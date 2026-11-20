# Jobs feed — Phase 2F.1

Date: 2026-10-15 (America/Chicago). Branch `ui-ux-overhaul`, HEAD `7ba0dee`.
All existing dirty/untracked work and relay artifacts are retained. No commits, push or deployment.

## Decision and scope

**Phase 2F.1 functional native acceptance is COMPLETE after the Phase 2F.1.1 navigation correction. Actual VoiceOver announcements and reliable native interaction timing remain NOT VERIFIED; see the final section.**
GO for continued synthetic acceptance after unlock. NO-GO for real autofill, live discovery or paid
model requests under this phase. No production SQLite, candidate records, tracker import, live ATS,
credentials, account/model settings, browser installation/registration, notifications or submissions
were accessed/performed. The real-history counts supplied in the prompt were not imported or
represented as a complete lifetime count.

## Inventory and reuse

| Existing implementation | State before this increment | Reuse / boundary retained |
|---|---|---|
| JobsPage / JobWorkspace / root navigation | Jobs was already the landing experience; split feed, tabs, search, source panel and embedded preparation existed | Extended these screens; preserved onboarding and navigation |
| Greenhouse / Lever / Ashby adapters, normalize, runner | Normalized full descriptions, source metadata, salary, deduplication, explicit manual discovery and local scoring | No second discovery implementation, no live transport executed |
| `scoreJob`, existing workspace helpers | Local weighted ranking existed; UI lacked separate requirement-level eligibility | Retained ranking as local fit, separate from eligibility |
| Evidence packet / freshness services | Privacy/inheritance rules, bounded remote packets, completed AI invalidation already implemented | Shared packet builder; full local-only evidence evaluation preserves remote 12-item/40-fact/30-skill limits |
| AI matching persistence / budget / approval dialog | Durable audits/reservations, explicit approval, stale checks and repair limits existed | Preserved; no model is called to display the feed or job details |
| Tailor Resume / XeLaTeX | Explicit generation, grounding, source validation, one-page checks and exports existed | Existing lazy Resume tab remains; no fake PDF or auto generation queue |
| Packages / tracker / browser authorization | Transactional approval/revocation, PDF SHA-256, candidate/job/revision binding and single-use tokens existed | Kept existing service boundaries; no direct approval bypass |
| Source configuration and UI library | Source editor, semantic roving tabs, shared controls, responsive styles existed | Existing source editor and components retained; source counts remain actual local counts |

The missing layer was a deterministic, cited assessment connecting actual local evidence, complete
saved JD, eligibility uncertainty and conservative application history to the Jobs UI. A separate
eligibility review flow was also needed because generic boolean legal answers cannot safely be
assumed to apply to a particular jurisdiction.

## Implemented functionality

- Recommended / Needs Confirmation / Applied / Saved / Excluded views, plus existing All Jobs and
  Companies. Recommended excludes explicit disqualifiers, unavailable/skipped records, confirmed
  applications and possible history matches awaiting review. Excluded records are retained.
- Requirement-level explanations and exact normalized JD excerpts; separate supported, unresolved,
  disqualifying and preferred/trainable groups. Source IDs link to an actual local evidence inspector
  which receives keyboard focus; no manufactured citations.
- Company/title, arrangement/location, explicit compensation, declared source, posting date, fit,
  eligibility, skills and local application state in the feed/detail. Missing currency is labelled
  unknown rather than assumed USD. Full JD remains readable in the detail workspace.
- Explicit local eligibility review: unknown defaults, optional degree/date/enrollment/location
  assertions, jurisdiction-scoped authorization and separately reviewed future sponsorship. User
  confirmation is required. Save uses a transaction, stale-review comparison and existing claim
  lock protections. It does not edit account/model settings or the application answer vault.
- Same-source conflicting requisitions remain POSSIBLE_MATCH even if a URL or internal row ID is
  reused. Malformed/blank URLs cannot produce exact matches. Strong cross-source canonical posting
  identity can reconcile a syndicated repost. Exact repost actions open the original tracked
  application rather than creating a second tracker.
- Existing AI analysis remains explicitly available; UI never starts it automatically. Existing
  resume/package flows remain reachable and keep their approval, source and PDF-byte checks.
- Narrow layout source support and a 720×600 native minimum window, visible focus, text-plus-color
  statuses, reduced motion/transparency and high-contrast overrides. No new dependencies.

## Typed eligibility and fit contract

`FitAssessment` (`cc-job-fit-v1`) records source=`deterministic`, eligibility, optional local score,
requirement reasons/codes, citations, timestamp, semantic job fingerprint, SHA-256 candidate evidence
fingerprint and freshness at the authoritative snapshot. Eligibility is one of:

- **ELIGIBLE:** all interpreted mandatory conditions are supported; optional/trainable gaps remain distinct.
- **NEEDS_CONFIRMATION:** missing evidence, legal scope, unsupported/compound wording or uncertain history.
- **DISQUALIFIED:** a supported explicit incompatibility or locally recorded unavailable posting.

A high ranking cannot override a disqualifier. Missing skills are evidence gaps rather than invented
legal/hard disqualifiers. No score is shown when the posting/evidence cannot support a meaningful
comparison. Scores are weighted local comparisons, never probabilities of interview or offer success.

Dimensions cover role evidence, numeric professional experience, education/degree/field and graduation
windows, student status, location/remote-region/start availability, current authorization, future
sponsorship and required/preferred/trainable skills. Professional years use non-overlapping dated
employment; projects do not become professional employment. Internships count only with explicit
supported equivalence wording. Explicit project alternatives require manual review rather than an
invented numeric conversion. Missing/unreviewed employment evidence cannot prove insufficient history.
Mixed mandatory/preferred or conditional degree/experience clauses require review.

Legal assertions require one schema-valid `job_fit_eligibility` claim, locked and verified or user
confirmed. No legal inference is made from city, nationality, school, degree or profile contact fields.
Current authorization requires an explicit matching jurisdiction; permanent/unrestricted requirements
and future sponsorship are evaluated separately. These are reviewed user assertions, not legal verification.

## Evidence, freshness and persistence

`loadFitFeed` reads a consistent repository transaction and stores a separate `job_fit` safety record.
It recomputes/validates job/evidence/context fingerprints before reuse and refreshes day-sensitive
experience/posting-age conclusions. Full local evidence is evaluated beyond remote prompt caps;
citations still use the same eligibility/privacy inheritance rules. Full persisted fact/parent
provenance and reviewed declarations participate in the local cache key. Cosmetic item order and UI
settings are not career qualifications. No AI audit/history, budget or package revision is overwritten.

Relevant job/evidence edits invalidate the deterministic cache on its next authoritative read; standard
UI mutations invalidate queries. Existing Phase 2D.1 AI/package invalidation remains authoritative.
There is no new background polling. Another process's already-rendered pixels may remain a prior
snapshot until focus/query refresh; cached fit is not an application approval authority. Future changes
to assessment semantics must bump the assessment/cache version.

## Application reconciliation

Exact local job identity, valid canonical posting URL, or matching company/role/source/requisition
can identify an application. Conflicting same-source requisitions defeat exact inference. A company
name alone does not establish a match. Same company and role without strong posting identity is
POSSIBLE_MATCH, displayed as uncertain and retained for review. Applied requires an exact match and
actual submitted/applied/interview/offer/rejected/withdrawn status or recorded submission date. No
rejection is inferred from silence; no offer is inferred from recruiter messages. The fixture contains
one explicitly synthetic submitted-history record, not an external submission.

## Synthetic acceptance coverage

Twenty synthetic postings plus controlled edits/history variants cover the requested scenarios:

| Scenario | Result / evidence |
|---|---|
| New graduate / AI engineering / relevant reviewed projects | PASS: eligible fixtures 0, 1 and project-support reasons |
| Projects without required professional years / senior 7+ years | PASS: fixtures 3, 4 excluded despite strong skills |
| Graduation-window mismatch | PASS: fixture 5 disqualified |
| Ambiguous sponsorship / incompatible unrestricted authorization | PASS: fixtures 6 needs confirmation, 7 disqualified |
| Unavailable hybrid location / restricted remote region | PASS: fixtures 8, 9 disqualified |
| Missing compensation / required skill evidence / trainable gap | PASS: fixtures 10, 11, 12; no fabricated pay or hard legal skill rejection |
| Missing candidate evidence | PASS: controlled removal gives unknown fit and confirmation, not fabricated precision |
| Exact prior requisition / same employer different role / repost | PASS: fixture 13 exact, 14 unrelated, 15 canonical cross-source identity; conflicting/uncertain variants separately tested |
| Closed / stale / malformed posting | PASS: fixtures 16, 17, 18 respectively excluded, confirmation and unknown fit |
| Start-date mismatch | PASS: fixture 19 |
| Formatting-only JD / meaningful requirement change / evidence change | PASS: fingerprint/reassessment tests, no AI reservations |
| More employment items than remote prompt cap | PASS: all 14 cited employment items evaluated, omitted evidence cannot silently undercount years |
| SQLite restart / local cache / review saves / stale review rejection | PASS: SQL fixture and React integration tests |
| Actual packaged native data initialization | PASS: verified temporary SQLite, 20 fixtures, six recommended, zero AI reservations |
| Native safety harness / full process restart | PASS: final packaged 16 scenarios plus 2 full-process restart checks |
| Actual native desktop visual inspection / keyboard interaction | PASS after unlock; actual screenshots and AX evidence below |
| Native narrow-window resizing | NOT VERIFIED: CUA edge drags did not resize the window |
| Component interaction and server rendering | PASS; explicitly not native GUI acceptance |
| Genuine Chrome / real FileList attachment | NOT VERIFIED and out of scope |
| Live model / ATS / real submissions | NOT VERIFIED and prohibited |

## Measured performance

Single observed run, Apple M4, macOS arm64; Vitest/jsdom with MemoryRepository. Dataset: 500
synthetic postings made from 20 full supplied mock-description templates with distinct posting IDs.
Dataset preparation excluded. Timings include fingerprint validation and caching. They are not
production-data or native paint benchmarks; no improvement over a baseline is claimed.

| Operation | Observed ms |
|---|---:|
| Assessment + feed initialization | 294.10 |
| Filtering and sorting | 0.438 |
| Selected-job lookup | 0.045 |
| Detail React server rendering | 8.12 |
| Cached validation | 223.58 |
| Reassessment after evidence edit | 302.74 |

The first native 20-posting seed/assessment marker measured **95 ms** before App rendering. That is
SQLite/service initialization, not UI first paint. Native selection/render/resize timings remain
BLOCKED. The saved `performance.json` and native marker contain raw observed values/methodology.
Runtime: Node v24.12.0, Vitest v4.1.10.

## Design review

Applied local apple-design, emil-design-eng, react-best-practices and web-design-guidelines guidance.
The latter's external refresh was deliberately not fetched under the local-only constraint.

| Before | After | Why |
|---|---|---|
| Blended fit and broad prose | Separate eligibility, deterministic rank, requirements and evidence | Makes uncertainty and disqualifiers explicit |
| Fit reasons without direct fact inspection | Focusable cited-evidence inspector and timestamp/fingerprints | Supports auditability and keyboard access |
| 1120px native minimum | 720px minimum plus wrapping/layout adaptations | Enables narrow-window layouts; actual visual check is blocked |
| Implicit USD fallback | Explicit unknown currency label | Avoids inventing compensation metadata |

## Files changed

New: `src/lib/jobs/fitAssessment.ts`, `fitFeed.ts`, `fitFixtures.ts`, `eligibilityReview.ts`,
`fitAssessment.test.ts`, `fitPersistence.test.ts`, `fitPerformance.test.tsx`;
`src/features/jobs/FitExplanation.tsx`, `EligibilityReview.tsx`.

Extended existing JobsPage, JobWorkspace, SampleWorkspacePage, sampleWorkspace, workspace helper
and their regression tests; scoped Jobs CSS; native window minimum; `main.tsx`, acceptance environment
and artifact allowlist for the explicit isolated Jobs fixture mode. Shared evidence packet builder
and fingerprint snapshot helper were adapted without changing existing remote caps or authorization.
Historical acceptance reports were not rewritten.

## Verification and isolation

Final verification: **368 frontend tests / 50 files, 35 Rust tests, 12 Python tests PASS**.
Lint, typecheck, Rust formatting, warnings-denied Clippy, extension build, acceptance/production
builds and isolated dev startup PASS. Final packaged safety harness **16 PASS**, full process
restart **2 PASS**. Logs/results are in `docs/jobs-feed-evidence/phase2f1/`. Existing Vite chunk-size warning
remains; it is not suppressed. Production bundle is built but never launched.

Native Jobs root:
`/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-kbz3c8za/native.sqlite3`.
The direct temporary root marker, acceptance identifier and actual `PRAGMA database_list` were
verified before fixture use. Explicit `CC_ACCEPTANCE_UI=1 CC_ACCEPTANCE_JOBS_FEED=1` seeds only a
fresh verified isolated repository; existing non-fixture records cause refusal, not overwrite.
The normal production identifier refuses this acceptance environment. No normal SQLite plugin,
Keychain/provider, discovery, notification or browser installation capability is added to acceptance.

Final safety harness root: `careercompiler-native-py1lcn9_/native.sqlite3` under the same temporary parent.
No production path was opened to establish isolation. Source branch/HEAD and original paths are
checked again at completion. Owned test processes are stopped; existing unrelated browser/server
processes are not targeted.

## Known limitations and next increment

- This is a bounded deterministic interpreter, not a general natural-language/legal verifier. Numeric
  experience, ISO graduation windows, supported degree/technology terms and explicit jurisdiction
  assertions have tests. Unrecognized requirements, natural-language dates, mixed clauses and legal
  ambiguity need confirmation; parser coverage should expand with reviewed fixtures.
- Degree/legal eligibility can be based on explicit reviewed declarations. No credential authenticity
  or immigration-status verification is claimed. Eligibility review does not silently populate the
  separately supervised application-answer vault.
- No live availability, remote-country permission, salary currency or lifetime application history is
  invented. Exact string matching can leave geographic aliases/rebrands/history uncertain. New source
  identities with ambiguous postings remain review work rather than automatic application state.
- Local fit snapshots refresh through authoritative reads/query invalidation, not a daemon. They do
  not replace approval, resume grounding, exported-byte verification or single-use browser tokens.
- Performance is one synthetic observation on modest template descriptions; large, diverse production
  data and native paint/interaction performance are not verified. No virtualization speedup claimed.
- Native visual, screen-reader and narrow-window acceptance remains BLOCKED by the screen lock.
  There are no new native screenshots. Existing component tests are not presented as native screenshots.
- No new supported source platforms, account integrations, authentication or automation queues were added.

**Next recommended increment:** unlock the Mac and execute native Jobs interactions and resizing with
these same isolated fixtures, including manual evidence/history review and explicit resume preparation.
Then extend parser fixtures based on confirmed ambiguous wording. Chrome installation, live discovery,
paid models and real application actions remain separately unauthorized.

## Terminal partial acceptance checkpoint

Implementation and independent verification are complete; unlock-dependent UI acceptance is not.
Final Jobs packaged PID 37293 and safety PID 37302/restart 37573 used the explicit temporary
paths above. Isolated dev PID 38032 reached `repository_verified` against the same Jobs database.
All owned native processes were stopped; the dev watcher/server was stopped separately. Prior
synthetic roots/artifacts are retained. No original modified/untracked paths are missing, and
branch/HEAD and whitespace checks passed. No commit, push or external message was sent.

After unlock, launch only the existing marked acceptance root/bundle with
`CC_ACCEPTANCE_ROOT=<Jobs root> CC_ACCEPTANCE_UI=1 CC_ACCEPTANCE_JOBS_FEED=1`.
Verify actual desktop and 720px-width layout, keyboard tabs/back navigation, evidence inspector
focus/readability, Needs Confirmation/Excluded/Applied/Saved filters, review save/cancel and stale
review recovery, exact-versus-possible application drilldown, and explicit resume preparation
without executing paid generation or real browser autofill. Capture only synthetic screenshots
and update this report's BLOCKED rows from actual observations. Do not repeat implementation,
install browser infrastructure, or open production data to complete those steps.

The compact legacy three-job preview still uses explicitly mocked job-analysis fixtures; the new
20-posting native feed and all fit assessment run deterministically without a provider request.
No native GUI screenshots or native paint/interaction timings are claimed.


## Unlocked native UI continuation — 2026-10-15

This section supersedes the earlier lock-dependent checkpoint for the checks actually executed.
Only the acceptance bundle (`com.mirathfan.careercompiler.acceptance`) ran, against the same
marked temporary Jobs root. Processes 71105 and 71439 each reported the exact `native.sqlite3`
path through native preflight and repository `PRAGMA database_list`; restart retained 20 fixtures,
six recommendations and zero AI reservations. No provider, external posting or browser was opened.
No source changes or repeated full suites were needed in this continuation.

| Actual native UI check | Result and observed evidence |
| --- | --- |
| Desktop feed and full saved description | PASS: six recommendations, supported requirements, current score, source and complete synthetic description visible |
| Evidence inspection and focus | PASS: Inspect synthetic-fact revealed the exact saved fact and moved AX focus to Selected supporting evidence |
| Needs Confirmation | PASS: five rows, including ambiguous application history and unknown-fit posting |
| Keyboard view navigation | PASS: Right from Needs Confirmation selected Applied and moved focus to that tab |
| Applied history | PASS: one synthetic applied record, dated 2026-10-14; selected workspace showed View application |
| Excluded | PASS: eight excluded rows remained inspectable, separate from recommendations |
| Saved and restart persistence | PASS: initially empty; explicitly saved fit-job-0; after terminating and relaunching the process Saved contained that one job |
| Review cancel | PASS: edited field to Cancelled synthetic edit, cancelled, reopened; Computer Science restored |
| Review explicit confirmation/save | PASS: save disabled until checkbox checked; saving unchanged reviewed synthetic values closed form and preserved eligibility |
| Explicit resume preparation | PASS: opened Resume step 1 with correct company, role, URL and full synthetic JD; generation/export not attempted |
| Native narrow layout/back navigation | NOT VERIFIED: two CUA edge drags left window dimensions unchanged; no narrow-layout screenshot claimed |
| Stale-review error/recovery in native UI | NOT VERIFIED in this continuation; existing service regression coverage is separate |
| Screen-reader behavior beyond AX focus | NOT VERIFIED |

Actual synthetic screenshots: `ui-unlocked-desktop.png`, `ui-unlocked-evidence.png`,
`ui-unlocked-restart.png`, with corresponding AX text under `docs/jobs-feed-evidence/phase2f1/`.
Additional AX captures cover confirmation, exclusions, applied history and resume preparation.
Startup/restart logs and JSON record process isolation; read-only SQLite integrity is `ok`, with
zero foreign-key violations. The desktop screenshot shows readable split panes; native paint timing
and minimum-width layout remain unmeasured. The synthetic saved-job change is retained intentionally.

Decision: GO for further isolated mocked acceptance. Native minimum-width and stale-review UI
recovery still need execution. NO-GO for paid live API tests or real autofill; this continuation
provides no installed Chrome integration evidence and authorizes no installation or registration.


## Final native closure — 2026-10-15

**Acceptance status: PARTIAL. No approval request is pending.** Earlier PASS results remain intact.
Only the remaining native checks were exercised. No later-phase implementation was started.

| Remaining check | Actual result |
| --- | --- |
| Native 720px window | PASS for actual sizing and inspected layout: macOS Move & Resize → Left first produced **757×899 points**, not 720. Existing trusted AX access then resized the named acceptance window to **720×800 points**, confirmed independently by CoreGraphics. Screenshots are 1440px wide at 2× scale. Feed/detail, wrapped filters, primary actions, review form and evidence were inspected; vertical scrolling exposes long content. Exhaustive every-control keyboard/clipping audit is NOT VERIFIED. |
| Back navigation | PARTIAL: evidence close returns to detail; All jobs returns to list with `view=saved`, `jobId=fit-job-0` and the selected row preserved. These narrow transitions use local view state, so the route intentionally stays unchanged. Reopening detail starts at the top. Citation focus restoration initially FAILed and is fixed/verified below. Returning from detail to feed leaves AX focus on the page container: FAIL for restoring focus to the selected row, unresolved. Precise prior scroll-offset restoration and a keyboard-only full back loop are NOT VERIFIED. No invented back shortcut was used. |
| Native stale review and recovery | PASS: opened eligibility review, transactionally changed only the marked synthetic claim's field through a controlled SQLite fixture injection, then clicked confirmed Save in the native app. It rejected the stale review with “Eligibility changed while this review was open. Reopen and review the current statements.” Cancel/reopen loaded the changed field and reset confirmation. Fresh review restored Computer Science and saved successfully. Following process restart retained the restored locked claim. No package/approval existed or was created. The injected concurrent writer was a test mechanism, not a claim of second-UI-writer integration. |
| Accessibility | PASS for inspected AX names/labels, selected filters, eligibility text, cited evidence, review fields and stale error presence. Citation open focuses the inspector; after correction close restores the originating citation; Tab advances to the next citation. Native review is an inline labelled form, not a modal dialog. Actual VoiceOver interaction/announcement is NOT VERIFIED: no active VoiceOver process or exposed speech/reader controller was available; VoiceOver/system accessibility settings were not changed. AX presence does not establish spoken announcements. |
| Native interaction timing | NOT VERIFIED: existing CUA round-trip durations include transport, AX settling and capture; they cannot isolate native visible readiness or paint latency. Existing initialization markers are service timings. No new instrumentation installed, no native timing or improvement claim made. |

### Reproduced defect and narrow correction

Using the systematic-debugging workflow, traced lost citation focus to `FitExplanation.tsx`:
opening focused the inspector, but closing removed its focused button without returning focus.
Retain the exact invoking button in a ref and restore it on Close evidence. This handles repeated
citations of the same fact correctly; it does not change eligibility, authorization, provenance,
persistence or package logic. The added `FitExplanation.test.tsx` first failed on the old behavior,
then passed after the correction. Native rebuilt app also focused the exact second citation,
then passed the first-citation close/Tab sequence at 720px. No redesign or dependency added.
The separate detail-to-feed focus/scroll concern is recorded for review rather than expanded into
navigation redesign during this bounded closure.

Affected verification: **2 focused tests PASS** (`FitExplanation.test.tsx`,
`fitPersistence.test.ts`), lint PASS, typecheck PASS, packaged acceptance production build PASS
(existing chunk-size warning retained), native focus retest PASS. Earlier 368 frontend / 35 Rust /
12 Python and full checks remain historical baseline, not rerun or relabelled for this correction.
Only React focus behavior changed, so Rust/Python/extension checks were not repeated.

### Native evidence and isolation

New artifacts under `docs/jobs-feed-evidence/phase2f1/` use prefix `closure-`:

- `closure-720-detail.png`, `closure-720-review.png`, `closure-720-evidence.png` are actual native screenshots.
- `closure-native-bounds.txt` records the initial 757×899 result; `closure-native-720-bounds.txt`
  and `closure-fixed-720-bounds.txt` record actual 720×800 window bounds.
- `closure-resize-api.txt`, `closure-fixed-resize-api.txt`, `closure-resize.swift` and
  `closure-ax-trust.txt` record the existing authorized native sizing API and permission state.
  No permissions were requested or granted. Initial edge drags were ineffective input attempts,
  not evidence of a nonresizable product: config remains resizable with minimum 720×600.
- `closure-stale-error.txt/.png`, `closure-stale-reopened.txt`, `closure-back-feed.txt`,
  `closure-focus-fixed.txt/.png` record actual native outcomes; focus text is authoritative for focus.
- `closure-focus-before.log` records failing regression, `closure-focus-after.log` passing tests;
  build/lint/typecheck logs retained alongside them.
- `closure-startup.log`, `closure-retest-startup.log`, repository startup/Jobs JSON and
  `closure-safety.json` record PIDs 75327 / 78194 and the retained exact temporary SQLite path.

The marked root remains `/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-kbz3c8za`.
Native repository path verification and read-only post-run checks agree. Integrity `ok`, zero FK
violations, 20 `job_fit` cache records, **zero AI budget reservations**, zero packages. There remains
one deliberately seeded `synthetic-applied` history row dated 2026-10-14; **zero actual external
submissions** does not mean zero synthetic submitted-history rows. No live discovery, notifications,
paid requests, real autofill or production records were used. Acceptance bridge mode remained false.
No Chrome setup, account/model/security changes, commit/push/deploy or competing coding task was run.
Owned acceptance processes were stopped after verification; existing dirty paths were preserved.
Branch/HEAD remain `ui-ux-overhaul` / `7ba0dee`.

**Decision:** PARTIAL native closure. Phase 2F.2 may be considered for separate review/authorization
with these limitations disclosed; it has not begun. Further isolated mocked testing is safe within
the existing constraints. NO-GO for paid live API tests or real autofill. Remaining acceptance work:
feed-return focus/scroll and complete keyboard loop, actual screen-reader operation, reliable native
interaction timing, and exhaustive minimum-width control inspection. No approval is currently pending.


## Phase 2F.1.1 — Feed Navigation Closure

2026-10-15 (America/Chicago). **Functional native acceptance: COMPLETE.** Broader assistive-technology
and native performance validation remain PARTIAL/NOT VERIFIED as described below. No approval is
pending, no Phase 2F.2 work was started, and no previously passing full suite was rerun.

### Root cause and production correction

`JobsPage` previously changed only `mobileDetail`/`expanded` on Back. The focused Back button then
became hidden at narrow widths, leaving focus on the page container. Neither entering details nor
returning to the feed had a committed-render focus target or captured feed scroll position.

Added scoped `useJobFeedNavigation.ts` and wired refs/requests into `JobsPage.tsx`. On selection it
captures the actual row's ancestor scroll positions and filter/search/work-style/sort scope. After
React commits the detail pane, focus moves to its labelled region, placing the existing Back control
next in the tab order. On Back, the layout effect locates the visible row by stable job ID, restores
compatible scroll positions, focuses with `preventScroll`, then uses nearest scrolling only to keep
the target visible. Changed filter scope does not restore an obsolete offset. If the row is gone or
no rows exist, the labelled Job results region receives focus. Hidden/disconnected targets are not
focused. Requests are consumed synchronously after commit; there are no delayed focus timers.

`src/index.css` now exposes the existing JobWorkspace Back control at desktop widths too. This is
the same return action, not a new shortcut or navigation architecture. The hook is scoped to Jobs;
other screens, business logic, evidence freshness, approvals and browser authorization are unchanged.
The previously corrected citation opener restoration is preserved.

### Focused regressions and verification

Five new JobsPage regressions cover:

1. Stable row/filter restoration following evidence inspection and a keyboard Enter/Tab/Back cycle.
2. Back from a remounted deep-linked workspace.
3. Selected row filtered out and completely empty feed fallbacks.
4. Rapid repeated selection/back across different stable IDs.
5. Scroll restoration after review cancellation and discarding offsets from another filter scope.

The initial four focus regressions failed against the old implementation (7 existing tests passed).
After correction, **14 tests across 3 files PASS**: JobsPage, FitExplanation and shared UI accessibility
controls. Lint PASS, typecheck PASS, acceptance Tauri production build PASS; existing bundle-size
warning remains. Native execution used the newly built acceptance bundle. These are incremental
results; earlier frontend/Rust/Python/full-production baselines remain historical.

### Actual packaged native results

| Scenario | Result |
| --- | --- |
| Native desktop sizing | PASS: CoreGraphics confirms **1280×820 points**; actual screenshots 2560×1640 at 2× |
| Native minimum-width sizing | PASS: existing trusted AX resize, independently confirmed **720×800 points**, screenshots 1440×1600; no permissions/configuration changes |
| Desktop complete keyboard-only loop | PASS: starting on a feed row, Enter → detail region; Tab → evidence citation; Enter → inspector; Tab → Close; Enter → originating citation; Shift+Tab → Back; Enter → original feed row; Tab → next job; Enter → next detail. Actual AX focus transcript retained. |
| 720×800 complete keyboard-only loop | PASS: same complete sequence executed using keyboard input only after filter setup; no pointer activation within the loop |
| Citation restoration and visible focus | PASS: exact opener restored at both sizes; actual screenshots show the blue row focus indicator and selected state |
| Escape | PASS as observed behavior, not a shortcut claim: Escape did not dismiss the inline evidence region; Tab/Enter on Close worked. No Escape-to-Back feature was introduced. |
| Desktop below-fold scroll return | PASS: keyboard traversed to Graduate Works below the initially visible rows, opened detail, returned via Back; same row remained visible at the same observed position, with All jobs and selection preserved |
| 720px below-fold return after review | PASS: same below-fold row; opened details and eligibility form, keyboard-tabbed to Cancel review, returned via Back; focus and observed feed position restored |
| Evidence then Back / repeated navigation | PASS at desktop and 720px as part of the full loops; next-row activation succeeded without focus loss or a trap |
| Filter switch removes originating row | PASS: Graduate Works detail → Saved → Back; absent originating row caused focus to the labelled Job results region; Saved filter preserved |
| Empty feed fallback | PASS: desktop synthetic search produced 0 rows while detail remained open; Back focused Job results, with understandable empty-state text. Search was transient UI state. |
| Accessibility tree | PASS for inspected row toggle-button names, selected state, filter tab labels, labelled detail/feed regions, existing Back and evidence Close controls; transcripts retained |
| Actual VoiceOver announcements | NOT VERIFIED: no active authorized reader/controller was used; AX assertions are not spoken-announcement evidence. No system accessibility settings changed. |
| Reliable native timing | NOT VERIFIED: CUA round trips and AX settling are not paint/interaction latency. No instrumentation installed or improvement claimed. |

Native scroll evidence is observed screenshot/AX behavior, not an instrumented DOM scroll-offset
measurement. Before/after below-fold screenshots preserve visible row position at each tested size;
we do not claim exact numeric CSS offsets or exhaustive behavior across every possible layout/data
change. Native tests used the existing 20 synthetic jobs. The fallback cases were actual UI execution,
not jsdom-only results. No package approval was created or modified.

### Evidence and final safety

All new artifacts are under `docs/jobs-feed-evidence/phase2f1/` with prefix `navigation-`:

- `navigation-desktop-loop.json` and `navigation-720-loop.json`: full keyboard action/focus sequences.
- `navigation-desktop-scroll-before.png/.txt`, `navigation-desktop-scroll-after.png/.txt`,
  `navigation-720-scroll-before.png/.txt`, `navigation-720-scroll-after.png/.txt`: actual native
  below-fold return observations; `navigation-720-review-back.json` includes review cancellation.
- Desktop final, 720px detail/feed, filtered fallback and empty fallback screenshots/AX records.
- `navigation-native-720-bounds.txt`, `navigation-native-desktop-bounds.txt`, native resize API
  logs/source: actual native dimensions, distinct from browser viewport simulation.
- `navigation-regressions-before.log`, `navigation-tests.log`, lint/typecheck/build logs.
- `navigation-startup.log`, `navigation-repository-startup.json`, `navigation-jobs-feed.json`,
  `navigation-safety.json`: native path/process verification and final read-only database checks.

Native PID **80855** used only the existing marked root
`/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-kbz3c8za`.
Preflight and actual repository `PRAGMA database_list` agree on its `native.sqlite3`. Final integrity
is `ok`, foreign-key violations **0**, AI budget reservations **0**, packages **0**. Only the existing
`synthetic-applied` fixture history row remains; there were **zero actual external submissions**.
Forced isolated runtime mocks and disabled discovery/extension polling protections were preserved.
No real candidate, production SQLite, live job board, paid provider, browser setup, credentials,
account/model/security setting, commit, push or deployment was accessed or changed.

Only the owned acceptance process was stopped. Original dirty paths remain present; no competing
coding task was started. Branch/HEAD remain **ui-ux-overhaul / 7ba0dee**, and whitespace checks pass.

**Recommendation:** close Phase 2F.1 functional acceptance. Its reproduced navigation defect is fixed
and the required native focus/scroll/complete-keyboard workflows pass at both sizes. Retain actual
VoiceOver and reliable native timing as NOT VERIFIED limitations; this does not claim universal
accessibility or performance certification. Phase 2F.2 is suitable for separate review/authorization,
with no implementation begun. Live paid APIs, real autofill and external submissions remain NO-GO
under the current authorization and acceptance scope.
