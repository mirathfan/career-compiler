# Explicit preference refinement — Phase 2F.3

Date: 2026-10-15. Branch `ui-ux-overhaul`, HEAD `7ba0dee`.
Scope: local synthetic/mock-only implementation. Existing modified/untracked work is preserved.
No commit, push, deployment, later phase, paid request, live retrieval, real application/autofill,
Chrome installation/registration, credential access or account/security setting change.

## Result

Functional UI and persistence are implemented. **151 focused frontend tests / 12 files, lint and
typecheck PASS.** Native production acceptance build and path verification are recorded below.
Actual packaged native skip/undo, explicit preference confirmation, edit/disable, ranking restoration,
full process restart and 720×800 management **PASS after an initially locked attempt**. Component/SQLite
tests and native GUI observations are separately identified below.

**GO:** isolated functional use of Phase 2F.3. The requested native A–L matrix is complete.
**NO-GO:** paid/live integrations or real autofill/submission. Actual VoiceOver, native timing and
process death during an import/preference transaction remain unverified. No later increment was started.

## Existing services reused

- JobsPage, JobWorkspace, existing split-pane navigation and scroll/focus restoration.
- Existing `rejected` Job status means skipped. There is no parallel job-state system, no deletion
  of descriptions and no fabricated application status.
- `loadFitFeed`, `filterFitFeed`, deterministic v2 assessments, conservative exact/possible
  application reconciliation and existing saved/application/package workflows.
- Existing `AppRepository.transaction` and SQLite `safety_records`; no new schema or migration.
  Native transactions retain the existing single connection / `BEGIN IMMEDIATE` implementation.
- Existing semantic `jobFingerprint`, additionally bound to source/requisition/posting identity
  for reviewed skip decisions; versioned canonical SHA-256 for preference ranking fingerprints.
- Existing bounded modal styling, native HTML dialogs, focusable headings, labelled fields and
  visible focus/reduced-motion behavior.

Profile `JobSearchPreferences` and Candidate Brain `CandidatePreferences` were inspected. Those
aggregates already serve discovery, fit/evidence and answer settings, but cannot represent narrow
per-decision confirmation, revision, enablement and audit history. They remain unchanged. This
increment stores only explicit Jobs ranking refinements in existing local record storage; nothing
is inferred from synthetic test choices into a real user profile.

## Decision and preference model

`job_skip` / `cc-job-skip-v1` stores one current decision per job, unique decision/revision IDs,
reason, optional bounded note, original status, timestamp, relevant semantic/requisition revision,
active state, explicit provenance and job-only versus confirmed-preference state. Prior complete
decisions survive as audit snapshots. Repeated identical active skips are idempotent; overlapping
stale starts reject, rather than creating contradictory records. Current job status remains
`rejected`; restore returns the prior supported status. Legacy skipped records remain restorable.

All eight requested reasons are available. “Already applied” records a skip reason only: existing
exact/possible reconciliation stays visible and authoritative; no application record or date is
created. Active application/preparation states are not forcibly rewritten by the skip control.
A skipped job can be revisited in Skipped/Excluded/All jobs, restored and then saved normally.

Default Save records only a job-specific skip. An optional separate screen asks for an exact scope;
“Keep skip job-specific” and Cancel remain available. “Confirm preference and skip” commits both
records together. Neither a bare skip nor cancellation creates a preference.

`job_preference` / `cc-job-preference-v1` stores category, exact value, prefer/avoid semantics,
explicit confirmation/provenance, enabled/removed state, immutable creation time, updated time,
revision, source decision ID when applicable and compensation currency. Invalid/unconfirmed or
unversioned records fail closed. Supported scopes:

| Category | Deliberately narrow matching contract |
|---|---|
| City | Exact normalized first comma-separated location component; no geocoding |
| State/region | Exact later comma-separated component; a single state-only string stays unknown |
| Arrangement | Explicit remote/hybrid/on-site; unspecified stays unknown |
| Role | Exact normalized role title; no invented role-family taxonomy |
| Compensation | Positive annual minimum, explicit supported currency, disclosed structured annual range in the same currency; missing, crossing ranges, estimates, unsupported periods/currencies stay unknown |
| Technology/domain | Explicit bounded description term; absence stays unknown, not assumed incompatibility |

Location strings with alternative/multiple locations are unknown. These are text scopes, not legal
or relocation assertions. Willingness to relocate and broad industry/role-family inference are not
automatically derived. No city, nationality, residence or immigration inference is introduced.

Jobs → Ranking preferences supports direct explicit confirmation, edit with fresh confirmation,
disable, enable, remove and restore removed scopes. Exact conflicting/duplicate scopes reject and
must be resolved by editing the existing scope. Stale revision writes reject. Disabled state and
original creation/source provenance survive edits and restore. Removing a preference removes its
ranking contribution, not its history. Restoring a removed scope rejects a newly conflicting active
scope. Undoing a skip retains its independently confirmed preference; the UI explains where to
manage that preference, rather than silently undoing two different decisions.

## Ranking and explanation contract

Each feed row has `baseScore`, `adjustment`, `priority`, explanations and `preferenceRevision`.
The underlying deterministic assessment object is unchanged.

- Preferred scopes within a category are alternatives. One known match gives +3 once.
- A known avoided match gives −6 once for that category and wins a same-category conflict.
- If every preferred scope has a known mismatch, that category gives −6 once.
- Unknown inputs contribute zero. Repeated skips or multiple scopes cannot stack unlimited points.
- Total adjustment is bounded to −18…+9. Priority is base plus adjustment, clamped to 0…100.
  Unknown technical fit remains unknown priority.
- Eligibility and application-history gates run independently before sorting. Disqualified jobs
  remain excluded; Needs Confirmation remains separate; possible history never becomes confirmed.
- Stable ties use posting/creation date then job ID. “Newest” remains an explicit alternate sort.
- Row/detail explanations identify the matched scope and show technical score separately from
  adjustment/priority. Preference mismatches are never labelled qualification failures.

Ranking is recalculated from a consistent local snapshot. Mutations invalidate queries; fingerprints
change with preference revisions. There is no new background polling. A second process's existing
pixels can remain old until its normal refetch; those pixels grant no approval or authorization.

## Transactions, reversibility and invariants

Skip status, decision, optional preference and before/after audit append commit/rollback together.
Management actions use the same transaction and optimistic preference revisions. The service reads
actual persisted creation/enablement/source metadata instead of trusting caller-supplied snapshots.
Job updates revalidate skip review against semantic content and requisition identity. A later content
revision never silently broadens a prior confirmed scope; the original skip remains inspectable.

Injected failures in MemoryRepository and SQLite roll back all related writes. Retry, SQLite export,
close and reopen restore the expected decisions/ranking. This is real SQLite via sql.js, **not native
process-death acceptance**. There is no new privileged command or test-only production bypass.

Tests compare career items/facts/claims, complete assessments, descriptions, application history,
packages, AI budget and browser authorization records. Preferences alter none of those. Existing
job-content/evidence/PDF/approval/extension authorization contracts are unchanged. There is no
provider/discovery import or call path in the refinement service and no passive telemetry.

## Files changed in this increment

| File | Purpose |
|---|---|
| `src/lib/jobs/preferenceRefinement.ts` | Validated decisions/preferences, transactional services, rollback/stale/conflict guards, deterministic ranking/fingerprints |
| `src/lib/jobs/fitFeed.ts` | Reuse existing feed; add separate ranking snapshot and Skipped view |
| `src/features/jobs/PreferenceControls.tsx` | Reason dialog, explicit generalization, restore and preference management UI |
| `src/features/jobs/JobsPage.tsx` | Jobs management entry, Skipped tab, priority sort/explanations |
| `src/features/jobs/JobWorkspace.tsx` | Replace immediate unreasoned skip, preserve saved/app flows, explain priority |
| `src/index.css` | Scoped wrapping for long preference text in existing bounded dialog |
| `src/lib/jobs/preferenceRefinement.test.ts` | Decision/ranking/invariant/concurrency/staleness/reversibility regressions |
| `src/lib/jobs/preferencePersistence.test.ts` | SQLite rollback/retry/reopen and unchanged history |
| `src/lib/jobs/preferencePerformance.test.ts` | Reproducible synthetic rank/sort observations |
| `src/features/jobs/PreferenceControls.test.tsx` | Confirmation/decline/cancel/focus/edit/enable/remove/restore component interactions |
| This report, `docs/job-automation.md`, evidence folder | Contracts and actual verification evidence |

## Regression and scenario results

PASS here means executed automated service/component/SQLite tests, unless explicitly labelled native.

| Requested synthetic scenarios | Result / evidence |
|---|---|
| 1–7: all reason variants, including role/location/arrangement/compensation/technology/already-applied/job-only | PASS: parameterized reason persistence + unchanged application history |
| 8–9: explicit city and remote preferences | PASS: confirmation/UI/services and scoped adjustment |
| 10–12: edit, disable/enable, undo skip | PASS: service/component tests; removed preferences also restore |
| 13–14: same city/different role, same role/different city | PASS: independent exact scopes and unchanged eligibility |
| 15–16: unknown salary and ambiguous location | PASS: zero adjustment for unknown inputs |
| 17–18: disqualified and Needs Confirmation | PASS: ranking cannot enter default recommendations |
| 19–20: high-fit mismatch versus lower-fit alignment | PASS: separate base fit retained while priority ordering changes |
| 21–22: repeated identical skip and conflicting preferences | PASS: idempotent/stale concurrent request handling, duplicate-scope rejection, bounded categories |
| 23: preference after content/requisition revision | PASS: scope/provenance retained; stale review rejects |
| 24: persistence/restart | PASS: SQLite close/reopen and actual native decision/preference restart |
| 25–26: exact/possible application history | PASS: all synthetic fixture reconciliation objects/history unchanged |
| 27–28: empty recommendation, filtering/search after skip | PASS: no recommendations after skips, retained Skipped records and search behavior |
| 29: native keyboard-only skip/undo | PASS after the focus correction: Enter → reason/note → Save → immediate Enter restore; Escape restores opener |
| 30: actual native 720×800 preference management | PASS: observed bounds, management/edit, wrapping, keyboard scrolling to visible Save and Escape cancellation |

New focused tests are distinct from historical full-suite baselines. No Rust, native transaction,
Python or extension code changed, so historical Rust/Python/extension suites were not repeated.

## Verification and native environment

Exact new commands/logs and final path/safety results are retained under
`docs/job-preferences-evidence/phase2f3/`. The test command selects refinement, SQLite persistence,
performance and UI tests together with existing Jobs navigation, fit/parser, import and evidence
inspector regressions: **151 tests / 12 files PASS**. Lint/typecheck PASS. Whitespace checks PASS.
The acceptance build includes the production frontend and native executable; the pre-existing Vite
chunk-size warning remains. This is an acceptance-identifier build, not a production installation.

The retained marked root is:

`/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-kbz3c8za`

Actual database: `<root>/native.sqlite3`. The marker was read and matched `synthetic-only\n` before
launch; both config and built Info.plist identify `com.mirathfan.careercompiler.acceptance`.
Startup uses only `CC_ACCEPTANCE_ROOT`, `CC_ACCEPTANCE_UI=1`, `CC_ACCEPTANCE_JOBS_FEED=1`. Native
`ISOLATION_PREFLIGHT` and `PRAGMA database_list` agree on the fixed temporary path. The acceptance
builder omits production HTTP/Keychain/discovery/opener handlers, forces mock runtime and disables
background scheduling/bridge. Sources remain empty. The retained environment was not recreated.

PID 3545 reached `repository_verified` with 23 synthetic jobs and zero AI reservations. CUA then
reported “The Mac is locked and automatic unlock could not unlock it.” One unlock request was
sent; independent tests continued. PID 3545 was stopped after verifying its exact owned binary.
The next unlocked retry exposed the focus issue below. Rebuilt PID 6440 completed the corrected
keyboard/720px workflow; PID 7122 verified full native restart and retained ranking. All owned
processes are stopped. Earlier import/feed screenshots remain historical, separate evidence.

| Native acceptance step | Actual Phase 2F.3 result |
|---|---|
| Packaged build and temporary DB preflight | PASS |
| A–C: skip, status, undo | PASS: reason persisted, Saved → Skipped → Saved, no general preference from job-only skip |
| D–H: confirm scope, priority change, unchanged fit/eligibility, disable, restored rank | PASS: city −6; explicit role edit changes ordering; disabling restores baseline |
| I–J: restart with saved native decisions/rank | PASS: persisted skip observed after rebuild/restart, then active role preference and ordering observed after full process restart |
| K: native keyboard-only skip/undo | PASS after fixing pending-button focus restoration |
| L: actual 720×800 layout | PASS: independently observed 720×800 bounds and 1440×1600 screenshots |
| Actual VoiceOver speech / reliable native timing | NOT VERIFIED |
| Crash during reviewed import commit (carried forward) | NOT VERIFIED |
| Native process death during a preference transaction | NOT VERIFIED; injected rollback is not that claim |
| Live personalization/model learning or genuine Chrome | NOT VERIFIED / out of scope |

## Performance

Apple M4, macOS arm64, Vitest/jsdom. 500 synthetic postings and three confirmed preferences;
one warmup followed by five observed rank-and-stable-sort samples. Fixture creation, repository
reads and preference hashing are excluded. Raw samples, median and method are in `performance.json`.
These measure deterministic local JavaScript work, not SQLite IPC/native paint and not an improvement
against any baseline. No interaction/paint latency claim is made.

## Remaining limits and next action

- The requested native matrix is complete. Further acceptance may target larger preference lists,
  real VoiceOver speech or controlled preference-transaction process death under a separately
  bounded synthetic test; no broader reliability/accessibility certification is claimed.
- Locations and roles use deliberately exact text scopes; no fuzzy geography/taxonomy, implicit
  relocation, employment authorization or inferred willingness is supported.
- Pay comparison requires a disclosed compatible annual structured range. Unsupported/ambiguous
  salary inputs are unknown; no normalization of estimated salary or currency conversion occurs.
- Preference notes/audit snapshots remain local and are not sent to AI. Audit records are appended
  by this service; generic repository storage is not a tamper-resistant ledger against arbitrary
  local database editing. Concurrent native process interruption and actual VoiceOver remain unverified.
- A restore preserves separately confirmed preferences; users can independently disable/remove them.
- No new AI inference, live personalization, automatic learning or integration is claimed.

Recommendation: retain the completed isolated Phase 2F.3 workflow and review these remaining limits. No Phase 2F.4 work, paid APIs,
live discovery, real candidate use, browser installation/registration or submissions are authorized.


## Native closure details and discovered defect

The initial keyboard attempt reproduced a real defect: Save completed while the skip opener was
still disabled by `busy`; the attempted focus call failed and focus fell back to HTML content.
The first follow-up navigation attempt did not reach Restore and navigated to the synthetic Profile
screen; no candidate data was edited. That attempt is retained as failed diagnostic evidence and is
not counted as a successful keyboard cycle.

A newly tightened component regression failed before the fix (`focus-before.log`). The correction
queues opener focus until both modal closure and pending-state completion have committed, using a
small state-dependent effect rather than a timeout. The regression passes afterward (`focus-after.log`).
The rebuilt actual native cycle starts with Skip job focused and uses only keyboard/paste through
reason/note, Save, focus on Restore, immediate Enter restore and focus on Skip job. Escape/cancel
also returns focus. `keyboard-fixed-skipped.*`, `keyboard-fixed-restored.*`, `escape-focus-restored.*`
and the marked phase in `native-actions.json` record this successful cycle separately.

Native two-step confirmation showed zero preference records and job still Saved before Confirm
(`before-confirmation.json`). Confirming exact city Seattle committed the explicit preference and
skip together. Restoring the job retained its independently confirmed scope: technical fit remained
91 and Eligible while priority became 85. Disable restored priority 91. At actual 720×800, Enable,
Edit category to exact role Software Engineer, fresh checkbox confirmation and Save succeeded.
The recommended order changed from `[0,1,10,12,14,2,import]` to `[1,14,2,0,10,12,import]`
(`fit-job-*` suffixes; import is the prior Greenhouse synthetic import). Technical scores and
eligibility did not change. The native restart retained this exact order and scope/provenance.
Post-restart Disable restored the original order. Remove → explicit Restore retained the disabled
state and audit history. A final 720px keyboard pass scrolled the modal to a visibly focused Save;
Escape cancelled without a write (`720-keyboard-save-visible.png`).

The AX resize API initially returned before CoreGraphics reflected the new bounds; the later
independent observation records Width 720 / Height 800 in `720-bounds.txt`. Screenshots are 2× pixels.
The long explanation wraps within the bounded dialog; its lower controls are keyboard-reachable
through normal scrolling. Native desktop screenshots show the same controls. No VoiceOver speech
or native paint latency is inferred from AX/CUA durations.

Final safety evidence (`final-safety.json`): integrity `ok`, foreign-key violations 0, 23 jobs,
unchanged complete original job content and every non-job/non-safety table digest, unchanged all
23 score/eligibility/application-reconciliation results, original fit-job-0 status Saved. Current
skip is inactive; the one confirmed synthetic role preference is disabled. There are 13 append-only
service audit snapshots, 1 current skip record and 1 preference record. The only safety kinds are
job_fit/job_skip/job_preference/job_preference_audit: AI budget and browser fill-token records are
zero. Application history remains the single deliberately seeded fake record; packages and sources
remain zero. The root was retained without reset or recreation. No production data or paid/live
operation occurred. `cleanup.json` records stopped processes and preserved original dirty paths.

Final measurements: Node v24.12.0; median 1.281 ms, observed range 1.256–3.112 ms for the 500-row rank/sort.
Final verification: 30 new regression cases plus 121 retained focused regressions = **151 / 12 files PASS**; lint, typecheck, acceptance build and whitespace PASS. Rust/Python/extension suites were not repeated because those implementations were unchanged. All four owned native PIDs are stopped; no native process remains.
