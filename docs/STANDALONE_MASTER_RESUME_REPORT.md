# Standalone Master résumé creation

Status: **PARTIAL — implemented and tested; persistent use on existing SQLite databases awaits approval and a safe migration runner.**

## Actual outcome

Résumés now exposes **Create Master Résumé** without a job selector. The service reads approved/enabled profile evidence through the existing deterministic Master planner and claim validator. A fresh digest binds explicit review to the exact content, template and source evidence; changed previews or evidence fail closed. No job reads, job insertions or provider calls are needed for preparation or saving.

The UI requires review before Save or PDF generation. Existing Masters are never demoted, replaced or reused as the new record. On a compatible synthetic schema, Save creates a separate approved Master with SQL `job_id = NULL`, domain `jobId = ""`, no source job and no parent/base. The original template settings are retained. A later reviewed child uses its real selected job and preserves its exact Master parent/base. Duplicating a jobless Master creates another general Master draft, not an invalid jobless tailored version.

The new PDF surface uses the existing LaTeX serializer and native `render_resume_latex` command. It validates current evidence and review, checks exactly one page, and revalidates the source after rendering. Saved previews use an exact version ID; no export path, submitted identity or record content is rewritten. The creator remains open after Save and the library can reopen the Master/PDF surface.

## Actual blocker and owner decision

The current `resume_versions.job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE` is the persistence constraint. The TypeScript string representation, general Master planner, document builder and PDF renderer can already represent a missing job. The UI and old helper had required a job to satisfy the database constraint.

The proposed minimal schema change makes `job_id` nullable only for `kind='master'`; the foreign key and all existing rows remain. The installed SQLite versions require a table rebuild. This is an additive migration-history proposal, **not purely additive DDL**. Exact SQL and safeguards are in [the owner approval proposal](migration-proposals/012_STANDALONE_MASTER_APPROVAL.md) and [SQL body](migration-proposals/012_standalone_master_resume.sql).

No migration was registered or executed on production. Current startup migrations remain at 11. On the unchanged schema, jobless preview and reviewed PDF generation work, and Save is disabled with a clear database-update notice. Fresh installs also remain gated until migration registration is approved. **The production application cannot yet persist a jobless Master.**

The required owner decision is approval of the nullable-job schema change and implementation of a dedicated, backup-protected transactional migration runner. Production execution remains separately subject to authorization. The current pooled migration loop is insufficient for this rebuild; the existing native transaction command allowlist has not been weakened. Do not simply append the SQL to that loop.

## Validation performed in this run

| Requirement | Result and evidence |
|---|---|
| Prepare with zero jobs | PASS: focused service/UI tests, no job selector or synthetic placeholder job |
| Review before save | PASS: unchecked review blocks save; tampered/stale preview rejected |
| Correct profile evidence | PASS: existing planner/claim validation, source fact IDs, unreviewed evidence rejection and stale evidence tests |
| Existing Master preservation | PASS: exact original equality after another Master is saved; no automatic designation replacement |
| Persistence without a job | PASS only after proposed SQL on a fresh synthetic database; BLOCKED on unchanged schema |
| No fake job | PASS: zero jobs before/after first Master save and database reopen |
| Failure rollback/restart | PASS: interrupted schema rebuild and save roll back; exact records survive SQL serialization/reopen |
| Later tailored child | PASS: exact parent/base Master and selected job; existing tailoring and two-child reviewed pipeline regressions pass |
| Submitted versions/applications | PASS: all legacy résumé columns, application submission/PDF identity and favorites unchanged after synthetic rebuild/save/reopen |
| PDF generation | PASS: real XeLaTeX compile from exact persisted synthetic Master source; one page; extracted text and rendered PNG visually checked |
| PDF UI integration | PASS: reviewed controls, exact saved version and iframe creation; browser IPC fixture returns the real PDF only for matching LaTeX. IAB's embedded PDF viewer showed an empty dark surface, so visual native iframe behavior remains UNVERIFIED |
| Native desktop startup | NOT RUN: no native app launched; no native acceptance guard changed. Native executable build passes, but native save/PDF UI acceptance remains pending the approved migration runner |

Focused final run: **17 passed across 8 files**. Full suite: **876 passed, 5 failed, 2 existing skips** across 108 files. The full run preceded the final duplicate-copy regression test; that additional test passes in the final focused run. No assertion was removed or weakened to mask a failure.

The five failures are four `JobsPage.test.tsx` scenarios and one `jobs/workspace.test.ts` filter assertion. Re-running these two files against the verified pre-change source restored temporarily into the existing QA location produced the **same five failures and 19 passes**. Their fixed `FIT_FIXTURE_DATE = 2026-10-15` has crossed the 30-day posting limit as of this run; original Jobs sources/tests were left untouched. Full-suite green is not claimed.

**42 Rust tests passed.** TypeScript, lint, Rustfmt and Clippy passed. Frontend build and final native debug build (`--no-bundle`) passed. Vite reported a chunk over 500 kB; no build failure. Earlier local TypeScript failures were corrected in the new test fixture (SQL.js type import and PDF byte-array generic). Initial focused test failures from a Vite-transformed test SQL URL were corrected to use the test working directory. All attempts and final results remain in evidence logs.

## Commands and isolation

Tests/builds used the already-existing verification location, not a new development copy:
`/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/verification-source`.

The wrapper `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/check.py` supplies the existing dedicated QA home/temp/cache, offline dependencies, no provider credentials, and `CC_INTELLIGENCE_EVIDENCE=/Users/athfan/Desktop/career-compiler-standalone-master-20261115`. Changed source hashes are compared with this QA source. Command arrays and timestamps are retained in each `*-result.json`.

- `focused-final`: exit `0`. `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run test:run -- src/lib/tailoring/standaloneMaster.test.ts src/lib/database/standaloneMasterPersistence.test.ts src/lib/resume/masterPdf.test.ts src/features/resume-library/ProfileMasterCreator.test.tsx src/features/resume-library/ResumeEntryPoints.test.tsx src/lib/tailoring/jobSpecificVariant.test.ts src/lib/tailoring/resumeRecoveryPipeline.test.ts src/features/tailoring/TailorResumePage.test.tsx`. Log: `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/focused-final.log`.
- `frontend-tests`: exit `1`. `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run test:run`. Log: `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/frontend-tests.log`.
- `jobs-regression`: exit `1`. `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run test:run -- src/features/jobs/JobsPage.test.tsx src/lib/jobs/workspace.test.ts`. Log: `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/jobs-regression.log`.
- `jobs-baseline`: exit `1`. `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run test:run -- src/features/jobs/JobsPage.test.tsx src/lib/jobs/workspace.test.ts`. Log: `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/jobs-baseline.log`.
- `typecheck-final`: exit `0`. `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run typecheck`. Log: `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/typecheck-final.log`.
- `lint-final`: exit `0`. `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run lint`. Log: `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/lint-final.log`.
- `rust-tests`: exit `0`. `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo test --manifest-path src-tauri/Cargo.toml --locked --offline`. Log: `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/rust-tests.log`.
- `rustfmt`: exit `0`. `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo fmt --manifest-path src-tauri/Cargo.toml --check`. Log: `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/rustfmt.log`.
- `clippy`: exit `0`. `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --offline --locked -- -D warnings`. Log: `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/clippy.log`.
- `frontend-build`: exit `0`. `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run build`. Log: `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/frontend-build.log`.
- `native-build-final`: exit `0`. `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run tauri:build -- --debug --no-bundle`. Log: `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/native-build-final.log`.

PDF command: `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/TinyTeX/bin/universal-darwin/xelatex -no-shell-escape -interaction=nonstopmode -halt-on-error -file-line-error resume.tex`, working directory `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/pdf-work`, dedicated QA HOME/temp and evidence-local TeX caches. This uses the existing serializer and native renderer's exact argument list; it is not a claim of invoking the desktop command in this run. `pdf-verification.json` binds PDF/source SHA-256, one-page metadata and exact synthetic version ID; the final fixture regeneration produced identical LaTeX bytes.

Synthetic persistence artifacts: `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/standalone-master.sqlite3`, `standalone-persistence.json`; the existing regression also wrote `synthetic-recovery.sqlite3`. No production database was opened. SQL.js databases were initialized fresh in memory; only the standalone tests execute the proposed schema body.

Browser acceptance used an in-memory synthetic repository with zero saved jobs in the existing QA `tmp/standalone-master` harness on loopback port 5197. It verified library → create → preview → explicit review → save → PDF surface → close → reopen saved Master. Rendering IPC was a fixture and made no native/provider call. The temporary tab was closed; the owned Vite command was interrupted through its session control (exit 130). No historical processes were inspected or signaled.

## Source preservation and recovery

Authoritative source: `/Users/athfan/Desktop/career-compiler`. Baseline branch `ui-ux-overhaul`, HEAD `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`; 1,323 source files including tracked and untracked work. Baseline matched the prior source manifest before editing.

Verified source archive: `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/source-before.tar.gz`, SHA-256 `e21d6ceb79622c863474384a5b26ac111b4a4ad475381f045e7cc245df070bd9`. Individual before-copies are under `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/before/`. `baseline.json`, `git-status-before.txt` and `final-preservation.json` record hashes, modes and the allowed change set. Existing recovery artifacts remain intact.

Ten pre-existing source/test files changed; nine files were added (six code/tests and three proposal/report documents). No source files were removed. Production database files, credentials, Keychain, provider settings, native guards, Tauri permissions, native source, registered migrations and dependency manifests were not changed. Tests used only synthetic records and mocked providers. No commits, pushes, deployments or production migrations occurred.

Rollback of this **source-only** change: stop owned development checks; compare affected files with `final-preservation.json` to detect subsequent edits; preserve any newer work. Restore only the ten recorded changed files from verified `before/` copies and move the nine added paths to a new quarantine directory. Do not reset Git or restore the entire tree over unrelated work. No production database rollback is needed because no production migration was run.

## Changed/added paths

- `docs/STANDALONE_MASTER_RESUME_REPORT.md`
- `docs/migration-proposals/012_STANDALONE_MASTER_APPROVAL.md`
- `docs/migration-proposals/012_standalone_master_resume.sql`
- `src/features/resume-library/MasterPdfPreview.tsx`
- `src/features/resume-library/ProfileMasterCreator.test.tsx`
- `src/features/resume-library/ProfileMasterCreator.tsx`
- `src/features/resume-library/ResumeEntryPoints.test.tsx`
- `src/features/resume-library/ResumeLibraryPage.tsx`
- `src/lib/database/memoryRepository.ts`
- `src/lib/database/repository.ts`
- `src/lib/database/sqliteRepository.ts`
- `src/lib/database/standaloneMasterPersistence.test.ts`
- `src/lib/resume/masterPdf.test.ts`
- `src/lib/resume/masterPdf.ts`
- `src/lib/tailoring/jobSpecificVariant.test.ts`
- `src/lib/tailoring/profileMaster.ts`
- `src/lib/tailoring/resumeRecoveryPipeline.test.ts`
- `src/lib/tailoring/standaloneMaster.test.ts`
- `src/types/domain.ts`

## Evidence and next step

Synthetic UI screenshot (MemoryRepository fixture, not production SQLite):

![Jobless Master saved and reopened](/Users/athfan/Desktop/career-compiler-standalone-master-20261115/master-library-ui.jpg)

Real PDF and rendered page: `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/standalone-master.pdf` and `standalone-master.png`. They contain only synthetic data.

Next step: owner approval of the concrete migration proposal, then implementation and isolated native testing of a dedicated migration runner before any production rollout. Native persistence, native PDF-preview readability and full end-to-end restart acceptance remain pending. No new feature sprint is started.
