# Private job-note display increment

## Delivered

The selected job's Overview now has a compact private-note section, labeled “User-authored · Unverified · Not career evidence or an AI conclusion.” It displays exact saved text with preserved line breaks, wrapping for long unbroken strings and a keyboard-focusable scrolling area for long notes. Missing, empty and older records without a notes field show “No private note saved.” Content is rendered as React text, never HTML or instructions.

“Review a note change in Copilot” opens the existing assistant scoped to that job, where the existing command guidance and before/after acceptance flow remain. The embedded assistant is keyed by job ID so changing its job prop cannot retain the previous job's conversation state.

An explicitly requested selected-job summary now includes a separately attributed private-note display. The response stores the exact text and job ID as local display metadata, with a citation to the selected job. The UI says it is a snapshot from the time of the summary and instructs the user to summarize again for later changes. Note text is not added to retrieval context previews, search documents, embeddings or model/provider requests. Merely viewing the workspace does not create a conversation or mutate jobs.

## Files

- `src/components/PrivateJobNote.tsx` and `.test.tsx`: shared read-only plain-text display.
- `src/components/ContextCopilotDialog.tsx`: reset embedded state by job ID.
- `src/features/jobs/JobWorkspace.tsx` and `JobsPage.test.tsx`: workspace display, reviewed-edit route and selected-job/no-write test.
- `src/lib/copilot/careerCopilot.ts` and `.test.ts`: explicitly requested summary metadata, selection/legacy/no-write coverage.
- `src/features/copilot/CareerCopilotPage.tsx` and `.test.tsx`: attributed snapshot rendering and inert-text UI coverage.

All pre-existing edits and backup/native artifacts were preserved. No persistence/schema changes were needed in this increment.

## Validation

Focused synthetic service and UI tests: **29 passed across 4 files** (`/tmp/cc-note-display-focused.log`). These cover exact selected-note content, provenance, absent/older notes, long/multiline and prompt-like text, switching jobs, opening the correctly scoped reviewed-edit path, absence of pending writes on summary and unchanged saved jobs after reads.

Final full frontend suite: **69 files passed; 607 tests passed, 2 skipped** (`/tmp/cc-note-display-full.log`). TypeScript, lint, `git diff --check` and Vite production build passed. Build artifacts: `/tmp/cc-note-display-build`; build log: `/tmp/cc-note-display-build.log`. The existing large-chunk warning remains.

## Limits

Live browser interaction, screenshots, narrow-layout visual acceptance and native keyboard acceptance were not run. The prior loopback binding denial (`EPERM`, `127.0.0.1:5219`) was not retried or bypassed. The layout has wrapping and bounded scrolling in source; automated DOM tests do not establish measured visual behavior.

Native 720×800 acceptance remains deferred; no native app/process inspection, Tauri startup/build, Rust cache repair or repeated known failing Rust checks occurred. No real database/history access, migrations, external provider/model/paid calls, sharing, push, deployment, deletion, security/permission or schedule changes were performed.

Next useful step: permitted browser/visual QA for the selected-job workspace and note-review flow, followed by a clearer guided note composer that continues to produce the same reviewed proposal. Copilot is still a bounded deterministic local assistant.
