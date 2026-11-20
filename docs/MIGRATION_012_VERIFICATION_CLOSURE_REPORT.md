# Migration 012 — verification closure

**READY WITH DOCUMENTED LIMITATIONS — 19 November 2026.** The complete affected frontend group now passes unchanged: **18/18, no skips**. All five earlier failures also passed in an initial, separate 8-test reproduction run. Six focused native safety regressions and five CLI checks passed their expected outcomes. No product code, tests, assertions, timeouts, configuration, permit, or migration behavior changed.

This is readiness for a separate owner decision, not execution approval. The precise initiating cause of the earlier failures remains unresolved. There is strong evidence of transient test-environment slowdown, but insufficient evidence to attribute it to a particular resource or to claim a synchronization defect was fixed. No active test failure or demonstrated migration-safety defect remains in this affected group.

## Evidence and preservation

Authoritative repository: `/Users/athfan/Desktop/career-compiler`; branch `ui-ux-overhaul`; HEAD `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`.

Evidence directory, abbreviated **E** below:

`/Users/athfan/Desktop/career-compiler-migration012-closure-20261119-010923`

All 1,346 baseline source files, including untracked work, matched the preceding safety report's final manifest. A recovery archive was verified member by member, with hashes and modes: `E/source-before.tar.gz`, SHA-256 `4858ca3fd49254f91c35ab3aa0c93a80ecd14067498d7c4059cf2f9e68810759`. The only repository addition is this report. `E/final-preservation.json` records the final source, mode, branch, HEAD, index/protected Git, archive, and existing QA-copy comparisons.

Testing used the existing isolated `verification-source` under `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112`, with its dedicated QA HOME, temporary/cache paths, offline dependencies, and no credentials. All baseline files and modes matched between it and the authoritative repository. No new development copy was created.

No real database, real-data backup, production sidecar, résumé/application record, or credential was accessed. This is an access-boundary statement, not a newly measured production-integrity result. No native desktop app was launched; no owner-enabled executable was built; no permit was issued. Existing recovery materials were retained.

## Five original failures and classification

Exact original log: `/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/frontend-final.log`. Full test names, messages and locations are transcribed in `E/failure-classification.json`.

| Test / original location | Exact original message | Classification and current evidence |
| --- | --- | --- |
| `standaloneMasterPersistence.test.ts:25` — approval, legacy references, standalone Master/child and restart | `Error: Test timed out in 5000ms.` | **Unresolved historical cause; probable runner/resource instability.** Original duration 5,077 ms. Unchanged test completed in 505 ms and 530 ms now, including rollback, original-row/reference comparisons and restart. No failed data assertion was reported in the original run. |
| `TailorResumePage.test.tsx:40:35` — lazy-load mock workflow and save explicitly | `TestingLibraryElementError: Unable to find role="button" and name \`/run safe seed/i\`` | **UI readiness-wait failure; underlying cause unresolved.** Failed at the initial dashboard control, before seeding/tailoring. Both current runs complete the entire workflow, including explicit review/save and Master/child preservation. |
| `ResumeEntryPoints.test.tsx:15:16` — distinct import/create/tailor actions | `TestingLibraryElementError: Unable to find role="heading" and name "Resumes"` | **UI readiness-wait failure; underlying cause unresolved.** Initial route heading did not satisfy the default wait. Both current runs pass all navigation/intake/no-write assertions. |
| `ResumeEntryPoints.test.tsx:38:33` — reject unreviewed evidence | `TestingLibraryElementError: Unable to find role="button" and name "Analyze job"` | **UI readiness-wait failure; underlying cause unresolved.** Initial route control timed out, before testing evidence rejection. Both current runs reach the rejection and verify zero résumé writes. |
| `ResumeEntryPoints.test.tsx:53:33` — duplicate standalone Master | `TestingLibraryElementError: Unable to find an element with the text: More options. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.` | **UI readiness-wait failure; underlying cause unresolved.** Both current runs complete duplication and verify the original Master and jobs are unchanged. No text matcher was relaxed. |

The UI tests use the actual lazy-routed App, React Query and asynchronous repository/route rendering. Their original DOM dumps stop in the sidebar before the main workspace, so they do **not** prove which route/loading state was present. Source inspection alone cannot distinguish delayed dynamic import, rendering, query readiness or host scheduling at that past instant. The existing waits already assert the real requested controls; no demonstrated synchronization fault justified rewriting them.

The identical eight-file command originally took **109.46 s** (transform 15.78 s, setup 5.24 s, import 26.15 s, environment 43.59 s). It now took **14.44 s** (transform 1.56 s, setup 0.372 s, import 2.97 s, environment 3.59 s). The earlier report also records a worker-start timeout in a separate attempt. This supports a runner/environment timing explanation; it does not establish CPU, memory, I/O, or another process as the cause. No process inspection or induced machine stress was used.

**Changes made: none to executable source or tests.** No timeout increased, assertion removed, test suppressed, retry policy changed or cache reset. These failures are not the separately established five Jobs baseline failures. Those unrelated cases were not rerun or reclassified.

If these timing failures recur, capture the full main-workspace DOM and route/import/repository readiness timings in that failing run before selecting a wait fix. Current passing runs do not retroactively turn the original failures into passes.

## Focused verification performed in this run

Commands ran through `python3 E/check.py NAME COMMAND...`; each `NAME-result.json` records the literal command, cwd, completion time and exit status, alongside its log. Node/npm paths are `/Users/athfan/.local/node-v22.23.4/bin/node` and `/Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js`.

1. `reproduce`: same single-worker configuration, the three previously failing test files — **8 passed**, 7.86 s.
2. `frontend-affected`: the entire original affected group — **18 passed in 8 files, zero failures/skips**, 14.44 s. Includes the optional native-migrated repository integration case, enabled using this run's fresh synthetic native artifact.

```sh
node npm-cli.js run test:run -- --pool=forks --no-file-parallelism --maxWorkers=1 \
  src/lib/database/migration012.test.ts \
  src/lib/database/standaloneMasterPersistence.test.ts \
  src/lib/resume/masterPdf.test.ts \
  src/lib/tailoring/standaloneMaster.test.ts \
  src/lib/tailoring/jobSpecificVariant.test.ts \
  src/features/resume-library/ProfileMasterCreator.test.tsx \
  src/features/resume-library/ResumeEntryPoints.test.tsx \
  src/features/tailoring/TailorResumePage.test.tsx
```

3. `rust-safety`: **6 passed**, 3.75 s, using the existing native test executable `verification-source/src-tauri/target/debug/deps/career_compiler_lib-b8f1474a92e00fe3`, with `--test-threads=1` and these filters:

```text
owner_mode_and_invalid_arguments_stop_before_opening_a_target
failures_roll_back_schema_data_and_history
fresh_native_schema_tracks_012_without_a_job
lost_ownership_never_restores_or_quarantines_with_a_conflicting_connection
native_011_to_012_preserves_all_relationships_and_wal_backup
post_commit_failure_requires_recovery_without_replacing_database
```

The bundled native SQLite version was **3.46.0**. `E/native-receipt.json` verifies reopened integrity/FKs and identical fingerprints for every original non-migration-metadata table, including résumé/application relationships. The fresh synthetic WAL-safe backup SHA-256 is `87adec5f7bb7233fe47ee7af7abc2dc55ca08435088c1d8848be465172987dee`. `E/native-owned-root.txt` identifies its newly created synthetic root; `E/native-migrated.sqlite3` is the frontend integration input. The repository test verifies SQL NULL for a jobless Master, a real synthetic job association for its child, original/submitted résumé identity, application equality, and persistence on reopen.

4. `python3 E/cli-denial-checks.py`: **5 expected outcomes passed** — help, disabled owner invocation, runtime pin unable to activate owner execution, disabled issuance, and rejection of an unowned synthetic target. Only nonexistent paths inside E were supplied. They remained nonexistent. Exact vectors/results: `E/cli-denial-results.json`.

The prior **75 Rust passes, 13 CLI checks, TypeScript, lint, Rustfmt, Clippy and builds** remain historical results from the unchanged implementation, not new passes claimed here. No unrelated full suite/build repetition was necessary for this documentation-only closure. Frontend PDF preview/serialization boundaries passed; real native XeLaTeX rendering and interactive desktop QA were not repeated.

## Migration safeguards and readiness review

Reviewed actual `adapter.rs`, `adapter/permit.rs`, the transaction/post-commit branches in `mod.rs`, their tests, the dedicated CLI entry point, feature/startup registration and repository schema detection. All remain byte-for-byte baseline-identical.

| Control | Finding |
| --- | --- |
| Exact authority | `compiled_pin()` uses compile-time `option_env!("CC_MIGRATION012_APPROVAL_SHA256")`; runtime env/CLI input cannot arm an unpinned executable. The approval digest binds exact database path/identity/hash, manifest, recovery directory, operation, SQL and validity. Issuance binds the running executable's canonical path, inode/device, mode, size and SHA-256. |
| Intended issuance | Only the explicit `issue-owner-permit --approval ... --confirm AUTHORIZE_MIGRATION_011_TO_012` route issues a real-mode permit, after compiled-pin and source validation. Preparation alone does not authorize execution. Ordinary startup has no route to issuance or migration. |
| Expiration and single use | Maximum 3,600 seconds from preparation; future, expired or extended validity rejected. Durable issuance and atomic durable consumption reservations prevent replay/incomplete-attempt reuse. Consumption precedes source access. In-memory reuse also fails. Authority is rechecked at entry, before rebuild, and before commit. |
| Missing/mismatched permits | Owner parsing requires a permit; shared consumption rejects absent/malformed, wrong pin/seal, expired, consumed, wrong operation/SQL/root/executable/source/manifest. Prior synthetic permit tests cover these cases; prior built-CLI results cover valid consumption, replay, confirmation and runtime-pin denial. This run reconfirms the unpinned CLI boundary without issuing anything. |
| Ownership and schema | Dedicated native SQLite connection acquires the real exclusive lock; OWNER is only identity metadata. Exact 011 schema/history/objects, original fingerprints, integrity/FKs, manifest and reviewed SQL are checked. No arbitrary SQL/force bypass was introduced. |
| Failure handling | Pre-commit failures roll back and verify original state. COMMIT uncertainty or any post-commit validation/close/receipt failure returns `RecoveryRequired`. No automatic database/sidecar rename, replacement, restoration or quarantine branch exists. Both post-commit and conflicting-reopen tests pass now. |
| Startup and identity | 012 remains outside startup migrations; repository initialization tolerates completed 012 and detects nullable Master storage. All original rows, IDs, provenance, submitted résumé references and attachments are fingerprint-protected. The native/frontend round trip passes now. |

Enforceability is within the documented trusted owner-account, reviewed-binary, local-filesystem and system-clock model. It does not protect against an administrator rewriting the executable, deleting consumption state, rolling back the filesystem or manipulating time. No automatic post-commit restoration is possible **through this adapter**; separately authorized manual recovery remains possible. No further product-code change is identified as necessary for the one-time operation.

## Proposed future owner approval packet — not authorization

**Fresh real-data preflight and backup are still mandatory.** Prior real-data evidence is historical and was not accessed here. All CareerCompiler desktop/development writers must remain closed from preparation through final verification. Require the owner's renewed closure confirmation and actual SQLite exclusive ownership; stop on a conflict without process inspection or interference.

Target, exactly:

`/Users/athfan/Library/Application Support/com.mirathfan.careercompiler/careercompiler.db`

The verified, currently unpinned preparation executable is:

`/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/unpinned-migration012`

SHA-256: `5f37593bc6c6e8ec3ee91eece874bf6a3f82d7723ae2080dca93f9749b873e28`; mode 0755. It cannot execute owner migration.

After separate authorization for fresh preparation, its exact CLI interface is:

```sh
"/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/unpinned-migration012" prepare-owner \
  --database "/Users/athfan/Library/Application Support/com.mirathfan.careercompiler/careercompiler.db" \
  --recovery-root "<NEW_CANONICAL_RECOVERY_DIRECTORY>" \
  --expires-at "<APPROVED_UNIX_EXPIRY_WITHIN_3600_SECONDS>" \
  --confirm ALL_CAREERCOMPILER_WRITERS_STOPPED
```

Preparation must validate exact Migration 011 schema/history, all 22 résumé columns, four indexes, dependent objects and references; run integrity/FK checks; create/sync/reopen/verify a fresh `VACUUM main INTO` backup; compare schema and all-table fingerprints; and seal the current database/sidecar identities in `invocation.json` and `approval.json`. No records appear in the approval document. The owner must review the resulting exact digests and expiry.

**No final production-pinned executable or real manifest exists for this operation yet.** Its final canonical path and SHA-256 must be filled in and reviewed before execution; an earlier synthetic executable is not a substitute. Following approval of the fresh approval-document digest, build the unchanged `careercompiler-migrate012` target with `--features migration012-adapter --locked --offline` and the compile-time environment `CC_MIGRATION012_APPROVAL_SHA256=<EXACT_APPROVED_APPROVAL_SHA256>`, using the existing isolated toolchain. Use a separate new build-output directory. Verify the final executable hash/mode at its intended permanent invocation path **before** issuance; do not move/rebuild it afterward. This is future configuration/build work, not missing migration-engine implementation, and was not performed in this task.

The exact issuance and execution argument contracts to complete in the future packet are:

```sh
"<FINAL_CANONICAL_EXECUTABLE>" issue-owner-permit \
  --approval "<NEW_CANONICAL_RECOVERY_DIRECTORY>/approval.json" \
  --confirm AUTHORIZE_MIGRATION_011_TO_012

"<FINAL_CANONICAL_EXECUTABLE>" migrate --mode owner \
  --database "/Users/athfan/Library/Application Support/com.mirathfan.careercompiler/careercompiler.db" \
  --manifest "<NEW_CANONICAL_RECOVERY_DIRECTORY>/invocation.json" \
  --manifest-sha256 "<EXACT_APPROVED_MANIFEST_SHA256>" \
  --permit "<NEW_CANONICAL_RECOVERY_DIRECTORY>/permit.json" \
  --confirm MIGRATE_011_TO_012
```

These are deliberately uninstantiated templates. No placeholder may remain at actual approval/execution, and no current artifact supplies authority for real data. Expiry, changed input or failed consumption requires fresh preparation and a new owner approval, never resetting/extending/reusing the old permit.

Execution makes another fresh verified WAL-safe backup under its exclusive connection immediately before the transaction. Foreign keys are disabled and verified before BEGIN; the exact reviewed SQL (`cbaab894011a6cd889388b9b28bebd9b9714df70109caa0e723048b0bd229d14`) rebuilds the table; schema/indexes, references and every original row fingerprint are verified; history ID 12 and its success record are inserted atomically. Authority is rechecked before COMMIT. Foreign keys are restored, the database is reopened with reacquired ownership, and schema/history, integrity, FKs, all original identities/relationships, backup and receipt are verified. Only `kind='master'` may have SQL NULL `job_id`; existing non-null associations and Master designation remain unchanged. No startup rebuild is enabled.

Proposed owner statement, to present only with all exact values filled in:

> I authorize one Migration 011 → 012 attempt on `/Users/athfan/Library/Application Support/com.mirathfan.careercompiler/careercompiler.db`, using the reviewed final executable at **[canonical path, SHA-256, mode]**, bound to **[approval digest, authorization ID and expiry]**, **[manifest path/digest]**, the reviewed SQL digest, **[recovery directory identity]**, and **[fresh verified backup path/digest]**. All application/development writers will remain stopped. Require renewed compatibility/integrity/FK checks, exclusive ownership, the fresh execution backup, original-row and submitted-résumé/application-reference preservation, and reopened post-commit verification. Permit only this exact command and one durable attempt. Stop on any mismatch or failure; roll back before commit. On uncertain commit or post-commit failure, return `RecoveryRequired`, preserve the database/sidecars and all recovery/authorization evidence, and perform no automatic replacement or restore. Any retry, new permit or manual recovery requires separate approval.

On `RecoveryRequired`, keep the app closed and preserve the current main database **and all sidecars together**, both backups/manifests, approval/permit/issued/consumed state, and diagnostics. Do not retry, reset authorization state, overwrite the database or assume it is still 011. A separately authorized recovery assessment must establish ownership throughout recovery and determine whether 012 is already valid before considering restoration; restoring 011 could discard intervening writes. The adapter intentionally provides no automatic recovery command.

**Remaining limitations:** historical timing cause not conclusively identified; unrelated Jobs baseline failures remain outside scope; no new live/native UI/PDF acceptance or real-data compatibility claim; fresh real preparation, exact final executable/manifest approval and one-time authorization are still required. These do not justify more product changes or permitting execution now.
