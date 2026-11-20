use super::*;
use serde_json::Value;

fn run(f: impl std::future::Future<Output = ()>) {
    tauri::async_runtime::block_on(f);
}
async fn fixture(records: bool, fts: bool) -> SyntheticDatabase {
    fixture::synthetic_fixture(records, fts).await.unwrap()
}
async fn scalar(c: &mut SqliteConnection, sql: &str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(c).await.unwrap()
}
pub(super) async fn insert_master(
    c: &mut SqliteConnection,
    id: &str,
    kind: &str,
    job: Option<&str>,
) -> std::result::Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO resume_versions(id,job_id,name,template_id,content_json,validation_json,status,last_export_path,created_at,updated_at,kind) VALUES(?,?,'Synthetic new resume','mir-resume','{}','[]','approved','','synthetic','synthetic',?)")
        .bind(id).bind(job).bind(kind).execute(c).await.map(|_|())
}

#[test]
fn fresh_native_schema_tracks_012_without_a_job() {
    run(async {
        let mut db = fixture(false, false).await;
        let receipt = migrate(&mut db, Fault::None).await.unwrap();
        assert!(receipt.reopened && receipt.restored_foreign_keys);
        assert_eq!(
            scalar(db.conn().unwrap(), "SELECT max(id) FROM schema_migrations").await,
            12
        );
        assert_eq!(
            scalar(db.conn().unwrap(), "SELECT count(*) FROM schema_migrations").await,
            12
        );
        insert_master(db.conn().unwrap(), "new-master", "master", None)
            .await
            .unwrap();
        assert_eq!(
            scalar(db.conn().unwrap(), "SELECT count(*) FROM jobs").await,
            0
        );
        assert_eq!(
            scalar(
                db.conn().unwrap(),
                "SELECT job_id IS NULL FROM resume_versions WHERE id='new-master'"
            )
            .await,
            1
        );
        for kind in ["tailored", "imported"] {
            assert!(insert_master(db.conn().unwrap(), kind, kind, None)
                .await
                .is_err());
        }
        assert!(
            insert_master(db.conn().unwrap(), "empty-job", "master", Some(""))
                .await
                .is_err()
        );
        db.reopen().await.unwrap();
        assert_eq!(
            scalar(db.conn().unwrap(), "SELECT count(*) FROM resume_versions").await,
            1
        );
        integrity(db.conn().unwrap()).await.unwrap();
        db.close().await.unwrap();
    });
}
#[test]
fn native_011_to_012_preserves_all_relationships_and_wal_backup() {
    run(async {
        let mut db = fixture(true, false).await;
        // This record exists in committed WAL pages when backup starts.
        db.conn().unwrap().execute("INSERT INTO safety_records VALUES('wal-only','synthetic-preservation','{\"value\":\"committed in WAL\"}','synthetic')").await.unwrap();
        assert!(
            fs::metadata(format!("{}-wal", db.path.display()))
                .unwrap()
                .len()
                > 32
        );
        let receipt = migrate(&mut db, Fault::None).await.unwrap();
        for (table, before) in &receipt.before {
            if !["schema_migrations", "migration_events", "sqlite_sequence"]
                .contains(&table.as_str())
            {
                assert_eq!(
                    receipt.after.get(table),
                    Some(before),
                    "changed table {table}"
                );
            }
        }
        assert_eq!(
            scalar(
                db.conn().unwrap(),
                "SELECT count(*) FROM resume_versions WHERE job_id='audit-backend-job'"
            )
            .await,
            3
        );
        assert_eq!(scalar(db.conn().unwrap(),"SELECT count(*) FROM applications WHERE submitted_resume_version_id='m012-submitted'").await,1);
        if let Ok(out) = std::env::var("CC_INTELLIGENCE_EVIDENCE") {
            db.close().await.unwrap();
            // Closed owned connection checkpointed the final native artifact.
            fs::copy(&db.path, Path::new(&out).join("native-migrated.sqlite3")).unwrap();
            fs::write(
                Path::new(&out).join("native-receipt.json"),
                serde_json::to_vec_pretty(&receipt).unwrap(),
            )
            .unwrap();
            fs::write(
                Path::new(&out).join("native-owned-root.txt"),
                db.root.to_string_lossy().as_bytes(),
            )
            .unwrap();
            fs::write(
                Path::new(&out).join("MIGRATION012_SYNTHETIC_ONLY"),
                "created-by-native-migration012-tests",
            )
            .unwrap();
        }
        db.close().await.unwrap();
    });
}
#[test]
fn preserves_optional_fts_schema_and_shadow_records() {
    run(async {
        let mut db = fixture(true, true).await;
        let receipt = migrate(&mut db, Fault::None).await.unwrap();
        for (name, value) in &receipt.before {
            if name.starts_with("search_documents_fts") {
                assert_eq!(receipt.after.get(name), Some(value));
            }
        }
        assert_eq!(scalar(db.conn().unwrap(),"SELECT count(*) FROM search_documents_fts WHERE search_documents_fts MATCH 'evidence'").await,1);
        db.close().await.unwrap();
    });
}
#[test]
fn failures_roll_back_schema_data_and_history() {
    run(async {
        for fault in [
            Fault::AfterCopy,
            Fault::AfterDrop,
            Fault::AfterRebuild,
            Fault::AfterHistory,
            Fault::ChangeData,
            Fault::BrokenReference,
        ] {
            let mut db = fixture(true, false).await;
            let before = fingerprint(db.conn().unwrap()).await.unwrap();
            let old_schema = schema(db.conn().unwrap()).await.unwrap();
            let expected = match fault {
                Fault::ChangeData => Failure::Fingerprint,
                Fault::BrokenReference => Failure::Integrity,
                _ => Failure::Injected,
            };
            assert!(
                matches!(migrate(&mut db,fault).await,Err(ref e) if *e==expected),
                "incorrect failure stage: {fault:?}"
            );
            assert_eq!(fingerprint(db.conn().unwrap()).await.unwrap(), before);
            assert_eq!(schema(db.conn().unwrap()).await.unwrap(), old_schema);
            foreign_keys(db.conn().unwrap(), 1).await.unwrap();
            db.reopen().await.unwrap();
            assert_eq!(fingerprint(db.conn().unwrap()).await.unwrap(), before);
            db.close().await.unwrap();
        }
    });
}
#[test]
fn post_commit_failure_requires_recovery_without_replacing_database() {
    run(async {
        let mut db = fixture(true, false).await;
        let inode = db.inode;
        let before = fingerprint(db.conn().unwrap()).await.unwrap();
        assert!(matches!(
            migrate(&mut db, Fault::AfterCommit).await,
            Err(Failure::RecoveryRequired)
        ));
        assert_eq!(db.inode, inode);
        assert_eq!(
            (
                db.path.metadata().unwrap().dev(),
                db.path.metadata().unwrap().ino()
            ),
            inode
        );
        db.reopen().await.unwrap();
        check_history(db.conn().unwrap(), 12).await.unwrap();
        let after = fingerprint(db.conn().unwrap()).await.unwrap();
        for (table, value) in &before {
            if !["schema_migrations", "migration_events", "sqlite_sequence"]
                .contains(&table.as_str())
            {
                assert_eq!(after.get(table), Some(value));
            }
        }
        let entries: Vec<_> = fs::read_dir(&db.root)
            .unwrap()
            .map(|p| p.unwrap().path())
            .collect();
        assert!(!entries.iter().any(|p| p
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("quarantine-")));
        let backup = entries
            .iter()
            .find(|p| {
                p.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("before-012-")
                    && p.extension().unwrap() == "sqlite3"
            })
            .unwrap();
        let mut c = open(backup, true).await.unwrap();
        check_history(&mut c, 11).await.unwrap();
        assert_eq!(fingerprint(&mut c).await.unwrap(), before);
        integrity(&mut c).await.unwrap();
        c.close().await.unwrap();
        db.close().await.unwrap();
    });
}
#[test]
fn lost_ownership_never_restores_or_quarantines_with_a_conflicting_connection() {
    run(async {
        let mut db = fixture(true, false).await;
        let before = fingerprint(db.conn().unwrap()).await.unwrap();
        let inode = db.inode;
        assert!(matches!(
            migrate(&mut db, Fault::ConflictingReopen).await,
            Err(Failure::RecoveryRequired)
        ));
        assert_eq!(
            (
                db.path.metadata().unwrap().dev(),
                db.path.metadata().unwrap().ino()
            ),
            inode
        );
        let mut other = db.conflicting_connection.take().unwrap();
        check_history(&mut other, 12).await.unwrap();
        let after = fingerprint(&mut other).await.unwrap();
        for (table, old) in &before {
            if !["schema_migrations", "migration_events", "sqlite_sequence"]
                .contains(&table.as_str())
            {
                assert_eq!(after.get(table), Some(old));
            }
        }
        let entries: Vec<_> = fs::read_dir(&db.root)
            .unwrap()
            .map(|p| p.unwrap().path())
            .collect();
        assert!(!entries.iter().any(|p| p
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("quarantine-")));
        let backup = entries
            .iter()
            .find(|p| {
                p.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("before-012-")
                    && p.extension().unwrap() == "sqlite3"
            })
            .unwrap();
        let backup_bytes = fs::read(backup).unwrap();
        let mut b = open(backup, true).await.unwrap();
        check_history(&mut b, 11).await.unwrap();
        integrity(&mut b).await.unwrap();
        assert_eq!(fingerprint(&mut b).await.unwrap(), before);
        b.close().await.unwrap();
        // Even another reopen attempt still cannot acquire the separate connection's lock.
        assert!(db.reopen().await.is_err());
        assert_eq!(fs::read(backup).unwrap(), backup_bytes);
        other.execute("ROLLBACK").await.unwrap();
        other.close().await.unwrap();
        db.reopen().await.unwrap();
        check_history(db.conn().unwrap(), 12).await.unwrap();
        integrity(db.conn().unwrap()).await.unwrap();
        db.close().await.unwrap();
    });
}
#[test]
fn refuses_corrupted_backup_before_database_changes() {
    run(async {
        let mut db = fixture(true, false).await;
        let before = fingerprint(db.conn().unwrap()).await.unwrap();
        assert!(matches!(
            migrate(&mut db, Fault::CorruptBackup).await,
            Err(Failure::Backup)
        ));
        assert_eq!(fingerprint(db.conn().unwrap()).await.unwrap(), before);
        foreign_keys(db.conn().unwrap(), 1).await.unwrap();
        db.close().await.unwrap();
    });
}
#[test]
fn repeated_attempt_is_verified_noop_with_no_second_history_or_backup() {
    run(async {
        let mut db = fixture(true, false).await;
        migrate(&mut db, Fault::None).await.unwrap();
        let before = fingerprint(db.conn().unwrap()).await.unwrap();
        let files = fs::read_dir(&db.root).unwrap().count();
        assert!(matches!(
            migrate(&mut db, Fault::None).await,
            Err(Failure::AlreadyApplied)
        ));
        assert_eq!(fingerprint(db.conn().unwrap()).await.unwrap(), before);
        assert_eq!(fs::read_dir(&db.root).unwrap().count(), files);
        db.close().await.unwrap();
    });
}
#[test]
fn refuses_missing_changed_indexes_unknown_objects_and_history() {
    run(async {
        for sql in [
        "DROP INDEX idx_resume_versions_job",
        "DROP INDEX idx_resume_versions_kind; CREATE INDEX idx_resume_versions_kind ON resume_versions(name)",
        "CREATE INDEX unexpected_resume ON resume_versions(name)",
        "CREATE VIEW unexpected_view AS SELECT * FROM resume_versions",
        "CREATE TRIGGER unexpected_trigger AFTER INSERT ON resume_versions BEGIN UPDATE profile SET full_name='unexpected'; END",
        "ALTER TABLE resume_versions ADD COLUMN unexpected TEXT",
        "CREATE TABLE unexpected_dependency(id TEXT REFERENCES resume_versions(id))",
        "UPDATE schema_migrations SET name='unexpected' WHERE id=11",
        "DELETE FROM schema_migrations WHERE id=8",
        "INSERT INTO schema_migrations VALUES(13,'unknown','synthetic')",
    ] {
        let mut db=fixture(true,false).await;sqlx::raw_sql(sql).execute(db.conn().unwrap()).await.unwrap();let before=fingerprint(db.conn().unwrap()).await.unwrap();
        assert!(migrate(&mut db,Fault::None).await.is_err());assert_eq!(fingerprint(db.conn().unwrap()).await.unwrap(),before);
        assert!(!fs::read_dir(&db.root).unwrap().any(|p|p.unwrap().file_name().to_string_lossy().starts_with("before-012")));db.close().await.unwrap();
    }
    });
}
#[test]
fn refuses_foreign_key_corruption_without_repair() {
    run(async {
        let mut db = fixture(true, false).await;
        db.conn()
            .unwrap()
            .execute("PRAGMA foreign_keys=OFF")
            .await
            .unwrap();
        db.conn()
            .unwrap()
            .execute("UPDATE resume_versions SET job_id='missing'")
            .await
            .unwrap();
        let before = fingerprint(db.conn().unwrap()).await.unwrap();
        assert!(matches!(
            migrate(&mut db, Fault::None).await,
            Err(Failure::Integrity)
        ));
        assert_eq!(fingerprint(db.conn().unwrap()).await.unwrap(), before);
        db.close().await.unwrap();
    });
}
#[test]
fn refuses_an_active_conflicting_connection_without_process_inspection() {
    run(async {
        let mut db = fixture(true, false).await;
        let mut other = open(&db.path, false).await.unwrap();
        other.execute("BEGIN IMMEDIATE").await.unwrap();
        assert!(matches!(
            migrate(&mut db, Fault::None).await,
            Err(Failure::Ownership)
        ));
        other.execute("ROLLBACK").await.unwrap();
        other.close().await.unwrap();
        check_history(db.conn().unwrap(), 11).await.unwrap();
        db.close().await.unwrap();
    });
}
#[test]
fn refuses_changed_ownership_and_symlink_backup_inputs() {
    run(async {
        let mut db = fixture(true, false).await;
        fs::write(db.root.join("OWNER"), "different-owner").unwrap();
        assert!(matches!(
            migrate(&mut db, Fault::None).await,
            Err(Failure::Ownership)
        ));
        db.close().await.unwrap();
        let mut db = fixture(true, false).await;
        let path = db.path.clone();
        exclusive(db.conn().unwrap(), &path).await.unwrap();
        let before = fingerprint(db.conn().unwrap()).await.unwrap();
        let b = backup(&mut db, &before).await.unwrap();
        let moved = db.root.join("retained-backup.sqlite3");
        fs::rename(&b.path, &moved).unwrap();
        std::os::unix::fs::symlink(&moved, &b.path).unwrap();
        assert!(matches!(verify_backup(&b).await, Err(Failure::Backup)));
        db.close().await.unwrap();
    });
}

#[test]
#[ignore = "entry point used only by the owned crash-recovery child process"]
fn crash_child() {
    let manifest =
        PathBuf::from(std::env::var("CC_M012_CRASH_MANIFEST").expect("owned crash test required"));
    let stage = std::env::var("CC_M012_CRASH_STAGE").expect("owned crash stage required");
    run(async {
        let mut db = fixture(true, false).await;
        let before = fingerprint(db.conn().unwrap()).await.unwrap();
        fs::write(
            db.root.join("before-data.json"),
            serde_json::to_vec(&before).unwrap(),
        )
        .unwrap();
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(manifest)
            .unwrap();
        file.write_all(db.root.to_string_lossy().as_bytes())
            .unwrap();
        file.sync_all().unwrap();
        let fault = if stage == "drop" {
            Fault::CrashAfterDrop
        } else {
            Fault::CrashAfterHistory
        };
        let _ = migrate(&mut db, fault).await;
        panic!("Crash point was not reached");
    });
}
#[test]
fn owned_process_interruption_recovers_without_partial_history() {
    run(async {
        for stage in ["drop", "history"] {
            let mut parent = SyntheticDatabase::create().await.unwrap();
            let manifest = parent.root.join("child-root.txt");
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "migration012::tests::crash_child",
                    "--ignored",
                    "--nocapture",
                ])
                .env("CC_M012_CRASH_MANIFEST", &manifest)
                .env("CC_M012_CRASH_STAGE", stage)
                .output()
                .unwrap();
            assert_eq!(
                output.status.code(),
                Some(86),
                "owned crash child did not reach interruption"
            );
            let root = PathBuf::from(fs::read_to_string(manifest).unwrap());
            assert!(root.parent() == Some(std::env::temp_dir().canonicalize().unwrap().as_path()));
            assert_eq!(
                fs::read_to_string(root.join("OWNER")).unwrap(),
                root.file_name().unwrap().to_str().unwrap()
            );
            let before: Snapshot =
                serde_json::from_slice(&fs::read(root.join("before-data.json")).unwrap()).unwrap();
            let mut c = open(&root.join("synthetic.sqlite3"), false).await.unwrap();
            check_history(&mut c, 11).await.unwrap();
            check_schema(&mut c, 11, false).await.unwrap();
            integrity(&mut c).await.unwrap();
            foreign_keys(&mut c, 1).await.unwrap();
            assert_eq!(fingerprint(&mut c).await.unwrap(), before);
            c.close().await.unwrap();
            parent.close().await.unwrap();
        }
    });
}

#[test]
#[ignore = "run after the TypeScript native-artifact repository round trip"]
fn verifies_repository_roundtrip_and_renders_real_native_pdf() {
    run(async {
        let out = PathBuf::from(
            std::env::var("CC_MIGRATION012_NATIVE_RESULT")
                .expect("synthetic artifact directory required"),
        );
        assert_eq!(
            fs::read_to_string(out.join("MIGRATION012_SYNTHETIC_ONLY")).unwrap(),
            "created-by-native-migration012-tests"
        );
        let ids: Value =
            serde_json::from_slice(&fs::read(out.join("repository-identity.json")).unwrap())
                .unwrap();
        let mut c = open(&out.join("repository-after.sqlite3"), true)
            .await
            .unwrap();
        check_history(&mut c, 12).await.unwrap();
        check_schema(&mut c, 12, false).await.unwrap();
        integrity(&mut c).await.unwrap();
        let row = sqlx::query("SELECT job_id,kind FROM resume_versions WHERE id=?")
            .bind(ids["masterId"].as_str().unwrap())
            .fetch_one(&mut c)
            .await
            .unwrap();
        assert!(row.try_get::<Option<String>, _>(0).unwrap().is_none());
        assert_eq!(row.get::<String, _>(1), "master");
        let row=sqlx::query("SELECT job_id,parent_resume_version_id,base_resume_version_id FROM resume_versions WHERE id=?").bind(ids["childId"].as_str().unwrap()).fetch_one(&mut c).await.unwrap();
        assert_eq!(row.get::<String, _>(0), ids["jobId"].as_str().unwrap());
        assert_eq!(row.get::<String, _>(1), ids["masterId"].as_str().unwrap());
        assert_eq!(row.get::<String, _>(2), ids["masterId"].as_str().unwrap());
        assert_eq!(scalar(&mut c, "SELECT count(*) FROM jobs").await, 1);
        let original: Receipt =
            serde_json::from_slice(&fs::read(out.join("native-receipt.json")).unwrap()).unwrap();
        let after = fingerprint(&mut c).await.unwrap();
        for (table, prior) in &original.after {
            if table != "resume_versions" {
                assert_eq!(
                    after.get(table),
                    Some(prior),
                    "unexpected repository mutation: {table}"
                );
            }
        }
        let mut before = open(&out.join("native-migrated.sqlite3"), true)
            .await
            .unwrap();
        for id in ["m012-original-master", "m012-submitted", "m012-imported"] {
            let sql = "SELECT * FROM resume_versions WHERE id=?";
            let old = sqlx::query(sql)
                .bind(id)
                .fetch_one(&mut before)
                .await
                .unwrap();
            let new = sqlx::query(sql).bind(id).fetch_one(&mut c).await.unwrap();
            for i in 0..old.len() {
                assert_eq!(
                    old.try_get::<Option<String>, _>(i).unwrap(),
                    new.try_get::<Option<String>, _>(i).unwrap()
                );
            }
        }
        before.close().await.unwrap();
        c.close().await.unwrap();
        let latex = fs::read_to_string(out.join("master.tex")).unwrap();
        let pdf = crate::commands::files::render_resume_latex(latex.clone())
            .expect("native XeLaTeX must be available for this acceptance");
        assert!(pdf.starts_with(b"%PDF-"));
        fs::write(out.join("native-master.pdf"), &pdf).unwrap();
        fs::write(out.join("native-pdf-identity.json"),serde_json::to_vec_pretty(&serde_json::json!({"masterVersionId":ids["masterId"],"latexSha256":hash(latex.as_bytes()),"pdfSha256":hash(&pdf),"nativeRenderer":true})).unwrap()).unwrap();
    });
}

#[test]
fn rejects_attached_databases_temporary_objects_and_check_violations() {
    run(async {
        for statement in ["ATTACH ':memory:' AS unexpected", "CREATE TEMP TABLE unexpected(id TEXT)", "PRAGMA ignore_check_constraints=ON; UPDATE resume_versions SET kind='unknown'; PRAGMA ignore_check_constraints=OFF"] {
        let mut db=fixture(true,false).await;sqlx::raw_sql(statement).execute(db.conn().unwrap()).await.unwrap();
        let before=fingerprint(db.conn().unwrap()).await.unwrap();
        let result=migrate(&mut db,Fault::None).await;
        assert!(matches!(result,Err(Failure::Ownership | Failure::Integrity)));
        assert_eq!(fingerprint(db.conn().unwrap()).await.unwrap(),before);db.close().await.unwrap();
    }
    });
}

#[test]
fn already_migrated_database_still_rejects_unknown_database_metadata() {
    run(async {
        let mut db = fixture(false, false).await;
        migrate(&mut db, Fault::None).await.unwrap();
        db.conn()
            .unwrap()
            .execute("PRAGMA user_version=99")
            .await
            .unwrap();
        let before = fingerprint(db.conn().unwrap()).await.unwrap();
        assert!(matches!(
            migrate(&mut db, Fault::None).await,
            Err(Failure::Schema)
        ));
        assert_eq!(fingerprint(db.conn().unwrap()).await.unwrap(), before);
        db.close().await.unwrap();
    });
}
