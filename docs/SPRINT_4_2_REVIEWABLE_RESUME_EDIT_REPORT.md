# Sprint 4.2 — Reviewable résumé bullet revisions

## A. Executive summary and status

**PARTIAL — the narrow source workflow is implemented and verified with synthetic repositories and mocked providers; native interactive acceptance remains unverified.** No live provider claim is made.

Career AI can prepare one verified-evidence bullet replacement, show its exact before/after text, reject it without mutation, or explicitly accept it into a **new draft child version**. It never overwrites the source, Master, or submitted résumé. A second reviewed operation archives an unchanged, unused child without deleting its content, files or audit.

The implementation intentionally copies one verified fact statement exactly. It does not offer arbitrary paraphrasing, multi-fact synthesis, whole-document editing, or inferred metrics. The user explicitly chooses the source and stable bullet ID; ambiguous conversational requests receive selection guidance. A model can select evidence wording after the existing two outbound reviews, but receives no original résumé text or local target binding.

## B. Baseline and recovery

- Authoritative source: `/Users/athfan/Desktop/career-compiler`.
- Branch: `ui-ux-overhaul`; HEAD: `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`.
- Snapshot time: `2026-11-12T20:17:58.132939+00:00`.
- Full source inventory: 1285 tracked and untracked files. Comparison with Sprint 4.1 final hashes/modes found **zero drift** before editing.
- New evidence/recovery directory: `/Users/athfan/Desktop/career-compiler-sprint4-2-evidence-20261112-201755`.
- Recovery: `source-before.tar.gz`, SHA-256 `3ddad34a267c23e74fe0ae5ff2ecb7b51540b45595ff13a978aa98b122d31c3a`; every archived file's content and mode verified before implementation.
- `preservation.json` and `git-status-before.txt` record membership, hashes, modes and pre-existing Git work. No reset, clean, stash, commit, push or deployment occurred.
- `before/`, `changes.json`, `changed-paths.json`, `sprint4-2.patch`, `git-status-after.txt` and `final-preservation.json` provide the final per-file reconciliation. The patch includes new files, not just tracked differences.
- Tests/builds reuse the established `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/verification-source`. Changed source was synchronized there and exact final source parity verified; no new full development copy was made.

Rollback is deliberately manual and conflict-aware: verify each current changed path still has its `afterSha256` and mode in `changes.json`; restore only replacements from this run's verified `before/`; move this run's additions to a new quarantine directory instead of deleting them. Stop if any later edit is detected. Do not restore the entire repository or touch production data, Git metadata, or earlier recovery directories. No rollback was performed.

## C. Existing services reused

The shared CareerCopilotPage serves both full-page and contextual panel presentations. Existing conversation/message persistence, `actionReview`, repository confirmed-action transactions, immutable SafetyRecord audits, React Query invalidation, validated citation navigation, and archive flags are reused.

The existing WorkspaceReadReview → reviewWorkspaceQuestion → sendWorkspaceReview flow provides consent receipts, field-limited read tools, stale-data rechecks, two explicit outbound approvals, budgets, timeouts/cancellation and provider dispatch. Existing OpenAI structured transport and offline mock provider are extended with one optional suggestion shape; no provider abstraction, write engine or conversation store was added.

Résumé services reused: document normalization/conversion, the editor's stable bullet and section model, `validateResumeClaims`, exact source-fact associations, parent/base version conventions, existing library navigation and PDF serializer/engine. The optimizer was inspected but not invoked: it can apply multiple changes, which exceeds this one-bullet action.

## D. Single-bullet operation contract

`revise_resume_bullet` is the only new action type. Its strict model suggestion is:

```json
{"operation":"revise_resume_bullet","evidenceId":"verified-fact-id","replacementText":"Exact verified statement."}
```

It carries no model-supplied target, path, SQL, document, approval flag or write command. The application binds the selected saved job, source version and stable bullet ID locally. The persisted pending action includes proposal/message/thread identity; source/job/evidence SHA-256 fingerprints; exact old text; proposed wording; verified evidence ID; reason; source/job/section labels; a preallocated unoccupied child ID; and pending/confirmed/cancelled status.

Acceptance checks the exact stored pending action, original version and job hashes, unique nonempty bullet identity, document identity and matching text/evidence in both stored representations, inclusion/rejection/lock state, current evidence, reviewed labels/rationale and child-ID vacancy. Duplicate acceptance is serialized and rejected. Navigation cannot rebind an action to another job.

## E. Evidence and allowed claims

The replacement must equal the trimmed statement of one enabled **verified** fact belonging to the bullet's exact career item; the item must also be enabled. Missing, prohibited, needs-review, unrelated, injected or secret-like evidence is rejected. Unsupported accomplishments, metrics or technology wording cannot be introduced by the model because arbitrary paraphrases fail exact-statement validation.

The fact must have a reviewed technology tag appearing as a complete term in both the statement and saved-job text. Existing term matching is reused with sentence-ending punctuation normalized, preventing Java/JavaScript false matches. This is explicitly described as text overlap, not a fit guarantee or eligibility determination. Existing whole-document claim validation must have no blocking errors before creation. Other source bullets and their evidence IDs are preserved; only the revised bullet receives the approved fact ID, with its previous IDs retained in the untouched source and audit provenance.

## F. Review UI

In a saved-job conversation, open **Review one résumé bullet**, select the exact source version and target bullet, and choose verified evidence for a local draft. For a model selection, keep that local target, open **Read across selected records**, enable the separate bullet-proposal option, select authorized evidence/job records and ask to improve the bullet. The exact outbound request is reviewed twice through the existing UI. Neither opening the picker nor navigation calls a provider.

The action card shows target job/ID, source name/ID, section/stable bullet ID, exact current and proposed text, reason, evidence/source links and planned child ID. Impact text explicitly says new child, original/Master/submitted versions preserved, and **text preview only — PDF not rendered by the action**. Accept and Reject reuse existing controls. To revise a proposal, reject it and prepare another verified statement.

Accepted changes offer an exact before/after disclosure and a validated link to the child. “Show me what changed” returns the accepted snapshot and exact source/child links. “Undo that” prepares a review; it does not execute reversal. A plain “yes” does not accept a write. Existing conversation persistence retains the action's precise references across reopening; the picker requires deliberate selection for new drafts.

## G. Transactional child creation

Inside the existing confirmed-action transaction, validation runs again, a deep-cloned representation changes exactly one targeted bullet, existing document conversion/normalization preserves the rest, and `saveResumeVersion` creates the preallocated new child. It has a new content ID, `kind: tailored`, `status: draft`, an empty `lastExportPath`, parent = exact source, and base = source Master or existing base lineage. Template/layout settings and unrelated content/locks remain intact. No active/Master designation is changed.

The revised bullet is marked unapproved for downstream export review, just as with manual editing. The old document is retained as the deterministic baseline. Saved content/document equality and source preservation are checked; the audit and proposal status commit in the same transaction. Injected failures after child/audit writes roll everything back, leaving no committed orphan child. UI confirmation and query invalidation occur only after persistence succeeds.

## H. Lineage and provenance

The immutable `resume_bullet_action` audit stores operation direction, thread/message IDs, exact proposal before/after values, accepted child fingerprint, explicit review attribution and `pdfStatus: not_rendered_by_action`. The message records local/mock/model provenance. No schema migration was needed.

Tests preserve source/Master and previously submitted versions byte-for-byte at repository-object level, along with application submitted-version IDs, PDF hashes and Application History safety records. Child IDs are checked for collisions; existing destinations are never overwritten. Existing export/artifact fields are not copied as if they belonged to the child.

## I. Reviewed reversal

Reversal **archives**, rather than deletes, the accepted child using existing résumé archive flags. A separate pending proposal and explicit acceptance are required. The original action, both audits, child content and any files are retained. This is not erasure of version creation and does not restore or change active selection.

It refuses a missing/edited/exported child, existing archive, favorite, descendant/base reference, linked/submitted application or application package, a changed pending reversal, or a duplicate reversal. Source changes made later are preserved. Root résumé delete/archive/favorite operations now enter the existing transaction queue so an in-flight accepted action cannot overwrite a simultaneous manual change. No new AI delete capability exists.

## J. Document and PDF validation

Synthetic checks verify only the approved bullet differs, locks survive, the child has correct parent/base identity, its document and TailoredResume agree, the source stays unchanged, and invalid or colliding creation leaves no partial version.

A real PDF was generated outside the app from the accepted synthetic child's **existing `renderResumeLatex` output**, using the approved TinyTeX executable and arguments copied/checked against `XELATEX_ARGUMENTS`: `-no-shell-escape -interaction=nonstopmode -halt-on-error -file-line-error resume.tex`. Dedicated HOME/runtime directories are under this run's `pdf-check/`; no system installation/configuration changed. Compiler output was captured but not logged.

`pdfinfo` and pypdf confirmed one unencrypted US Letter page. Extracted text contains the approved LangGraph bullet; the PNG was visually inspected and is readable with no clipping. It is intentionally a sparse synthetic document, not validation of arbitrary real-world page density. PDF, PNG, text, exact render command and hashes are retained under this evidence directory. Artifacts: `/Users/athfan/Desktop/career-compiler-sprint4-2-evidence-20261112-201755/pdf-check/resume.pdf` and `/Users/athfan/Desktop/career-compiler-sprint4-2-evidence-20261112-201755/pdf-check/resume.png`; the PDF is 15,965 bytes, SHA-256 `296acff38728401210f55726bd8f1de74a10eeb08fac2f66c2c31a1d51515aac`. `pdf-content-verification.json` binds the final accepted synthetic child ID and parent to identical serializer output.

Exact render driver: `python3 /Users/athfan/Desktop/career-compiler-sprint4-2-evidence-20261112-201755/verify-pdf.py`. Read-only visual inspection used the bundled `pdfinfo <pdf>` and `pdftoppm -png -scale-to 1400 -singlefile <pdf> <output-prefix>` tools under `/Users/athfan/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/`; pypdf ran under the bundled `dependencies/python/bin/python3`, loading that PDF, asserting one page and the exact approved statement, and writing `pdf-text.txt`/`pdf-content-verification.json`. The application's `countPdfPages` is also covered by existing regression; this standalone render was not a Tauri command invocation, native preview, export or native UI test. Acceptance itself does not promise a PDF; normal library rendering/export remains a separate step and retains existing one-page enforcement.

## K. Outbound controls

New suggestion opt-in defaults off. Local source/bullet IDs, source hash and original résumé text remain in a local review receipt, never added to WorkspaceRequest. Selecting résumé metadata does not authorize full content. The request uses the existing selected-record fields and question; any text the user types is visibly part of that reviewed request. Record fields retain existing minimization and result limits.

The model may select only a fact actually returned by the approved read tools; local validation checks it against the exact source career item and current data. Only one action option can be enabled per request. Invalid output, unknown fields, unapproved suggestions, stale records, provider failure and cancellation create no domain mutation. Existing model budgets, Keychain handling, native command permissions, provider storage settings and acceptance guards are unchanged. No paid calls were made.

## L. Synthetic end-to-end evidence

`resumeBulletActions.test.ts` exercises both MemoryRepository and SQL.js-backed SqliteRepository. SQLite export/reopen covers pending proposal, rejection, a fresh mocked proposal, acceptance, child persistence, reviewed archive and preserved submitted associations. These are synthetic in-memory SQLite databases, not a production file or native restart.

`ResumeBulletWorkflow.test.tsx` mounts the actual shared Career AI component: selects the AURA bullet, reviews two mock requests, inspects exact values, rejects, prepares a fresh local proposal, accepts via keyboard, unmounts/reopens the repository/UI, opens the exact child link, shows the change, and separately approves archival reversal. It records two mock calls, no unexpected calls from navigation, and preserved application/source objects. Service-level acceptance separately covers a fresh **model-backed mocked** proposal through creation.

Synthetic wording:

- Before: “Built AURA using TypeScript.”
- Approved: “Built AURA agent orchestration using LangGraph.”
- The unrelated locked TypeScript bullet remains unchanged.

Evidence: `resume-bullet-ui-acceptance.json`, `resume-bullet-ui-reversal.json`, final test logs, `pdf-render-result.json`, `pdf-content-verification.json` and `pdf-check/resume.png`. No native UI screenshots were captured; the PNG is a PDF render.

## M. Commands, results and skips

Commands run through `/Users/athfan/Desktop/career-compiler-sprint4-2-evidence-20261112-201755/check.py` in `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/verification-source` with the already-approved offline toolchains and isolated HOME/cache/temp paths. The original source was not used as a test runtime. Logs and exact command/cwd/exit/timestamp JSON accompany every named check. No global prerequisites were installed.

| Evidence name | Exit | Exact underlying command |
|---|---:|---|
| `focused-first` | 1 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run src/lib/copilot/resumeBulletActions.test.ts --maxWorkers=1` |
| `diagnosis` | 1 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run src/lib/copilot/resumeBulletDiagnostics.test.ts --maxWorkers=1` |
| `focused-second` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run src/lib/copilot/resumeBulletActions.test.ts src/lib/copilot/resumeBulletDiagnostics.test.ts --maxWorkers=1` |
| `focused-ui` | 1 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run src/features/copilot/ResumeBulletWorkflow.test.tsx src/lib/copilot/workspaceTransport.test.ts src/features/copilot/ProfileSkillWorkflow.test.tsx --maxWorkers=1` |
| `focused-ui-second` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run src/features/copilot/ResumeBulletWorkflow.test.tsx --maxWorkers=1` |
| `focused-final` | 1 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run src/lib/copilot/resumeBulletActions.test.ts src/lib/copilot/resumeBulletDiagnostics.test.ts src/features/copilot/ResumeBulletWorkflow.test.tsx src/features/copilot/WorkspaceReadReview.test.tsx src/lib/copilot/workspaceTransport.test.ts --maxWorkers=1` |
| `focused-final-corrected` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run src/lib/copilot/resumeBulletActions.test.ts src/lib/copilot/resumeBulletDiagnostics.test.ts src/features/copilot/ResumeBulletWorkflow.test.tsx src/features/copilot/WorkspaceReadReview.test.tsx src/lib/copilot/workspaceTransport.test.ts --maxWorkers=1` |
| `frontend-final` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run --maxWorkers=1` |
| `frontend-final-verified` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run --maxWorkers=1` |
| `types-first` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/typescript/bin/tsc -b --noEmit` |
| `types-second` | 2 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/typescript/bin/tsc -b --noEmit` |
| `types-final` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/typescript/bin/tsc -b --noEmit` |
| `types-verified` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/typescript/bin/tsc -b --noEmit` |
| `lint-final` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/oxlint/bin/oxlint .` |
| `lint-verified` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/oxlint/bin/oxlint .` |
| `rust-tests` | 0 | `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo test --manifest-path src-tauri/Cargo.toml --locked --offline` |
| `rustfmt` | 0 | `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo fmt --manifest-path src-tauri/Cargo.toml --check` |
| `clippy` | 0 | `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked --offline -- -D warnings` |
| `native-build` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run tauri:build -- --debug --no-bundle -- --locked --offline` |

Final checks: **792 frontend tests passed, two historical skips; 40 Rust tests passed; TypeScript, Rustfmt, Clippy, frontend Vite build and Tauri debug/no-bundle build passed.** Lint passed with the existing warning described below. Native startup and interaction were not run.

The first complete single-worker suite passed **791 tests, two existing skips, 93 files**. After the final target-label/identity validation and whole-term matching adjustments, `frontend-final-verified` passed **792 tests, two existing skips, 93 files** in 141.01 seconds; the final focused corrected run passed **29/29**. No assertions or timeouts were weakened and no historical tests were removed. Lint exits successfully with zero errors and one existing `no-control-regex` warning in unchanged `applicationActionContract.ts`. The two existing skips remain in Application History recovery coverage.

Failures retained transparently: the initial focused action run had 8 passes/4 failures (JSON field ordering in memory-document equality and one invalid foreign-key fixture); an isolated diagnostic proved identical values with differing key order, fixed with existing canonical serialization. The first UI run had 7 passes/1 failure because the test assumed `/resumes` instead of the existing `/library` route. An intermediate type check caught an overly broad fixture array type. A later stricter-term focused run failed because the reused matcher treats a trailing period as a technology character; normalization and a Java/JavaScript regression resolved it. Subsequent focused checks passed without relaxing safety assertions.

## N. Changed and added source files

- Modified `src/features/copilot/CareerCopilotPage.tsx`
- Added `src/features/copilot/ResumeBulletComposer.tsx`
- Added `src/features/copilot/ResumeBulletWorkflow.test.tsx`
- Modified `src/features/copilot/WorkspaceReadReview.tsx`
- Modified `src/lib/ai/mockProvider.ts`
- Modified `src/lib/ai/openAIProvider.ts`
- Modified `src/lib/copilot/actionReview.ts`
- Modified `src/lib/copilot/careerCopilot.ts`
- Added `src/lib/copilot/resumeBulletActions.test.ts`
- Added `src/lib/copilot/resumeBulletActions.ts`
- Added `src/lib/copilot/resumeBulletContract.ts`
- Added `src/lib/copilot/resumeBulletDiagnostics.test.ts`
- Modified `src/lib/copilot/workspaceContract.ts`
- Modified `src/lib/copilot/workspaceConversation.ts`
- Modified `src/lib/copilot/workspaceTransport.test.ts`
- Modified `src/lib/database/memoryRepository.ts`
- Modified `src/lib/database/sqliteRepository.ts`
- Added `src/test/resumeBulletFixture.ts`
- Modified `src/types/domain.ts`
- Added `docs/SPRINT_4_2_REVIEWABLE_RESUME_EDIT_REPORT.md`.

The new contract/actions implement one domain operation; the composer integrates it into the shared surface; the fixture/tests cover it; provider, review, message and repository changes wire it into existing mechanisms. No Rust/native/security/migration source changed.

## O. Preservation

Final verification: PASS: 1285 archive members, 8 additions, 12 replacements, zero deletions; 1273 other source files unchanged; 8 protected Git entries, 57125 excluded runtime metadata entries, 1251 original candidate files and both integration recovery archives verified.

Production databases and credentials were never opened or mutated. Preservation uses source hashes/modes and existing excluded-file size/mode/mtime evidence, not private row inspection or Keychain access. This supports untouched-file metadata and the absence of production operations; it is not a new content audit of production databases. Existing guards/config/migrations/provider interface remain hash-identical to baseline. No process inspection, signals, native launch, external requests, application submission, Git history change or security-setting change occurred.

## P. Native QA limitations

No Tauri dev window or packaged native application was launched in this sprint. Native interactive acceptance remains **unverified**; the prior identity-resolution limitation was not bypassed and acceptance guards were not modified. Component/jsdom keyboard and persistence checks do not establish macOS focus, compact-window geometry, real native restart or native PDF-preview behavior. No new screenshot or live-provider claim is made. The native build and Rust checks, when listed above, validate compilation/regression only.

## Q. Remaining work and Sprint 4.3 recommendation

Complete an explicitly authorized isolated native walkthrough of this action, including compact layout, evidence/child navigation, keyboard focus, restart and PDF preview/export. The existing implementation is a conservative exact-evidence revision, not free-form model rewriting. It requires explicit source/bullet selection rather than guessing across a natural-language résumé recommendation; richer disambiguation can be added without removing that confirmation.

For Sprint 4.3, first improve the existing one-bullet workflow's selection and native acceptance. If paraphrasing is desired, introduce a separately reviewed minimized original-bullet outbound scope and a stronger claim-to-evidence contract before expanding generated wording. Retain new-child persistence and reviewed non-destructive reversal. Do not broaden to whole-document rewriting or autonomous applications.
