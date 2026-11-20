# Migration 012 — final safety hardening

## A. Executive summary

**Status: PARTIAL.** Both safety fixes passed native synthetic verification, but the final targeted frontend run retained 5 failures out of 18 tests. This prevents an unqualified readiness claim; no frontend implementation or assertions were changed. This task uses synthetic databases only; it does not authorize production preparation, permit issuance, or migration.

Two changes are implemented in the existing native maintenance adapter/engine: an exact, expiring, single-use owner authorization lifecycle, and a fail-closed manual-recovery boundary after commit. The reviewed rebuild SQL, ordinary startup migration registration, application permissions, acceptance guards, and credential handling are unchanged.

## B. Source changes and preservation

Authoritative source: `/Users/athfan/Desktop/career-compiler`. Baseline branch `ui-ux-overhaul`; HEAD `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`. All 1,343 baseline source files matched the previous preservation manifest, including untracked work. A new source archive was verified member-by-member, including modes:

`/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/source-before.tar.gz`

SHA-256: `cf05bf62fc718e40578084e5db60567926a2003d7fbcbf4531e0b2badef79f3f`.

Modified: `src-tauri/src/migration012/adapter.rs`, `mod.rs`, `tests.rs`, and `adapter/tests.rs`. Added: `adapter/permit.rs`, `adapter/permit/tests.rs`, and this report. No dependency or build-script changes are required.

The new module wraps the existing manifest, file identity, exclusive SQLite ownership, schema validation, fingerprint, WAL-safe backup, and transactional rebuild functions. It does not implement another migration engine.

## C. Permit lifecycle and safeguards

1. **Preparation is explicit and does not authorize execution.** `prepare-owner` requires an absolute canonical database path, a new separate recovery directory, an absolute expiry timestamp, and a confirmation that all CareerCompiler writers have stopped. It obtains the actual SQLite exclusive lock, verifies exact 011 schema/history/metadata/integrity/FKs, creates/reopens/verifies a WAL-aware backup, and seals the closed source/sidecar identities and logical fingerprint into `invocation.json`. The new recovery directory is mode 0700; authorization artifacts are mode 0600. Existing recovery directories are never reused or overwritten.
2. `approval.json` binds format, exact `MIGRATE_011_TO_012` operation, randomly generated 128-bit authorization ID, creation time, expiry, canonical target path, device/inode/size/mode/SHA-256 of the database, recovery directory device/inode, invocation-manifest SHA-256, and reviewed SQL SHA-256. It contains no row content. Validity is at most 3,600 seconds from preparation. A future creation timestamp, expired authorization, or longer lifetime is rejected.
3. **Independent build-time trust anchor.** The owner reviews that exact document and approves its digest. The maintenance executable must then be explicitly built with `CC_MIGRATION012_APPROVAL_SHA256` set to that digest at compile time. Rust `option_env!` captures the value; a runtime environment variable or CLI flag cannot enable an unpinned binary. Ordinary builds have no pin. The opt-in `migration012-adapter` feature remains separate from ordinary startup.
4. `issue-owner-permit` requires that compiled pin and confirmation `AUTHORIZE_MIGRATION_011_TO_012`. It checks the approved document, expiry, recovery identity, manifest, source and sidecars. It pins the issuing executable's canonical path, device/inode/size/mode/SHA-256. It durably creates an `issued/` reservation before writing a hash seal and `permit.json`. Interrupted issuance is not retried or reset.
5. `migrate --mode owner` requires the pinned executable, exact database/manifest/hash, permit path, and original `MIGRATE_011_TO_012` confirmation. It checks the approved contents against the compiled digest, the issued seal, time, recovery directory, and running executable. It then atomically creates `consumed/` and syncs its parent **before database access**. An existing reservation rejects replay, including an incomplete attempt. The attempt record is synced; source/manifest checks follow. No automatic reset or renewal exists. Concurrent consumers can obtain only one capability.
6. The capability also permits only one execution in memory. Time, recovery identity, and executable are revalidated at engine entry, immediately before beginning the rebuild, and inside the transaction before commit. Expiration during precommit work rolls back; the permit remains consumed. Failed executions require a newly prepared document and separate new owner approval, not a retry or extension of the old authorization.

The compiled approval pin is the authority for one target, not a general production switch. The issued executable identity prevents moving/rebuilding/replacing the executable and reusing its permit. Local authorization state assumes a trusted owner account, trusted reviewed binary, reliable local filesystem sync, and a correct system clock. It is not a defense against an administrator rewriting binaries, deleting consumption state, restoring the filesystem from an old snapshot, or manipulating the clock. Do not restore/reset authorization state as part of database recovery.

## D. Recovery ownership correction

The `OWNER` marker is explicitly documented as identity metadata, not an interprocess lock. SQLite exclusive locking on the dedicated connection is the ownership mechanism during preflight, backup, and transaction. Closing that connection releases its ownership; reopen must reacquire it.

The automatic restore function has been removed. No post-commit path renames, moves, replaces, copies over, deletes, or quarantines the database or its sidecars. A failed/uncertain COMMIT or failed post-commit verification returns `RecoveryRequired` and preserves the current database, verified backup, and fixed-code diagnostics. Diagnostic-write failures do not turn that result into a misleading lesser error. Adapter close/receipt failures after successful commit also require recovery review.

Before commit, the existing rollback path remains: rollback the active transaction, restore/verify foreign keys, compare exact 011 schema and every original table fingerprint, and check integrity. A committed migration cannot be transactionally rolled back. After commit, no automatic file restoration is attempted even if a later connection can acquire a lock.

## E. Synthetic authorization verification

**10 permit-specific Rust tests passed**, including multiple negative cases per test. Tests cover valid, absent, unauthorized, expired/future/overlong, reused, malformed/tampered, wrong-operation, wrong-SQL, wrong-executable, wrong-target, changed-database-identity, changed-recovery-root and changed-manifest cases. They exercise incomplete issuance, consumption interruption, an owned child process exiting during consumption, concurrent consumption, failed migration followed by retry, and expiry before commit. All inputs are freshly created synthetic fixtures.

## F. Synthetic recovery verification

A regression test was first run against the original implementation and failed because it restored the database after a simulated post-commit verification failure. Updated tests require `RecoveryRequired`, retain 012 in the original database, validate the 011 backup, compare original row fingerprints, and forbid quarantine. A second owned native SQLite connection takes a conflicting lock during the close/reopen gap; the runner must fail reacquisition without disturbing that connection or replacing database files.

**33 focused native tests passed, 0 failed**, including the authorization tests and both recovery-ownership cases. Four special entry points were ignored in the ordinary run: three owned crash helpers were actually executed and verified by their parent tests; the historical native PDF entry point was not needed or rerun for this safety-only change. Existing native tests still cover transaction rollback after copy/drop/rebuild/history, owned child-process interruption, WAL-only committed records in the backup, backup corruption, incompatible schema/dependencies/indexes/history, invalid FKs, and validated repeated execution.

## G. Regression commands and results

- **75 Rust tests passed**: 33 focused native migration/permit tests plus all 42 other existing Rust tests. The existing compiled test binary ran the 42 regressions with `--skip migration012`, avoiding a repeat of the completed migration cases.
- **13 built CLI invocations passed their expected outcomes**, across the unpinned and synthetic-pinned binaries. The runtime environment could not activate the unpinned binary or change the pinned binary's authority. Wrong confirmation did not consume the permit; valid execution did, and replay/reissuance were rejected. Target inode and all nonmetadata table fingerprints were preserved; the actual backup SHA-256 matched the receipt.
- **TypeScript, lint, Rustfmt, Clippy (`-D warnings`), frontend production build, native desktop debug build, and both maintenance CLI builds passed**. Lint retained one existing warning about a control-character regex; Vite retained the existing large-chunk warning. No desktop application was launched.
- Final focused frontend command: exit **1**; Test Files  3 failed | 5 passed (8); Tests  5 failed | 13 passed (18); Duration  109.46s (transform 15.78s, setup 5.24s, import 26.15s, tests 22.90s, environment 43.59s).
- Frontend acceptance remains incomplete. Do not classify these failures as previously known Jobs baseline failures, and do not claim full application regression success. No frontend implementation or assertion was changed.
- Earlier focused frontend attempts are preserved: concurrent/default worker run **9 passed, 7 failed, 1 skipped**, plus a worker-startup timeout (one test file never started); serial threads run **10 passed, 7 failed, 1 skipped**. Four test cases exceeded the unchanged 5-second limit, and three UI cases failed waiting for loading to finish. The native artifact did not yet exist for their optional round-trip case. A hash-only diagnostic of the owned test executable measured 11.37 seconds for 18.8 MB in the debug SHA-256 dependency; slow checks were observed without inspecting other processes. The final run is reported separately, not substituted silently for these failures.
- The initial `recovery-red` test deliberately failed against the original restore behavior, then passed in the updated focused suite. That preserved failure is root-cause evidence, not an outstanding regression.

Commands and complete logs are retained under `/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723`. Checks run through its `check.py`, in the existing isolated `verification-source`, with dedicated QA HOME/temp/cache paths, offline dependencies, and no credentials. No new full development copy was created.

Exact recorded command vectors (shell-quoted here for readability):

- `rust-focused` — exit `0`; log `/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/rust-focused.log`.

```sh
/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo test --manifest-path src-tauri/Cargo.toml --locked --offline migration012 -- --test-threads=1
```

- `rust-regressions` — exit `0`; log `/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/rust-regressions.log`.

```sh
/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/verification-source/src-tauri/target/debug/deps/career_compiler_lib-b8f1474a92e00fe3 --skip migration012 --test-threads=1
```

- `typecheck` — exit `0`; log `/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/typecheck.log`.

```sh
/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run typecheck
```

- `lint` — exit `0`; log `/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/lint.log`.

```sh
/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run lint
```

- `rustfmt` — exit `0`; log `/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/rustfmt.log`.

```sh
/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

- `clippy` — exit `0`; log `/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/clippy.log`.

```sh
/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --offline --locked -- -D warnings
```

- `cli-build-unpinned` — exit `0`; log `/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/cli-build-unpinned.log`.

```sh
/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo build --manifest-path src-tauri/Cargo.toml --locked --offline --features migration012-adapter --bin careercompiler-migrate012
```

- `cli-build-synthetic-pin` — exit `0`; log `/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/cli-build-synthetic-pin.log`.

```sh
/usr/bin/env CC_MIGRATION012_APPROVAL_SHA256=a1fd4abd97e1b16444bf509184339c35faa30b097c9245f08caa569578dd4efc /Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo build --manifest-path src-tauri/Cargo.toml --locked --offline --features migration012-adapter --bin careercompiler-migrate012
```

- `native-build` — exit `0`; log `/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/native-build.log`.

```sh
/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run tauri:build -- --debug --no-bundle
```

- `frontend-final` — exit `1`; log `/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/frontend-final.log`.

```sh
/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run test:run -- --pool=forks --no-file-parallelism --maxWorkers=1 src/lib/database/migration012.test.ts src/lib/database/standaloneMasterPersistence.test.ts src/lib/resume/masterPdf.test.ts src/lib/tailoring/standaloneMaster.test.ts src/lib/tailoring/jobSpecificVariant.test.ts src/features/resume-library/ProfileMasterCreator.test.tsx src/features/resume-library/ResumeEntryPoints.test.tsx src/features/tailoring/TailorResumePage.test.tsx
```

The CLI invocation argument vectors, exit codes, and responses are in `cli-prepare-results.json` (6 expected outcomes) and `cli-armed-results.json` (7 expected outcomes); `cli-safety.py` records the orchestration. Only generated synthetic paths were supplied.


The previously reported five frontend failures (four Jobs page scenarios and one job workspace filter using aging fixed-date fixtures) are historical baseline failures. Their source and assertions are unchanged. They must not be reported as new passes or conflated with failures from this run.

The actual owner-mode CLI target was:

`/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/qa-temp/synthetic-migration012-3e4953c6a72c523d6b3622ec84ef44b2/synthetic.sqlite3`

Its receipt is `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/qa-temp/synthetic-migration012-3e4953c6a72c523d6b3622ec84ef44b2/owner-approval-cli/receipt-b6a2e423f2d0378aca2577b18d9cba26.json`. Bundled SQLite reported `3.46.0`. The synthetic-pinned executable SHA-256 was `58fab5ab270e1ad925c70b5194474ce0d753d2c18bdab05419842b9e04766b22`; its consumed approval digest was `a1fd4abd97e1b16444bf509184339c35faa30b097c9245f08caa569578dd4efc`. These are evidence artifacts only and authorize no real database.

The five final failures were:

- src/lib/database/standaloneMasterPersistence.test.ts > requires approval of the schema change, preserves every legacy row/reference, then saves a standalone Master and tailored child atomically across restart
- src/features/tailoring/TailorResumePage.test.tsx > main tailoring workflow > lazy-loads the mock workflow and persists only after explicit save
- src/features/resume-library/ResumeEntryPoints.test.tsx > connects Résumés to local document intake and distinct creation/tailoring actions
- src/features/resume-library/ResumeEntryPoints.test.tsx > blocks starter generation from unreviewed evidence with a useful error and no résumé write
- src/features/resume-library/ResumeEntryPoints.test.tsx > duplicates a standalone Master without inventing a job or changing its original

One persistence test exceeded its 5-second test limit; four UI assertions timed out waiting for expected controls. Their precise underlying timing/loading cause was not established. The native-artifact repository round trip, two standalone Master UI review/save/preview tests, PDF preview boundaries, and job-specific variant tests passed. This task does not alter unrelated frontend behavior or relax test limits. The historical five Jobs failures were not rerun and remain a separate baseline classification.

## H. Backup and data preservation

The reviewed SQL remains pinned to `cbaab894011a6cd889388b9b28bebd9b9714df70109caa0e723048b0bd229d14`. Preparation and execution both reuse `VACUUM main INTO` with exclusive SQLite ownership, synced backup and directory, reopened integrity/FK/schema checks, all-table logical fingerprints, and physical backup SHA-256. Execution makes a fresh verified backup immediately before the rebuild; an older preparation backup is not substituted.

The owner database, real-data backups and sidecars are not opened, inspected, hashed, or modified in this task. Credentials and Keychain are not accessed. Earlier recovery artifacts are not modified. This is an access-boundary statement, not a newly measured real-data integrity claim.

## I. Remaining production risks and manual recovery boundary

Real-data compatibility and ownership are not established by synthetic tests. They must be renewed under separate authorization. All app/development writers must remain closed from preparation through execution. The native SQLite lock rejects conflicts; no process inspection, historical PID signaling, or invented advisory lock is used.

If `RecoveryRequired` occurs, keep CareerCompiler closed. Do not retry migration, delete a permit marker, or overwrite the database. Preserve the current main database and every existing sidecar together, both verified backups/manifests, permit/approval/consumption artifacts, and diagnostics. Obtain separate recovery authorization and establish exclusive ownership for the entire recovery operation. Reinspect the current state first: the database may already be a valid 012, or commit status may be uncertain. Restoring the 011 backup may discard writes made after lock release and cannot be assumed appropriate.

This adapter deliberately offers **no automatic restore or recovery command**. A separately reviewed manual recovery procedure must maintain independently established ownership through any file operation, preserve the failed state without deletion, verify the selected backup, restore only after explicit approval, then reopen/check schema, every original relationship/fingerprint and integrity/FKs. The earlier reports' automatic quarantine/restore descriptions are superseded by this report; they are not current recovery instructions.

## J. Exact future owner approval requirements

The following is a future procedure, not permission or a command executed against real data in this task.

1. Authorize fresh preflight/backup of exactly `/Users/athfan/Library/Application Support/com.mirathfan.careercompiler/careercompiler.db`, confirm all CareerCompiler app/development writers are stopped, and keep them stopped. Use a new separate recovery root, never an existing real-data backup or recovery directory. Run the unpinned maintenance executable explicitly:

```sh
"/ABSOLUTE/PATH/TO/UNPINNED/careercompiler-migrate012" prepare-owner \
  --database '/Users/athfan/Library/Application Support/com.mirathfan.careercompiler/careercompiler.db' \
  --recovery-root '/ABSOLUTE/NEW/RECOVERY_DIRECTORY' \
  --expires-at '<REVIEWED_UNIX_SECONDS_WITHIN_ONE_HOUR>' \
  --confirm ALL_CAREERCOMPILER_WRITERS_STOPPED
```

2. Review the returned backup verification, exact `approval.json`, nonce, expiry, canonical database identity, manifest digest and unchanged SQL digest. Explicitly authorize that one approval-document SHA-256 and its exact 011 → 012 scope. A generic approval or the old historical backup is insufficient. If the source changes or the approval expires, stop and prepare/review new authorization.
3. Build only the opt-in maintenance CLI with that approved pin; use the already approved isolated toolchain/build environment:

```sh
CC_MIGRATION012_APPROVAL_SHA256='<EXACT_APPROVED_DOCUMENT_SHA256>' \
  cargo build --manifest-path src-tauri/Cargo.toml --locked --offline \
  --features migration012-adapter --bin careercompiler-migrate012
```

Stage the executable at a fixed canonical path with one hardlink, verify its hash/source provenance, and retain it unchanged. Issuance binds that exact executable file, not a generic binary name. Do not move or rebuild it after issuance.

4. Under that explicit owner authorization, issue once:

```sh
"/ABSOLUTE/PINNED/careercompiler-migrate012" issue-owner-permit \
  --approval '/ABSOLUTE/NEW/RECOVERY_DIRECTORY/approval.json' \
  --confirm AUTHORIZE_MIGRATION_011_TO_012
```

5. Execute once, before expiry, with all returned/pinned values:

```sh
"/ABSOLUTE/PINNED/careercompiler-migrate012" migrate --mode owner \
  --database '/Users/athfan/Library/Application Support/com.mirathfan.careercompiler/careercompiler.db' \
  --manifest '/ABSOLUTE/NEW/RECOVERY_DIRECTORY/invocation.json' \
  --manifest-sha256 '<EXACT_APPROVED_MANIFEST_SHA256>' \
  --permit '/ABSOLUTE/NEW/RECOVERY_DIRECTORY/permit.json' \
  --confirm MIGRATE_011_TO_012
```

Immediately before rebuild the runner must again obtain exclusive SQLite ownership, validate exact schema/history through 011 (22 résumé columns, four explicit indexes and every dependency), check integrity/FKs and original fingerprints, and create/verify the fresh WAL-safe backup. SQL runs on that same connection with foreign keys disabled outside the transaction. All original rows must match before atomic 012 history/audit insertion; foreign keys, schema, indexes, relationships, integrity, history and fingerprints are rechecked after commit and reopen. Submitted versions, application provenance/attachments, original Masters, lineage and conversations must remain intact.

Normal application initialization already tolerates a completed 012 history and detects nullable Master storage; 012 remains absent from the startup migration registry. Ordinary startup will neither run this rebuild nor rerun it. Production fresh-install schema changes and native real-data UI acceptance are separate scopes.

Owner-facing approval wording: “I authorize one explicit Migration 011 → 012 operation on the exact CareerCompiler database path above, bound to the freshly reviewed approval digest, source identity, recovery directory, manifest, SQL and executable. All writers will remain stopped. Require the verified fresh WAL-safe backup, transactional preservation and post-commit checks. On failure, consume the permit and stop; any post-commit restoration requires separate ownership-protected recovery approval.” Actual values must replace every placeholder before approval or execution.

## K. Final status

**PARTIAL.** No real permit was issued and no real database operation was performed. The remaining acceptance requirement is investigation/resolution of the five current frontend timeout/loading failures without weakening assertions, followed by clean relevant regression evidence. Do not treat this report as final production execution approval.

The two identified implementation gaps are resolved and verified using native synthetic databases and the built CLI. No further migration-engine or startup integration code is required to use the bounded permit lifecycle. Real execution still requires fresh separately authorized preparation, exact owner approval of the new document digest and executable, the explicit pinned build/issuance, and all checks described above. Manual recovery remains a separate authorization and ownership-protected operation; no automatic restore is provided.

Source preservation is recorded in `/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/final-preservation.json`: 4 modified source/test files, 3 additions (including this report), no deletions, all other 1,339 baseline files unchanged, original modes preserved, branch/HEAD/index/protected Git metadata unchanged, archive verified, and QA source parity. The final manifest contains exact hashes and modes. The complete QA comparison found three historical Markdown reports missing from the test copy; no executable source differed. Those reports were copied without overwriting any QA files, and complete source parity was rechecked (`qa-comparison.json`). The source diff is `/Users/athfan/Desktop/career-compiler-migration012-safety-20261118-171723/changes.diff`.

For source-only rollback, first preserve any subsequent edits and compare against the final manifest. Restore only the four modified files from the verified `before/` copies or matching members of `source-before.tar.gz`; retain the three added files in a separate quarantine location instead of deleting them. Do not reset/clean Git or overwrite later work. Source rollback is unrelated to database recovery: no real database migration occurred in this task.
