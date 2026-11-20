//! Exact approval pin -> durable issuance -> durable single-use attempt.
//! The compile-time pin is the trust anchor, never a runtime flag or environment lookup.
use super::*;
use std::{
    os::unix::fs::{DirBuilderExt, OpenOptionsExt},
    time::{SystemTime, UNIX_EPOCH},
};

const OPERATION: &str = "MIGRATE_011_TO_012";
const APPROVAL: &str = "approval.json";
const PERMIT: &str = "permit.json";
const MAX_VALIDITY_SECONDS: u64 = 3600;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct DirectoryIdentity {
    device: u64,
    inode: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Approval {
    format: u32,
    operation: String,
    authorization_id: String,
    created_at: u64,
    expires_at: u64,
    database: PathBuf,
    database_identity: FileIdentity,
    recovery_root: PathBuf,
    recovery_identity: DirectoryIdentity,
    manifest_sha256: String,
    sql_sha256: String,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Permit {
    approval: Approval,
    approval_sha256: String,
    executable: PathBuf,
    executable_identity: FileIdentity,
}
#[derive(Debug)]
pub(super) struct OwnerPermit {
    pub(super) database: PathBuf,
    pub(super) recovery_root: PathBuf,
    pub(super) manifest_sha256: String,
    approval: Approval,
    used: std::cell::Cell<bool>,
    executable: PathBuf,
    executable_identity: FileIdentity,
}

fn now() -> Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|v| v.as_secs())
        .map_err(|_| Failure::Authorization)
}
fn digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub(super) fn compiled_pin() -> Result<&'static str> {
    option_env!("CC_MIGRATION012_APPROVAL_SHA256")
        .filter(|p| digest(p))
        .ok_or(Failure::ProductionExecutionDisabled)
}
fn directory(path: &Path) -> Result<DirectoryIdentity> {
    let m = path.symlink_metadata()?;
    if !path.is_absolute()
        || path.canonicalize()? != path
        || !m.is_dir()
        || m.file_type().is_symlink()
        || m.mode() & 0o777 != 0o700
    {
        return Err(Failure::Ownership);
    }
    Ok(DirectoryIdentity {
        device: m.dev(),
        inode: m.ino(),
    })
}
fn private_bytes(path: &Path) -> Result<Vec<u8>> {
    let m = path.symlink_metadata()?;
    if !m.is_file()
        || m.file_type().is_symlink()
        || m.nlink() != 1
        || m.len() > 32768
        || m.mode() & 0o777 != 0o600
    {
        return Err(Failure::Authorization);
    }
    Ok(fs::read(path)?)
}
fn private_new(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut f = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)?;
    f.write_all(bytes)?;
    f.sync_all()?;
    File::open(path.parent().ok_or(Failure::Ownership)?)?.sync_all()?;
    Ok(())
}
fn valid_time(a: &Approval) -> Result<()> {
    let current = now()?;
    if a.created_at > current
        || a.expires_at <= current
        || a.expires_at <= a.created_at
        || a.expires_at - a.created_at > MAX_VALIDITY_SECONDS
    {
        return Err(Failure::PermitExpired);
    }
    Ok(())
}
fn validate_approval(a: &Approval) -> Result<()> {
    valid_time(a)?;
    if a.format != 1
        || a.operation != OPERATION
        || a.authorization_id.len() != 32
        || !a
            .authorization_id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        || !digest(&a.manifest_sha256)
        || a.sql_sha256 != APPROVED_SQL_SHA256
        || hash(REBUILD.as_bytes()) != a.sql_sha256
        || !a.database.is_absolute()
        || a.database.starts_with(&a.recovery_root)
        || directory(&a.recovery_root)? != a.recovery_identity
    {
        return Err(Failure::Authorization);
    }
    Ok(())
}
fn validate_source(a: &Approval) -> Result<()> {
    if a.database.canonicalize()? != a.database
        || file_identity(&a.database)? != a.database_identity
    {
        return Err(Failure::StaleInput);
    }
    let bytes = private_bytes(&a.recovery_root.join(MANIFEST))?;
    if hash(&bytes) != a.manifest_sha256 {
        return Err(Failure::Authorization);
    }
    let m: Invocation = serde_json::from_slice(&bytes).map_err(|_| Failure::Authorization)?;
    if m.format != 1
        || m.scope != "owner"
        || m.database != a.database
        || m.root != a.recovery_root
        || m.sql_sha256 != a.sql_sha256
        || m.files != files(&a.database)?
    {
        return Err(Failure::StaleInput);
    }
    Ok(())
}
fn read_approval(path: &Path, pin: &str) -> Result<Approval> {
    if !digest(pin) {
        return Err(Failure::ProductionExecutionDisabled);
    }
    let bytes = private_bytes(path)?;
    if hash(&bytes) != pin {
        return Err(Failure::Authorization);
    }
    let a: Approval = serde_json::from_slice(&bytes).map_err(|_| Failure::Authorization)?;
    validate_approval(&a)?;
    if path != a.recovery_root.join(APPROVAL) {
        return Err(Failure::Authorization);
    }
    Ok(a)
}

// Explicit preparation only: creates a new recovery directory, validates 011 and
// takes a verified WAL-aware backup. It issues NO execution authorization.
pub(super) async fn prepare(database: PathBuf, root: PathBuf, expires_at: u64) -> Result<String> {
    let created_at = now()?;
    if expires_at <= created_at || expires_at - created_at > MAX_VALIDITY_SECONDS {
        return Err(Failure::PermitExpired);
    }
    if !database.is_absolute()
        || database.canonicalize()? != database
        || !root.is_absolute()
        || root.starts_with(&database)
        || database.starts_with(&root)
        || root.parent().ok_or(Failure::Ownership)?.canonicalize()? != root.parent().unwrap()
    {
        return Err(Failure::Ownership);
    }
    let identity = file_identity(&database)?;
    fs::DirBuilder::new().mode(0o700).create(&root)?;
    File::open(root.parent().unwrap())?.sync_all()?;
    let owner = root
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| s.len() <= 128)
        .ok_or(Failure::Ownership)?
        .to_string();
    private_new(&root.join("OWNER"), owner.as_bytes())?;
    let mut db = SyntheticDatabase {
        root: root.clone(),
        path: database.clone(),
        inode: (identity.device, identity.inode),
        owner: owner.clone(),
        _marker: File::open(root.join("OWNER"))?,
        #[cfg(test)]
        conflicting_connection: None,
        connection: Some(open(&database, false).await?),
    };
    let result:Result<String>=async {
        db.verify_paths()?;exclusive(db.conn()?,&database).await?;
        check_history(db.conn()?,11).await?;
        let fts=sqlx::query_scalar::<_,i64>("SELECT count(*) FROM sqlite_schema WHERE name='search_documents_fts'").fetch_one(db.conn()?).await?==1;
        check_schema(db.conn()?,11,fts).await?;integrity(db.conn()?).await?;
        for pragma in ["PRAGMA user_version","PRAGMA application_id"] {
            if sqlx::query_scalar::<_,i64>(pragma).fetch_one(db.conn()?).await?!=0 {return Err(Failure::Schema);}
        }
        let before=fingerprint(db.conn()?).await?;
        let b=backup(&mut db,&before).await?;verify_backup(&b).await?;
        db.close().await?;db.verify_paths()?;
        let invocation=Invocation {format:1,scope:"owner".into(),database:database.clone(),root:root.clone(),owner,
            files:files(&database)?,data_sha256:snapshot_hash(&before)?,sql_sha256:APPROVED_SQL_SHA256.into()};
        let manifest_bytes=json_bytes(&invocation)?;
        private_new(&root.join(MANIFEST),&manifest_bytes)?;
        let a=Approval {format:1,operation:OPERATION.into(),authorization_id:format!("{:032x}",rand::random::<u128>()),created_at,expires_at,
            database,database_identity:file_identity(&db.path)?,recovery_root:root.clone(),recovery_identity:directory(&root)?,
            manifest_sha256:hash(&manifest_bytes),sql_sha256:APPROVED_SQL_SHA256.into()};
        let bytes=json_bytes(&a)?;
        private_new(&root.join(APPROVAL),&bytes)?;
        Ok(serde_json::json!({"status":"approval_required","approval":root.join(APPROVAL),"approvalSha256":hash(&bytes),
            "manifest":root.join(MANIFEST),"manifestSha256":a.manifest_sha256,"expiresAt":expires_at,
            "backup":b.path,"backupSha256":b.sha256}).to_string())
    }.await;
    let closed = db.close().await;
    match result {
        Err(e) => Err(e),
        Ok(v) => {
            closed?;
            Ok(v)
        }
    }
}

// Called only with the compiled approval pin (tests supply pins for fresh fixtures).
pub(super) fn issue(path: &Path, pin: &str) -> Result<String> {
    let a = read_approval(path, pin)?;
    validate_source(&a)?;
    let executable = std::env::current_exe()?.canonicalize()?;
    let executable_identity = file_identity(&executable)?;
    // Reserve issuance durably FIRST. Interrupted issuance cannot be repeated.
    let issued = a.recovery_root.join("issued");
    fs::DirBuilder::new()
        .mode(0o700)
        .create(&issued)
        .map_err(|_| Failure::PermitConsumed)?;
    File::open(&a.recovery_root)?.sync_all()?;
    let p = Permit {
        approval: a,
        approval_sha256: pin.into(),
        executable,
        executable_identity,
    };
    let bytes = json_bytes(&p)?;
    private_new(&issued.join("permit.sha256"), hash(&bytes).as_bytes())?;
    private_new(&p.approval.recovery_root.join(PERMIT), &bytes)?;
    Ok(serde_json::json!({"status":"permit_issued","authorizationId":p.approval.authorization_id,
        "permit":p.approval.recovery_root.join(PERMIT),"permitSha256":hash(&bytes),"executableSha256":p.executable_identity.sha256,
        "expiresAt":p.approval.expires_at}).to_string())
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum ConsumeFault {
    None,
    #[cfg(test)]
    AfterReservation,
    #[cfg(test)]
    CrashAfterReservation,
}

pub(super) fn consume(path: &Path, pin: &str, fault: ConsumeFault) -> Result<OwnerPermit> {
    if !digest(pin) {
        return Err(Failure::ProductionExecutionDisabled);
    }
    let bytes = private_bytes(path)?;
    let p: Permit = serde_json::from_slice(&bytes).map_err(|_| Failure::Authorization)?;
    let a = &p.approval;
    // Check the independently compiled approval and issued seal, not a caller's hash.
    if p.approval_sha256 != pin
        || hash(&json_bytes(a)?) != pin
        || path != a.recovery_root.join(PERMIT)
    {
        return Err(Failure::Authorization);
    }
    validate_approval(a)?;
    let issued = a.recovery_root.join("issued");
    directory(&issued)?;
    if private_bytes(&issued.join("permit.sha256"))? != hash(&bytes).as_bytes() {
        return Err(Failure::Authorization);
    }
    let executable = std::env::current_exe()?.canonicalize()?;
    if executable != p.executable || file_identity(&executable)? != p.executable_identity {
        return Err(Failure::Authorization);
    }
    let consumed = a.recovery_root.join("consumed");
    fs::DirBuilder::new()
        .mode(0o700)
        .create(&consumed)
        .map_err(|_| Failure::PermitConsumed)?;
    // No database access is allowed before this namespace reservation is durable.
    File::open(&a.recovery_root)?.sync_all()?;
    #[cfg(test)]
    match fault {
        ConsumeFault::AfterReservation => return Err(Failure::Injected),
        ConsumeFault::CrashAfterReservation => std::process::exit(86),
        ConsumeFault::None => {}
    }
    #[cfg(not(test))]
    let _ = fault;
    private_new(
        &consumed.join("attempt.json"),
        &json_bytes(
            &serde_json::json!({"authorizationId":a.authorization_id,"operation":OPERATION,"startedAt":now()?}),
        )?,
    )?;
    validate_source(a)?;
    Ok(OwnerPermit {
        database: a.database.clone(),
        recovery_root: a.recovery_root.clone(),
        manifest_sha256: a.manifest_sha256.clone(),
        approval: p.approval,
        used: std::cell::Cell::new(false),
        executable: p.executable,
        executable_identity: p.executable_identity,
    })
}
impl OwnerPermit {
    pub(super) fn begin(&self) -> Result<()> {
        if self.used.replace(true) {
            return Err(Failure::PermitConsumed);
        }
        self.revalidate()
    }
    // Revalidate time and executable immediately before entering the engine.
    pub(super) fn revalidate(&self) -> Result<()> {
        validate_approval(&self.approval)?;
        if std::env::current_exe()?.canonicalize()? != self.executable
            || file_identity(&self.executable)? != self.executable_identity
        {
            return Err(Failure::Authorization);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
