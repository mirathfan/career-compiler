# Sprint 4.4 — Native Desktop UX and Product Acceptance

## A. Executive summary

**PARTIAL.** Two reproduced UX defects were fixed and verified. The actual React application passed a synthetic browser approval/reversal journey, responsive checks, 816 frontend tests (two existing skips), typecheck, lint, frontend build and nonlaunching native compilation. A synthetic approved résumé rendered through XeLaTeX into one readable page.

**Native interactive acceptance is BLOCKED.** The UI tool rejected the already-authorized acceptance application identity. No native application was launched, no native database was opened, and no native restart, physical-keyboard, VoiceOver, preview or export pass is claimed. Browser and standalone PDF results do not substitute for these checks.

The fixes are complete within their tested scope. Product acceptance remains incomplete. No new features, actions, permissions, schema, providers or automation were introduced.

## B. Repository and preservation baseline

- Authoritative source: `/Users/athfan/Desktop/career-compiler`.
- Branch: `ui-ux-overhaul`; HEAD: `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`.
- Read the Sprint 4.0, 4.1, 4.2 and 4.3 reports. Before editing, all **1,301 source files**, hashes and modes matched the Sprint 4.3 final manifest; Git working-tree status matched its recorded state. Existing tracked and untracked work was preserved.
- Evidence/recovery directory, called **E44** below: `/Users/athfan/Desktop/career-compiler-sprint4-4-evidence-20261113-161244`.
- Verified pre-change source archive: `E44/source-before.tar.gz`, SHA-256 `c0cb8dc8de1680fe47b9c1efed444cfc25b292feb7943ab1c0d647d1f9de2d2a`. All 1,301 member hashes/modes were verified. Individual affected files are also retained under `E44/before/`.
- Tests used the **existing** QA copy at `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/verification-source`. Changed files were synchronized and final source parity verified. No new repository copy was created.

Historical Sprint 4.3 results—815 frontend tests, 40 Rust tests, Rustfmt and Clippy—are historical evidence, not new Sprint 4.4 passes.

## C. Native environment and identity

The exact tool operation was:

```javascript
await cua.getApp("com.mirathfan.careercompiler.acceptance.run83554983eeb14244b579898f3d784624");
```

Result: `Invalid app: com.mirathfan.careercompiler.acceptance.run83554983eeb14244b579898f3d784624`.

Read-only configuration checks confirmed the same identity in the existing config, regular matching isolation markers, nonsymlink dedicated root, and restricted `core:default` capability. Paths:

| Item | Exact configured value | Actual result this run |
|---|---|---|
| Synthetic root | `/private/tmp/careercompiler-native-q45or6l9` | Markers verified |
| Runtime HOME | `/private/tmp/careercompiler-native-q45or6l9/runtime-home` | Configured dedicated path |
| Intended SQLite file | `/private/tmp/careercompiler-native-q45or6l9/native.sqlite3` | **Absent**; not opened or initialized |
| Actual running native database | None | **BLOCKED**, cannot verify a running identity |

Evidence: `E44/native-tooling-blocker.json`, `E44/native-environment-readonly.json`. No alternate app identity, process inspection, guard change or access workaround was attempted. A nonlaunching native build is compilation evidence only.

## D. End-to-end journey results

Browser fallback mounted the real `App`, styles and repository context using the existing `preparationFixture(false)` and `MemoryRepository`. It ran at `http://127.0.0.1:43444/tmp/sprint44/index.html` in owned headless Chrome. It did not mark the browser as Tauri or inject native command access. Synthetic IDs were `skill-job`, `preparation-application`, `preserved-master` and `preserved-child`. All non-loopback requests were blocked by the test harness; no such requests were attempted and no page errors were recorded.

| Stage | Native result | Independently performed checks |
|---|---|---|
| A — Startup/Home | **BLOCKED** | **PASS, browser:** synthetic repository identity, actual Home and navigation. Counts and actions came from fixture records. |
| B — Jobs | **BLOCKED** | **PASS, browser:** All jobs → selected AI Engineer → saved job; exact URL/context; eligibility shown as needing confirmation. The default For you view omitted this uncertain job; All jobs exposed it. |
| C — Career AI | **BLOCKED** | **PASS, browser:** contextual panel, local grounded preparation response, record citations, no domain writes from planning. No live/model-written answer is claimed. |
| D — Preparation | **BLOCKED** | **PASS, browser:** all three justified suggestions; a second fixture offered only the supported application action. Independent review, no blanket acceptance. |
| E — Review | **BLOCKED** | **PASS, browser:** résumé rejection leaves records unchanged; keyboard Enter accepts profile skill; résumé child created separately; application next action accepted separately; double-click creates one audit. Home and Applications show the saved task. |
| F — Résumé/PDF | **BLOCKED** | **PASS, browser/data + standalone XeLaTeX:** exact child link, parent/content preservation, one readable PDF page. Native preview/export not exercised. |
| G — Reversal | **BLOCKED** | **PASS, browser:** three separate reviewed reversals; skill/tracker restored, child archived without deletion, history retained. Conflicts also covered by current synthetic tests. |
| H — Restart | **BLOCKED** | **PASS only for browser panel close/reopen and automated SQLite export/reopen.** These are not native application restart. |

`E44/browser-journey-final.json` records 13 passing stages, with before/accepted/reversed snapshots in `browser-journey-final-state.json`. `browser-supplement-final.json` records the subset plan. `browser-stable-matrix.json` records 18 settled browser layout checks, six views at each size.

## E. Career AI coordinated workflow

The full plan proposed LangGraph from verified AURA evidence, one specific AURA bullet revision from `preserved-master`, and the linked preparing application's next action. It cited existing records, labeled the answer local, stated that suggestions are not changes, and retained sponsorship as unknown. Each review targeted its original entity.

In the subset fixture, LangGraph evidence was `needs_review` and the original fact disabled **before** planning. Profile and résumé rows both showed **Needs information**; only Application next action showed **Suggested**. Profile, skills, facts, résumés, applications, history and archives were unchanged by planning. No fabricated replacement actions appeared.

Current automated tests additionally passed stale evidence/source/application/context rejection, repeated acceptance, partial cancellation, independently failed operation rollback, and bounded mocked reads. These are automated synthetic results, not observed native interruptions.

## F. Résumé/PDF and identity preservation

Browser-approved child: `resume-99774f6a-8e21-43cf-a05e-405ddab12aef`; parent/base: `preserved-master`. Approved included text: “Built AURA agent orchestration using LangGraph.” The unrelated locked/excluded bullet remained unchanged. Every pre-existing version and the submitted application's historical linkage remained unchanged in before/after comparisons.

The existing `renderResumeLatex` serializer produced the input. The existing TinyTeX engine ran with the same five flags as the native command: `-no-shell-escape -interaction=nonstopmode -halt-on-error -file-line-error resume.tex`, inside dedicated `E44/pdf-check` runtime/home paths. No native invocation or alternate renderer was used.

- PDF: [synthetic approved child](/Users/athfan/Desktop/career-compiler-sprint4-4-evidence-20261113-161244/pdf-check/resume.pdf), 15,909 bytes, one Letter page, no JavaScript/forms, unencrypted.
- SHA-256: `7cd3c6f998c059add104e46b2fc4f0a8e510f09253a9da6257043a1a1d8c8125`.
- Serialized input SHA-256: `00f394abd17df54f1e8ff3b35a45d3a0149c4018f00a366706cad0dcb45d1c43`.
- Poppler text extraction found the exact approved bullet. The rendered PNG was visually inspected: readable contact header, project bullet and skills, no clipping. This is a sparse synthetic résumé, not proof of dense real-world pagination.
- `pdf-content-verification.json` binds the PDF's exact input to the browser-approved version and verifies prior versions/history remain intact.

Evidence bookkeeping: the full frontend suite also writes `resume-child.tex` from its different fixture. The browser input was separately regenerated as `browser-child.tex` and verified against the already-rendered PDF input hash. Use `browser-child.tex` or `pdf-check/resume.tex` for this PDF, not the suite's later generic filename.

## G. Undo, audit and recovery

The actual browser UI exposed each supported undo through Accepted changes → Review undo → Accept change. LangGraph was removed, the application's empty next action/date restored, and the exact child archived while its content stayed intact. Pre-existing application history was unchanged. Reopening the panel retained Reversed / Archived statuses.

Current `preparationWorkflow` and UI tests also reopened synthetic SQLite state with accepted and pending operations, finished acceptance, reversed each domain operation, and reopened again. Evidence: `E44/coordinated-acceptance.json`. Native process restart remains BLOCKED.

All owned browser handles were closed in `finally`. Owned Vite servers were closed using their own PTY Ctrl-C controls; final loopback connection refusal confirms the test endpoint stopped. No native process was created. See `E44/owned-session-closure.json`.

## H. Layout, keyboard and accessibility

| Check | Result and limits |
|---|---|
| 720×800 / 1024×800 / 1440×900 | **PASS, browser CSS pixels:** document width equals viewport for Home, Jobs, Applications, Résumés, Profile and Activity. Native window-point measurement BLOCKED. |
| AI presentation | Modal drawer at 720/1024, dock at 1440. Main job remains visible at wide width; compact background interaction is contained by the modal. |
| Composer | Fixed clipping, then verified card scroll/client geometry, composer bounds and Send hit-testing after scrolling at all sizes. |
| Scrolling | Outer panel and conversation have separate scrolling. Reachable after the fix, but still cramped; see P2 findings. |
| Keyboard | Browser-generated Tab/Shift+Tab samples stayed in compact drawer; Escape dismissed it and focus returned to Open Career AI. Enter accepted a reviewed profile change. |
| Semantics | Tests used named links, buttons, dialog, status rows and labeled textbox. No full accessibility-tree audit or screen-reader pass is claimed. |
| Empty/loading/error | Limited-evidence plan and default Jobs empty recommendation view observed. Current component tests cover loading/error/retry states. These were not exhaustively exercised visually at every size. |
| Native keyboard/VoiceOver | **BLOCKED / unverified**. No physical-keyboard or VoiceOver claim. |

Representative browser screenshots: [compact AI after fix](/Users/athfan/Desktop/career-compiler-sprint4-4-evidence-20261113-161244/layout-after-720.png), [Home with saved task](/Users/athfan/Desktop/career-compiler-sprint4-4-evidence-20261113-161244/home-accepted-after.png), [exact child navigation](/Users/athfan/Desktop/career-compiler-sprint4-4-evidence-20261113-161244/child-library-1440.png), [subset plan](/Users/athfan/Desktop/career-compiler-sprint4-4-evidence-20261113-161244/subset-plan-1440.png). These are real browser UI captures, not native screenshots or mockups.

## I. Prioritized reproduced UX findings

| ID / severity / screen | Reproduction and expected behavior | Observed behavior / evidence | Minimal resolution |
|---|---|---|---|
| UX-01 **P1**, AI at 720/1024×800 | Open a job preparation conversation; reach composer. All primary controls should fit the scrollable card. | Card height 510px, client 508px, internal content 556px. Composer ended about 47px below the card's hidden-overflow boundary, clipping input/Send. `layout-before.json`, `plan-before-720.png`. | **Fixed:** allow the existing card's minimum height to fit its content. After: client/scroll both 556px; outer panel scrolling reveals controls. |
| UX-02 **P2**, Home after approval | Accept tomorrow's next action on a preparing application, then open Home. Existing draft row should expose the saved task/date. | Applications showed “review this application”, but Home's Continue row showed only AI Engineer despite counting one upcoming action. `home-accepted-before.png/txt`. | **Fixed:** include saved task and valid date in the existing row; no change to priority/due rules. `home-accepted-after.png/txt`, red/green regression test. |
| UX-03 **P2**, AI plan readability | Open all-three preparation plan. The answer should receive useful space alongside controls. | Multiple entry buttons and context/composer sections leave a 192px message viewport at 1440×900 and 140px at 800px height for roughly 1,505px of plan content. Nested scrolling remains. `layout-before.json`, `plan-initial-1440.png`, `layout-after-720.png`. | **Deferred:** propose collapsible secondary entry controls while a plan is active, preserving an obvious way to reopen them. Requires deliberate layout review, not another one-line fix. |
| UX-04 **P2**, exact résumé navigation | Accepted changes → Open exact child. Expect the selected version and its parent to be prominent. | Correct record opens, but library search/review/statistics precede the card; at 1440×900 the card begins around y=696 and preview falls below the fold. Lineage reads “Child variant” rather than the parent's name in the visible summary. `child-library-1440.png/txt`. | **Deferred:** focused exact-version header with parent link and scroll/focus to selected preview; retain full library navigation. |
| UX-05 **P2**, reversal discovery | After accepting a change, locate undo. Expect a clearly labeled path. | Reviewed undo is inside collapsed “Accepted changes (3)” below the composer/review area; the visible label does not name undo. Once opened, reversal works. `accepted-plan-1440.png`, browser journey. | **Deferred:** expose “Review undo” entry guidance beside accepted status while reusing the same reviewed reversal. No one-click destructive undo. |

No P0 data-loss/wrong-target defect was observed within synthetic coverage. No separate reproduced P3 issue was assigned. This is not a claim that native behavior is defect-free.

First-time-user assessment:

| Question | Assessment |
|---|---|
| What first? | Home gives concrete next actions; the fixed task/date helps. Jobs' default recommendations can be empty while uncertain jobs exist in All jobs. |
| Jobs versus Applications? | Distinct navigation and evaluation versus tracker content are understandable; related job/application links work. |
| Versioning understandable? | Exact identity is preserved, but generic “Child variant” and library chrome obscure the relationship on first arrival. |
| Does AI help? | Yes for assembling supported next steps locally; compact controls and nested scrolling make reading harder than necessary. |
| Proposals inspectable? | Targets/evidence and independent review are explicit, but long plan content requires substantial scrolling. |
| Nothing before approval? | Clear local-plan notice and separate Accept/Reject controls; snapshots confirmed no domain writes from planning/rejection. |
| Undo discoverable? | Available and functional, but hidden behind Accepted changes; improve entry guidance. |
| Suggestions versus facts? | Local/model-scope labels, citations and unknown sponsorship are explicit. Wordy notices compete with the answer. Live model UX was not tested. |
| Next actions visible? | Home now exposes the accepted task/date; Applications exposes exact tracking details. |
| Redundant controls? | Three AI entry buttons plus Prepare this job/private-note controls compete within the narrow panel. Résumé library search/review/stats remain even on an exact-record link. |

## J. Minimal changes implemented

Three existing files replaced; one report added; zero deletions:

1. `src/index.css`: change the scoped Career AI conversation minimum height from `0` to `min-content` so controls cannot overflow its hidden boundary. No global dialog or navigation redesign.
2. `src/lib/dashboard/workspace.ts`: show recorded next action and valid follow-up date in the existing draft row. Ordering, urgency and domain state unchanged.
3. `src/lib/dashboard/workspace.test.ts`: one meaningful regression test covering saved task/date, future-not-due classification, unchanged records, and invalid/empty omission.
4. `docs/SPRINT_4_4_NATIVE_UX_ACCEPTANCE_REPORT.md`: this report.

The CSS cause was reproduced, tested with a temporary style hypothesis, then changed. The Home test failed before the fix and passed afterward. No assertions were weakened. Browser harness/scripts/screenshots remain in the existing QA `tmp/sprint44` and E44, outside authoritative app source.

## K. Actual commands and results

Commands below ran through `python3 E44/check.py <label> ...` in the existing QA copy with its dedicated HOME/cache/temp/toolchains, offline package settings, no credentials, and no acceptance root set for nonlaunching checks. Exact argument arrays/cwd/timestamps are in each `*-result.json`.

| Command after wrapper | Result this sprint |
|---|---|
| `node node_modules/vitest/vitest.mjs run src/lib/dashboard/workspace.test.ts --maxWorkers=1` before implementation | Expected red: 1 failed, 7 passed; retained `home-before.log`. |
| `node node_modules/vitest/vitest.mjs run src/lib/dashboard/workspace.test.ts src/features/copilot/PreparationWorkflow.test.tsx src/features/copilot/ApplicationNextActionWorkflow.test.tsx src/components/CareerAIPanel.test.tsx --maxWorkers=1` | **PASS: 20 tests / 4 files**. |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=1` | **PASS: 816 tests / 96 files; 2 existing skips**. Shared CSS and cross-workspace Home behavior justified the full frontend regression run. |
| `node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run typecheck` | **PASS**. |
| Same npm CLI, `run lint` | **PASS**. |
| Same npm CLI, `run build` | **PASS**; existing >500kB chunk-size warning remains. |
| Same npm CLI, `run tauri:build -- --debug --no-bundle -- --locked --offline` | **PASS**, debug native executable compiled, not launched or distributed. |
| `node E44/browser-journey-final.mjs` | **PASS**, 13 browser journey stages, zero external requests/page errors. |
| `node E44/browser-supplement-final.mjs` | **PASS**, limited-evidence plan and six-view layout geometry. |
| `node E44/browser-stable-matrix.mjs` | **PASS**, 18 settled layout checks; fresh viewport per size, fonts/animation frames settled. |
| `python3 E44/verify-pdf.py` | **PASS**, real standalone XeLaTeX; see exact engine/flags in `pdf-render-result.json`. |
| Bundled Poppler `pdfinfo`, `pdftotext -layout`, `pdftoppm -png -scale-to 1400 -singlefile` | **PASS**, one page, exact bullet text, rendered PNG inspected. |
| Native UI / Tauri dev startup | **BLOCKED**, exact tool rejection above; not attempted under another identity. |
| Rust tests / Rustfmt / Clippy | **Not rerun**: no Rust, guards, commands, dependency or schema changes. Historical 40-test Sprint 4.3 results remain historical; unrelated reruns were avoided per sprint scope. |

`node` above is `/Users/athfan/.local/node-v22.23.4/bin/node`. The two frontend skips are existing opt-in synthetic history recovery cases. Early browser scripts had test-harness locator errors (`h1` assumption and incorrect résumé heading); the selectors were corrected to actual accessible headings, without app changes or weakened checks. Failed attempts are retained. Some immediate-resize screenshots showed stale paint strips; the final matrix uses a fresh viewport and settled frames. These capture issues are not classified as product defects.

## L. Native blockers and unverified items

The exact identity rejection prevents actual native startup, window-point measurement, native database identity, full A–H journey, native review dialogs/keyboard, real process restart, native PDF preview/export and VoiceOver verification. Provider/network failure states are not exhaustively visually tested at each size. Live providers were not called.

An [owner-executable native checklist](/Users/athfan/Desktop/career-compiler-sprint4-4-evidence-20261113-161244/OWNER_NATIVE_CHECKLIST.md) includes exact existing identity/paths, copied unchanged controls, guarded build/launch commands, synthetic fixture recipe, stage-by-stage expected results, two real restarts, stop conditions and owned shutdown. The restricted branch intentionally omits general Settings file/dialog/export commands; the checklist does not enable them. If fixture preparation or native PDF retention cannot use existing permitted UI, report that criterion BLOCKED.

## M. Data and source preservation

Final verification: **1,302 source files**, **3 replacements**, **1 addition**, **0 deletions**; all **1,298 other original source files unchanged**, original modes retained, tested-copy hashes/modes equal. Branch/HEAD and eight protected Git entries remain unchanged. Native acceptance guards, production config, providers, credentials code and migrations are unchanged.

The prior manifest's **57,125 excluded dependency, generated and runtime files** retained their recorded size/mode/mtime metadata (`node_modules`, `dist`, `output`, `tmp`, native target/gen and extension dist). This is metadata preservation evidence for those repository trees, not an inventory or content-hash audit of externally stored production databases or macOS Keychain. Production database/private file contents were deliberately not opened. No production-data operation, Keychain call, paid request, production migration, production launch, commit, push, deploy or unrelated process inspection occurred.

The original Sprint 2.7 candidate's **1,251 files** and both original recovery archives were reverified. Existing recovery artifacts were not changed. Details: `E44/final-preservation.json`, `E44/changes.json`, `E44/sprint4-4.patch`, `E44/git-status-before.txt`, `E44/git-status-after.txt`.

Rollback, only if later requested: first verify each current affected file still matches `changes.json`'s after-hash/mode. If any differs, stop for conflict review. Restore only the three replacements from `E44/before/`, validating their before-hashes/modes. Preserve this added report in a new quarantine directory rather than deleting it. Do not reset the repository, restore the full archive over unrelated work, or touch databases/Git metadata. No rollback was needed or executed.

## N. Three highest-value product improvements

1. Give the AI answer and plan more vertical space by collapsing secondary entry tools when a conversation is active; retain accurate scope notices and accessible access to those tools.
2. Make exact résumé links land on a focused version preview with a named parent and submitted-use status, keeping the library available separately.
3. Make reviewed undo discoverable directly from accepted status, with clear profile/tracker reversal versus résumé archival language and the existing confirmation flow.

## O. Recommended next sprint

Complete owner-operated native acceptance using the unchanged guards and existing isolated environment before adding more AI capability. Resolve tooling identity visibility through the supported owner/tool path, then test A–H, both real restarts, native geometry, keyboard and PDF preview. Only after that evidence, scope a small usability follow-up for the three deferred findings. No Sprint 5 feature work was started.
