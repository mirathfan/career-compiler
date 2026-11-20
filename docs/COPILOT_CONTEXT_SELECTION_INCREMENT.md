# Copilot saved-record context increment

## Delivered

Copilot now offers explicit saved job, application and resume selectors with human-readable labels. The conversation displays its scope and selected record. Switching records opens a separate conversation context and clears the unsent draft; older proposals remain in their original conversation and keep their original target. Returning to that conversation restores its matching selector.

Refresh records updates changed labels. Missing records disable sending and acceptance in the UI. The service also rejects missing records, missing conversations and attempts to change a persisted conversation's context before writing messages. Job-specific requests no longer silently choose the first saved job.

“Summarize this selected record” returns a bounded deterministic summary of the exact selected job, application or resume, with a citation to that record. No model provider is called. Existing before/after application-status review, cancellation, stale/replay/tamper checks and reviewed undo remain in place. This increment intentionally does not add another write-action type.

## Changed files

- `src/features/copilot/CareerCopilotPage.tsx`
- `src/features/copilot/CareerCopilotPage.test.tsx`
- `src/lib/copilot/careerCopilot.ts`
- `src/lib/copilot/careerCopilot.test.ts`

The working tree already contained the prior review/undo increment and other user changes. Those changes were preserved.

## Verification

- Full Vitest suite: **68 files passed; 588 tests passed, 2 skipped**. Log: `/tmp/cc-context-tests.log`.
- TypeScript: `tsc -b --noEmit` passed.
- Lint: `oxlint .` passed.
- `git diff --check` passed.
- Vite production build passed into `/tmp/cc-context-build`; log `/tmp/cc-context-build.log`. Existing large-chunk warning remains.
- Service tests cover exact cited summaries for all three record types, explicit job selection, missing conversation/record rejection and context mismatch without message writes.
- UI tests cover switching away from a pending proposal and returning to accept it only for its original record, updated record labels, unavailable records, and reviewed undo.
- Browser interaction QA used only an isolated, nonpersistent MemoryRepository preview with synthetic Example records. Switching from the first application to the second removed the first proposal from view. Sending the selected-record summary created a separate conversation, correctly named the second application and cited it, with no pending write. This verifies browser interaction/accessibility state, not visual polish or native keyboard acceptance. The screenshot was not available for inspection.
- The owned preview server on port 5218 was stopped. Synthetic preview artifacts remain under ignored `tmp/copilot-context-preview/`.

## Limits and next step

Native 720×800 acceptance and Tauri startup/build remain unrun for this increment under the existing deferred native-session restriction. Rust checks were not repeated: the previously established dependency-cache blocker (missing `alloc-no-stdlib-2.0.4/src/bin/example.rs`) remains unchanged. No cache repair was attempted.

Copilot remains a bounded local assistant, not a general conversational model agent. A useful next increment is a narrowly scoped job-note proposal with explicit before/after review and the same persisted-action validation and reviewed undo guarantees.

No real histories, external providers, paid requests, native app access, push, deployment, data deletion, security changes or schedule changes were performed.
