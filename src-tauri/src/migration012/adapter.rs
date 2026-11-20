//! Strict invocation and identity binding around the existing migration engine.
//! An owner argument alone is never an execution authorization.
mod permit;
use super::*;
use permit::OwnerPermit;

const CONFIRMATION: &str = "MIGRATE_011_TO_012";
const MANIFEST: &str = "invocation.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct FileIdentity {
    device: u64,
    inode: u64,
    bytes: u64,
    mode: u32,
    sha256: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Invocation {
    format: u32,
    scope: String,
    database: PathBuf,
    root: PathBuf,
    owner: String,
    files: BTreeMap<String, Option<FileIdentity>>,
    data_sha256: String,
    sql_sha256: String,
}
#[derive(Debug)]
struct Request {
    database: PathBuf,
    manifest: PathBuf,
    manifest_sha256: String,
    owner_permit: Option<OwnerPermit>,
}

fn file_identity(path: &Path) -> Result<FileIdentity> {
    let m = path.symlink_metadata()?;
    if !m.is_file() || m.file_type().is_symlink() || m.nlink() != 1 {
        return Err(Failure::Ownership);
    }
    Ok(FileIdentity {
        device: m.dev(),
        inode: m.ino(),
        bytes: m.len(),
        mode: m.mode(),
        sha256: hash(&fs::read(path)?),
    })
}
fn files(path: &Path) -> Result<BTreeMap<String, Option<FileIdentity>>> {
    let mut result = BTreeMap::new();
    for suffix in ["", "-wal", "-shm", "-journal"] {
        let p = PathBuf::from(format!("{}{suffix}", path.display()));
        let value = match p.symlink_metadata() {
            Ok(_) => Some(file_identity(&p)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound && !suffix.is_empty() => None,
            Err(_) => return Err(Failure::Ownership),
        };
        result.insert(suffix.into(), value);
    }
    Ok(result)
}
fn json_bytes(value: &impl Serialize) -> Result<Vec<u8>> {
    serde_json::to_vec_pretty(value).map_err(|_| Failure::Authorization)
}
fn snapshot_hash(value: &Snapshot) -> Result<String> {
    Ok(hash(&json_bytes(value)?))
}
fn write_new(path: &Path, value: &impl Serialize) -> Result<()> {
    let mut f = OpenOptions::new().write(true).create_new(true).open(path)?;
    f.write_all(&json_bytes(value)?)?;
    f.sync_all()?;
    File::open(path.parent().ok_or(Failure::Ownership)?)?.sync_all()?;
    Ok(())
}

// Seal only a capability created by the engine, not an arbitrary filesystem path.
async fn seal(db: &mut SyntheticDatabase) -> Result<Request> {
    db.verify_paths()?;
    let data_sha256 = snapshot_hash(&fingerprint(db.conn()?).await?)?;
    db.close().await?;
    let invocation = Invocation {
        format: 1,
        scope: "synthetic".into(),
        database: db.path.clone(),
        root: db.root.clone(),
        owner: db.owner.clone(),
        files: files(&db.path)?,
        data_sha256,
        sql_sha256: APPROVED_SQL_SHA256.into(),
    };
    let manifest = db.root.join(MANIFEST);
    write_new(&manifest, &invocation)?;
    Ok(Request {
        database: db.path.clone(),
        manifest_sha256: file_identity(&manifest)?.sha256,
        manifest,
        owner_permit: None,
    })
}

fn parse(args: &[String]) -> Result<Request> {
    if args.len() != 10 && args.len() != 12 {
        return Err(Failure::Arguments);
    }
    let mut fields = BTreeMap::new();
    for pair in args.chunks_exact(2) {
        if ![
            "--mode",
            "--database",
            "--manifest",
            "--manifest-sha256",
            "--confirm",
            "--permit",
        ]
        .contains(&pair[0].as_str())
            || fields.insert(pair[0].as_str(), pair[1].as_str()).is_some()
        {
            return Err(Failure::Arguments);
        }
    }
    let pin = match fields.get("--mode") {
        Some(&"owner") => Some(permit::compiled_pin()?),
        Some(&"synthetic") if !fields.contains_key("--permit") => None,
        _ => return Err(Failure::Arguments),
    };
    for field in ["--database", "--manifest", "--manifest-sha256", "--confirm"] {
        if !fields.contains_key(field) {
            return Err(Failure::Arguments);
        }
    }
    if fields.get("--confirm") != Some(&CONFIRMATION) {
        return Err(Failure::Authorization);
    }
    let database = PathBuf::from(fields["--database"]);
    let manifest = PathBuf::from(fields["--manifest"]);
    let digest = fields["--manifest-sha256"];
    if !database.is_absolute()
        || !manifest.is_absolute()
        || digest.len() != 64
        || !digest
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(Failure::Arguments);
    }
    let owner_permit = if let Some(pin) = pin {
        let path = Path::new(fields.get("--permit").ok_or(Failure::Authorization)?);
        Some(permit::consume(path, pin, permit::ConsumeFault::None)?)
    } else {
        None
    };
    Ok(Request {
        database,
        manifest,
        manifest_sha256: digest.into(),
        owner_permit,
    })
}

async fn adopt(request: &Request) -> Result<SyntheticDatabase> {
    // Authorization is resolved before reading either target or manifest.
    // No target can be opened in owner mode without a consumed pinned permit.
    let (root, scope) = if let Some(permit) = &request.owner_permit {
        permit.revalidate()?;
        if request.database != permit.database
            || request.manifest != permit.recovery_root.join(MANIFEST)
            || request.manifest_sha256 != permit.manifest_sha256
            || request.database.parent() == Some(permit.recovery_root.as_path())
            || request.database.starts_with(&permit.recovery_root)
        {
            return Err(Failure::Authorization);
        }
        (permit.recovery_root.as_path(), "owner")
    } else {
        let root = request.database.parent().ok_or(Failure::Ownership)?;
        let parent = std::env::temp_dir().canonicalize()?;
        let name = root
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or(Failure::Ownership)?;
        let nonce = name
            .strip_prefix("synthetic-migration012-")
            .ok_or(Failure::Ownership)?;
        if root.parent() != Some(parent.as_path())
            || nonce.len() != 32
            || !nonce
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            || request.database.file_name().and_then(|s| s.to_str()) != Some("synthetic.sqlite3")
            || request.manifest != root.join(MANIFEST)
        {
            return Err(Failure::Ownership);
        }
        (root, "synthetic")
    };
    let name = root
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or(Failure::Ownership)?;
    if request.database.canonicalize()? != request.database {
        return Err(Failure::Ownership);
    }
    if root.canonicalize()? != root || !root.symlink_metadata()?.is_dir() {
        return Err(Failure::Ownership);
    }
    let manifest_identity = file_identity(&request.manifest)?;
    if manifest_identity.bytes > 32_768 || manifest_identity.sha256 != request.manifest_sha256 {
        return Err(Failure::Authorization);
    }
    let invocation: Invocation = serde_json::from_slice(&fs::read(&request.manifest)?)
        .map_err(|_| Failure::Authorization)?;
    let marker = root.join("OWNER");
    if file_identity(&marker)?.bytes > 128
        || invocation.format != 1
        || invocation.scope != scope
        || invocation.database != request.database
        || invocation.root != root
        || invocation.owner != name
        || fs::read_to_string(&marker)? != invocation.owner
        || invocation.sql_sha256 != APPROVED_SQL_SHA256
    {
        return Err(Failure::Authorization);
    }
    if files(&request.database)? != invocation.files {
        return Err(Failure::StaleInput);
    }
    let meta = request.database.symlink_metadata()?;
    let pinned = invocation
        .files
        .get("")
        .and_then(Option::as_ref)
        .ok_or(Failure::Authorization)?;
    if (meta.dev(), meta.ino()) != (pinned.device, pinned.inode) {
        return Err(Failure::StaleInput);
    }
    let mut db = SyntheticDatabase {
        root: root.into(),
        path: request.database.clone(),
        inode: (meta.dev(), meta.ino()),
        owner: invocation.owner,
        _marker: File::open(marker)?,
        #[cfg(test)]
        conflicting_connection: None,
        connection: Some(open(&request.database, false).await?),
    };
    let result = async {
        db.verify_paths()?;
        exclusive(db.conn()?, &request.database).await?;
        // Logical binding after acquiring the SQLite lock catches WAL or concurrent changes.
        if snapshot_hash(&fingerprint(db.conn()?).await?)? != invocation.data_sha256 {
            return Err(Failure::StaleInput);
        }
        Ok(())
    }
    .await;
    if let Err(error) = result {
        db.close().await?;
        return Err(error);
    }
    Ok(db)
}

async fn execute(request: &Request, fault: Fault) -> Result<String> {
    if let Some(permit) = &request.owner_permit {
        permit.begin()?;
    }
    let mut db = adopt(request).await?;
    let result = if let Some(permit) = &request.owner_permit {
        migrate_checked(&mut db, fault, &|| permit.revalidate()).await
    } else {
        migrate(&mut db, fault).await
    };
    // A completed operation always closes its owned connection; only fixed codes are exposed.
    let closed = db.close().await;
    let receipt = result?;
    closed.map_err(|_| Failure::RecoveryRequired)?;
    let receipt_path = db
        .root
        .join(format!("receipt-{:032x}.json", rand::random::<u128>()));
    write_new(&receipt_path, &receipt).map_err(|_| Failure::RecoveryRequired)?;
    Ok(
        serde_json::json!({"status":"migrated","scope":if request.owner_permit.is_some() {"owner"} else {"synthetic"},"database":db.path,
        "receipt":receipt_path,"backup":db.root.join(&receipt.backup_name),
        "backupSha256":receipt.backup_sha256,"productionExecutionEnabled":false})
        .to_string(),
    )
}

/// Explicit command-line invocation. Ordinary app startup never calls this function.
/// Owner mode needs an exact compile-time approval pin and a single-use permit.
pub fn invoke(args: Vec<String>) -> std::result::Result<String, String> {
    let result: Result<String> = tauri::async_runtime::block_on(async {
        if args == ["--help"] {
            return Ok("prepare-synthetic --fixture fresh|representative; migrate --mode synthetic|owner --database ABSOLUTE_PATH --manifest ABSOLUTE_PATH --manifest-sha256 SHA256 --confirm MIGRATE_011_TO_012 --permit ABSOLUTE_PERMIT (owner only); prepare-owner --database ABSOLUTE_PATH --recovery-root NEW_ABSOLUTE_DIRECTORY --expires-at UNIX_SECONDS --confirm ALL_CAREERCOMPILER_WRITERS_STOPPED; issue-owner-permit --approval ABSOLUTE_APPROVAL --confirm AUTHORIZE_MIGRATION_011_TO_012; owner issuance/execution require an exact compile-time approval pin".into());
        }
        if args.len() == 3 && args[0] == "prepare-synthetic" && args[1] == "--fixture" {
            let records = match args[2].as_str() {
                "fresh" => false,
                "representative" => true,
                _ => return Err(Failure::Arguments),
            };
            let mut db = fixture::synthetic_fixture(records, false).await?;
            let request = seal(&mut db).await?;
            return Ok(serde_json::json!({"scope":"synthetic","database":request.database,"manifest":request.manifest,
                "manifestSha256":request.manifest_sha256,"productionExecutionEnabled":false}).to_string());
        }
        if args.len() == 9
            && args[0] == "prepare-owner"
            && args[1] == "--database"
            && args[3] == "--recovery-root"
            && args[5] == "--expires-at"
            && args[7] == "--confirm"
            && args[8] == "ALL_CAREERCOMPILER_WRITERS_STOPPED"
        {
            return permit::prepare(
                PathBuf::from(&args[2]),
                PathBuf::from(&args[4]),
                args[6].parse().map_err(|_| Failure::Arguments)?,
            )
            .await;
        }
        if args.len() == 5
            && args[0] == "issue-owner-permit"
            && args[1] == "--approval"
            && args[3] == "--confirm"
            && args[4] == "AUTHORIZE_MIGRATION_011_TO_012"
        {
            // Resolve the compiled trust anchor before reading the approval or target.
            return permit::issue(Path::new(&args[2]), permit::compiled_pin()?);
        }
        if args.first().map(String::as_str) != Some("migrate") {
            return Err(Failure::Arguments);
        }
        let request = parse(&args[1..])?;
        execute(&request, Fault::None).await
    });
    result.map_err(|code| format!("migration012_{code:?}"))
}

#[cfg(test)]
mod tests;
