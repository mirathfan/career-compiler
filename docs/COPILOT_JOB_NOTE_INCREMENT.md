# Copilot job-note proposal increment

## Behavior

Select a saved job, then enter `Set job note: ` followed by the desired note. Copilot prepares a replacement proposal with the target job and exact before/after note. It uses only the supplied text and labels it as unverified user text. No job changes until acceptance. Cancel leaves the job unchanged.

Accepted notes support a separately reviewed undo. Original messages and action history remain. Stored proposal identity/content, selected-job context, full job snapshots, and transactional writes protect against wrong targets, tampering, stale changes, replay, duplicate undo and interrupted acceptance. Proposal creation is also transactional, preventing interrupted responses from leaving partial conversations.

Notes must be nonempty and at most 4,000 characters; ordinary messages are limited to 12,000 characters. An exact already-saved note produces no action. A thread with a pending note proposal asks the user to review or cancel it before another proposal. Empty notes can be restored by undo, but cannot be requested as a new note replacement. Existing notes over 4,000 characters are left untouched by this tool. Changed or missing records require fresh context/proposals.

The additive migration 11 adds `jobs.notes` with an empty default. Older memory records/backups may omit notes; repositories normalize missing notes on save. Existing native pre-migration copy and migration-event recording are retained. Only disposable synthetic SQLite databases were migrated in this turn. Job descriptions and evidence analysis are not repurposed as notes; the new notes field is not added to search/embedding documents.

## Files changed in this increment

- `src/types/domain.ts`: optional backward-compatible job notes and `set_job_note` action type.
- `src/lib/database/migrations.ts`, `migrations.test.ts`: additive column and preservation test.
- `src/lib/database/memoryRepository.ts`, `sqliteRepository.ts`: note persistence, transactional acceptance and accepted snapshot.
- `src/lib/copilot/careerCopilot.ts`: bounded command, duplicate handling and atomic turns.
- `src/lib/copilot/actionReview.ts`, `actionReview.test.ts`: validation, reviewed undo and memory/SQLite failure coverage.
- `src/features/copilot/CareerCopilotPage.tsx`, `CareerCopilotPage.test.tsx`: command guidance, exact note review, context switching, cancel/accept/undo UI flow.

Pre-existing uncommitted changes and prior reports were preserved. Synthetic browser fixture files were added under ignored `tmp/copilot-jobnote-preview/`.

## Verification

TypeScript, lint, Vite production build and `git diff --check` passed. Build output is `/tmp/cc-jobnote-build`, with log `/tmp/cc-jobnote-build.log`; the existing large-chunk warning remains.

Repository tests cover both MemoryRepository and SqliteRepository through an isolated sql.js adapter. Coverage includes empty/oversized input, explicit targets, exact text preservation, no mutation before approval, repeated input, cancellation, accepted replay, wrong-target tampering, context mismatch, stale proposals, reviewed undo, duplicate/cancelled/stale undo, and injected interruption during proposal creation and acceptance with rollback and retry. The additive migration test preserves an existing synthetic job. The UI test exercises cancellation, context switching, acceptance on the original target and separately reviewed undo.

Final full frontend suite: **68 files passed; 600 tests passed, 2 skipped**. Log: `/tmp/cc-jobnote-final-tests.log`. The initial run found one stale-element reference in the new UI test; the test now reacquires the textbox after rerender and the full final suite passes. A test-only unsupported query option was also corrected before the final typecheck.

## Unrun checks and blockers

Browser interaction QA did not execute. The preview launch command `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5219 --strictPort` exited 1 at `listen`, with `EPERM: operation not permitted 127.0.0.1:5219`. No listener started. Supported message-history lookup supplied no new relevant evidence; the denied action was not retried. No screenshot or visual validation is claimed. Automated UI interaction tests are separate from live browser QA.

Native 720×800 acceptance stays deferred. No native app lookup/startup, Tauri build or Rust cache repair was performed. The established Rust dependency-cache blocker remains unchanged and its failing checks were not repeated. No real databases/history, providers, paid APIs, discovery/submission, publication, deletion, permissions or schedules were touched.

## Next step

Expose saved private notes read-only in the selected-job conversation summary and job workspace, then validate visual layout and browser interactions when a permitted preview is available. Copilot remains a bounded deterministic local assistant, not a general AI agent.
