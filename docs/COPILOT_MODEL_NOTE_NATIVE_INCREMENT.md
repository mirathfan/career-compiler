# Model note suggestions and isolated native validation

## Native validation: actual compilation, no app launch

The old extracted `alloc-no-stdlib-2.0.4` cache still lacks `src/bin/example.rs`. Read-only archive inspection found the file intact inside the already-cached official `.crate` archive. A fresh temporary Cargo home was seeded only with copies of the existing registry archives/index. Cargo performed normal offline extraction there. The shared cache was neither repaired nor deleted, and no dependencies were fetched.

Isolated root: `/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/cc-native-qa-yj_iyfwd`. It contains a copy of `src-tauri`, a minimal synthetic frontend asset fixture, a new Cargo home and a fresh build target. The final changed `commands/ai.rs` was synchronized into this isolated source copy. The toolchain was the installed Rust/Cargo 1.99.1.

Passed:

- `cargo check --offline --locked --all-targets` on the isolated manifest/target, including a final check after the native test addition. Logs: `/tmp/cc-native-offline-check.log`, `/tmp/cc-native-final-check.log`.
- `cargo test --offline --locked --lib commands::ai::tests`: **6 passed**, 30 filtered out. Log: `/tmp/cc-native-ai-final-tests.log`. Tests cover structured serialization, response parsing, error/secret redaction and the Copilot route's budget-gate requirement plus `store:false`.

These are real native Rust compilation and unit tests. They do not prove end-to-end Keychain/network/database-budget execution inside a running Tauri app, nor packaging, live-provider behavior or native keyboard acceptance. No app was started, stopped or inspected. The installed bundle was not replaced. The known source-cache defect remains in its original location, but it no longer blocks this isolated offline validation route.

`rustfmt --check` could not run: the installed stable toolchain reports that rustfmt is not installed. Log: `/tmp/cc-native-ai-format.log`. No component was installed. No broad Rust suite, Clippy, Tauri bundle build or native UI acceptance was claimed.

## Runtime implementation

Selected-job AI Q&A now offers an explicit per-request checkbox allowing a model to suggest a private note copied from the current question. This flag is part of the exact outbound-context review. The existing provider/model disclosure, paid-send approval, single-use request receipts, credential path and durable request budget remain.

The strict output schema adds one nullable allowlisted action: `set_job_note`, with exact job ID and note text. Local validation rejects any suggestion without opt-in, wrong targets, unknown action types, extra fields, blank/oversized text, and any text that is not an exact contiguous substring of the current question. The model cannot invent or paraphrase note content, read the existing private note, or execute a tool.

A valid model suggestion is shown as user-authored, unverified text. “Review suggested note” creates the existing persisted local pending action, with the actual current before/after note. It does not change the job. Separate “Accept change” or cancellation and separately reviewed undo are unchanged. The assistant session remains mounted while the local proposal conversation loads.

Model-result receipts are bound to the original repository, selected-job snapshot and exact accepted output. Synchronous review ownership prevents concurrent duplicate proposals. Stale or tampered results are rejected. Interrupted persistence rolls back and releases the local review lock for retry. Successful review consumes that result for proposal creation; even after cancellation, replaying the same result cannot silently produce another proposal.

Private-note database fields, unrelated jobs, disabled/prohibited/unselected facts and other career records remain excluded from provider context. Prior action suggestions are removed from follow-up answer payloads. User questions—including text the user deliberately entered for a note—can appear in the last three turns and remain visible in each exact-context approval. No saved private-note field is automatically retrieved for transmission.

## Files changed

- `src-tauri/src/commands/ai.rs`: named budget-routing predicate and Copilot route regression test; prior runtime budget/storage/timeout implementation retained.
- `src/lib/copilot/modelContract.ts`: strict nullable note suggestion contract and exact-user-text validation.
- `src/lib/copilot/modelConversation.ts`: opt-in request context, stripped follow-up suggestion data, single-use model-to-pending-proposal bridge.
- `src/lib/ai/mockProvider.ts`: schema-compatible offline response, still explicitly a non-reasoning demo.
- `src/features/copilot/ModelJobConversation.tsx`: opt-in, suggestion provenance and separate local review handoff.
- `src/features/copilot/CareerCopilotPage.tsx`: persisted-proposal selection while retaining the model session.
- Tests in `modelNoteProposal.test.ts`, `modelConversation.test.ts`, `copilotProvider.test.ts`, and `CareerCopilotPage.test.tsx`.

All pre-existing edits, retained bundles, fixtures and backups were preserved. AURA's repository and task were untouched.

## Frontend and mocked validation

Focused tests: **26 passed across 5 files** (`/tmp/cc-model-note-ui.log`). The dedicated model-proposal tests cover both MemoryRepository and isolated sql.js SQLite adapters: no write on response/review, separate accept/undo, cancellation, stale/tampered results, concurrent duplicate review, rollback and retry after injected interruption, and rejection without opt-in or with invented text/unknown actions/wrong targets. The UI regression exercises an opted-in synthetic model response through review, exact local before/after display, acceptance and separately approved undo, with one mocked provider request.

Final full frontend suite: **74 files passed; 632 tests passed, 2 skipped** (`/tmp/cc-model-note-full.log`). Typecheck, lint, Vite production build and `git diff --check` passed. Build artifacts: `/tmp/cc-model-note-build`; log: `/tmp/cc-model-note-build.log`. The existing large-chunk warning remains.

## Remaining limits and next action

This is an actual model-provider proposal path with offline mocked validation, plus native compilation/unit validation. No live model call, spending, secret inspection, user-data transmission, real database access/migration, external sharing, discovery/autofill/submission, push/deploy, deletion or security/permission/schedule change occurred. The prior loopback denial was not retried or bypassed. Browser/screenshot/narrow-layout checks and native 720×800 keyboard acceptance remain unrun/deferred.

The next useful validation is a separately authorized isolated packaged-runtime test of the request budget and Keychain gates, followed by a reviewed synthetic live-provider request if authorized. Product capability remains bounded: quoted job Q&A and an opt-in exact-user-text note suggestion. Grounded free-form synthesis, career/resume reasoning and broader model-driven actions remain unfinished; no general agent completion is claimed.
