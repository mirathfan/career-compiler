# CareerCompiler — Development Sprint 1

Date: November 11, 2026. **Final status: PARTIAL.** The shell and connected Home slice are implemented and tested. Native launch and packaging are now working, but Phase 2F.4.2 is not fully closed. No changes have been applied to the original repository.

## A. Work completed

- Preserved the current working tree before product edits. The observed baseline matched the historical counts: branch `ui-ux-overhaul`, HEAD `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`, 62 modified tracked files, 718 untracked files, no staged changes.
- Verified 1,070 preserved files by SHA-256, including all existing Git-visible files and additional relevant ignored documentation/evidence. Saved the original status, binary diff, verified Git history bundle, manifest, and an independent development baseline commit.
- Restored npm executable shims with `npm ci --ignore-scripts --no-audit --no-fund`, using the unchanged lockfile. Current Rust dependencies were sufficient for an offline build. No global toolchain or system dependency was installed.
- Built current native source, launched isolated Tauri dev and a fresh packaged debug application, exercised native history cancellation and approval, restarted the package, and verified database identity and integrity.
- Refined the existing shell, improved the existing DashboardPage, added a bounded read-only Activity display over existing records, and fixed exact application deep links and an intermediate-width résumé form overflow.

## B. Screens and UX

Primary navigation is Home → Jobs → Applications → Résumés → Profile. Activity, Career Copilot, and Settings are persistent secondary destinations. More tools and the existing ⌘K navigator retain advanced workflows. Home retains `/dashboard`; new workspaces start there, while valid existing route preferences, queries, and anchors survive. Browser Back and navigator return-focus behavior have regression coverage.

The sidebar automatically compacts below 981px and can be compacted manually at wider sizes. Semantic teal, surface, text, focus, spacing, radius, and typography tokens extend the existing stylesheet. This is a light-theme increment; dark mode is not claimed.

Home shows actual draft applications, explicit due follow-ups, saved jobs, and unarchived draft resumes. Prioritization is deterministic: explicit due dates first (oldest first), application drafts, resume drafts, then evidence review; stable IDs resolve ties. Missing/invalid follow-up dates and application age do not create urgency. Closed applications are excluded from follow-ups. Saved jobs use the same saved/preparation status set as the existing Jobs view.

Next-action links open exact application or resume IDs. Saved-job cards open the existing job workspace. A due-follow-up summary opens the actual due queue across application status tabs. Historical submitted resume IDs are never changed by these reads or links. Fit and eligibility are not inferred on Home.

Activity displays existing dated application status events, resume-version creation, and reviewed career-import/undo records. Application/resume entries link to their actual IDs. Import entries have no invented entity link. The feed renders 40 rows at a time. It omits undated events and links to existing screens for other history sources. It is not a replacement event store or a complete unified audit feed.

Career AI launches the current Career Copilot and its existing conversations. A docked assistant panel is deferred to protect context and persistence behavior.

Actual captures:

- [Home, 1440px browser preview](sprint1-evidence/home-1440-browser.jpg)
- [Home, 1024px browser preview](sprint1-evidence/home-1024-browser.jpg)
- [Home, 720px browser preview](sprint1-evidence/home-720-browser.jpg)
- [Résumés, 1024px browser preview](sprint1-evidence/resumes-1024-browser.jpg)
- [Home, native synthetic package](sprint1-evidence/home-native.png)
- [Application history, native synthetic package](sprint1-evidence/application-native.png)

Browser preview data is fictional, built through the existing MemoryRepository and fit fixtures. Native captures are from the isolated SQLite-backed package. Neither is real user data.

## C. Changed files

| Path | Change |
| --- | --- |
| `src/App.tsx` | Primary Home, ordered navigation, Activity route, compact sidebar control; existing lazy routes retained |
| `src/lib/desktop/navigation.ts` | Home/Activity destinations; safe restoration of valid historical routes and context |
| `src/index.css` | Semantic tokens, compact chrome and Home layouts |
| `src/features/dashboard/DashboardPage.tsx` | Existing dashboard refactored into connected Home; guided intake, setup links and explicit sample seed retained |
| `src/lib/dashboard/workspace.ts` | Read-only repository projection, explicit-date rules, deterministic actions, entity URLs and recorded activity |
| `src/features/activity/ActivityList.tsx`, `ActivityPage.tsx` | Shared activity rendering and read-only Activity destination |
| `src/features/applications/ApplicationsPage.tsx` | Exact `applicationId` and legacy `historyApplication` selection; due follow-up queue; honest missing-record state |
| `src/features/resume-library/ResumeLibraryPage.tsx` | Recommendation/review forms use two columns at intermediate widths and four only at spacious widths |
| `src/App.test.tsx` | 18 route cases, startup preferences, Back, ordering, compact state, navigator return focus |
| `src/lib/dashboard/workspace.test.ts` | Counts, missing dates, deterministic order, archives, exact IDs, no mutation, activity provenance and errors |
| `src/features/applications/ApplicationsPage.test.tsx` | Exact/legacy links, missing IDs, due follow-ups, no navigation writes |
| `src/features/dashboard/DashboardPage.test.tsx` | Existing setup tests updated; real counts/links and submitted identity coverage |
| `src/features/tailoring/TailorResumePage.test.tsx` | Intentional Résumés navigation label updated; full mock tailoring workflow preserved |
| `scripts/sprint1-preview.html`, `scripts/sprint1-preview.tsx` | Development-only fictional preview, in-memory repository, isolated runtime |
| `scripts/verify-sprint1-preservation.py` | Read-only snapshot/original/hash/status/history verification |
| `docs/SPRINT_1_REPORT.md`, `docs/sprint1-evidence/` | This report and actual validation evidence |

No package dependency, production Tauri permission/configuration, credential handler, migration, repository implementation, or AI provider changed.

## D. Reused functionality

HashRouter and lazy routes; WorkspaceNavigator and its dialog contract; PageHeader, PageSection, Badge and shared styles; React Query and RepositoryContext; existing repository metrics, applications, jobs, resume archives/versions and career imports; existing Profile, Jobs, Application History, Resume Library, tailoring and Copilot screens; existing native isolation and synthetic fixtures.

Existing validation, citations, stale-state checks, approval transactions, undo, resume lineage, provenance, budget gates and remote-data restrictions remain in place. No second AI orchestrator or conversation store was added.

## E. Test results

All commands ran in the isolated development directory, with normal npm shims restored. No direct-executable workaround was needed.

| Command / check | Final result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS; 284 packages installed from unchanged lockfile |
| Pre-change `npm run test:run` | 74 files passed; 632 tests passed, 2 skipped — newly executed baseline |
| Final `npm run test:run` | **77 files passed; 666 tests passed, 2 skipped** (48.41s) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; no reported warnings |
| `git diff --check` | PASS |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline` | **36 passed**; binary/doc-test targets have zero tests |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | BLOCKED: `cargo-fmt` component missing |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --offline -- -D warnings` | BLOCKED: `cargo-clippy` component missing |
| Isolated `npm run tauri:dev -- --config "$NATIVE_ROOT/tauri.acceptance.dev.json"` | PASS; current-source native launch, SQL path reported by SQLite |
| Isolated `npm run tauri:build -- --debug --config "$NATIVE_ROOT/tauri.acceptance.json"` | PASS; includes `npm run build` (TypeScript + Vite) and fresh debug `.app` bundle |
| Native packaged launch and restart | PASS; explicit acceptance environment, persisted history/provenance digest unchanged |
| Browser layout matrix | Home, Jobs, Applications, Résumés, Profile, Activity, Copilot at 720×800, 1024×800, 1440×800: no document horizontal overflow after fix |
| Navigator at 720×800 | Dialog bounds 576×574.59 at x72/y112.70; Escape returned focus to launcher |
| Preservation verification | 1,070 original + 1,070 preserved hashes match; original Git status unchanged; history bundle verifies |

The full suite includes existing job/import, profile persistence, application history/recovery, resume lineage and Copilot approval regressions. The two retained-native tests remain skipped; fresh native evidence is reported separately, not used to relabel skipped tests.

Warnings: Node's experimental SQLite API notice; Vite reports a main chunk above 500 kB (approximately 518 kB). No warning was suppressed. Early failures were resolved: new jsdom tests needed the existing dialog shim, accessible link labels needed updated assertions, new test code used an unsupported Testing Library option, and layout measurement exposed the résumé form overflow. Final logs show the passing results.

Logs and measurements: [evidence directory](sprint1-evidence/), including initial/final layout matrices and cancellation/restart/integrity JSON. Evidence log copies have trailing whitespace normalized for the patch; original command logs remain in the preservation root.

## F. Data safety and reconciliation

Original repository: `/Users/athfan/Desktop/career-compiler` — unchanged, still on its original branch and HEAD.

Preservation root: `/Users/athfan/Desktop/career-compiler-sprint1-20261111-074953`.

- `preserved/`: immutable baseline copy (verified after work).
- `manifest.json`, `verification.json`, `original-status.txt`, `original-diff.patch`, `history.bundle`: recovery and verification artifacts.
- `development/`: all sprint modifications; local branch `codex/sprint1-workspace` based on the full captured working tree.
- `sprint1.patch`: reviewable binary-capable diff against that full working-tree baseline, including new files.

Excluded from the source/test copy: dependencies, generated build output, runtime/tmp and backup directories, live SQLite files/sidecars and credential/certificate files. All Git-visible source/tests/fixtures/docs were verified included. Original excluded material was left untouched. Original Git history is preserved in the verified bundle; the development baseline has no remote configured.

Synthetic SQLite path:

`/private/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/careercompiler-native-9d_3xrbm/native.sqlite3`

The existing harness checks the marked temporary root and acceptance identifier, verifies `PRAGMA database_list` before initialization, omits the production SQL plugin and registers only acceptance commands. The native environment disables live boards, provider/keychain commands and extension IPC. Production permissions and production database files were not opened or changed by this task. Only synthetic records were modified during acceptance. No paid requests, live job requests, external submissions, pushes or deployments occurred.

Native cancellation compared every table row before/after with no differences. Accepted history survived restart with digest `2b73060ce2b92ecd7ff0aac7e932b865847c4c193eac5de16a9084c02587345c`. Tracker/provenance remained unchanged after viewing Home. SQLite integrity is `ok`, foreign-key errors are empty, and synthetic migration history is unchanged. Product migration files are unchanged.

Verify before any future reconciliation:

```bash
cd /Users/athfan/Desktop/career-compiler-sprint1-20261111-074953/development
python3 scripts/verify-sprint1-preservation.py

git -C /Users/athfan/Desktop/career-compiler apply --check \
  /Users/athfan/Desktop/career-compiler-sprint1-20261111-074953/sprint1.patch
```

The patch passed `git apply --check` against the untouched original tree. It has not been applied. If the original changes later, stop and compare those changes before applying anything. Do not copy the development tree wholesale over the original.

Reproduce the safe browser preview (no SQLite; fixtures reset on reload):

```bash
npm run dev -- --host 127.0.0.1 --port 5201
# Open http://127.0.0.1:5201/scripts/sprint1-preview.html#/dashboard
```

Reproduce native startup with a **new** marked synthetic root and the existing fail-closed harness:

```bash
NATIVE_ROOT="$(python3 scripts/prepare-native-acceptance.py)"
CC_ACCEPTANCE_ROOT="$NATIVE_ROOT" CC_ACCEPTANCE_UI=1 CC_ACCEPTANCE_JOBS_FEED=1 \
  CARGO_NET_OFFLINE=true npm run tauri:dev -- --config "$NATIVE_ROOT/tauri.acceptance.dev.json"
```

The helper defaults to 1280×820. The sprint changed only the generated temporary acceptance window dimensions to 720×800 before its native runs. Do not use a production-identifier launch for these tests. The browser preview remains available on port 5199 for this review session; the native test process is stopped after verification.

## G. Native acceptance

**Phase 2F.4.2: PARTIAL, not complete.** Desktop access worked. A fresh debug package used the existing acceptance configuration with width 720/height 800; captured native PNGs are 1440×1600 pixels. Independent native window bounds in points were not available through the used tooling, so configuration plus screenshot pixels are not represented as independent 720×800-point verification.

Actually exercised in the native window:

1. Opened the history dialog, traversed with Tab, cancelled with Escape and observed focus return to the import trigger.
2. Parsed the bundled 20-record synthetic JSON: 16 valid / 4 invalid.
3. Inspected an unresolved company-only record; entered a temporary role correction through native keyboard input; saw stale-preview invalidation; cancelled without writes.
4. Reopened and confirmed reset choices. Reviewed a safe receipt record, selected a new-application operation, refreshed the exact proposal, and used Space/Tab/Enter for final approval.
5. Observed one accepted record and its provenance; opened the linked tracker record.
6. Restarted the freshly built package and verified identical tracker/history data; the new shell preserved the legacy deep link and displayed only that exact application.
7. Opened the new native Home screen and observed the actual historical status event.

Some dropdown choices used pointer input. An accepted ambiguous correction, complete keyboard-only traversal of all conflict cases, and independent point-bound measurement remain unverified. Exception/recovery unit tests passed, but no new process-death recovery test was conducted. VoiceOver and physical human keyboard acceptance are not claimed. The native acceptance binary was not the old retained executable.

## H. Known limitations

- Phase 2F.4.2 remains partial for the reasons above.
- XeLaTeX is unavailable; one-page PDF rendering/export was not tested. No alternate renderer or system installation was introduced.
- Rustfmt and Clippy are missing from the current toolchain. Release-mode/notarized distribution was not built; the tested package is a fresh debug acceptance bundle.
- Browser sizing is responsive evidence, not native point-bound acceptance. The 21-route matrix uses synthetic records; exhaustive populated states, long-content cases and every existing dialog were not visually inspected.
- Activity covers only the listed record types. It reads existing repository lists and limits rendered rows; database-level pagination and consolidated job/Copilot audit events are future work.
- Home date-based prioritization refreshes on page/query refresh; a midnight rollover timer is not implemented.
- Docked contextual Copilot, live AI integration, installed Chrome extension integration, and full dark mode are not part of this increment.
- The original workspace still needs a deliberate reconciliation step; this sprint has not silently replaced it.

## I. Next recommended sprint

First close the remaining native keyboard/point-bound and PDF acceptance gaps. Then add a small optional Copilot dock using the existing CareerCopilotPage, persisted threads, citations and review contract. Start with local record context and explicit context selection; do not expand remote data permissions. A later bounded model-backed read-tool increment can follow once those context and consent boundaries have focused tests.

## J. Final status

**PARTIAL — functional UX slice delivered, original work preserved, regression suite passing, and native builds/startup restored.** Full native keyboard acceptance and PDF/toolchain checks remain open. The sprint is ready for review in the isolated development copy, not yet a fully accepted production milestone.
