# CareerCompiler — Sprint 2.5 acceptance and integration readiness

November 11, 2026. This report records newly executed checks in the isolated Sprint 2.5 copy. Historical Sprint 1/2 results are retained separately.

## A. Executive summary

**Overall: PARTIAL.** The complete Application History functional keyboard sequence now passes in the packaged native application at independently measured **720×800 points**. Cancellation, reviewed correction, explicit approval, provenance inspection, return navigation and restart persistence were exercised using native key events. No product-code fix was needed.

All 674 frontend tests passed (two existing conditional integration tests skipped), as did 36 Rust tests, lint, TypeScript, frontend build, debug native packaging and isolated dev startup. XeLaTeX, Rustfmt and Clippy remain unavailable in the installed environment. Those are dependency blockers, not observed product failures.

| Acceptance area | Current result |
|---|---|
| Application History native acceptance | **PASS** — native tool-delivered keyboard events; human hardware keyboard and VoiceOver not claimed |
| PDF generation acceptance | **BLOCKED** — no XeLaTeX runtime found |
| Rustfmt | **BLOCKED** — cargo-fmt not installed |
| Clippy | **BLOCKED** — cargo-clippy not installed |
| Frontend regression | **PASS** — 78 files, 674 passed, 2 skipped; lint/types/build passed |
| Rust regression | **PASS** — 36 tests |
| Native startup | **PASS** — packaged launch, packaged restart and tauri:dev |
| Preservation/reconciliation readiness | **PASS** — complete source/mode manifest and archive; both patch replays verified in disposable copies |

No original-repository integration, commit, push, deployment, paid model call, live discovery or external submission occurred. All 302 preserved files under `src/` and `src-tauri/` are byte-for-byte unchanged from Sprint 2. The existing model and approval boundaries are therefore unchanged, with current regression coverage also passing.

## B. Development environment

- Original, untouched: `/Users/athfan/Desktop/career-compiler`.
- Sprint 1, untouched: `/Users/athfan/Desktop/career-compiler-sprint1-20261111-074953/development`.
- Sprint 2, untouched: `/Users/athfan/Desktop/career-compiler-sprint2-20261111-080951/development`.
- **Sprint 2.5 development:** `/Users/athfan/Desktop/career-compiler-sprint2-5-20261111-090352/development`.
- Sprint 2.5 recovery: `/Users/athfan/Desktop/career-compiler-sprint2-5-20261111-090352/preserved`.
- Packaged executable: `src-tauri/target/debug/bundle/macos/CareerCompiler Acceptance.app/Contents/MacOS/career_compiler` inside Sprint 2.5 development.
- Identifier: `com.mirathfan.careercompiler.acceptance`; title: `CareerCompiler — SYNTHETIC NATIVE ACCEPTANCE`.
- Exact test database: `/private/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/careercompiler-native-ne_hvqx1/native.sqlite3`.
- Marker: `ISOLATED_ACCEPTANCE`, exact contents `synthetic-only\n`. The root is a direct child of the resolved system temporary directory. The database did not exist at preflight.
- Node `v22.23.4`; npm `10.9.9`; rustc `1.99.1 (58cf8f9c3 2026-10-13)`; cargo `1.99.1 (5f94df478 2026-08-27)`; only `stable-aarch64-apple-darwin` installed. Rustup home: `/Users/athfan/.local/share/rustup`.
- Inherited development HEAD `adb3c083f079fa06a1f431cbf15d0aa07dc1d3b9`, branch `codex/sprint1-workspace`. This is the earlier complete original-working-tree snapshot, not original HEAD `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`. No new commits were created.
- Exact Sprint 2 starting tree: `b43ded5c38b40c456b2f1b4f29108a35dd97f78b`, including all relevant untracked/ignored evidence. Development did not start from old HEAD.

The existing acceptance configurator generated the test configs. Only their test window dimensions and dev loopback port (5205) were adjusted. Product window configuration, Tauri capability settings, credentials and machine settings were not changed. The existing isolated runtime forces mocks, disables scheduler/discovery and excludes production HTTP/Keychain/browser handlers. Preflight and repository `PRAGMA database_list` independently agree on the exact database path for PIDs 15974, 17727 and 18155. All owned native/dev processes were stopped; retained prior preview servers were left alone.

## C. Phase 2F.4.2

Recovered `.codex-phase2f42-native-keyboard-prompt.txt` and read the Phase 2F.4, 2F.4.1, Jobs Feed 2F.1 and automation reports plus retained evidence. The latest Sprint 2.5 instructions govern isolation, full regression and continuing independent work when a prerequisite is missing.

The desktop was unlocked and usable. The native acceptance window was observable and responded to `app.pressKey`. AX `Raise` was used only to foreground the newly launched window. All product actions below used native key events (`Tab`, `Shift+Tab`, `Return`, `Space`, arrows, `Home`, `Escape`, printable letters and modifiers). No AXPress, pointer activation, paste, DOM/browser automation or jsdom event was substituted for these product actions. This is automated native keyboard delivery, not a claim that a human operated a physical keyboard.

Independent read-only CoreGraphics measurement identified PID 15974, exact title and window ID 10243: **width 720, height 800 points, on-screen true**, position 396/55. Restart measurement independently confirmed the same size for PID 17727. Existing native Tauri geometry also reports 720×800 points at 2× scale; screenshots are 1440×1600 pixels. Browser viewport emulation was not used.

| Recovered step | Actual observation |
|---|---|
| A. Open Application History | From Applications, Tab → Skip to content, Return → main, Tab → Import synthetic history; active Applications navigation and visible focus observed. |
| B. Open import | Return opened the modal and focused its heading. Tab traversed Cancel, fixture selector and Parse in order. |
| C. Synthetic fixture | Bundled `synthetic-history.json`, 20 rows, 16 valid/4 invalid; fingerprint `b75401dbe1015f5015e39f5ff9dd735fb8b7c58ead06d79bbec7b30147452bf6`. No arbitrary files or URL fetching. |
| D. Preview/matches | Initial 0 accepted/20 skipped and all-new matches inspected. After acceptance, preview showed 2 exact/4 possible/10 conflicts/4 new. Keyboard selection inspected receipt-new exact match and its existing identity, missing-req possible match, rejection conflict and its acknowledgment checkbox. No additional writes approved. |
| E. Ambiguous correction | Selected row 6, `missing-role`; expanded original source with empty role; opened correction fields and typed `Software Engineer` through native printable key events. Existing requisition `req-0`, source and date were retained. Visible input focus and accurate text captured. |
| F. Cancel | Escape dismissed the corrected draft and restored focus to Import synthetic history. All **40 table hashes**, complete application records and safety groups matched the baseline. No application, audit, batch, package, budget or browser authorization write. Later the explicit Cancel button also worked via Shift+Tab and Return. |
| G. Reopen | Return reopened the same selected row, fixture and volatile correction; final approval remained disabled until refreshed. This matches the existing contract: close retains this in-memory draft; parsing again resets choices, and restart discards volatile draft. |
| H. Explicit approval | Selected Accept new application; reviewed submission evidence and conflict acknowledgment, refreshed preview, inspected the single exact operation. Space checked final approval, Tab focused Apply, Return executed the transaction. Before Apply, all database contents were still unchanged. Result: 1 accepted, 0 reused; 19 skipped. |
| I. Inspect accepted application | Native keyboard opened the result link; tracker displayed Example Studio / Software Engineer / applied. Source identity inspection showed req-0, synthetic-greenhouse, example.invalid/0 and submission date 2026-10-01. Provenance and decision-audit disclosures were keyboard-accessible. SQLite confirms original empty role, corrected role and immutable source/audit. |
| J. Return navigation | Shift+Tab from provenance returned to Import. Reopening retained row selection. Cancel restored the Import trigger and preserved the linked-application URL/filter. No background control activation or keyboard trap occurred. |
| K. Restart | Stopped owned PID 15974, launched PID 17727 with the same verified isolation. Linked tracker, accepted evidence and provenance reappeared; all 40 table hashes and complete records matched before restart. Keyboard provenance inspection passed again. |

Focus details: correction fields and final confirmation scrolled into view; native screenshots show visible focus rings and wrapped content at 720 points. While Refresh disables its button, WebKit temporarily reports focus on HTML content; the next Tab continues directly to Exact proposed operations. Reverse traversal at the dialog boundary visits its container and web-content focus positions before the last link, without exposing background controls. These observations are recorded rather than presented as a custom focus-trap implementation.

The tool reported three UI interruptions during post-approval inspection. State was re-observed and the keyboard sequence resumed from known focus. An uncommanded normalized-values disclosure expansion was excluded from keyboard evidence; that inspection was repeated through supported keyboard paths. The correction/cancel/approval operations are separately captured, so no uninterrupted human session is claimed.

Only `applications` and `safety_records` changed on approval: one new application, one source entry, one audit and one batch. The original application and every pre-existing safety kind are unchanged. Candidate evidence, technical fit, eligibility, preferences, packages, résumé references, budgets and browser authorization remained unchanged. Company-only row 5 remained unresolved in the native preview and was skipped. Every snapshot passed `integrity_check=ok` and zero foreign-key violations. No new schema was introduced.

Additional Sprint 2 smoke check: native ⌘⇧. opened Career AI with the selected application identified, `Conversation: application` and `Model scope: Unavailable for this context`. Escape returned focus to the originating provenance summary. Opening/closing caused **zero table changes** and no provider calls. Full Copilot approval/undo, persistence and model-transport assertions ran in the frontend suite; the earlier Sprint 2 native accept/undo workflow is historical evidence, not relabeled as rerun here.

Evidence: [keyboard transcript](sprint2-5-evidence/native-keyboard-transcript.json), [native invariant verification](sprint2-5-evidence/native-verification.json), [independent bounds](sprint2-5-evidence/native-window-bounds.json), [restart bounds](sprint2-5-evidence/native-restart-bounds.json), plus baseline/cancel/pre-approval/accepted/restart/final/dev JSON snapshots in the same directory. Screenshots: [correction](sprint2-5-evidence/native-correction.png), [confirmation](sprint2-5-evidence/native-confirmation.png), [audit](sprint2-5-evidence/native-audit.png), [restart provenance](sprint2-5-evidence/native-restart-provenance.png), [AI context](sprint2-5-evidence/native-ai-panel.png).

**Decision: close Phase 2F.4.2 functional native keyboard acceptance.** Human hardware testing, actual VoiceOver speech, native paint timing and exhaustive every-record assistive-technology coverage remain NOT VERIFIED; they are not required to misrepresent this automated native result as human testing.

## D. PDF verification

**Runtime acceptance BLOCKED: XeLaTeX executable absent.** `command -v xelatex` found nothing. Searched existing `/Library/TeX`, `/usr/local/texlive`, `/usr/local/bin`, `/opt/homebrew`, user TinyTeX paths, local bin/toolchain paths and existing CareerCompiler isolated workspaces. No existing xelatex/xetex was found. Exact search roots and results are in [tool-discovery.json](sprint2-5-evidence/tool-discovery.json). No distribution was installed and no global environment was changed.

Inspected the actual pipeline: the tailoring export fits and validates content, serializes with `renderResumeLatex`, invokes native `render_resume_latex`, verifies readable output/page count with pdf-lib, requires exactly one page, then offers a save path and persists that version. Native code resolves fixed allowlisted engine paths/PATH, uses a unique temporary directory, `-no-shell-escape`, bounded source/output sizes, sanitized errors and cleanup after rendering. Missing engine returns `latex_engine_missing` before creating a render directory. Package approval separately validates readable, unencrypted one-page PDF bytes and SHA-256 provenance.

Existing Rust argument/runtime-detection/temp-directory tests and frontend LaTeX/provenance/version-lineage tests passed. They do **not** establish real rendering. No new PDF was generated; output readability, one-page visual appearance, rendered-version correspondence, actual compiler failure cleanup and no-overwrite export behavior remain unexecuted runtime checks. Existing résumé versions and attachments were unchanged in the native database snapshots. No mock PDF is represented as XeLaTeX output.

## E. Rust verification

- `PATH="$HOME/.cargo/bin:$PATH" cargo fmt --manifest-path src-tauri/Cargo.toml --check`: exit 1, `cargo-fmt` not installed for stable-aarch64-apple-darwin. **BLOCKED**, not a formatting failure result.
- `PATH="$HOME/.cargo/bin:$PATH" cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`: exit 1, `cargo-clippy` not installed. **BLOCKED**; no correctness/style warning assessment from Clippy is claimed.
- `PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml --locked --offline`: exit 0, **36 passed**, binary/doc targets also succeeded. No new Rust warnings in the log.
- `rustup show`, installed-component inspection and local executable scan found only cargo, rustc and rust-std in the installed toolchain; no alternative existing Rustfmt/Clippy binary. No update/component installation performed.

## F. Regression results and executed commands

Commands ran in the exact Sprint 2.5 development path above. Logs are under `docs/sprint2-5-evidence/` unless noted.

| Command/check | Actual result / evidence |
|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS, 284 packages; `../npm-install.log` |
| `npm run lint` | PASS; `lint.log` |
| `npm run typecheck` | PASS; `typecheck.log` |
| `npm run test:run` | PASS, **78 files / 674 tests**, 2 skipped, 77.84 seconds; `frontend-tests.log` |
| `npm run build` | PASS; `frontend-build.log` |
| Cargo fmt / Clippy / test commands in E | Two unavailable tools; 36 Rust tests passed; `rustfmt.log`, `clippy.log`, `rust-tests.log` |
| `python3 scripts/prepare-native-acceptance.py` | PASS, created only the new marked root; generated prelaunch copied to evidence |
| `npm run tauri:build -- --debug --config /private/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/careercompiler-native-ne_hvqx1/tauri.acceptance.json` | PASS, debug macOS acceptance bundle; `native-build.log` |
| Isolated packaged executable launch and restart | PASS, PIDs 15974 → 17727; `native-launch.log`, `native-restart.log` |
| `npm run tauri:dev -- --config /private/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/careercompiler-native-ne_hvqx1/tauri.acceptance.dev.json` | PASS, current PID 18155 repository verified; `tauri-dev.log`, `native-dev-startup.json` |
| `python3 scripts/snapshot-sprint25-native.py /private/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/careercompiler-native-ne_hvqx1` | PASS at baseline, cancel, pre-approval, accepted, restart, AI close and dev startup checkpoints |
| `swift scripts/measure-acceptance-window.swift 15974` and `… 17727` | PASS, independent CoreGraphics bounds exactly 720×800 |
| `python3 scripts/verify-sprint25-preservation.py` | PASS, original/Sprint 1/Sprint 2/recovery contents, modes, Git states and Sprint 2 archive verified |
| `python3 -m py_compile scripts/snapshot-sprint25-native.py scripts/verify-sprint25-preservation.py` and `python3 -m py_compile scripts/prepare-sprint25-reconciliation.py` | PASS; generated caches excluded from source deliverable |
| `python3 scripts/prepare-sprint25-reconciliation.py` | PASS, archive verification plus both apply-check/replay/content/executable-bit verifications; external `../reconciliation-verification.json` |

Native commands used `CC_ACCEPTANCE_ROOT=/private/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/careercompiler-native-ne_hvqx1 CC_ACCEPTANCE_UI=1 CC_ACCEPTANCE_JOBS_FEED=1 CARGO_NET_OFFLINE=true PATH="$HOME/.cargo/bin:$PATH"` for build/dev. Packaged launches supplied the same isolation flags directly to the executable; no production launch occurred.

The full frontend run includes Jobs, Applications, Profile, Home, Activity, navigation, Copilot action review/status/note/undo/conflict handling, conversation persistence, model transport bounds, résumé lineage/PDF provenance, Application History import/persistence and recovery. The two skipped tests are the pre-existing `historyRecovery.test.ts` cases requiring separately supplied retained-source/destination environment variables. Their earlier native recovery success is historical; they are not counted as passing this run. Existing Node experimental SQLite and Vite large-chunk warnings remain. Raw retained build/test logs also cause Git whitespace warnings (trailing reporter spaces/blank final lines); those logs are preserved unchanged. No tests, assertions or timeouts were weakened.

One initial packaged launch command guessed `career-compiler` as the executable and failed with file-not-found before starting a process or opening a database. It was corrected by reading `CFBundleExecutable` (`career_compiler`) from the built Info.plist. This was a launch-command correction, not a product defect. Native input interruptions are described in C. No failed product assertion is hidden in the pass counts.

## G. Changes made

No files under `src/` or `src-tauri/` changed in Sprint 2.5. No schema, product UI, provider, budget, credential, capability or dependency changes.

- Added this report and new synthetic evidence under `docs/sprint2-5-evidence/`.
- Appended closure references to `APPLICATION_HISTORY_PHASE_2F4_REPORT.md` and `APPLICATION_HISTORY_PHASE_2F41_REPORT.md`; historical text/evidence retained.
- Added `scripts/snapshot-sprint25-native.py`: guarded read-only all-table and safety-kind snapshots, full accepted-record evidence and integrity checks.
- Added `scripts/measure-acceptance-window.swift`: independent read-only CoreGraphics measurement filtered to the owned PID and exact acceptance title.
- Added `scripts/verify-sprint25-preservation.py`: checks original/Sprint 1/Sprint 2 and recovery content, modes, Git state and archived source without writing to those inputs.
- Added `scripts/prepare-sprint25-reconciliation.py`: complete manifest/archive, separate-index patch generation and disposable replay verification. Creates no commits and never applies to original or prior development copies.

Exact added/modified paths, hashes, modes and original tracked/untracked classification are in `../reconciliation-manifest.json`; the Sprint 2.5-only path list is `../sprint25-changed-files.txt`. Build output, node_modules, caches and synthetic databases are deliberately excluded from the source archive. The marked database remains separately available at the exact path in B.

## H. Data preservation

Before any change, verified all **1,147** Sprint 2 working-tree files against the manifest and complete archive, including modes and every Git-visible file. Archive SHA-256: `b95fec7edfe4219ec5fac9d8a7186afacceeafcb224de72f8ee121bfe2f41b75`. Both historical patch hashes matched their recorded values. No post-report source drift was found.

Copied those actual working-tree files into both new development and recovery directories, verified both byte-for-byte and mode-for-mode, then copied isolated Git metadata. Re-ran preservation checks after native acceptance: original **1,070**, Sprint 1 **1,110**, Sprint 2 **1,147** files, and their recovery copies all match, with unchanged Git statuses. See `../preservation-manifest.json`, `../preservation-verification.json`, `../sprint2-status.txt` and current [preservation evidence](sprint2-5-evidence/preservation-verification.json).

Production databases were neither opened nor modified by this task. Evidence for database isolation is the guarded temporary root, acceptance-only executable/configuration, current process preflight and repository-reported database path, not an inspection of real candidate records. No real records or credentials were copied into test fixtures. All prior recovery directories and backup sources remain intact. No cleanup/reset/discard/commit/push/integration was run against any repository.

## I. Integration readiness

Deliverables reside beside development, under `/Users/athfan/Desktop/career-compiler-sprint2-5-20261111-090352/`:

- `reconciliation-manifest.json`: complete source membership, SHA-256, byte size, POSIX mode, original provenance and incremental/cumulative change classification.
- `complete-source.tar.gz`: all manifest members, including original relevant untracked files, Sprint 1/2 additions and Sprint 2.5 reports/evidence/scripts. Every member content and mode verified.
- `sprint2-5.patch`: incremental change from the verified complete Sprint 2 tree.
- `sprint1-through-sprint2-5.patch`: cumulative change from the complete preserved original working tree, including untracked additions.
- `reconciliation-verification.json`: exact final file counts, archive/patch SHA-256 values, isolated replay paths, content/executable-bit checks and per-file mode differences.
- `sprint25-changed-files.txt`: exact incremental path list.

The final source contains **1,188 files**, with **43 Sprint 2.5 changed/added paths** and **135 cumulative changed/added paths**. Both patches pass `git apply --check` and actual application **only in newly created disposable copies**, then every manifest file is rehashed. This is stronger than apply-check alone. Original relevant untracked/ignored files are included (828 inherited files). Original files and Git status have not changed, so no content conflicts against the inspected original baseline were found.

Git patches preserve executable bits but not all POSIX permission bits. Rewritten files originally mode 0600 can become 0644 in a patch replay. The incremental patch has 2 such mode differences and the cumulative patch has 16; the verification lists every path. No executable-bit mismatch occurred. The archive/manifest remain the authoritative recovery representation. Do not blindly extract over original, normalize permissions, or assume a Git patch alone is a complete filesystem recovery. No permission change was made to the original or earlier workspaces.

Safe future integration procedure — **documented only, not executed**:

1. Complete the prerequisite checks in J, then obtain explicit authorization for integration. Re-run preservation and compare current original hashes/status against this recorded baseline immediately before preparing an integration candidate.
2. Make a new verifiable recovery snapshot of the original's actual working tree and Git history, including untracked additions. Preserve any new work; stop automatic reconciliation if a path differs.
3. Create another isolated integration candidate from that current original working tree. Use the cumulative patch (not the old Sprint 1-only patch) or reviewed manifest-directed copies. Never start from original old HEAD, which omits substantial existing work.
4. Check/apply the cumulative patch only to the candidate, then compare all required source files, hashes and executable bits. Inspect the recorded 0600/0644 differences and preserve existing modes for existing files. Review permissions for added files before any future adoption; do not silently broaden them.
5. If original has advanced, perform a path-by-path three-way reconciliation using preserved original, current original and final source archive. Resolve conflicts in the candidate without discarding either side. Review inherited untracked files and generated evidence explicitly.
6. Run lint/types/frontend/Rust/build, the available formatting/Clippy/PDF checks, and isolated synthetic startup against the candidate. Do not launch candidate verification on production data or run migrations there.
7. Present the exact reviewed delta and rollback artifacts before any authorized adoption into original. Keep Git history and all existing original untracked work; do not commit, push, deploy or apply changes without that later authorization.

## J. Remaining blockers

1. **XeLaTeX**: supply an authorized working local MacTeX/TinyTeX-compatible XeLaTeX runtime with required fonts/packages, then run actual synthetic native render/export, readable one-page/version/no-overwrite checks and compiler-failure cleanup QA. Current environment has no engine.
2. **Rustfmt**: supply a compatible existing/local `rustfmt` component and run the exact check in E.
3. **Clippy**: supply a compatible existing/local Clippy component and run all-target/all-feature warnings-as-errors check. Classify any findings before a narrow fix.

Separately unverified: human hardware keyboard operation, VoiceOver speech, native paint latency, signed release packaging, live provider behavior and real external submissions. No new failure or permission expansion is inferred from these unexecuted checks. The prior Phase 2F.4.2 functional native keyboard blocker is closed by this run.

## K. Recommended next action

The cumulative source is ready for integration review and has a verified recovery/reconciliation package. **Finish the three local prerequisite checks before final integration approval.** No further Copilot feature work or broader model data access is recommended until actual PDF runtime, Rustfmt and Clippy acceptance is recorded. A user-authorized local tool setup can resolve those environment blockers; this sprint did not install tools.

## L. Final status

**PARTIAL**: native Application History acceptance, current regression, isolated startup and preservation/reconciliation pass. Actual XeLaTeX rendering, Rustfmt and Clippy remain blocked by missing installed tools. No product defects requiring code changes were demonstrated, and no integration into original was performed.
