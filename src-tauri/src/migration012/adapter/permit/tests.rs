use super::*;
fn run(f: impl std::future::Future<Output = ()>) {
    tauri::async_runtime::block_on(f);
}
async fn ready() -> (SyntheticDatabase, PathBuf, String) {
    let mut db = fixture::synthetic_fixture(true, false).await.unwrap();
    db.close().await.unwrap();
    let root = db.root.join("permit-recovery");
    let v: serde_json::Value = serde_json::from_str(
        &prepare(db.path.clone(), root.clone(), now().unwrap() + 3600)
            .await
            .unwrap(),
    )
    .unwrap();
    (db, root, v["approvalSha256"].as_str().unwrap().into())
}
fn consume_request(root: &Path, pin: &str) -> Result<Request> {
    let p = consume(&root.join(PERMIT), pin, ConsumeFault::None)?;
    Ok(Request {
        database: p.database.clone(),
        manifest: root.join(MANIFEST),
        manifest_sha256: p.manifest_sha256.clone(),
        owner_permit: Some(p),
    })
}
fn rewrite_approval(root: &Path, change: impl FnOnce(&mut Approval)) -> String {
    let mut a: Approval = serde_json::from_slice(&fs::read(root.join(APPROVAL)).unwrap()).unwrap();
    change(&mut a);
    let bytes = json_bytes(&a).unwrap();
    fs::write(root.join(APPROVAL), &bytes).unwrap();
    hash(&bytes)
}
fn rewrite_permit(root: &Path, change: impl FnOnce(&mut Permit)) {
    let mut p: Permit = serde_json::from_slice(&fs::read(root.join(PERMIT)).unwrap()).unwrap();
    change(&mut p);
    let bytes = json_bytes(&p).unwrap();
    fs::write(root.join(PERMIT), &bytes).unwrap();
    fs::write(root.join("issued/permit.sha256"), hash(&bytes)).unwrap();
}
#[test]
fn one_exact_permit_executes_once_and_cannot_be_reissued_or_replayed() {
    run(async {
        let (db, root, pin) = ready().await;
        let original = files(&db.path).unwrap();
        assert!(consume_request(&root, &pin).is_err());
        assert!(matches!(
            issue(&root.join(APPROVAL), &"0".repeat(64)),
            Err(Failure::Authorization)
        ));
        issue(&root.join(APPROVAL), &pin).unwrap();
        assert!(matches!(
            issue(&root.join(APPROVAL), &pin),
            Err(Failure::PermitConsumed)
        ));
        let request = consume_request(&root, &pin).unwrap();
        assert_eq!(files(&db.path).unwrap(), original);
        execute(&request, Fault::None).await.unwrap();
        assert!(matches!(
            execute(&request, Fault::None).await,
            Err(Failure::PermitConsumed)
        ));
        assert!(matches!(
            consume_request(&root, &pin),
            Err(Failure::PermitConsumed)
        ));
        let mut c = open(&db.path, true).await.unwrap();
        check_history(&mut c, 12).await.unwrap();
        integrity(&mut c).await.unwrap();
        c.close().await.unwrap();
    });
}
#[test]
fn expired_future_or_extended_approvals_are_rejected_without_issuing() {
    run(async {
        for case in 0..3 {
            let (db, root, _) = ready().await;
            let before = files(&db.path).unwrap();
            let pin = rewrite_approval(&root, |a| match case {
                0 => {
                    a.created_at = now().unwrap() - 7200;
                    a.expires_at = now().unwrap() - 1;
                }
                1 => {
                    a.created_at = now().unwrap() + 100;
                    a.expires_at = a.created_at + 300;
                }
                _ => a.expires_at = a.created_at + MAX_VALIDITY_SECONDS + 1,
            });
            assert!(matches!(
                issue(&root.join(APPROVAL), &pin),
                Err(Failure::PermitExpired)
            ));
            assert!(!root.join("issued").exists());
            assert_eq!(files(&db.path).unwrap(), before);
        }
    });
}
#[test]
fn issued_permit_expiration_is_checked_at_consumption_and_before_commit() {
    run(async {
        let (db, root, pin) = ready().await;
        issue(&root.join(APPROVAL), &pin).unwrap();
        // A test-signed already-expired permit cannot pass validation even with a matching seal.
        rewrite_permit(&root, |p| {
            p.approval.created_at = now().unwrap() - 7200;
            p.approval.expires_at = now().unwrap() - 1;
            p.approval_sha256 = hash(&json_bytes(&p.approval).unwrap());
        });
        let p: Permit = serde_json::from_slice(&fs::read(root.join(PERMIT)).unwrap()).unwrap();
        assert!(matches!(
            consume_request(&root, &p.approval_sha256),
            Err(Failure::PermitExpired)
        ));
        let mut owned = fixture::synthetic_fixture(true, false).await.unwrap();
        let before = fingerprint(owned.conn().unwrap()).await.unwrap();
        let checks = std::cell::Cell::new(0);
        let result = migrate_checked(&mut owned, Fault::None, &|| {
            let n = checks.get() + 1;
            checks.set(n);
            if n == 3 {
                Err(Failure::PermitExpired)
            } else {
                Ok(())
            }
        })
        .await;
        assert!(matches!(result, Err(Failure::PermitExpired)));
        assert_eq!(checks.get(), 3);
        assert_eq!(fingerprint(owned.conn().unwrap()).await.unwrap(), before);
        check_history(owned.conn().unwrap(), 11).await.unwrap();
        owned.close().await.unwrap();
        assert!(db.path.is_file());
    });
}
#[test]
fn permit_manifest_sql_executable_operation_and_recovery_tampering_fail_closed() {
    run(async {
        for case in 0..7 {
            let (db, root, mut pin) = ready().await;
            let before = files(&db.path).unwrap();
            if case == 0 || case == 1 {
                pin = rewrite_approval(&root, |a| {
                    if case == 0 {
                        a.sql_sha256 = "0".repeat(64);
                    } else {
                        a.operation = "MIGRATE_ANYTHING".into();
                    }
                });
                assert!(matches!(
                    issue(&root.join(APPROVAL), &pin),
                    Err(Failure::Authorization)
                ));
                continue;
            }
            issue(&root.join(APPROVAL), &pin).unwrap();
            match case {
                2 => {
                    fs::write(root.join(MANIFEST), b"tampered synthetic manifest").unwrap();
                }
                3 => rewrite_permit(&root, |p| p.executable_identity.sha256 = "0".repeat(64)),
                4 => rewrite_permit(&root, |p| {
                    p.executable = PathBuf::from("/synthetic-unapproved-executable")
                }),
                5 => {
                    let mut bytes = fs::read(root.join(PERMIT)).unwrap();
                    bytes.push(b' ');
                    fs::write(root.join(PERMIT), bytes).unwrap();
                }
                _ => rewrite_permit(&root, |p| {
                    p.approval.recovery_root = db.root.join("wrong-recovery")
                }),
            }
            assert!(consume_request(&root, &pin).is_err());
            assert_eq!(files(&db.path).unwrap(), before);
            assert!(!fs::read_dir(&root).unwrap().any(|p| p
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with("quarantine-")));
        }
    });
}
#[test]
fn changed_database_identity_and_wrong_target_burn_the_attempt_without_migrating() {
    run(async {
        for changed_identity in [true, false] {
            let (db, root, pin) = ready().await;
            issue(&root.join(APPROVAL), &pin).unwrap();
            if changed_identity {
                // Replace only a just-created synthetic fixture, retaining its old file.
                let old = db.root.join("retained-original.sqlite3");
                fs::rename(&db.path, &old).unwrap();
                fs::copy(&old, &db.path).unwrap();
                assert!(matches!(
                    consume_request(&root, &pin),
                    Err(Failure::StaleInput)
                ));
                assert_eq!(fs::read(&old).unwrap(), fs::read(&db.path).unwrap());
            } else {
                let mut request = consume_request(&root, &pin).unwrap();
                request.database = db.root.join("never-open-this.sqlite3");
                assert!(matches!(
                    execute(&request, Fault::None).await,
                    Err(Failure::Authorization)
                ));
                assert!(!request.database.exists());
            }
            assert!(matches!(
                consume_request(&root, &pin),
                Err(Failure::PermitConsumed)
            ));
            let mut c = open(&db.path, true).await.unwrap();
            check_history(&mut c, 11).await.unwrap();
            c.close().await.unwrap();
        }
    });
}
#[test]
fn failed_migration_or_interrupted_consumption_never_resets_authorization() {
    run(async {
        for interrupted in [false, true] {
            let (db, root, pin) = ready().await;
            issue(&root.join(APPROVAL), &pin).unwrap();
            if interrupted {
                assert!(matches!(
                    consume(&root.join(PERMIT), &pin, ConsumeFault::AfterReservation),
                    Err(Failure::Injected)
                ));
                assert!(root.join("consumed").is_dir());
                assert!(!root.join("consumed/attempt.json").exists());
            } else {
                let request = consume_request(&root, &pin).unwrap();
                assert!(matches!(
                    execute(&request, Fault::AfterHistory).await,
                    Err(Failure::Injected)
                ));
                assert!(matches!(
                    execute(&request, Fault::None).await,
                    Err(Failure::PermitConsumed)
                ));
            }
            assert!(matches!(
                consume_request(&root, &pin),
                Err(Failure::PermitConsumed)
            ));
            assert!(matches!(
                issue(&root.join(APPROVAL), &pin),
                Err(Failure::PermitConsumed)
            ));
            let mut c = open(&db.path, true).await.unwrap();
            check_history(&mut c, 11).await.unwrap();
            integrity(&mut c).await.unwrap();
            c.close().await.unwrap();
        }
    });
}
#[test]
fn concurrent_consumers_only_issue_one_execution_capability() {
    run(async {
        let (db, root, pin) = ready().await;
        issue(&root.join(APPROVAL), &pin).unwrap();
        let mut threads = vec![];
        for _ in 0..2 {
            let root = root.clone();
            let pin = pin.clone();
            threads.push(std::thread::spawn(move || {
                consume(&root.join(PERMIT), &pin, ConsumeFault::None).map(|_| ())
            }));
        }
        let results: Vec<_> = threads.into_iter().map(|t| t.join().unwrap()).collect();
        assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
        assert_eq!(
            results
                .iter()
                .filter(|r| **r == Err(Failure::PermitConsumed))
                .count(),
            1
        );
        let mut c = open(&db.path, true).await.unwrap();
        check_history(&mut c, 11).await.unwrap();
        c.close().await.unwrap();
    });
}
#[test]
fn incomplete_issuance_never_gets_reissued() {
    run(async {
        let (db, root, pin) = ready().await;
        fs::DirBuilder::new()
            .mode(0o700)
            .create(root.join("issued"))
            .unwrap();
        File::open(&root).unwrap().sync_all().unwrap();
        assert!(matches!(
            issue(&root.join(APPROVAL), &pin),
            Err(Failure::PermitConsumed)
        ));
        assert!(consume_request(&root, &pin).is_err());
        assert!(!root.join(PERMIT).exists());
        assert!(db.path.is_file());
    });
}
#[test]
#[ignore = "owned process entry point; parent verifies durable consumption after process exit"]
fn consumption_crash_child() {
    let path = PathBuf::from(std::env::var("CC_M012_PERMIT_CHILD").unwrap());
    let pin = std::env::var("CC_M012_PERMIT_PIN").unwrap();
    let _ = consume(&path, &pin, ConsumeFault::CrashAfterReservation);
    panic!("consumption fault not reached");
}
#[test]
fn process_exit_during_consumption_leaves_no_reusable_permit() {
    run(async {
        let (db, root, pin) = ready().await;
        issue(&root.join(APPROVAL), &pin).unwrap();
        let before = files(&db.path).unwrap();
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "migration012::adapter::permit::tests::consumption_crash_child",
                "--ignored",
                "--nocapture",
            ])
            .env("CC_M012_PERMIT_CHILD", root.join(PERMIT))
            .env("CC_M012_PERMIT_PIN", &pin)
            .output()
            .unwrap();
        assert_eq!(output.status.code(), Some(86));
        assert!(matches!(
            consume_request(&root, &pin),
            Err(Failure::PermitConsumed)
        ));
        assert_eq!(files(&db.path).unwrap(), before);
    });
}
#[test]
fn stale_or_conflicting_preparation_never_issues_authorization() {
    run(async {
        let mut db = fixture::synthetic_fixture(true, false).await.unwrap();
        let path = db.path.clone();
        exclusive(db.conn().unwrap(), &path).await.unwrap();
        assert!(prepare(
            path.clone(),
            db.root.join("conflict"),
            now().unwrap() + 3600
        )
        .await
        .is_err());
        assert!(!db.root.join("conflict/approval.json").exists());
        check_history(db.conn().unwrap(), 11).await.unwrap();
        db.close().await.unwrap();
        let mut c = open(&path, false).await.unwrap();
        c.execute("CREATE TABLE unknown_extra(id TEXT)")
            .await
            .unwrap();
        c.close().await.unwrap();
        assert!(matches!(
            prepare(path, db.root.join("schema"), now().unwrap() + 3600).await,
            Err(Failure::Schema)
        ));
        assert!(!db.root.join("schema/approval.json").exists());
    });
}
