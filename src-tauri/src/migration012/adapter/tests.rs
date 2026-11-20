use super::*;

fn run(f: impl std::future::Future<Output = ()>) {
    tauri::async_runtime::block_on(f);
}

#[test]
fn owner_target_binding_and_separate_recovery_are_verified_only_on_created_fixtures() {
    run(async {
        for fault in [Fault::None, Fault::AfterCommit] {
            let mut target = fixture::synthetic_fixture(true, false).await.unwrap();
            let before = fingerprint(target.conn().unwrap()).await.unwrap();
            target.close().await.unwrap();
            // Only this newly created fixture is renamed; no existing data is used.
            let path = target.root.join("synthetic-owner-target.sqlite3");
            fs::rename(&target.path, &path).unwrap();
            target.path = path.clone();
            // Use the real issuer/consumer with a private test pin for a freshly created fixture.
            let root = target.root.join("owner-recovery");
            let prepared: serde_json::Value = serde_json::from_str(
                &permit::prepare(
                    path.clone(),
                    root.clone(),
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs()
                        + 3600,
                )
                .await
                .unwrap(),
            )
            .unwrap();
            let pin = prepared["approvalSha256"].as_str().unwrap();
            permit::issue(&root.join("approval.json"), pin).unwrap();
            let mut request = Request {
                database: path.clone(),
                manifest: root.join(MANIFEST),
                manifest_sha256: prepared["manifestSha256"].as_str().unwrap().into(),
                owner_permit: Some(
                    permit::consume(&root.join("permit.json"), pin, permit::ConsumeFault::None)
                        .unwrap(),
                ),
            };
            request.database = target.root.join("not-the-authorized-target.sqlite3");
            assert!(matches!(adopt(&request).await, Err(Failure::Authorization)));
            request.database = path.clone();
            let pinned = request.manifest_sha256.clone();
            request.manifest_sha256 = "0".repeat(64);
            assert!(matches!(adopt(&request).await, Err(Failure::Authorization)));
            request.manifest_sha256 = pinned;
            if fault == Fault::None {
                let result: serde_json::Value =
                    serde_json::from_str(&execute(&request, fault).await.unwrap()).unwrap();
                assert_eq!(result["scope"], "owner");
                assert!(Path::new(result["backup"].as_str().unwrap()).starts_with(&root));
                let mut c = open(&path, true).await.unwrap();
                check_history(&mut c, 12).await.unwrap();
                let after = fingerprint(&mut c).await.unwrap();
                for (table, old) in &before {
                    if !["schema_migrations", "migration_events", "sqlite_sequence"]
                        .contains(&table.as_str())
                    {
                        assert_eq!(after.get(table), Some(old));
                    }
                }
                c.close().await.unwrap();
            } else {
                assert!(matches!(
                    execute(&request, fault).await,
                    Err(Failure::RecoveryRequired)
                ));
                let mut c = open(&path, true).await.unwrap();
                check_history(&mut c, 12).await.unwrap();
                let after = fingerprint(&mut c).await.unwrap();
                for (table, old) in &before {
                    if !["schema_migrations", "migration_events", "sqlite_sequence"]
                        .contains(&table.as_str())
                    {
                        assert_eq!(after.get(table), Some(old));
                    }
                }
                c.close().await.unwrap();
                assert!(!fs::read_dir(&root).unwrap().any(|p| p
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .starts_with("quarantine-")));
            }
            // The public route still cannot issue this test-only constructed capability.
            assert!(matches!(
                parse(&arguments(&request, "owner")),
                Err(Failure::ProductionExecutionDisabled)
            ));
        }
    });
}
fn arguments(r: &Request, mode: &str) -> Vec<String> {
    [
        "--mode",
        mode,
        "--database",
        r.database.to_str().unwrap(),
        "--manifest",
        r.manifest.to_str().unwrap(),
        "--manifest-sha256",
        &r.manifest_sha256,
        "--confirm",
        CONFIRMATION,
    ]
    .into_iter()
    .map(str::to_owned)
    .collect()
}
async fn prepared(records: bool) -> (SyntheticDatabase, Request) {
    let mut db = fixture::synthetic_fixture(records, false).await.unwrap();
    let r = seal(&mut db).await.unwrap();
    (db, r)
}

#[test]
fn owner_mode_and_invalid_arguments_stop_before_opening_a_target() {
    let r = Request {
        database: PathBuf::from("/synthetic-nonexistent/no-open.sqlite3"),
        manifest: PathBuf::from("/synthetic-nonexistent/no-open.json"),
        manifest_sha256: "a".repeat(64),
        owner_permit: None,
    };
    assert!(matches!(
        parse(&arguments(&r, "owner")),
        Err(Failure::ProductionExecutionDisabled)
    ));
    let mut a = arguments(&r, "synthetic");
    a[9] = "missing-review".into();
    assert!(matches!(parse(&a), Err(Failure::Authorization)));
    for a in [
        vec![],
        arguments(&r, "unknown"),
        {
            let mut a = arguments(&r, "synthetic");
            a[8] = "--database".into();
            a
        },
        {
            let mut a = arguments(&r, "synthetic");
            a.push("--force".into());
            a
        },
    ] {
        assert!(matches!(parse(&a), Err(Failure::Arguments)));
    }
    let mut a = vec!["migrate".into()];
    a.extend(arguments(&r, "owner"));
    assert_eq!(
        invoke(a).unwrap_err(),
        "migration012_ProductionExecutionDisabled"
    );
}

#[test]
fn adapter_migrates_fresh_and_representative_databases_and_refuses_replay() {
    run(async {
        for records in [false, true] {
            let (db, r) = prepared(records).await;
            let result: serde_json::Value =
                serde_json::from_str(&execute(&r, Fault::None).await.unwrap()).unwrap();
            assert_eq!(result["scope"], "synthetic");
            assert_eq!(result["productionExecutionEnabled"], false);
            let receipt: Receipt =
                serde_json::from_slice(&fs::read(result["receipt"].as_str().unwrap()).unwrap())
                    .unwrap();
            assert!(receipt.reopened && receipt.restored_foreign_keys);
            for (table, old) in &receipt.before {
                if !["schema_migrations", "migration_events", "sqlite_sequence"]
                    .contains(&table.as_str())
                {
                    assert_eq!(receipt.after.get(table), Some(old));
                }
            }
            let state = files(&db.path).unwrap();
            assert!(matches!(
                execute(&r, Fault::None).await,
                Err(Failure::StaleInput)
            ));
            assert_eq!(files(&db.path).unwrap(), state);
            let mut c = open(&db.path, false).await.unwrap();
            check_history(&mut c, 12).await.unwrap();
            integrity(&mut c).await.unwrap();
            if records {
                let id:String=sqlx::query_scalar("SELECT submitted_resume_version_id FROM applications WHERE id='m012-application'").fetch_one(&mut c).await.unwrap();
                assert_eq!(id, "m012-submitted");
            }
            super::super::tests::insert_master(&mut c, "standalone", "master", None)
                .await
                .unwrap();
            if records {
                super::super::tests::insert_master(
                    &mut c,
                    "child",
                    "tailored",
                    Some("audit-backend-job"),
                )
                .await
                .unwrap();
            } else {
                assert_eq!(
                    sqlx::query_scalar::<_, i64>("SELECT count(*) FROM jobs")
                        .fetch_one(&mut c)
                        .await
                        .unwrap(),
                    0
                );
            }
            c.close().await.unwrap();
            let mut c = open(&db.path, true).await.unwrap();
            assert_eq!(
                sqlx::query_scalar::<_, i64>(
                    "SELECT job_id IS NULL FROM resume_versions WHERE id='standalone'"
                )
                .fetch_one(&mut c)
                .await
                .unwrap(),
                1
            );
            c.close().await.unwrap();
        }
    });
}

#[test]
fn wrong_path_manifest_symlink_and_stale_state_are_rejected() {
    run(async {
        let (db, mut r) = prepared(true).await;
        let before = files(&db.path).unwrap();
        r.database = db.root.join("wrong.sqlite3");
        assert!(matches!(
            execute(&r, Fault::None).await,
            Err(Failure::Ownership)
        ));
        r.database = db.path.clone();
        r.manifest_sha256 = "0".repeat(64);
        assert!(matches!(
            execute(&r, Fault::None).await,
            Err(Failure::Authorization)
        ));
        assert_eq!(files(&db.path).unwrap(), before);
        r.manifest_sha256 = file_identity(&r.manifest).unwrap().sha256;
        let retained = db.root.join("retained-invocation.json");
        fs::rename(&r.manifest, &retained).unwrap();
        std::os::unix::fs::symlink(&retained, &r.manifest).unwrap();
        assert!(matches!(
            execute(&r, Fault::None).await,
            Err(Failure::Ownership)
        ));
        assert_eq!(files(&db.path).unwrap(), before);
        let (db, r) = prepared(true).await;
        let mut c = open(&db.path, false).await.unwrap();
        c.execute("UPDATE profile SET full_name='Synthetic later edit'")
            .await
            .unwrap();
        c.close().await.unwrap();
        let changed = files(&db.path).unwrap();
        assert!(matches!(
            execute(&r, Fault::None).await,
            Err(Failure::StaleInput)
        ));
        assert_eq!(files(&db.path).unwrap(), changed);
    });
}

#[test]
fn adapter_preserves_unknown_schema_history_and_invalid_references_without_repair() {
    run(async {
        for (statement,expected) in [
            ("DROP INDEX idx_resume_versions_job",Failure::Schema),
            ("CREATE TABLE unknown_dependency(id TEXT REFERENCES resume_versions(id))",Failure::Schema),
            ("UPDATE schema_migrations SET name='unknown' WHERE id=11",Failure::History),
            ("PRAGMA foreign_keys=OFF; UPDATE resume_versions SET job_id='missing'; PRAGMA foreign_keys=ON",Failure::Integrity),
        ] {
            let mut db=fixture::synthetic_fixture(true,false).await.unwrap();
            sqlx::raw_sql(statement).execute(db.conn().unwrap()).await.unwrap();
            let before=fingerprint(db.conn().unwrap()).await.unwrap();
            let r=seal(&mut db).await.unwrap();
            assert!(matches!(execute(&r,Fault::None).await,Err(e) if e==expected));
            let mut c=open(&db.path,true).await.unwrap();
            assert_eq!(fingerprint(&mut c).await.unwrap(),before);c.close().await.unwrap();
            assert!(!fs::read_dir(&db.root).unwrap().any(|p|p.unwrap().file_name().to_string_lossy().starts_with("before-012")));
        }
    });
}

#[test]
fn conflicting_owned_connection_is_not_interrupted_by_adapter() {
    run(async {
        let (db, r) = prepared(true).await;
        let mut other = open(&db.path, false).await.unwrap();
        other.execute("BEGIN IMMEDIATE").await.unwrap();
        assert!(matches!(
            execute(&r, Fault::None).await,
            Err(Failure::StaleInput | Failure::Ownership)
        ));
        other.execute("ROLLBACK").await.unwrap();
        check_history(&mut other, 11).await.unwrap();
        other.close().await.unwrap();
    });
}

#[test]
fn adapter_reuses_transaction_rollback_and_preserves_post_commit_state() {
    run(async {
        for (fault, expected) in [
            (Fault::AfterDrop, Failure::Injected),
            (Fault::AfterHistory, Failure::Injected),
            (Fault::AfterCommit, Failure::RecoveryRequired),
            (Fault::CorruptBackup, Failure::Backup),
        ] {
            let (db, r) = prepared(true).await;
            let invocation: Invocation =
                serde_json::from_slice(&fs::read(&r.manifest).unwrap()).unwrap();
            assert!(matches!(execute(&r,fault).await,Err(e) if e==expected));
            let mut c = open(&db.path, true).await.unwrap();
            check_history(&mut c, if fault == Fault::AfterCommit { 12 } else { 11 })
                .await
                .unwrap();
            if fault != Fault::AfterCommit {
                assert_eq!(
                    snapshot_hash(&fingerprint(&mut c).await.unwrap()).unwrap(),
                    invocation.data_sha256
                );
            } else {
                let backup = fs::read_dir(&db.root)
                    .unwrap()
                    .map(|p| p.unwrap().path())
                    .find(|p| {
                        p.file_name()
                            .unwrap()
                            .to_string_lossy()
                            .starts_with("before-012-")
                            && p.extension().unwrap() == "sqlite3"
                    })
                    .unwrap();
                let mut b = open(&backup, true).await.unwrap();
                assert_eq!(
                    snapshot_hash(&fingerprint(&mut b).await.unwrap()).unwrap(),
                    invocation.data_sha256
                );
                check_history(&mut b, 11).await.unwrap();
                b.close().await.unwrap();
            }
            integrity(&mut c).await.unwrap();
            c.close().await.unwrap();
            if fault == Fault::AfterCommit {
                assert!(!fs::read_dir(db.root).unwrap().any(|p| p
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .starts_with("quarantine-")));
            }
        }
    });
}

#[test]
#[ignore = "entry point used only by the owned adapter interruption/WAL tests"]
fn crash_child() {
    run(async {
        let manifest = PathBuf::from(std::env::var("CC_M012_ADAPTER_CHILD").unwrap());
        let stage = std::env::var("CC_M012_ADAPTER_STAGE").unwrap();
        let mut db = fixture::synthetic_fixture(true, false).await.unwrap();
        let r = if stage == "wal" {
            // Preserve a committed WAL without a final-connection checkpoint.
            let invocation = Invocation {
                format: 1,
                scope: "synthetic".into(),
                database: db.path.clone(),
                root: db.root.clone(),
                owner: db.owner.clone(),
                files: files(&db.path).unwrap(),
                data_sha256: snapshot_hash(&fingerprint(db.conn().unwrap()).await.unwrap())
                    .unwrap(),
                sql_sha256: APPROVED_SQL_SHA256.into(),
            };
            let manifest = db.root.join(MANIFEST);
            write_new(&manifest, &invocation).unwrap();
            Request {
                database: db.path.clone(),
                manifest_sha256: file_identity(&manifest).unwrap().sha256,
                owner_permit: None,
                manifest,
            }
        } else {
            seal(&mut db).await.unwrap()
        };
        write_new(&manifest,&serde_json::json!({"database":r.database,"manifest":r.manifest,"manifestSha256":r.manifest_sha256})).unwrap();
        if stage == "wal" {
            std::process::exit(86);
        }
        let fault = if stage == "drop" {
            Fault::CrashAfterDrop
        } else {
            Fault::CrashAfterHistory
        };
        let _ = execute(&r, fault).await;
        panic!("Adapter interruption point not reached");
    });
}

#[test]
fn adapter_handles_persisted_wal_and_process_interruption() {
    run(async {
        for stage in ["wal", "drop", "history"] {
            let mut parent = SyntheticDatabase::create().await.unwrap();
            let report = parent.root.join("child.json");
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "migration012::adapter::tests::crash_child",
                    "--ignored",
                    "--nocapture",
                ])
                .env("CC_M012_ADAPTER_CHILD", &report)
                .env("CC_M012_ADAPTER_STAGE", stage)
                .output()
                .unwrap();
            assert_eq!(
                output.status.code(),
                Some(86),
                "child failed before intended exit"
            );
            let v: serde_json::Value = serde_json::from_slice(&fs::read(report).unwrap()).unwrap();
            let r = Request {
                database: PathBuf::from(v["database"].as_str().unwrap()),
                manifest: PathBuf::from(v["manifest"].as_str().unwrap()),
                manifest_sha256: v["manifestSha256"].as_str().unwrap().into(),
                owner_permit: None,
            };
            if stage == "wal" {
                assert!(
                    fs::metadata(format!("{}-wal", r.database.display()))
                        .unwrap()
                        .len()
                        > 32
                );
                let result: serde_json::Value =
                    serde_json::from_str(&execute(&r, Fault::None).await.unwrap()).unwrap();
                let mut b = open(Path::new(result["backup"].as_str().unwrap()), true)
                    .await
                    .unwrap();
                check_history(&mut b, 11).await.unwrap();
                integrity(&mut b).await.unwrap();
                let invocation: Invocation =
                    serde_json::from_slice(&fs::read(&r.manifest).unwrap()).unwrap();
                assert_eq!(
                    snapshot_hash(&fingerprint(&mut b).await.unwrap()).unwrap(),
                    invocation.data_sha256
                );
                b.close().await.unwrap();
            } else {
                let mut c = open(&r.database, false).await.unwrap();
                check_history(&mut c, 11).await.unwrap();
                check_schema(&mut c, 11, false).await.unwrap();
                integrity(&mut c).await.unwrap();
                let invocation: Invocation =
                    serde_json::from_slice(&fs::read(&r.manifest).unwrap()).unwrap();
                assert_eq!(
                    snapshot_hash(&fingerprint(&mut c).await.unwrap()).unwrap(),
                    invocation.data_sha256
                );
                c.close().await.unwrap();
            }
            parent.close().await.unwrap();
        }
    });
}
