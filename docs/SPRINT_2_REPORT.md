# CareerCompiler — Sprint 2: Contextual AI Workspace

November 11, 2026. **Final status: PARTIAL.** The contextual Career AI integration is implemented, regression-tested, built and exercised in the isolated packaged desktop app. Native answer → proposal → cancel/accept → reviewed undo → navigation → restart passed. Complete Phase 2F.4.2 keyboard-only acceptance, XeLaTeX PDF QA, Rustfmt and Clippy remain open. No integration into the original repository was executed.

## A. Implementation and location

Development copy: `/Users/athfan/Desktop/career-compiler-sprint2-20261111-080951/development`.

Career AI is a persistent surface in the main workspace. At 1280 px and above it occupies a bounded 360–400 px right column and temporarily compacts navigation. Below that breakpoint it uses a dismissible native HTML modal dialog, reserving no workspace column. It has its own conversation and panel scrolling, a short contextual header, history/context controls, citations, local composer, optional existing reviewed AI, pending-action review and supported undo. The width is bounded, not manually resizable; no existing reliable splitter infrastructure was present.

The `/copilot` route remains available. Full-page and docked presentations share **one mounted `CareerCopilotPage`**. Switching presentation, navigating, or closing/reopening retains its local thread selection and unsent draft. Existing SQLite conversations survive restart. Only the last thread ID is added to localStorage; message bodies, draft text, profile data and keys are not copied there. Unsent drafts remain session-only. Model Q&A remains the existing temporary bounded conversation, separate from persisted deterministic Copilot messages; it is not silently converted into a new persisted model store.

Jobs, application cards and résumé cards open contextual Copilot in place. The saved-job private-note trigger restores focus correctly, including WebKit/packaged macOS. Full-page fallback entry points remain available for standalone screens. The existing legacy contextual dialog is only the standalone-screen fallback, not a second shell conversation.

Increment status: 1–4 implemented; 5 implemented with the validation limits below; 6 advanced but incomplete.

## B. Preservation and recovery

Sprint 1 source: `/Users/athfan/Desktop/career-compiler-sprint1-20261111-074953/development`.

Sprint 2 recovery root: `/Users/athfan/Desktop/career-compiler-sprint2-20261111-080951`.

Before edits, the actual Sprint 1 working tree was copied and checked against `manifest.json`. **1,110 source files** matched both `preserved/` and the new development copy, including every Git-visible tracked and untracked file. This includes the significant original uncommitted implementation, not merely the old original HEAD. Exclusions in the manifest cover Git internals, dependencies/build outputs and disposable runtime material; no production database or credential was copied.

The current Sprint 1 diff exactly matched the saved `sprint1.patch`, SHA-256 `8988e721a8f6f08ebd4b498f94a12d2684de1f8a86c85c661d72b9ea097916ce`. Its additions were already represented in that diff through intent-to-add entries; no new Git-visible source changes since its report were found. The existing Sprint 1 preservation checker also verified **1,070 original files with zero differences**. Repeated final checks verified both workspaces unchanged.

Recovery material outside the development copy includes `preserved/`, `manifest.json`, `verification.json`, `sprint1-status.txt`, the exact current `sprint1.patch`, and verified `sprint1-history.bundle`. Sprint 2 copied the existing local Git metadata without remotes. Its inherited HEAD is `adb3c083f079fa06a1f431cbf15d0aa07dc1d3b9` (the pre-Sprint-1 full-working-tree snapshot), and its starting working-tree baseline is Git tree `9aeab471d4508e659bda8439d5340ada2038051e`. This tree was recorded using a separate index, without a commit. **No commits, pushes, deployments, resets, cleans, destructive migrations, credential changes or security/global settings changes were performed.**

Read-only verification command:

```sh
python3 scripts/verify-sprint2-preservation.py
```

Evidence: `docs/sprint2-evidence/preservation-final.log` and the recovery-root manifests. Scripts are run from the development directory.

## C. Existing Copilot architecture reused

- `careerCopilot.ts` creates a thread on the first explicit message (or the existing New button creates one). The service transaction stores the user message, deterministic response, citations and pending actions together. Existing thread context is authoritative; mismatched caller context is rejected.
- `SqliteRepository` stores `career_copilot_threads` and `career_copilot_messages`. Existing backup/restore support remains untouched. There is no new conversation table or schema migration.
- `CareerCopilotPage` keeps selected thread/draft/scope in React and queries the existing `career-copilot-threads`, `career-copilot-messages`, `copilot-context-records` and `settings` React Query keys. Existing mutation invalidation refreshes the underlying job/application screens. The new provider contains only open/close, trigger, selection and explicit-context-request presentation state.
- Local capability routing already supports selected-record summaries, exact application history/status reads, deterministic application searches, résumé comparisons/base recommendations and career-memory retrieval. These use repository reads and existing normalized search, not model-directed SQL. Citations come from the records included in the local answer. Private note text remains inert, user-authored and unverified.
- Pending application-status and job-note actions retain their original thread/message/target and before/after values. `confirmCareerCopilotAction` and `cancelCareerCopilotAction` remain the mutation boundary. `actionReview.ts` rejects changed, stale, cancelled, tampered or replayed proposals and handles conflicts.
- `proposeCopilotUndo` creates another pending proposal, checking the accepted state and duplicate undo. The user must accept that proposal to restore the prior value. UI labels identify reversibility; no visual-only undo was added.
- `ModelJobConversation` still prepares an exact outbound review first. `modelConversation.ts` binds it to repository, saved job, configuration and request bytes; approval is single-use, the existing budget reservation is durable, stale/cancelled responses are discarded, and `validateJobAnswer` requires strict supported output and verbatim evidence. Provider errors show a retry-through-new-review message without destroying saved local history. Budget and configuration failures retain their existing explicit messages.
- Local record loading failures now have an accessible error and retry control; local send errors retain the draft. Message roles are labelled and the conversation is a polite live log. Enter sends, Shift+Enter inserts a newline, and IME composition is respected.

## D. Context and model boundaries

The header distinguishes **current view/selected record**, **conversation scope**, and **model scope**. Home, Profile and Activity are view labels; they confer no new model access. Application/résumé selection opens existing local Copilot capabilities only. Jobs register their actual mounted selected record, applications expose explicit review/deep-link selection where available, and résumés expose the opened version. A list with no selected record says so.

Navigation does not rebind an existing thread. When another supported record is selected, a mismatch notice explains that the conversation belongs to a different selection. “Use selected job/application/resume” explicitly opens an existing matching thread or starts that context. Existing proposals remain attached to their original target. A missing record prevents sending/acceptance; history remains available. Explicit context requests wait for an in-flight local message/thread creation to settle. Model component identity is keyed to the conversation job, so a real conversation-job change disposes its temporary model review and stale in-flight UI result.

| Boundary | Before Sprint 2 | After Sprint 2 |
|---|---|---|
| Model record fields | One saved job: ID, content hash, company, role title, location, first 12,000 description characters | Identical |
| Question/history | Explicit question ≤2,000 characters; up to 3 validated turns from the same job | Identical |
| Profile, applications, résumés, private notes, other jobs | Excluded from automatic model context | Identical |
| User-entered question | Included in the explicitly reviewed request | Identical; users may deliberately type private text and see it before sending |
| Model writes/tools | No arbitrary SQL, read tools or mutations | Identical |
| Optional note suggestion | Opt-in, exact question substring, saved-job ID only; separate local review and acceptance | Identical |
| Provider, Keychain, budget, network | Existing factory/Rust route, Keychain service/account, reservation limits, request restrictions | Identical |
| Navigation/opening | No automatic conversation provider request | Identical |

Nine implementation files covering the model, provider, action review, deterministic service and budget paths are byte-for-byte unchanged; see `model-boundary-comparison.json`. The transport integration test inspects the actual mocked provider argument, verifies the exact job-field keys and exclusions, and observes zero provider calls during browsing. No live/paid model call was made. Live-provider operation remains unverified.

## E. Changed and added files

Product integration:

- `src/App.tsx`: shell provider, global trigger, shared full-page route/panel host.
- `src/components/CareerAIPanel.tsx`: persistent dialog/dock/full-page host, media query, keyboard dismissal/opening, focus restoration and view context.
- `src/components/CareerAIWorkspace.tsx`, `src/components/careerAIContext.ts`: presentation state, selected-record registration and contextual entry buttons.
- `src/lib/copilot/workspaceContext.ts`: presentation-only selection/request types and validated route context parsing.
- `src/features/copilot/CareerCopilotPage.tsx`: reuse existing conversation/review UI in managed mode; history, scope mismatch, last-thread restoration, readable compact layout, local loading retry and message accessibility.
- `src/features/jobs/JobWorkspace.tsx`, `src/features/applications/ApplicationsPage.tsx`, `src/features/resume-library/ResumeLibraryPage.tsx`: selected-record metadata and in-place assistant entry points.
- `src/components/PrivateJobNote.tsx`: focus the invoking button before opening review.
- `src/index.css`: bounded dock, modal compact layout, scrolling and constrained workspace layouts.

Validation/support:

- `src/components/CareerAIPanel.test.tsx`: 8 integration tests, with real existing Copilot services and mocked model transport.
- `src/test/setup.ts`: guarded jsdom shim for nonmodal dialog presentation; native focus is tested separately.
- `src-tauri/src/acceptance.rs`, `src/lib/acceptance/nativeAcceptance.ts`, `src/main.tsx`: record measured native window geometry in the existing isolated startup artifact. No new command/permission/schema.
- `scripts/verify-sprint2-preservation.py`, `scripts/check-sprint2-native-state.py`: read-only preservation and marked-synthetic-database checks.
- This report, `docs/sprint2-evidence/*`, and the reconciliation inventory described below.

The generated reconciliation manifest inventories **all current deliverable files**, including tracked modifications, untracked additions, modes and SHA-256 values; it is not limited to the files already present in `git diff`.

## F. Commands and results

All commands ran in the isolated Sprint 2 development copy. Logs are retained under `docs/sprint2-evidence/`.

| Command | Actual result |
|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | Installed local dependencies; no global install |
| Baseline `npm run test:run` | 77 files; 666 passed, 2 skipped |
| `npm run lint` | PASS, no warnings in final log |
| `npm run typecheck` | PASS |
| `npm run test:run -- src/components/CareerAIPanel.test.tsx` | PASS, 8 integration tests |
| Final `npm run test:run` | **78 files; 674 passed, 2 skipped** |
| `PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml --locked --offline` | **36 passed**; binary/doc targets also passed |
| `PATH="$HOME/.cargo/bin:$PATH" cargo fmt --manifest-path src-tauri/Cargo.toml --check` | UNAVAILABLE: cargo-fmt not installed |
| `PATH="$HOME/.cargo/bin:$PATH" cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` | UNAVAILABLE: cargo-clippy not installed |
| `command -v xelatex` | Not found; PDF rendering not verified |
| Isolated `npm run tauri:dev -- --config …/tauri.acceptance.dev.json` | PASS: compiled, started, exact synthetic SQLite path verified |
| Isolated `npm run tauri:build -- --debug --config …/tauri.acceptance.json` | PASS: frontend build and macOS debug acceptance bundle; existing chunk-size warnings |
| Preservation and native read-only verification scripts | PASS |

Native command environment was `PATH="$HOME/.cargo/bin:$PATH" CC_ACCEPTANCE_ROOT=/private/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/careercompiler-native-nim2ha28 CC_ACCEPTANCE_UI=1 CC_ACCEPTANCE_JOBS_FEED=1 CARGO_NET_OFFLINE=true`. The generated dev config uses loopback port 5203. The separate in-memory browser preview uses 5202 and the inherited `scripts/sprint1-preview.html` fixture entry; its title is inherited, its code is Sprint 2.

Intermediate failures were resolved rather than suppressed: jsdom lacked `dialog.show`; a first unguarded shim failed in Node-only recovery suites; the test shim is now guarded. A test used Playwright-only `exact` options with Testing Library and was corrected after typecheck rejected it. Native testing found and verified the note-trigger focus fix. A repeated full-page context-link regression was reproduced, then fixed with a distinct request token for each route entry; its regression test passes. The keyboard shortcut also recognizes the shifted physical Period key. Source-only whitespace checking passed; raw retained tool logs retain their original whitespace. No tests/assertions were removed. Full regression includes Jobs, Applications, résumé/profile/Home/Activity/Copilot, application-history and recovery/persistence suites. The two pre-existing skipped retained-native tests remain skipped; this report does not count them as passed.

No production release, distribution signing or notarization is claimed. The successful build is the current-source isolated debug acceptance package.

## G. Browser and native acceptance

Browser measurements: document width equalled viewport width at **720×800**, **1024×800** and **1440×900**. At the two smaller widths the assistant was `:modal`; at 1440 it was a separate 400 px dock. Escape closed the drawer and returned focus to Open Career AI; Enter reopened it. Draft text and exactly one composer survived full-page/docked switching. Actual selected-job, source links, note review, contextual mismatch, navigation and scroll regions were exercised. Screenshots cover the real rendered UI. These are focused panel/workspace checks, not a claim of exhaustive manual résumé-editor QA.

Fresh package:
`src-tauri/target/debug/bundle/macos/CareerCompiler Acceptance.app`.

Exact test database:
`/private/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/careercompiler-native-nim2ha28/native.sqlite3`.

Startup checked the marked temporary root and acceptance identifier, then SQLite `PRAGMA database_list` confirmed that exact file. Existing isolated-runtime policy prevents live providers, boards, Keychain operations and production database fallback. All 20 job fixtures are synthetic.

Native packaged workflow observed:

1. Launch and restore Jobs with synthetic `fit-job-0`; explicitly save that job.
2. Open contextual Career AI while keeping the job selection underneath the compact modal.
3. Tab from Close through panel controls to the composer; type a local summary question and submit with Return. Observe grounded saved-job response and citation.
4. Type a supported job-note proposal; Tab to Cancel and reject it. Read-only SQLite confirms the saved note remains empty and the action is cancelled.
5. Rebuild/restart after the focus fix. The old thread and cancelled action persist. Escape now returns to the exact note-review trigger; Return reopens it.
6. Propose another note; keyboard-focus Accept change and accept. SQLite confirms only the intended synthetic note and confirmed action.
7. Open accepted changes, invoke Review undo, inspect original/proposed note values, explicitly accept the separate undo. SQLite confirms the original empty note is restored and undo is confirmed.
8. Navigate to Profile and reopen: current view is Profile while conversation/model scope remains the original job. No rebinding or model request occurs.
9. Restart after the history acceptance below. Reopen the same local conversation on Applications; all messages and accepted/undo history remain.

Actual geometry is read from the native window API, not inferred from config or screenshot pixels: **inner and outer 720×800 points**, scale factor 2, physical 1440×1600. The measurement is recorded in `ui-startup.json`/restart artifacts. This closes the earlier configuration-only measurement gap; it is a runtime native API measurement, not a separate external OS inspector measurement.

Before/after restart SHA-256 digests match for `jobs`, `applications`, `career_copilot_threads`, `career_copilot_messages` and `safety_records`. Schema hash matches the initial snapshot. `integrity_check=ok`, foreign-key violations=0, AI budget records=0. Native process IDs changed from 89340 to 89657. See `native-verification.json`, `native-before-restart.json`, `native-after-restart.json` and `native-accepted.json`. The acceptance app was stopped after verification; the synthetic database remains available for review. The final repeated-link, shortcut and history-scroll refinements were regression-tested and rebuilt after the full native workflow; the final current package then passed another isolated startup/data-invariant check (`native-current-startup.json`). Those specific refinements were not separately re-exercised through native UI automation.

## H. Remaining Phase 2F.4.2 and PDF limits

The native 720×800 window was measured. History parsing, keyboard selection of the company-only row, opening correction controls, typing a temporary role, stale-preview invalidation, Escape cancellation and Return reopening were exercised. Parsing/cancelling did not write an application. A fresh plan retained a reviewed role correction as **UNRESOLVED_RECORD evidence only**; final confirmation accepted one row, with no invented submitted application. The native provenance UI shows original blank role and reviewed correction, source fingerprint, row and decision. It survives restart; application count remains one pre-existing synthetic fixture.

Some later selection/expansion controls needed pointer interaction. Therefore **complete keyboard-only correction/confirmation and all conflict-case traversal remain unverified**, as do VoiceOver speech and physical human-keyboard acceptance. Native tooling input is not presented as human testing. Accepted ambiguous evidence correction and restart are now verified, but they do not close the whole Phase 2F.4.2 matrix.

XeLaTeX, Rustfmt and Clippy remain unavailable. No system prerequisites or global settings were installed/changed. No new PDF-rendering claim is made; existing renderer, escaping, disabled shell escape and one-page validation were unchanged.

## I. Screenshots and complete reconciliation

Real UI evidence:

- `docs/sprint2-evidence/panel-1440.jpg` — selected job plus dock.
- `docs/sprint2-evidence/panel-1024.jpg` — intermediate modal surface.
- `docs/sprint2-evidence/panel-720-review.jpg` — compact proposal review.
- `docs/sprint2-evidence/native-720-proposal.png` — packaged native acceptance with keyboard-focused Accept.
- `docs/sprint2-evidence/native-history-provenance.png` — accepted correction provenance.
- `docs/sprint2-evidence/native-restarted.png` and `.txt` — restored local conversation.

Recovery-root deliverables (outside `development/`):

- `sprint2.patch`: incremental change from the exact Sprint 1 working-tree baseline, including new files.
- `sprint1-and-sprint2.patch`: cumulative change from the original full-working-tree snapshot, including all Sprint 1 and Sprint 2 additions.
- `reconciliation-manifest.json`: complete deliverable path/hash/mode inventory plus incremental/cumulative status and original tracked/untracked classification.
- `reconciliation-verification.json`: independent patch replay, manifest comparison, mode differences and hashes.
- `complete-source.tar.gz`: all deliverable files with exact source modes, verified by reading every archive member. Git patches encode executable bits but do not preserve all POSIX modes. Disposable replay matched every file’s contents, while 10 incremental / 14 cumulative rewritten files received normalized modes. No mode changes were applied to either preserved source workspace. The archive and manifest are authoritative for full recovery.

The manifest includes the original working tree's untracked implementation. Merely replaying a patch onto the original old Git HEAD would lose that work. Recovery uses the preserved complete source plus the cumulative patch; the verified manifests are part of that handoff. The original repository was neither patched nor staged.

## J. Safe later integration plan and next step

1. Re-run both preservation checks and inspect current original Git status. If it has diverged, retain a new complete recovery snapshot and reconcile those changes first.
2. Create another isolated integration copy from the **then-current full original working tree**, including untracked implementation and relevant ignored documentation; preserve modes and hashes. Keep its databases/credentials separate.
3. Compare against the original preservation manifest and review `reconciliation-manifest.json`. If unchanged, replay the cumulative patch in that integration copy. If integrating into the exact Sprint 1 state instead, use only `sprint2.patch`; do not apply both.
4. Verify every expected addition, tracked modification, deletion (if any), file mode and hash. Account explicitly for Git’s mode normalization using the authoritative archive/manifest; do not silently widen existing source-file permissions. Run lint/typecheck/full frontend/Rust suites, isolated dev/package acceptance and native keyboard checks against a newly marked synthetic database.
5. Obtain the missing toolchain/PDF prerequisites through the user's chosen installation process, then run formatting, Clippy and real one-page XeLaTeX QA. Complete the Phase 2F.4.2 keyboard-only matrix and review the final diff.
6. Only under a later explicit integration instruction reconcile into the original workspace, preserving any newer user edits. Decide committing/publishing separately. This sprint does not perform that integration.

Recommended next implementation step: close the native keyboard-only and PDF/toolchain acceptance gaps, then review this bounded panel integration for adoption. Do not expand model record access or action permissions before that acceptance work is complete.
