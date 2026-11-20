# Reviewed application history — Phase 2F.4

Date: 2026-10-15 (America/Chicago). Branch `ui-ux-overhaul`, HEAD `7ba0dee`.
Scope: exclusively local synthetic fixtures and the retained marked temporary SQLite database.
All preceding modified/untracked work is retained; no competing task/subagent was started and no
competing edits were observed. Initial Git status is retained as `initial-git-status.txt`.

## Decision

**GO for isolated synthetic functional use and further acceptance. NO-GO for actual history import,
Gmail/account integration, paid providers, real autofill or submission.** The implementation is
functional, with source review, transactional writes, idempotence, corrections and existing Jobs
integration. Newly executed verification: **186 tests / 11 files PASS**, including **62 new cases / 4
files**, plus lint, typecheck, packaged acceptance build and whitespace checks.

Actual packaged native testing executed synthetic JSON/CSV preview, source inspection, correction,
explicit acceptance, cancellation, reimport, exact/possible matching and full process restart.
Actual 720×800 window bounds and rendered layout are verified. Desktop keyboard selection/Escape
were exercised. Physical keyboard interaction in the restarted narrow window encountered
`noWindowsAvailable`; this additional narrow-input check remains BLOCKED unless resolved below.
Actual VoiceOver speech, native paint timing and controlled process death during an import remain
NOT VERIFIED. No mocked result is described as live integration success.

## Architecture inspected and reused

| Existing component | Reuse / resulting boundary |
|---|---|
| `ApplicationRecord`, ApplicationsPage, repository tracker CRUD | Canonical application/event store; no competing application tracker |
| Existing status enum | preparing/ready/applied/interview/rejected/offer/withdrawn retained; uncertain history uses preparing plus explicit evidence metadata |
| Multiple application IDs per job | Distinct dated historical application events supported without a job-level unique constraint |
| `reconcileApplication` / existing Jobs feed | Exact versus possible matches retained; imported confirmations additionally require matching durable source proof |
| Application Queue / package services / `validateTrackerSelection` | Unchanged authority; import refuses to overwrite resume/package-linked trackers or link new history into an existing package relationship |
| Repository transactions / native `BEGIN IMMEDIATE` | Tracker, source entries, audit and batch idempotence share one transaction; no schema migration or new Rust/privileged commands |
| Existing `safety_records` | Typed import provenance, audit and execution markers; no provider/budget/authorization record is created |
| Job semantic fingerprints and canonical URL normalization | Review binding and conservative posting identity; job descriptions, statuses and fingerprints are not edited |
| Local file commands | Inspected; normal reads cannot be limited to synthetic fixtures, so this phase uses bundled named files instead of granting file permissions |
| Existing import/Jobs modal and focus patterns | Bounded dialog, labelled controls, explicit preview/save, pending guards, Escape and return focus |

The tracker already allowed manual status changes and multiple events but had no reviewed history
import contract, evidence classification, file/source idempotence or source audit UI. Its applied-date
fallback supplied today when a historical date was missing. The narrow repository change preserves
blank historical dates for the versioned import source marker while retaining existing manual-entry
behavior. `submittedAt` is supplied explicitly; date-only evidence never gains a fabricated time.

## Supported synthetic file contract

No actual application files, canonical history artifacts or real application counts were accessed.
The only native-selected files are repository-owned `synthetic-history.json` (20 records) and
`synthetic-history.csv` (18 records), bundled via the existing local fixture mechanism. This is the
explicit fallback permitted when native file selection cannot guarantee synthetic-only scope.
Arbitrary file-picker ingestion is deferred; CSV/JSON parsing itself is implemented and tested.

JSON envelope:

```json
{
  "schema": "cc-synthetic-history-v1",
  "synthetic": true,
  "namespace": "stable-synthetic-source",
  "records": [
    {
      "rowId": "receipt-001",
      "sourceCategory": "synthetic_receipt",
      "employer": "Example Studio",
      "role": "Software Engineer",
      "requisition": "req-0",
      "sourceId": "synthetic-greenhouse",
      "postingUrl": "https://example.invalid/0",
      "appliedAt": "2026-10-01T12:00:00Z",
      "status": "applied",
      "evidenceKind": "application_receipt",
      "submissionEvidence": "Synthetic role-specific receipt.",
      "statusEvidence": "",
      "statusAt": "",
      "eventId": ""
    }
  ]
}
```

CSV starts with the exact line `# cc-synthetic-history-v1`; its header contains `namespace`,
`rowId` and any supported record fields above. Namespace is constant across that file. All source
fields are bounded strings; missing optional values normalize to empty strings. Unknown fields or
unsupported types make a row invalid, rather than silently dropping source data. CSV supports commas,
escaped quotes and quoted multiline text; malformed quoting, duplicate headers and mismatched columns
reject the file. JSON envelope keys are strict and require the explicit synthetic marker.

Limits: 2,000,000 UTF-8 input bytes, 1,000 records, 4,000 characters per known field, 16,000 CSV row
characters, bounded structure depth/node counts and safe bounded basename ending `.csv`/`.json`.
No path traversal, executable files, arbitrary filesystem reads or external-resource retrieval exists.
Dates are valid ISO calendar dates or ISO timestamps with timezone; ambiguous/local timestamps and
impossible dates are invalid. Original timezone/text survives in source; normalized timestamps use UTC.
Import acceptance/recording time is distinct from source application/status time.

## Evidence states and status semantics

| State | Contract |
|---|---|
| CONFIRMED_APPLICATION | Employer/role plus scoped requisition or posting identity and specific declared submission evidence, with suitable status evidence; explicit reviewed corrections can establish missing identity/submission support |
| POSSIBLE_APPLICATION | Some submission/status evidence exists but identity or status support is incomplete; never an exact Applied signal |
| UNRESOLVED_RECORD | Missing employer/role, invalid fields or an explicit unresolved decision; retained as evidence without creating a tracker application when accepted unresolved |
| NOT_AN_APPLICATION | Saved jobs, resume preparation and generic recruiter outreach do not prove submission; retaining this evidence creates no application |

“Confirmed” means sufficient **reviewed local synthetic evidence**, not an externally verified event.
Free-form source text is untrusted and no email/ATS authenticity verification occurs. Every row starts
Skip; classification alone writes nothing. Applied/interview/rejected/offer/withdrawn are supported
source states. Interview/rejection/offer/withdrawal require specific status evidence/time plus an
appropriate explicit status source or review confirmation. Silence/encouragement do not establish
rejection/offer. Unknown/saved/preparing source states remain distinct from confirmed submission.

A missing application date stays missing even if the user accepts a specific submission receipt.
`createdAt`, acceptance timestamps and status-history recording timestamps are not substituted into
`appliedDate` or a fabricated `submittedAt`. Original status/evidence/time and reviewed corrections
remain in the source entry and audit. Nothing is recorded as a CareerCompiler browser submission.

## Identity, matching and event separation

Source identity hashes a versioned namespace plus stable original `rowId`; a separate canonical
source-record fingerprint detects changed source contents. File content fingerprint excludes the
filename, so renaming does not evade accepted-record detection. Original index is a transient review
key only. Reordered rows keep source identity; duplicate IDs are distinguished and cannot be accepted
twice in one plan. Identical duplicates can be skipped without blocking the first reviewed row.

Event identity uses explicit event identity scoped by source namespace, category and source ID where supplied, or employer/role/scoped requisition or
canonical posting URL plus source application timestamp/date. Without sufficient identity/date it
falls back to the stable source-record identity rather than company/title uniqueness. Separate
submission dates produce separate events. Explicit conflicting requisitions cannot be merged.

| Reconciliation | Meaning |
|---|---|
| EXACT_MATCH | Same employer and role with compatible posting/requisition and application-event identity |
| POSSIBLE_MATCH | Partial same-role identity, missing event data, or separate-date evidence needing review |
| CONFLICT | Contradictory requisition/status or changed previously accepted source content/correction |
| NEW_RECORD | No supported existing role-level event match; employer alone is insufficient |

Every row has a reason and inspectable candidates. There is no automatic AI match, automatic possible
merge, latest-status-wins rule or employer-only confirmation. A user may accept new, explicitly update
an inspected application, keep a genuinely separate event, retain unresolved evidence or Skip.
Matching across conflicting requisitions/dates rejects. Recreating an already-known event rejects;
the existing event must be reviewed instead. A status update can only write after explicit review and
acknowledgement, preserving earlier status history. Resume/package-linked records reject import updates.

The current event contract intentionally remains conservative: date-only versus precise-time evidence
can require review, and distinguishing ambiguous same-day resubmissions may need clearer source event
identity. This is not a fuzzy identity resolver or automatic recruiter-message grouping service.

## Review plan and transaction

Parsing and dry-run preview are read-only. The UI shows row counts, validity, evidence states,
exact/possible/conflict/new outcomes, source values, normalized values, corrections, candidate tracker
snapshots, proposed operations, reused rows and skipped rows. One record is reviewed at a time;
large inputs remain bounded. Choice changes revoke final confirmation and require Refresh reviewed
preview. Original/corrected role/date/status/evidence and optional saved-job association are explicit.

The reviewed plan binds versioned source content, stable source rows, choices/corrections, current
tracker snapshots, saved-job semantic/requisition identity and accepted-source entry revisions.
Execution reparses and revalidates inside the existing transaction. Stale source/tracker/choices
reject; package/resume constraints are rechecked. Simultaneous confirmations produce one committed
result/audit; a repeated identical accepted request returns its existing result without another write.

Accepted application changes, `application_history_entry`, `application_history_audit` and
`application_history_batch` commit or roll back together. Entries preserve source namespace/file/row,
original and normalized values, corrections, review choice, evidence classification, application/event
references, fingerprints and acceptance/update timestamps. Audits contain before/after source and
tracker snapshots, decision time and correction reason. The service appends unique audit IDs; it is
not a tamper-resistant ledger against arbitrary local database editing.

A same-source reimport reads the accepted reviewed classification and corrections, while separately
showing the raw source classification. This fixes the initially reproduced native reimport display
bug where the raw missing-role classification obscured its accepted correction. Reused and skipped
counts now form separate groups. The regression failed before the fix and passes after it.

## Corrections and audit UI

Accepted history exposes original/normalized/corrected values and on-demand before/after decision
audit. A mistaken confirmation/association can be explicitly downgraded to possible, unresolved or
not-an-application with a reason. The correction transaction clears erroneous exact association and
historical submission fields while preserving source/audit. It refuses linked resume/package changes,
stale corrections, missing canonical records or correction of an older superseded source entry.

Upgrades or identity/status replacements require another complete source review and plan, not a
one-click classification upgrade. Corrected unknown dates are explicit user values. Historical source
and prior decisions are never silently deleted. **Complete committed batch undo is not implemented.**
Conservative correction is not advertised as equivalent to rolling back a committed transaction.

## Existing Jobs and package integration

Imported evidence uses a validated versioned marker on the canonical tracker plus durable source
entry proof. Exact Jobs reconciliation requires consistent source-entry/application IDs, reviewed
classification, employer/role/requisition/source/URL and optional reviewed saved-job association.
A tracker marker alone is insufficient. Missing/contradictory proof stays possible and cannot enter
Applied. Company-only evidence creates no role-level application and does not mark unrelated roles.

The existing feed, filtering, ranking, eligibility and technical fit remain authoritative. No job
status/JD, candidate evidence, preference, package approval, resume/PDF lineage, AI budget or browser
authorization is changed by history import. Imported tracker status/date controls use the reviewed
history path instead of generic unreviewed submit/duplicate actions. Jobs exposes historical evidence
and opens the historical tracker rather than reusing it as a new application package.

## Security and backup boundary

- No network/provider/email/browser transport is imported or called by the history service.
- Imported text/HTML/formulas are inert React text; no HTML execution, spreadsheet evaluation,
  URL following, shell command, source-content logging or new file capability.
- Formula-like cells are invalid evidence; malformed, oversized, deeply nested, unsupported or
  conflicting structures reject or remain invalid/unresolved. Error text does not echo raw source.
- No credentials, OAuth, account/model/security changes, browser installation, native host
  registration, permissions expansion or live ATS pages were used.
- Existing JSON backup exports canonical tracker rows but **does not export the safety-table source
  entries/audits**. No broad backup-format change was introduced here. A tracker restored without
  matching provenance fails closed to uncertain Jobs history; tests verify this.
- **Before real history use:** implement a selective, versioned, validated and transactionally
  restored history-provenance backup contract. Do not restore browser tokens/budgets or secrets as
  part of that work. A native SQLite restart is verified; JSON history-provenance backup is deferred.

## Synthetic scenario coverage

PASS below refers to executed service/component/SQLite tests unless specifically called native.

| Requested scenarios | Result |
|---|---|
| 1–4: exact req, different role/req, separate dates | PASS: conservative matching and distinct events |
| 5–8: company-only/missing role/req/date | PASS: uncertainty preserved; reviewed correction; no invented date |
| 9–14: rejection/interview/offer/withdrawal evidence variants | PASS: explicit versus unsupported status evidence |
| 15–16: saved job and resume package | PASS: not proof of submission |
| 17–20: prior import, filename, reorder, correction | PASS: source/event identity and provenance retained |
| 21–23: conflicting status, duplicate rows, reposted requisition | PASS: explicit review, duplicate prevention, conflicting req rejected |
| 24–28: malformed CSV/JSON, bounds, formula and unknown fields | PASS: parser/security tests |
| 29–32: cancel, stale review, rollback, restart/reimport | PASS: component/SQLite; native cancel/reimport/restart also executed |
| 33: audit-history correction | PASS: service + SQLite + audit UI component; native audit inspection executed |
| 34–36: exact/possible Jobs and employer-only unresolved | PASS: service and native exact/unresolved feed checks |
| 37–38: repeated confirmation, distinct events | PASS: idempotence, simultaneous confirmation and event separation |
| 39–40: unsupported status and invalid/ambiguous timestamps | PASS: invalid until suitable explicit correction |

## Newly executed verification

- **186 tests / 11 files PASS**, 6.54-second responsive-host run recorded in `tests.log`.
  Includes 62 new cases in history core, SQLite persistence, performance and UI files; the remaining
  tests target changed Jobs reconciliation, existing job-import review binding and package invariants.
- Lint/typecheck PASS. Packaged acceptance build PASS; existing Vite chunk-size warning retained.
- Whitespace and final safety results are appended below.
- No Rust/schema/extension/Python implementation changed; historical full suites and unrelated
  acceptance workflows were not rerun. Tauri build compiled the native app and actual native writes
  exercised the existing transaction path. Focused job-import tests were rerun because proof freshness
  now participates in that preview; old native import acceptance was not repeated.
- An interrupted run coincident with multi-hour wall-clock gaps failed two unchanged tests on the normal 5-second timeout after ~231 seconds
  elapsed in each. Its log is retained. An earlier interrupted worker run also failed during the observed gaps and is excluded from passing totals. Host suspension is a plausible explanation, not a proven product diagnosis. No timeout was increased or failure suppressed; the same
  tests subsequently passed in the responsive-host run. This is not reported as a passing first run.

## Isolation and native execution

Retained root:
`/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-kbz3c8za`

Only `<root>/native.sqlite3` was opened. The existing `ISOLATED_ACCEPTANCE` marker was verified as
`synthetic-only\n`; config and built Info.plist use `com.mirathfan.careercompiler.acceptance`.
`ISOLATION_PREFLIGHT` and `PRAGMA database_list` agree on that temporary path for PIDs 15812 and 24755.
Flags are `CC_ACCEPTANCE_ROOT`, `CC_ACCEPTANCE_UI=1`, `CC_ACCEPTANCE_JOBS_FEED=1`; bridge remains off.
The acceptance build omits production HTTP/Keychain/opener/discovery handlers, uses forced mocks and
disables scheduler/polling. No normal production launch, root recreation/reset or real history scan.

PID 15812 executed the initial desktop acceptance. Row `missing-role` was explicitly corrected to
Software Engineer, previewed as one new confirmed event, and approved. Before approval the database
still contained one seeded application and zero history records. One historical synthetic event was
then created; its date remains 2026-10-01, not import time. CSV preview/Escape cancellation and JSON
reimport did not add an event or audit. Exact and possible existing matches were inspected. A separate
company-only row was explicitly corrected to employer Past Employer and retained unresolved; it
created evidence/audit only, not another application. Applied showed exactly Example Studio Software
Engineer plus the pre-existing Past Employer Software Engineer; the AI role/repost was not confirmed.

After stopping the owned process, final-source PID 24755 restored the accepted application, original
missing-role source, reviewed correction, unresolved company-only evidence and decision audit. The
fixed reimport UI shows `Source evidence: UNRESOLVED_RECORD` and `Accepted evidence:
CONFIRMED_APPLICATION`, with 0 new / 2 reused / 18 skipped. Jobs still shows two supported Applied
roles and unchanged 91-point technical fit / Eligible for the imported job.

The original AX window-array enumeration returned an empty list after restart. The already trusted
main-window API identified the exact acceptance title and set 720×800; independent CoreGraphics
inspection verifies those dimensions, and actual native screenshots are 1440×1600 at 2× pixels.
The modal wraps long IDs/explanations and uses bounded scrolling. Early unsuccessful resize captures
were renamed `pre-resize-*`; they are not claimed as 720px evidence.

Physical coordinate input later returned `Computer Use server error -10005: noWindowsAvailable`.
Accessibility actions/rendering remained available, and ordinary Window → named acceptance-window
foreground recovery was attempted without permissions/settings changes. A user request to bring it
onto the current desktop was sent. The extra post-restart narrow keyboard check is not claimed as
successful from AX rendering alone; final status is appended if that environment issue resolves.

| Native scenario | Result |
|---|---|
| A–B: synthetic file selection, preview/source | PASS: JSON and CSV bundled files, original values inspected |
| C: exact and possible matches | PASS: exact receipt event and missing-requisition possible candidate inspected |
| D–E: ambiguous correction and explicit new application | PASS: missing role correction, one accepted event |
| F–G: cancel another import, no writes | PASS: CSV cancellation; tracker/audit counts unchanged |
| H–I: identical reimport, no duplicate event/audit | PASS: 0 accepted / 1 reused before unresolved evidence acceptance |
| J–K: full process restart, source/history restoration | PASS: PIDs 15812 → 24755, matching temporary paths |
| L–M: exact Jobs Applied; company-only does not apply unrelated role | PASS: two specific supported roles; AI role remains unaffected |
| N: keyboard interaction | PASS on desktop: native dropdown Home/Down/Return and Escape/focus; additional restarted 720px physical keyboard BLOCKED as above |
| O: actual native 720×800 layout | PASS: verified bounds, real native render; not a native paint latency claim |
| P: temporary SQLite integrity | PASS: integrity ok, 0 FK violations, 0 orphan source references |
| Process death during import/preference transaction | NOT VERIFIED; injected rollback is distinct |
| Actual VoiceOver / native paint timing | NOT VERIFIED |
| Actual history, Gmail, live ATS, Chrome or paid APIs | NOT VERIFIED / prohibited |

## Performance

`performance.json` records single observations on Apple M4 / macOS arm64 / Node v24.12.0,
Vitest/jsdom MemoryRepository, at 20, 500 and the maximum 1,000 rows. Fixture construction is excluded.
Measured API boundaries are parse+normalization+fingerprints, reconciliation/reparse+preview binding,
and execution revalidation+transaction/audit. Timings are combined API work, not invented internal
phase timings, SQLite IPC, native paint or a speedup claim. Raw values are appended below.

## Remaining limits and requirements before real-history use

1. Only bundled synthetic file selection is exposed. Arbitrary local real files, authenticity,
   sender identity and external histories were not accessed or verified.
2. Selective provenance backup/restore must be implemented before real-history imports. Tracker
   markers alone fail closed; current JSON backup is not a complete history archive.
3. Complete batch undo is deferred. Corrections are conservative audited changes, not rollback of
   a committed historical batch. Resume/package-linked tracker changes require their existing flow.
4. No full process-death transaction test was added. SQLite injected rollback/reopen and ordinary
   full native restart are verified separately; the earlier crash-during-import gap remains.
5. Physical keyboard access in the restarted narrow window, actual VoiceOver and reliable native
   timing remain limited as specified. No broad accessibility/failure certification is claimed.
6. Reconciliation is deterministic and conservative, without fuzzy role/company normalization,
   email threading, external identity verification or passive/AI inference. Ambiguous same-day events
   need clearer source identity/review; older source entries cannot silently override newer evidence.
7. Before real-history use, review schema/privacy/backup retention, source authentication, recovery,
   larger actual-data semantics and the file-picker boundary under separate explicit authorization.
   Nothing here authorizes actual canonical-history access, email/OAuth, paid/live requests or later phases.

## Changed files

New: `historyContract.ts`, `historyImport.ts`, `historyFixtures.ts`, two synthetic fixture files,
`historyImport.test.ts`, `historyPersistence.test.ts`, `historyPerformance.test.ts` under
`src/lib/applications/`; `ApplicationHistoryPanel.tsx` and its test under
`src/features/applications/`; this report and `docs/application-history-evidence/phase2f4/`.

Extended: ApplicationsPage (reviewed import/provenance, protected historical status actions),
JobWorkspace/JobsPage (existing-history navigation and evidence), fitAssessment/fitFeed (proof-aware
reconciliation), jobImport (same proof and stale-review binding), both repositories (blank historical
date preservation), scoped CSS and `docs/job-automation.md`. No unrelated existing work was replaced.

## Final evidence and safety closure

| Synthetic rows | Parse/normalize/fingerprint ms | Reconcile/preview ms | Revalidate/transaction/audit ms |
|---:|---:|---:|---:|
| 20 | 6.671 | 15.350 | 12.442 |
| 500 | 44.787 | 230.802 | 250.882 |
| 1000 | 74.087 | 394.628 | 455.873 |

`final-safety.json` verifies integrity `ok`, foreign-key violations **0**, orphan history-to-application
references **0**, **23 unchanged jobs** and unchanged candidate/evidence/preferences/job states. All
pre-existing safety-record hashes remain identical. The pre-existing synthetic application is byte-for-byte
unchanged. There are **2 canonical applications**: that original fake record plus **1 explicitly reviewed
historical synthetic event**. Two accepted source entries and two audit/batch records represent that
corrected role receipt and separate unresolved company-only evidence. Reimport/cancellation added no event.
Only `fit-job-0` gained the intended exact historical reconciliation; all 23 fit scores/eligibility
states are unchanged and the Past Employer AI role remains NONE. Packages **0**, configured sources **0**,
AI reservations **0**, browser fill tokens **0**, real submissions/provider calls/discovery/email **0**.

The extra post-restart physical 720px keyboard check remains **BLOCKED** by `noWindowsAvailable`,
recorded in `native-input-limitation.json`; no lock diagnosis or successful foreground interaction is
invented. Actual desktop keyboard gestures passed earlier; actual narrow rendering/geometry passed.
All owned native processes are stopped. `cleanup.json` verifies branch/HEAD unchanged, no original dirty
paths missing, no native processes remaining and whitespace checks passed. No commit, push or deployment.

Evidence includes initial/final safety hashes, startup/path/native logs, source/correction and exact/
possible matching screenshots, cancellation and idempotent reimport, Applied feed before/after restart,
720px native renders/bounds, native actions, failed pre-fix accepted-classification regression, final
186-test log, the suspended-host failure log, lint/typecheck/build and raw performance observations.

Recommendation: continue only isolated Phase 2F.4 acceptance/review. Finish the additional physical
720px keyboard check when the window is available, and separately scope the selective provenance
backup/restore prerequisite before any actual-history import. No Phase 2F.5 or live/account work began.


Final namespace review added an explicit event-ID scope guard: namespaces/categories/source IDs
participate in provider event identity, so two different sources cannot collide merely because both
use event ID 1. Its new regression passes. Final verification is **186 tests / 11 files**, including
**62 new cases / 4 files**, lint/typecheck/build/whitespace PASS. Native workflows above ran on PIDs
15812/24755; the final guard affects nonempty explicit event IDs, which the retained fixture records
do not use. Final compiled-source PID **27481** reached `repository_verified` on the same temporary
database and restored the expected exact/uncertain Jobs state with unchanged record counts. The
unchanged GUI workflow was not repeated. All three owned native processes are stopped.


## Phase 2F.4.1 continuation (2026-10-16)

See [selective history recovery and keyboard closure](APPLICATION_HISTORY_PHASE_2F41_REPORT.md).
Selective synthetic backup/restore PASS; 122 focused tests, lint/typecheck and acceptance build
PASS. Native restored-state process restart PASS. Additional physical 720px keyboard closure
remains BLOCKED: macOS still reports locked on retry. Overall PARTIAL; no actual-history or
live operation is authorized by this result. Historical Phase 2F.4 evidence above is preserved.


## Phase 2F.4.2 — Native Keyboard Closure

2026-10-16. **BLOCKED; overall Phase 2F.4 acceptance remains PARTIAL.**
Branch `ui-ux-overhaul`, HEAD `7ba0dee`, all initial modified/untracked paths remain present.
No source code or recovery architecture changed; no competing coding task was started.

A console user session exists (`/dev/console` owner `athfan`). CUA returned an app inventory,
but native Finder window access failed with the exact error:
`Computer Use server error -10005: cgWindowNotFound`. This does not establish an unlocked,
interactive desktop. Native window interaction is unavailable through the existing facility.
The check stopped at this prerequisite; no acceptance application was launched and no bypass,
permission grant, credential entry or repeated window attempt was made.

Actual acceptance window identity/bounds at 720×800: NOT VERIFIED. Physical keyboard
input mechanism/workflow, focus/scroll order, correction, cancel/reopen/confirm, provenance
inspection, return navigation and new restart persistence: NOT VERIFIED in this attempt.
No keyboard event, AXPress, pointer action or screenshot is presented as success.
VoiceOver speech remains NOT VERIFIED. No product defect was reproduced or fixed.

No database was opened or mutated in this attempt. SQLite integrity, foreign keys and
post-import invariants were therefore not rerun; prior Phase 2F.4.1 PASS evidence remains
historical. No tests/builds were repeated, as no source change was required. Whitespace
check passed. No native process was started or stopped. No production data, real history,
live job/API/account/browser/submission operation or security setting change occurred.

Evidence: [desktop check](application-history-evidence/phase2f4/phase2f42-desktop-check.json).
Remaining prerequisite: a genuinely usable native desktop/window through existing authorized
controls, followed by the specified measured 720×800 physical-keyboard workflow.
Do not close functional UI acceptance on this result.


### Phase 2F.4.2 resumed check — 2026-11-08

**BLOCKED; overall acceptance remains PARTIAL.** Fresh native CUA access to Finder
returned the Desktop AX tree and its focused container. The previous inaccessible-desktop
condition was not reproduced. This establishes desktop observation, not acceptance-window
keyboard delivery. ChatGPT/Codex was not controlled.

Before launch, the documented disposable destination
`/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-_gd093xw`
was checked and **does not exist**. The retained packaged Acceptance app exists and its
Info.plist identifier is `com.mirathfan.careercompiler.acceptance`. Its presence alone does
not establish database isolation. No replacement directory/database was created, no retained
backup source was used for mutable UI work, and no app was launched. The saved scope requires
existing verified synthetic infrastructure and fail-closed behavior; this attempt stopped
at that missing prerequisite.

Actual acceptance window dimensions/identity, physical input, correction/cancel/reopen/confirm,
focus/scroll/navigation and resulting data invariants remain NOT VERIFIED in this attempt.
No keyboard, AXPress or pointer action was delivered to the product. No screenshot was taken.
No database was opened, so integrity/FK checks were not newly executed. No source fix or test
rerun was needed. Documentation whitespace check passed. All initial dirty paths remain
present; branch `ui-ux-overhaul` and HEAD `7ba0dee` are unchanged. No native process was
started or left running by this attempt. No security/permission/account change, production
data access, paid/live operation, commit, push or deployment occurred.

Evidence: [fresh prerequisite checks](application-history-evidence/phase2f4/phase2f42-resume-2026-11-08.json).
Remaining blocker: restore or separately authorize preparation of a disposable synthetic
acceptance environment before launch; do not silently recreate or replace the preserved source.


### Phase 2F.4.2 — fresh isolated environment, 2026-11-08

**BLOCKED; overall acceptance remains PARTIAL.** New chat “Resume CareerCompiler
acceptance” (`01a1bc5b-393c-72e9-8ded-cbf2c380a01d`) started prerequisite work.
Both prior project coordination/review chats were idle. The previously denied OS
process listing was not retried; absence of every OS process is not established.
Finder Desktop AX was available; no ChatGPT app control occurred.

The user explicitly authorized a fresh isolated synthetic destination. The existing
preparation script created a new marked temporary root at
`/private/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/careercompiler-native-njftnnrk`.
A new empty `native.sqlite3` was created there without reading or copying any retained
source, backup or production data. SQLite reports the exact destination, integrity
`ok` and zero foreign-key violations. These are empty-database checks only: schema
initialization and synthetic fixture population remain incomplete.

The retained Acceptance bundle identifier was verified. Launch with its fixed-path
root, UI and Jobs fixture flags failed with exit 126, `permission denied`. The
packaged Mach-O executable has mode 0600 (no execute bit). No permissions were
changed and no alternate launch was attempted. Native bootstrap therefore did not
run. The local Vitest executable is also absent, preventing immediate reuse of the
Node fixture harness without dependency preparation.

No native process started, no keyboard events were sent, and no screenshot or
720×800 measurement was obtained. Correction, cancellation, reopening, confirmation,
focus/navigation and import invariants remain NOT VERIFIED. No product defect was
reproduced or fixed; no historical test pass was relabeled as a new run. No test
suite, dev startup or build completed in this attempt. A recurring automation was
not verified or created.

All 753 initial modified/untracked file hashes matched before this report append;
branch `ui-ux-overhaul` and HEAD `7ba0dee` remain unchanged. Existing backups were
untouched. No push, deploy, deletion, security setting change or live action occurred.
Evidence: [fresh environment and launch blocker](application-history-evidence/phase2f4/phase2f42-fresh-environment-2026-11-08.json).


## Phase 2F.4.2 — Native Keyboard Closure, Sprint 2.5 continuation

November 11, 2026: **FUNCTIONAL NATIVE ACCEPTANCE PASS** in the fresh Sprint 2.5 copy.
Independent CoreGraphics measurements confirm 720×800 points. Native `app.pressKey`
completed import, original-source inspection, missing-role correction, Escape/cancel,
reopen, explicit confirmation, exact/possible/conflicting match inspection, provenance,
return navigation and restart. AX Raise only foregrounded the test window; no AXPress
or pointer product activation was substituted. This is tool-delivered native keyboard
acceptance; human hardware input and VoiceOver speech remain NOT VERIFIED.

All 40 synthetic SQLite tables were unchanged after cancellation and before Apply.
Approval created one corrected application plus its entry/audit/batch. Existing rows
and safety groups were unchanged; restart retained all hashes, integrity was ok and
foreign-key violations were zero. No product fix was necessary. Tool interruptions
during later inspection, native focus-boundary details and exact A–K evidence are
documented in [Sprint 2.5 report](SPRINT_2_5_REPORT.md#c-phase-2f42).

Evidence: [current bounds](application-history-evidence/phase2f4/sprint2-5/native-window-bounds.json),
[native assertions](application-history-evidence/phase2f4/sprint2-5/native-verification.json),
[keyboard transcript](sprint2-5-evidence/native-keyboard-transcript.json).
All historical evidence above is retained. PDF runtime, Rustfmt and Clippy remain
separate environment blockers; see the current report. Original and prior development
workspaces were untouched.
