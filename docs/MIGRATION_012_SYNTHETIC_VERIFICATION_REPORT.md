# Migration 012 — native synthetic verification

Status: **COMPLETE for the owner's approved implementation and synthetic-testing scope. Production migration remains NOT AUTHORIZED and DISABLED.**

## Implementation and exact SQL

The dedicated native runner is [src-tauri/src/migration012/mod.rs](../src-tauri/src/migration012/mod.rs). `src-tauri/src/lib.rs` declares it only under `#[cfg(test)]`. It is absent from normal application builds, has no Tauri command, no production path resolver, no runtime enable switch, and no startup hook. The runner's input is a capability for a freshly created, uniquely owned synthetic database; its constructor cannot accept an existing database path. The general SQL command restrictions, production application identifier, acceptance guards and Keychain code are unchanged.

The runner includes the **unchanged reviewed SQL** directly from [012_standalone_master_resume.sql](migration-proposals/012_standalone_master_resume.sql), pinned to SHA-256 `cbaab894011a6cd889388b9b28bebd9b9714df70109caa0e723048b0bd229d14`. It changes only the `resume_versions` schema: nullable `job_id`, existing FK retained, and `CHECK(job_id IS NOT NULL OR kind = 'master')`. It explicitly copies all 22 columns, replaces the table and recreates all four explicit indexes. No job is invented or inserted by the migration. No existing résumé is relabeled or assigned another job. Internal SQLite rowids are not public résumé identities; all declared IDs and original column values are fingerprinted and preserved.

This is a reviewed table rebuild, not purely additive DDL. The history entry is additive and atomic. The existing TypeScript migration array stays at 011; the pooled migration runner is not used for 012.

## Ownership, compatibility and preflight

Each native test database is created with a random fresh directory, exclusive-create owner marker and database file; existing paths are not accepted. The held ownership capability verifies canonical paths, database device/inode, regular files, no symlinks/hardlinks and the original owner marker. Sidecar paths are checked too. A real SQLite `EXCLUSIVE` locking mode plus acquired `BEGIN EXCLUSIVE`/`COMMIT` file lock establishes database exclusivity, with zero busy wait. This lock remains held through preflight, backup and the rebuild. Conflicting connections fail before the rebuild. No process inventory or historical PID signals are used.

A dedicated `SqliteConnection` is used, never a pool. Other attached databases and nonempty temp schemas are rejected. SQLite's empty internal temp schema is allowed; it is not an additional data source. Reopen retains the run's fresh-directory ownership capability, re-acquires SQLite exclusivity and revalidates hashes and integrity.

The expected schema is constructed with the project's bundled native SQLite from the pinned Migration 001–011 SQL fixture. A TypeScript test requires this fixture to equal the actual current migration registry exactly. Comparison covers the full `sqlite_schema` (tables, defaults, constraints, indexes, triggers and dependencies), preserving quoted SQL tokens while disregarding formatting whitespace. The runner also checks 22 résumé columns and four explicit indexes. The known optional FTS5 schema and its shadow tables are supported and tested. Unknown tables/views/triggers/indexes, changed or missing indexes/columns, unknown migration IDs/names, and incompatible database metadata fail closed. Repeated 012 attempts validate the completed schema/history/integrity, then return `AlreadyApplied` without another backup/history row.

Both foreign-key and integrity checks are required before migration. Per-table fingerprints cover **40 tables** in the representative baseline, using type-aware, length-delimited SHA-256 row digests and counts. Fingerprints and backup manifests contain no row content, private SQL or credentials. No real user data was used.

## Backup, transaction and recovery

The runner performs `VACUUM main INTO ?` on the exclusively held connection, writing a newly reserved backup file. This uses SQLite's consistent logical snapshot of committed WAL state rather than copying a potentially stale main file. The backup and containing directory are synced, reopened read-only, checked for integrity/foreign keys, and compared to the original schema and every table fingerprint. SHA-256 and fingerprint manifests are preserved before changing the schema. Backup hash/type/ownership are rechecked immediately before the transaction. [SQLite VACUUM INTO documentation](https://www.sqlite.org/lang_vacuum.html)

Foreign keys are disabled and verified **before** `BEGIN IMMEDIATE`. The exact SQL body executes inside that transaction. All schema/index/FK/integrity checks run again, and every pre-existing table fingerprint must match before history is written. Migration ID `12`, name `standalone_master_resume`, actual timestamp and a metadata-only migration event are then inserted on the same transaction. The event records the actual verified backup basename. Commit is followed by foreign-key restoration/verification, close/reopen, full schema/history/integrity/fingerprint validation and another backup verification. There is no detached mutation worker. [SQLite locking-mode behavior](https://www.sqlite.org/pragma.html#pragma_locking_mode)

Injected failures after copy, drop, rebuild and history insertion roll back to the exact old schema/data/history, with foreign keys restored and reopen verified. Unexpected row mutations or broken references also roll back. Owned child test processes exit during active transactions after DROP and after history insertion; reopening restores version 011 without partial 012 history. The parent waits on only those child handles. No unrelated session is inspected or controlled.

A simulated post-commit validation failure invokes the verified backup restore: closes the owned connection, moves the migrated database/sidecars into a new quarantine directory, restores the backup into a new file, and validates the restored 011 schema/data/FKs. Quarantine retains the migrated file with 012 history. It is not deleted. A failed restore returns `RecoveryRequired`; the runner does not silently retry migration. Failure and success journals contain fixed status codes only.

Power-loss hardware guarantees and arbitrary production schemas are not claimed. File sync, real SQLite transaction recovery and owned-process interruption were tested; real power removal was not.

## Native and application compatibility results

Native engine reported **SQLite 3.46.0**, the project's locked `sqlx` / bundled `libsqlite3-sys` implementation. Migration acceptance was not delegated to SQL.js.

| Check | Result |
|---|---|
| Fresh native schema and tracking | PASS: initialize 001–011, explicitly run 012, exactly 12 history rows, create NULL-job Master with zero jobs, reopen |
| Representative 011 → 012 | PASS: original Master, locked content, imported version, submitted child, job, application history/provenance, favorites, safety audit and conversation preserved |
| All original columns/relationships | PASS: all 40 table fingerprints unchanged before history/audit insertion; all nonmetadata table fingerprints unchanged after commit/reopen |
| WAL-safe backup | PASS: committed WAL-only safety record present in verified backup; original logical fingerprints match |
| Rebuild and save recovery | PASS: injected transaction failures, actual owned-process interruptions and post-commit quarantine/restore |
| Unknown schema/dependencies/indexes/history | PASS: rejection without repair or 012 history |
| FK/check violations | PASS: pre-existing invalid references and invalid kind fail preflight; newly introduced invalid reference rolls back |
| Repeated 012 attempt | PASS: validated no-op; incompatible metadata still rejected |
| NULL and empty-string compatibility | PASS: only Master accepts SQL NULL; empty string is not a fabricated job; repository maps no-job Master to/from empty string safely |
| Child and submitted identity | PASS: real repository creates reviewed child tied to the selected saved job and exact Master ID; original/submitted rows unchanged |
| Current repository initialize on 012 | PASS: does not rerun/downgrade migration history; 012 remains unregistered in startup array |
| Persistence | PASS: native connection reopen, repository serialization/reopen and independent native reread |
| Real native PDF | PASS: existing Rust `render_resume_latex` invoked; XeLaTeX shell escape remains disabled; readable, one-page PDF with exact saved Master identity |

The frontend repository round trip consumes a database first migrated by native SQLite, opens it through the existing SQL.js test adapter, uses the actual `SqliteRepository`, approved profile planner, review gate, document creation and child service, and writes its synthetic result. Native SQLite independently reopens that result and validates every other table fingerprint plus all 22 columns of each original résumé. This verifies the actual domain mapping; it is not claimed as a live native UI/IPC save session.

Master PDF version: `resume-bc9c1507-2ba7-4e74-b4f5-c171c2b827d5`. Tailored child: `resume-678f1358-f15f-4d25-882a-dec39657191f`. Preserved submitted identity: `m012-submitted`; application: `m012-application`. Existing job count remains one in the representative dataset; the fresh-schema native test independently verifies zero-job creation. No new saved-job record is created by Master creation.

PDF SHA-256: `8da22fd5591f5566f1fc2dac18e899dee1dba7d320e2d57caa64c458f2107689`. LaTeX SHA-256: `46234522b5896c07971c758248836360f6f271052d956d74cc07846e8090f74f`. Poppler confirmed one page and expected synthetic text; the rendered PNG was visually inspected with no clipping or overlap. Evidence: `/Users/athfan/Desktop/career-compiler-migration012-20261115-211508/native-master.pdf`, `native-master.png`, `pdf-verification.json`, `native-pdf-identity.json`.

## Fresh installs and production behavior

A fresh **synthetic** database explicitly reaches 012 through this native runner. A normal production fresh install and an existing owner database still use the original startup registry through 011. They do not auto-run 012. Standalone Master saving remains gated on those databases; reviewed preparation/PDF preview remains available. This is the requested authorization boundary, not a claim that production storage is fixed already.

No desktop application was launched or native UI acceptance claimed. The native renderer was invoked directly from the native test binary. Tauri/frontend build passes. A production-identity dev startup was deliberately not run because it would initialize normal application state outside this synthetic-only scope.

## Tests and exact commands

- **56 Rust tests passed**, including 42 existing regressions and 14 migration acceptance tests.
- Two specially invoked entry points are marked ignored in the ordinary Rust run: the owned crash child (actually executed twice and verified by its parent test) and native PDF acceptance (run separately, **1 passed**). These are not unverified skipped scenarios.
- Focused résumé/migration regressions: **18 passed**. The final native-artifact repository binding: **2 passed** after the last native run.
- Full frontend suite: **879 passed, 5 failed, 2 existing skips**, across 109 test files. All five failures exactly match the preserved prior baseline failure names. No assertions were weakened. See `baseline-failures.json`.
- TypeScript, lint, Rustfmt, Clippy and frontend/native debug build passed. The existing >500 kB chunk warning remains. No dependency changes were required.

The five baseline failures remain four Jobs page scenarios and one job workspace filter assertion. Fixed October 15 fixtures exceed the 30-day posting limit. Their source files and assertions are unchanged; the previous pre-change reproduction is retained at `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/jobs-baseline.log`. No unrelated Jobs repair was included.

Earlier attempts are retained: fixture construction initially omitted required message fields and used nonexistent domain properties; those were corrected against the real interfaces. The first native ownership run rejected SQLite's empty internal temp schema; diagnostics established that cause, the check was narrowed to permit only an empty unnamed temp schema, and explicit attached/nonempty-temp rejection tests passed. Rollback tests now assert exact failure codes so an early preflight error cannot masquerade as a passed injected-failure check. One duplicate owned test invocation was interrupted while contending for the build directory; no unrelated process was touched.

All commands ran through `/Users/athfan/Desktop/career-compiler-migration012-20261115-211508/check.py` in the **existing** verification source:
`/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/verification-source`.
The wrapper supplies dedicated QA HOME/temp/cache paths, offline dependencies and no provider credentials. Its native-artifact environment is enabled only after native tests create the synthetic marker. Normal frontend runs without that marker explicitly skip the cross-language artifact case; the ordered verification above ran it.

- `rust-verified` — exit `0`; `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo test --manifest-path src-tauri/Cargo.toml --locked --offline -- --test-threads=1`. Log: `/Users/athfan/Desktop/career-compiler-migration012-20261115-211508/rust-verified.log`.
- `repository-native` — exit `0`; `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run test:run -- src/lib/database/migration012.test.ts src/lib/database/standaloneMasterPersistence.test.ts src/lib/resume/masterPdf.test.ts src/lib/tailoring/standaloneMaster.test.ts src/lib/tailoring/jobSpecificVariant.test.ts src/features/resume-library/ProfileMasterCreator.test.tsx src/features/resume-library/ResumeEntryPoints.test.tsx src/features/tailoring/TailorResumePage.test.tsx`. Log: `/Users/athfan/Desktop/career-compiler-migration012-20261115-211508/repository-native.log`.
- `repository-verified` — exit `0`; `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run test:run -- src/lib/database/migration012.test.ts`. Log: `/Users/athfan/Desktop/career-compiler-migration012-20261115-211508/repository-verified.log`.
- `native-pdf-verified` — exit `0`; `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo test --manifest-path src-tauri/Cargo.toml --locked --offline migration012::tests::verifies_repository_roundtrip_and_renders_real_native_pdf -- --ignored --exact --test-threads=1`. Log: `/Users/athfan/Desktop/career-compiler-migration012-20261115-211508/native-pdf-verified.log`.
- `typecheck-verified` — exit `0`; `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run typecheck`. Log: `/Users/athfan/Desktop/career-compiler-migration012-20261115-211508/typecheck-verified.log`.
- `lint` — exit `0`; `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run lint`. Log: `/Users/athfan/Desktop/career-compiler-migration012-20261115-211508/lint.log`.
- `rustfmt-verified` — exit `0`; `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo fmt --manifest-path src-tauri/Cargo.toml --check`. Log: `/Users/athfan/Desktop/career-compiler-migration012-20261115-211508/rustfmt-verified.log`.
- `clippy-verified` — exit `0`; `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --offline --locked -- -D warnings`. Log: `/Users/athfan/Desktop/career-compiler-migration012-20261115-211508/clippy-verified.log`.
- `native-build` — exit `0`; `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run tauri:build -- --debug --no-bundle`. Log: `/Users/athfan/Desktop/career-compiler-migration012-20261115-211508/native-build.log`.
- `frontend-all` — exit `1`; `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run test:run`. Log: `/Users/athfan/Desktop/career-compiler-migration012-20261115-211508/frontend-all.log`.

Native PDF command entry uses the existing renderer's `xelatex -no-shell-escape -interaction=nonstopmode -halt-on-error -file-line-error resume.tex` in its owned disposable directory. Poppler commands and image/identity checks are recorded in the evidence artifacts. No paid provider or external job-board call was made.

## Preservation, artifacts and rollback

Authoritative source: `/Users/athfan/Desktop/career-compiler`. Branch `ui-ux-overhaul`, HEAD `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`. All **1,332** baseline source files matched the previous final manifest before editing. Recovery archive `/Users/athfan/Desktop/career-compiler-migration012-20261115-211508/source-before.tar.gz` was verified member-by-member with modes; SHA-256 `76672ed7e0b8bedf988d3b5cbaaf99add0115a90338e19c458a2462b2d0de187`. Individual before-copies exist for both modified files. Earlier recovery archives remain intact.

Final preservation evidence: `/Users/athfan/Desktop/career-compiler-migration012-20261115-211508/final-preservation.json`; it verifies source membership, changed-file allowlist, hashes/modes, unchanged branch/HEAD/index/protected Git files, prior archive and QA source parity. Native acceptance guards, production handlers/configuration, dependencies and registered migrations remain byte-for-byte unchanged. Only the test-gated module declaration is added to `lib.rs`. Production databases and credentials were not opened or modified. No commit, push, deploy or production migration occurred.

Representative owned native root: `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/qa-temp/synthetic-migration012-65e13bf6f64cc2c0ce8cd8f3e894939c`. Its verified backup is `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/qa-temp/synthetic-migration012-65e13bf6f64cc2c0ce8cd8f3e894939c/before-012-305f394102fe634903604bab5d07c459.sqlite3` with SHA-256 `87adec5f7bb7233fe47ee7af7abc2dc55ca08435088c1d8848be465172987dee`. Backup fingerprint manifests and failure/quarantine materials remain inside each fresh `synthetic-migration012-*` test root under the dedicated QA temp directory. Test roots were preserved. The handoff artifacts are `/Users/athfan/Desktop/career-compiler-migration012-20261115-211508/native-migrated.sqlite3`, `repository-after.sqlite3`, `native-receipt.json`, `repository-identity.json` and the PDF evidence above.

Changed files:
- `src-tauri/src/lib.rs`
- `docs/migration-proposals/012_STANDALONE_MASTER_APPROVAL.md`

Added files:
- `src-tauri/src/migration012/mod.rs`
- `src-tauri/src/migration012/tests.rs`
- `src-tauri/src/migration012/migrations-through-011.json`
- `src-tauri/src/migration012/legacy-records.json`
- `src/lib/database/migration012.test.ts`
- `docs/MIGRATION_012_SYNTHETIC_VERIFICATION_REPORT.md`

Source rollback, if needed: compare current affected hashes with `final-preservation.json`, preserve any subsequent work, restore only the two modified files from `before/`, and quarantine the six added files. Do not reset/clean Git or overwrite unrelated changes. No production database rollback is necessary because no real migration ran.

## Exact remaining approval-dependent steps

1. Obtain separate explicit owner approval for an owner-invoked real-data migration adapter; the current module is intentionally test-only and cannot accept a production path. Keep it out of automatic startup.
2. Under that separate authorization, establish exclusive ownership of the actual owner database, verify its exact schema/history/dependencies, and create/reopen/verify a WAL-safe backup of that exact database. This run does not inspect or certify the owner's current database.
3. Present the verified backup identity and reviewed real-data migration inputs for separate explicit execution approval. Stop on any unrecognized schema or ownership conflict.
4. Only after that approval, apply 012 through the dedicated connection path, then perform native UI save/restart/PDF acceptance against the authorized migrated database. Fresh-install production registration also needs explicit approval.

Work stops here. No real-data migration is requested or attempted by this report, and no automatic production pathway has been added.
