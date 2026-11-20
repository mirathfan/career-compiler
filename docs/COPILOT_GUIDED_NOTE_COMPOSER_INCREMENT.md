# Guided private-note composer

## Delivered

Copilot now offers “Propose a private note” when an available saved job is explicitly selected. The progressive composer shows the exact target, replacement semantics, unverified user-text provenance, a labeled multiline field, character count, “Prepare note review” and “Discard note draft.” Users no longer need command syntax to prepare a note change. Existing chat commands remain supported.

Opening and typing are local UI state. Discard clears the draft; changing record or conversation remounts the composer with an empty draft. Preparation preserves the exact entered text, including leading/trailing whitespace and line breaks. Empty/whitespace-only and over-4,000-character drafts cannot be submitted. Repeated clicks are suppressed while preparing. Failure retains the draft for retry. Pending note proposals direct the user to review or cancel before preparing another.

The new service entry point wraps the existing deterministic proposal service in a transaction: a guided request either persists a reviewable note proposal or rolls back. No-op, invalid and rejected requests do not create partial conversations. Preparing never edits the saved job. Existing exact before/after cards, explicit acceptance/cancellation, separately reviewed undo, stale checks, persisted tamper/replay checks and repository transactions remain intact.

Scope intentionally stays with private notes. Application-status actions remain available through the existing conversation/review flow. No new model capability, provider call, persistence field or migration was added.

## Files

- `src/features/copilot/JobNoteComposer.tsx` and `.test.tsx`: progressive form, local draft lifecycle, validation, failure/repeat protection and accessible labels.
- `src/features/copilot/CareerCopilotPage.tsx` and `.test.tsx`: selected-context integration and review/accept/undo regression.
- `src/lib/copilot/careerCopilot.ts`: atomic guided proposal entry point.
- `src/lib/copilot/actionReview.test.ts`: memory/SQLite invalid/no-op rollback and exact-text coverage.
- `src/features/jobs/JobsPage.test.tsx`: workspace edit route discovers the guided control.

All unrelated changes, prior fixtures, retained bundles and backups were preserved.

## Checks

Focused synthetic regressions: **40 passed across 4 files** (`/tmp/cc-composer-focused.log`). Tests cover discard, whitespace/oversized input, exact text, failed request retry, repeated clicks, switched contexts, unchanged jobs until acceptance, cancellation/undo safeguards and transactional no-op rejection in memory and isolated sql.js SQLite adapters.

Final full frontend suite: **70 files passed; 612 tests passed, 2 skipped** (`/tmp/cc-composer-full.log`). Typecheck, lint, Vite production build and `git diff --check` passed. Build artifacts: `/tmp/cc-composer-build`; log: `/tmp/cc-composer-build.log`. The existing large-chunk warning remains.

## Limits and next step

No live browser, screenshot, narrow-layout measurement or native acceptance was run. The previous loopback bind denial was neither retried nor bypassed. Native 720×800 keyboard acceptance remains deferred. The known Rust dependency-cache blocker was not repaired or rerun; no Tauri app/build was started.

No real history/database migrations, external AI/paid requests, discovery/autofill/submission, sharing, push/deploy, deletion, security/permission/schedule changes or process inspection occurred.

The gap to a true conversational agent remains substantial: intent handling is deterministic and bounded, with no general model reasoning or free-form cross-record editing. A useful next increment is a similarly bounded guided application-status selector using the existing reviewed status-action mechanism, followed by permitted visual/browser QA.
