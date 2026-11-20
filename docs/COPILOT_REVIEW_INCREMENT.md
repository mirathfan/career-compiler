# Copilot conversation and reviewed changes

Implemented as the first increment toward a simpler conversational workspace. The native
720×800 history-import checkpoint is deferred, not completed or modified by this work.

## Behavior

- Conversation-first, two-column Copilot layout replaces the persistent third information
  column. Sources and accepted changes expand on demand. Duplicate starter controls and
  implementation-oriented search badges are removed; starters fill the composer for review.
- The interface states that the assistant is local and deterministic, makes no AI calls,
  and does not yet support free-form AI editing. Existing cited reads remain available.
- Application-status requests require explicit application context or an unambiguous company
  and role match. The former fallback to the first stored application is removed.
- Review cards show status and applied date before and after. Explicit acceptance changes
  the tracker only, never submits an application. Cancel leaves the tracker untouched.
- Both repositories validate the persisted pending proposal inside their existing transaction
  boundary. Tampered, cancelled, replayed and stale proposals are rejected before mutation.
  SQLite confirmation now uses the existing retained-connection transaction implementation.
- Accepted status changes offer Review undo. This creates another pending proposal; acceptance
  is still required. Original messages and application history remain. Later edits and duplicate
  undo requests block reuse. Old accepted proposals without an acceptance timestamp cannot use
  this undo path. Other action types have no new undo capability.

## Verification

- Full frontend suite: 584 passed, 2 skipped, 68 files. No live providers or real records used.
- Focused Copilot checks: 10 passed across three files, including MemoryRepository and real
  SQLite through sql.js, plus the accept/review-undo/accept UI interaction.
- TypeScript, lint and frontend production build passed. Vite's chunk-size warning remains.
- A browser-only synthetic preview used a nonpersistent MemoryRepository, one Example Studio
  application and no Tauri runtime. Screenshot inspection and browser interaction verified
  the review card, accepted-change disclosure and separate undo proposal. DOM measurement
  reported viewport and document width both 1280px. This is not native or narrow-width QA.
- The owned loopback preview server was stopped after verification. Preview source is retained
  under ignored `tmp/copilot-review-preview/`; automated tests live in the normal test paths.
- Rust tests did not run: the cached alloc-no-stdlib v2.0.4 manifest references missing
  src/bin/example.rs. No cache was repaired or deleted. Native dev startup and a new Tauri
  bundle were not run; the uncertain acceptance session and retained bundles were untouched.

Logs: `/tmp/cc-copilot-tests.log`, `/tmp/cc-copilot-focused.log`,
`/tmp/cc-copilot-build.log`, `/tmp/cc-copilot-rust.log`.

## Boundaries and next increment

This is not a general tool-using AI agent. Resume comparison/recommendation and cited retrieval
retain their existing deterministic limitations; job/resume editing through conversation is
not newly implemented. No migration, remote provider, schedule change, deployment or push.

Next: explicit record selection within conversation, then a bounded job-note or resume-draft
proposal tool reusing the same review, transaction and undo boundary. Remote model integration
needs a separate evidence allow-list and explicit paid-request flow before it can be enabled.
