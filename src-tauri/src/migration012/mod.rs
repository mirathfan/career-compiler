//! Shared Migration 012 engine for tests and the explicitly built maintenance CLI.
//! No startup hook or Tauri command calls it. Owner execution requires a
//! separately compiled, exact approval pin and a durable single-use permit.
mod adapter;
mod fixture;
pub use adapter::invoke;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{
    sqlite::SqliteConnectOptions, Connection, Executor, Row, SqliteConnection, TypeInfo, ValueRef,
};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::Write,
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
    time::Duration,
};

const REBUILD: &str =
    include_str!("../../../docs/migration-proposals/012_standalone_master_resume.sql");
const APPROVED_SQL_SHA256: &str =
    "cbaab894011a6cd889388b9b28bebd9b9714df70109caa0e723048b0bd229d14";
const HISTORY: &str = include_str!("migrations-through-011.json");
const FTS: &str = "CREATE VIRTUAL TABLE IF NOT EXISTS search_documents_fts USING fts5(id UNINDEXED, title, normalized_text)";
type Result<T> = std::result::Result<T, Failure>;

// Never return raw SQLx errors: they can contain SQL or record content.
#[derive(Debug, PartialEq, Eq)]
enum Failure {
    Io,
    Sql,
    Ownership,
    Schema,
    History,
    Integrity,
    Fingerprint,
    Backup,
    AlreadyApplied,
    Injected,
    RecoveryRequired,
    Arguments,
    ProductionExecutionDisabled,
    Authorization,
    StaleInput,
    PermitConsumed,
    PermitExpired,
}
impl From<sqlx::Error> for Failure {
    fn from(_: sqlx::Error) -> Self {
        Self::Sql
    }
}
impl From<std::io::Error> for Failure {
    fn from(_: std::io::Error) -> Self {
        Self::Io
    }
}
#[derive(Deserialize)]
struct Migration {
    id: i64,
    name: String,
    sql: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct Fingerprint {
    rows: usize,
    sha256: String,
}
type Snapshot = BTreeMap<String, Fingerprint>;
type Schema = Vec<(String, String, String, Option<String>)>;
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Fault {
    None,
    AfterCopy,
    // Used only by test callers; the CLI always passes Fault::None.
    #[cfg_attr(not(test), allow(dead_code))]
    AfterDrop,
    AfterRebuild,
    AfterHistory,
    ChangeData,
    BrokenReference,
    CorruptBackup,
    AfterCommit,
    #[cfg(test)]
    ConflictingReopen,
    CrashAfterDrop,
    CrashAfterHistory,
}
#[derive(Serialize, Deserialize)]
struct Receipt {
    sqlite_version: String,
    backup_sha256: String,
    backup_name: String,
    before: Snapshot,
    after: Snapshot,
    restored_foreign_keys: bool,
    reopened: bool,
}
struct Backup {
    path: PathBuf,
    sha256: String,
    schema: Schema,
    data: Snapshot,
}

struct SyntheticDatabase {
    root: PathBuf,
    path: PathBuf,
    inode: (u64, u64),
    owner: String,
    // Identity marker only: this is NOT an interprocess lock.
    _marker: File,
    #[cfg(test)]
    conflicting_connection: Option<SqliteConnection>,
    connection: Option<SqliteConnection>,
}
impl SyntheticDatabase {
    // No constructor accepts an existing database, app identifier, or arbitrary path.
    async fn create() -> Result<Self> {
        let parent = std::env::temp_dir().canonicalize()?;
        let owner = format!("synthetic-migration012-{:032x}", rand::random::<u128>());
        let root = parent.join(&owner);
        fs::create_dir(&root)?;
        let mut lease = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(root.join("OWNER"))?;
        lease.write_all(owner.as_bytes())?;
        lease.sync_all()?;
        let path = root.join("synthetic.sqlite3");
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)?
            .sync_all()?;
        let metadata = path.symlink_metadata()?;
        let connection = open(&path, false).await?;
        Ok(Self {
            root,
            path,
            inode: (metadata.dev(), metadata.ino()),
            owner,
            _marker: lease,
            #[cfg(test)]
            conflicting_connection: None,
            connection: Some(connection),
        })
    }
    fn conn(&mut self) -> Result<&mut SqliteConnection> {
        self.connection.as_mut().ok_or(Failure::Ownership)
    }
    fn verify_paths(&self) -> Result<()> {
        let root = self.root.symlink_metadata()?;
        let db = self.path.symlink_metadata()?;
        let marker = self.root.join("OWNER");
        if !root.is_dir()
            || root.file_type().is_symlink()
            || self.root.canonicalize()? != self.root
            || !db.is_file()
            || db.file_type().is_symlink()
            || db.nlink() != 1
            || (db.dev(), db.ino()) != self.inode
            || !marker.symlink_metadata()?.is_file()
            || marker.symlink_metadata()?.file_type().is_symlink()
            || fs::read_to_string(marker)? != self.owner
        {
            return Err(Failure::Ownership);
        }
        for suffix in ["-wal", "-shm", "-journal"] {
            let p = PathBuf::from(format!("{}{suffix}", self.path.display()));
            match p.symlink_metadata() {
                Ok(m) if !m.is_file() || m.file_type().is_symlink() || m.nlink() != 1 => {
                    return Err(Failure::Ownership)
                }
                Ok(_) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err(Failure::Ownership),
            }
        }
        Ok(())
    }
    async fn reopen(&mut self) -> Result<()> {
        if let Some(c) = self.connection.take() {
            c.close().await?;
        }
        self.verify_paths()?;
        self.connection = Some(open(&self.path, false).await?);
        let path = self.path.clone();
        exclusive(self.conn()?, &path).await
    }
    async fn close(&mut self) -> Result<()> {
        if let Some(c) = self.connection.take() {
            c.close().await?;
        }
        Ok(())
    }
}
async fn open(path: &Path, read_only: bool) -> Result<SqliteConnection> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(false)
        .read_only(read_only)
        .foreign_keys(true)
        .busy_timeout(Duration::ZERO);
    Ok(SqliteConnection::connect_with(&options).await?)
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn quoted(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}
fn migrations() -> Vec<Migration> {
    serde_json::from_str(HISTORY).expect("reviewed migration fixture")
}

async fn initialize_011(c: &mut SqliteConnection) -> Result<()> {
    c.execute("CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)").await?;
    for m in migrations() {
        sqlx::raw_sql(&m.sql).execute(&mut *c).await?;
        sqlx::query("INSERT INTO schema_migrations VALUES(?,?,?)")
            .bind(m.id)
            .bind(m.name)
            .bind("2026-11-15T00:00:00Z")
            .execute(&mut *c)
            .await?;
    }
    Ok(())
}
// Remove only whitespace outside quoted tokens. Literal contents remain exact.
fn canonical_sql(sql: &str) -> String {
    let mut result = String::new();
    let mut quote = None;
    let mut chars = sql.chars().peekable();
    while let Some(ch) = chars.next() {
        if let Some(end) = quote {
            result.push(ch);
            if ch == end {
                if chars.peek() == Some(&end) {
                    result.push(chars.next().unwrap());
                } else {
                    quote = None;
                }
            }
        } else if ['\'', '"', '`', '['].contains(&ch) {
            quote = Some(if ch == '[' { ']' } else { ch });
            result.push(ch);
        } else if !ch.is_whitespace() {
            result.push(ch);
        }
    }
    result
}
async fn schema(c: &mut SqliteConnection) -> Result<Schema> {
    let rows = sqlx::query("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name")
        .fetch_all(c)
        .await?;
    rows.into_iter()
        .map(|r| {
            Ok((
                r.try_get(0)?,
                r.try_get(1)?,
                r.try_get(2)?,
                r.try_get::<Option<String>, _>(3)?
                    .map(|s| canonical_sql(&s)),
            ))
        })
        .collect()
}
async fn expected_schema(fts: bool, version: i64) -> Result<Schema> {
    let mut c = SqliteConnection::connect("sqlite::memory:").await?;
    initialize_011(&mut c).await?;
    if fts {
        c.execute(FTS).await?;
    }
    if version == 12 {
        c.execute("PRAGMA foreign_keys=OFF").await?;
        sqlx::raw_sql(REBUILD).execute(&mut c).await?;
    }
    let result = schema(&mut c).await?;
    c.close().await?;
    Ok(result)
}
async fn check_schema(c: &mut SqliteConnection, version: i64, fts: bool) -> Result<()> {
    if schema(c).await? != expected_schema(fts, version).await? {
        return Err(Failure::Schema);
    }
    let columns = sqlx::query("PRAGMA table_xinfo(resume_versions)")
        .fetch_all(&mut *c)
        .await?;
    let indexes: i64 = sqlx::query_scalar("SELECT count(*) FROM sqlite_schema WHERE type='index' AND tbl_name='resume_versions' AND sql IS NOT NULL").fetch_one(&mut *c).await?;
    if columns.len() != 22 || indexes != 4 {
        return Err(Failure::Schema);
    }
    Ok(())
}
async fn check_history(c: &mut SqliteConnection, version: i64) -> Result<()> {
    let history = sqlx::query("SELECT id,name,applied_at FROM schema_migrations ORDER BY id")
        .fetch_all(c)
        .await?;
    let mut expected: Vec<(i64, String)> =
        migrations().into_iter().map(|m| (m.id, m.name)).collect();
    if version == 12 {
        expected.push((12, "standalone_master_resume".into()));
    }
    if history.len() != expected.len() {
        return Err(Failure::History);
    }
    for (row, (id, name)) in history.iter().zip(expected) {
        if row.try_get::<i64, _>(0)? != id
            || row.try_get::<String, _>(1)? != name
            || row.try_get::<String, _>(2)?.is_empty()
        {
            return Err(Failure::History);
        }
    }
    Ok(())
}
async fn integrity(c: &mut SqliteConnection) -> Result<()> {
    let checks: Vec<String> = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_all(&mut *c)
        .await?;
    if checks != ["ok"]
        || !sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(c)
            .await?
            .is_empty()
    {
        return Err(Failure::Integrity);
    }
    Ok(())
}
async fn fingerprint(c: &mut SqliteConnection) -> Result<Snapshot> {
    let tables: Vec<String> =
        sqlx::query_scalar("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")
            .fetch_all(&mut *c)
            .await?;
    let mut snapshot = Snapshot::new();
    for table in tables {
        let rows = sqlx::query(&format!("SELECT * FROM {}", quoted(&table)))
            .fetch_all(&mut *c)
            .await?;
        let mut hashes = Vec::new();
        for row in &rows {
            let mut h = Sha256::new();
            for i in 0..row.len() {
                let raw = row.try_get_raw(i)?;
                let kind = raw.type_info().name().to_owned();
                let bytes = if raw.is_null() {
                    Vec::new()
                } else {
                    match kind.as_str() {
                        "INTEGER" => row.try_get::<i64, _>(i)?.to_be_bytes().to_vec(),
                        "REAL" => row.try_get::<f64, _>(i)?.to_bits().to_be_bytes().to_vec(),
                        "TEXT" => row.try_get::<String, _>(i)?.into_bytes(),
                        "BLOB" => row.try_get::<Vec<u8>, _>(i)?,
                        _ => return Err(Failure::Fingerprint),
                    }
                };
                h.update((kind.len() as u64).to_be_bytes());
                h.update(kind.as_bytes());
                h.update((bytes.len() as u64).to_be_bytes());
                h.update(bytes);
            }
            hashes.push(format!("{:x}", h.finalize()));
        }
        hashes.sort();
        snapshot.insert(
            table,
            Fingerprint {
                rows: rows.len(),
                sha256: hash(hashes.join("").as_bytes()),
            },
        );
    }
    Ok(snapshot)
}
async fn exclusive(c: &mut SqliteConnection, path: &Path) -> Result<()> {
    let databases = sqlx::query("PRAGMA database_list")
        .fetch_all(&mut *c)
        .await?;
    for row in databases {
        let name: String = row.try_get("name")?;
        let file: String = row.try_get("file")?;
        if name == "temp" && file.is_empty() {
            let count: i64 = sqlx::query_scalar("SELECT count(*) FROM temp.sqlite_schema")
                .fetch_one(&mut *c)
                .await?;
            if count == 0 {
                continue;
            }
            return Err(Failure::Ownership);
        }
        if name != "main" || Path::new(&file).canonicalize()? != path {
            return Err(Failure::Ownership);
        }
    }
    c.execute("PRAGMA busy_timeout=0").await?;
    c.execute("PRAGMA locking_mode=EXCLUSIVE").await?;
    // Acquire the actual SQLite file lock; merely setting the pragma is insufficient.
    c.execute("BEGIN EXCLUSIVE")
        .await
        .map_err(|_| Failure::Ownership)?;
    c.execute("COMMIT").await?;
    let mode: String = sqlx::query_scalar("PRAGMA locking_mode")
        .fetch_one(&mut *c)
        .await?;
    if mode != "exclusive" {
        return Err(Failure::Ownership);
    }
    c.execute("PRAGMA foreign_keys=ON").await?;
    foreign_keys(c, 1).await
}
async fn foreign_keys(c: &mut SqliteConnection, expected: i64) -> Result<()> {
    if sqlx::query_scalar::<_, i64>("PRAGMA foreign_keys")
        .fetch_one(c)
        .await?
        != expected
    {
        return Err(Failure::Integrity);
    }
    Ok(())
}
async fn backup(db: &mut SyntheticDatabase, before: &Snapshot) -> Result<Backup> {
    let path = db.root.join(format!(
        "before-012-{:032x}.sqlite3",
        rand::random::<u128>()
    ));
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)?
        .sync_all()?;
    db.conn()?.execute("PRAGMA synchronous=FULL").await?;
    sqlx::query("VACUUM main INTO ?")
        .bind(path.to_str().ok_or(Failure::Backup)?)
        .execute(db.conn()?)
        .await?;
    File::open(&path)?.sync_all()?;
    File::open(&db.root)?.sync_all()?;
    let result = Backup {
        path: path.clone(),
        sha256: hash(&fs::read(&path)?),
        schema: schema(db.conn()?).await?,
        data: before.clone(),
    };
    verify_backup(&result).await?;
    let manifest = serde_json::json!({"migration":12,"fromVersion":11,"backupName":path.file_name().unwrap().to_str(),"backupSha256":result.sha256,"schemaSha256":hash(&serde_json::to_vec(&result.schema).map_err(|_|Failure::Backup)?),"before":result.data});
    let mut f = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path.with_extension("manifest.json"))?;
    f.write_all(&serde_json::to_vec_pretty(&manifest).map_err(|_| Failure::Backup)?)?;
    f.sync_all()?;
    File::open(&db.root)?.sync_all()?;
    Ok(result)
}
async fn verify_backup(b: &Backup) -> Result<()> {
    let meta = b.path.symlink_metadata()?;
    if !meta.is_file()
        || meta.file_type().is_symlink()
        || meta.nlink() != 1
        || hash(&fs::read(&b.path)?) != b.sha256
    {
        return Err(Failure::Backup);
    }
    let mut c = open(&b.path, true).await?;
    integrity(&mut c).await?;
    let matches = schema(&mut c).await? == b.schema && fingerprint(&mut c).await? == b.data;
    c.close().await?;
    if !matches {
        return Err(Failure::Backup);
    }
    Ok(())
}
fn journal(root: &Path, status: &str) -> Result<()> {
    let mut f = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(root.join(format!("event-{:032x}.json", rand::random::<u128>())))?;
    // Codes only; no SQL, database rows, credentials, or private paths.
    f.write_all(
        serde_json::json!({"migration":12,"status":status})
            .to_string()
            .as_bytes(),
    )?;
    f.sync_all()?;
    Ok(())
}
async fn migrate(db: &mut SyntheticDatabase, fault: Fault) -> Result<Receipt> {
    migrate_checked(db, fault, &|| Ok(())).await
}
async fn migrate_checked(
    db: &mut SyntheticDatabase,
    fault: Fault,
    authorize: &dyn Fn() -> Result<()>,
) -> Result<Receipt> {
    let result = migrate_inner(db, fault, authorize).await;
    if let Err(error) = &result {
        if let Some(c) = db.connection.as_mut() {
            let reset: Result<()> = async {
                c.execute("PRAGMA foreign_keys=ON").await?;
                foreign_keys(c, 1).await
            }
            .await;
            if reset.is_err() {
                // Closing the owned connection also rolls back any still-active transaction.
                db.close().await.map_err(|_| Failure::RecoveryRequired)?;
                return Err(Failure::RecoveryRequired);
            }
        }
        if *error != Failure::AlreadyApplied && db.verify_paths().is_ok() {
            // Preserve RecoveryRequired even if diagnostic storage also fails.
            let recorded = journal(&db.root, &format!("stopped_{error:?}"));
            if *error != Failure::RecoveryRequired {
                recorded?;
            }
        }
    }
    result
}
async fn migrate_inner(
    db: &mut SyntheticDatabase,
    fault: Fault,
    authorize: &dyn Fn() -> Result<()>,
) -> Result<Receipt> {
    authorize()?;
    db.verify_paths()?;
    let path = db.path.clone();
    exclusive(db.conn()?, &path).await?;
    if hash(REBUILD.as_bytes()) != APPROVED_SQL_SHA256 {
        return Err(Failure::Schema);
    }
    let version: i64 = sqlx::query_scalar("SELECT coalesce(max(id),0) FROM schema_migrations")
        .fetch_one(db.conn()?)
        .await?;
    let fts = sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM sqlite_schema WHERE name='search_documents_fts'",
    )
    .fetch_one(db.conn()?)
    .await?
        == 1;
    for p in ["PRAGMA user_version", "PRAGMA application_id"] {
        if sqlx::query_scalar::<_, i64>(p)
            .fetch_one(db.conn()?)
            .await?
            != 0
        {
            return Err(Failure::Schema);
        }
    }
    if version == 12 {
        check_history(db.conn()?, 12).await?;
        check_schema(db.conn()?, 12, fts).await?;
        integrity(db.conn()?).await?;
        return Err(Failure::AlreadyApplied);
    }
    check_history(db.conn()?, 11).await?;
    check_schema(db.conn()?, 11, fts).await?;
    integrity(db.conn()?).await?;
    let sqlite_version = sqlx::query_scalar("SELECT sqlite_version()")
        .fetch_one(db.conn()?)
        .await?;
    let before = fingerprint(db.conn()?).await?;
    let b = backup(db, &before).await?;
    let backup_name = b
        .path
        .file_name()
        .and_then(|v| v.to_str())
        .ok_or(Failure::Backup)?
        .to_string();
    if fault == Fault::CorruptBackup {
        fs::write(&b.path, b"synthetic corrupted backup")?;
    }
    verify_backup(&b).await?;
    db.verify_paths()?;
    journal(&db.root, "verified_backup_before_rebuild")?;
    authorize()?;
    let c = db.conn()?;
    c.execute("PRAGMA foreign_keys=OFF").await?;
    foreign_keys(c, 0).await?;
    if c.execute("BEGIN IMMEDIATE").await.is_err() {
        c.execute("PRAGMA foreign_keys=ON").await?;
        foreign_keys(c, 1).await?;
        return Err(Failure::Sql);
    }
    let transaction:Result<Snapshot>=async {
        if matches!(fault,Fault::AfterCopy | Fault::AfterDrop | Fault::CrashAfterDrop) {
            let n=if fault==Fault::AfterCopy {2}else{3};
            sqlx::raw_sql(&REBUILD.split(';').take(n).collect::<Vec<_>>().join(";")).execute(&mut *c).await?;
            if fault==Fault::CrashAfterDrop { std::process::exit(86); }
            return Err(Failure::Injected);
        }
        sqlx::raw_sql(REBUILD).execute(&mut *c).await?;
        if fault==Fault::AfterRebuild {return Err(Failure::Injected);}
        if fault==Fault::ChangeData {c.execute("UPDATE profile SET full_name='Synthetic changed value'").await?;}
        if fault==Fault::BrokenReference {c.execute("UPDATE resume_versions SET job_id='synthetic-missing-job'").await?;}
        check_schema(c,12,fts).await?;integrity(c).await?;
        if fingerprint(c).await?!=before {return Err(Failure::Fingerprint);}
        c.execute("INSERT INTO schema_migrations(id,name,applied_at) VALUES(12,'standalone_master_resume',strftime('%Y-%m-%dT%H:%M:%fZ','now'))").await?;
        sqlx::query("INSERT INTO migration_events(from_version,to_version,success,backup_path,error_code,created_at) VALUES(11,12,1,?,'',strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(&backup_name).execute(&mut *c).await?;
        check_history(c,12).await?;
        if fault==Fault::AfterHistory {return Err(Failure::Injected);}
        if fault==Fault::CrashAfterHistory { std::process::exit(86); }
        let expected=fingerprint(c).await?;integrity(c).await?;authorize()?;Ok(expected)
    }.await;
    let after = match transaction {
        Ok(after) => after,
        Err(error) => {
            c.execute("ROLLBACK")
                .await
                .map_err(|_| Failure::RecoveryRequired)?;
            c.execute("PRAGMA foreign_keys=ON").await?;
            foreign_keys(c, 1).await?;
            if schema(c).await? != b.schema || fingerprint(c).await? != before {
                return Err(Failure::RecoveryRequired);
            }
            integrity(c).await?;
            journal(&db.root, "transaction_rolled_back")?;
            return Err(error);
        }
    };
    if c.execute("COMMIT").await.is_err() {
        // A failed COMMIT can leave a transaction active. Do not reuse it.
        // Commit outcome can be uncertain. Closing may roll back an active
        // transaction, but cannot undo a committed transaction. Never restore files.
        let _ = db.close().await;
        let _ = journal(&db.root, "commit_outcome_uncertain_recovery_required");
        return Err(Failure::RecoveryRequired);
    }
    let post: Result<()> = async {
        db.conn()?.execute("PRAGMA foreign_keys=ON").await?;
        foreign_keys(db.conn()?, 1).await?;
        #[cfg(test)]
        if fault == Fault::ConflictingReopen {
            db.close().await?;
            let mut other = open(&db.path, false).await?;
            other.execute("BEGIN EXCLUSIVE").await?;
            // The test owns this separate connection and closes it explicitly.
            db.conflicting_connection = Some(other);
        }
        // Closing releases SQLite ownership. Reacquisition may fail; the marker
        // does not authorize recovery across this gap.
        db.reopen().await?;
        check_schema(db.conn()?, 12, fts).await?;
        check_history(db.conn()?, 12).await?;
        integrity(db.conn()?).await?;
        if fingerprint(db.conn()?).await? != after || fault == Fault::AfterCommit {
            return Err(Failure::Fingerprint);
        }
        verify_backup(&b).await?;
        journal(&db.root, "committed_and_reopened")?;
        Ok(())
    }
    .await;
    if let Err(error) = post {
        // No rename, quarantine, copy, replacement, retry, or automatic restore.
        // Retain the committed DB and verified backup for separately approved recovery.
        let _ = journal(
            &db.root,
            &format!("post_commit_{error:?}_recovery_required"),
        );
        return Err(Failure::RecoveryRequired);
    }
    Ok(Receipt {
        sqlite_version,
        backup_sha256: b.sha256,
        backup_name,
        before,
        after,
        restored_foreign_keys: true,
        reopened: true,
    })
}

#[cfg(test)]
mod tests;
