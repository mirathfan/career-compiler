# Job Search Automation

CareerCompiler can poll configured public Greenhouse, Lever, and Ashby boards, normalize published postings, deduplicate them, apply deterministic eligibility rules, and calculate an explainable local score. No application is submitted by this system.

## Workflow

1. Add an unauthenticated public ATS source in **Job Radar** and test it before saving.
2. Configure target roles, locations, workplace preference, job age, score threshold, exclusions, keywords, skills, and per-run caps.
3. Run a search manually. If automation is explicitly enabled, CareerCompiler also runs once on launch when the last run is overdue.
4. Each source is fetched independently. Malformed jobs and failed sources are recorded without ending the run.
5. Provider ID, canonical URL, exact normalized identity, content hash, and conservative repost similarity are checked in that order. Duplicate reasons are stored.
6. Eligibility rules run before scoring or any future AI call. Closed, previously applied/rejected, excluded, ineligible, or too-old jobs are filtered locally.
7. Eligible jobs are scored out of 100: title/seniority 25, skills 25, experience 20, location/workplace 10, project/evidence relevance 10, and recency 10.
8. Strong jobs appear in **Match Inbox**. Resume generation links into the existing evidence-grounded Tailor Resume flow.
9. **Application Queue** requires a selected exported resume with no blocking validation errors before package approval. Approval creates or updates an existing application-tracker draft.
10. The browser extension can fill an approved package and upload its authorized PDF, but stops before final submission. Opening a page never marks a job applied.

## Optional AI match analysis

Discovery, filtering, and deterministic scoring still work without an API key. AI matching is disabled by default and never runs as part of an ordinary discovery run. From **Job Radar** or **Match Inbox**, a user may enable it and approve a single job, a selection, or the qualified queue. The confirmation identifies the request count, live/mock provider, selected model, per-run cap, and current daily use before any request starts. Overlapping batches are rejected, pending work can be cancelled between jobs, and unchanged valid results are skipped unless the user explicitly requests reanalysis.

The request uses the existing OpenAI Responses API and Structured Outputs path. It contains normalized public job fields, the deterministic decision/score, non-sensitive preferences, and a bounded packet of relevant enabled skills, career-item IDs, verified or user-provided facts, metric tokens, and known resume-profile IDs. Prohibited, disabled, or needs-review facts, contact information, private notes, repository-only notes, and the application answer vault are excluded.

The local validator checks the schema, 0–100 score, all referenced IDs, selected profile, qualification separation, unsupported numbers, hard-reject reasoning, explicit sponsorship language, and accidental contact data. A semantic validation failure receives exactly one repair request containing the original structured result, issues, schema contract, and original evidence packet. A failed repair is recorded but never becomes an accepted analysis.

The active score is 70% deterministic and 30% validated AI by default; the normalized weights are configurable. Missing, invalid, failed, deterministic-only, or stale AI output contributes nothing, so the deterministic score remains active. Deterministic hard rejects cannot be removed. Match Inbox displays all three scores, the analysis state, prompt/model/date, repair status, qualification lists, evidence IDs, and immutable history.

When material provider content changes, CareerCompiler preserves the prior audit, marks AI analysis stale, clears its score contribution, and requires reanalysis. Analysis history includes original/repaired output, validation issues, call metadata and available token usage, evidence IDs, duration, errors, trigger, prompt, model, and timestamp.

## Scheduling and limits

The default interval is 24 hours. Runs never overlap, use configured job/resume caps, and retry a provider request at most once by default. Desktop scheduling works only when CareerCompiler is open; launch catch-up does not make the Mac app a background/cloud service. `src/lib/job-automation/runner.ts` is independent of React so a future local daemon or cloud worker can reuse it with another repository and transport.

## Notifications

Run summaries group high matches, source failures, and prepared packages. The current UI shows these grouped in Job Radar. Native macOS notification delivery is intentionally deferred so notification permissions cannot make discovery unreliable.

## Automatic resume preparation

Automatic threshold-based resume preparation remains disabled and deferred. The stored policy defaults are manual mode, an 80 combined-score threshold, three resumes per run, five per day, valid AI required, and package approval required, but this milestone does not execute that policy. Resume generation continues through the existing explicit **Generate Resume** / Tailor Resume flow, including evidence validation, numeric validation, one-repair limit, XeLaTeX, one-page checks, and ATS text checks. Every application package still requires separate user approval.

## Known limitations

- Manual URL and email-import source types are represented in the schema but are saved through existing explicit/manual job capture; there is no generic scraper.
- AI batches are initiated only while the desktop app is open; there is no cloud scheduler.
- Structural provider/schema failures are terminal for that attempt; the one repair is reserved for a parsed structured response that fails semantic validation.
- Automatic resume preparation is not executed. Resume generation remains an explicit Tailor Resume action.
- CareerCompiler cannot detect a job closing between polls unless a provider omits it in a later run; closed-post reconciliation is a future milestone.
- The application queue supports the existing extension architecture rather than submitting through ATS APIs.

## Stabilization and isolated acceptance (2026-10-13)

Evidence packets filter parent eligibility before selecting child facts: disabled,
missing, sensitive, or packet-excluded parents cannot contribute facts. Children
must independently be enabled and verified/user-provided. Parent selection is
bounded before child selection so every supplied fact has a supplied parent.

AI batches acquire the runtime guard synchronously before repository reads and
retain it through persistence and cleanup. Overlapping starts reject rather than
queue. Each attempt writes an immutable running reservation before provider work;
the terminal audit carries the same `attemptId`, so daily usage counts one attempt,
including failed or interrupted attempts, rather than two audit rows. Cancellation
stops between jobs and does not refund reservations or interrupt an in-flight call.
Storage failures release the guard, retain consumed capacity, and reset running
states to deterministic fallback where possible. The next explicit start recovers
remaining interrupted states; no work resumes automatically. The daily boundary
is UTC, consistent with existing history timestamps. A repair is part of the same
analysis attempt and can make a second provider request.

Package resume changes revoke approval before tracker changes. The package service
records approval/replacement IDs and prior approval timestamps in existing tracker
status history, synchronizes the draft resume, and approves only after all related
writes succeed. Submitted tracker records are immutable through this service.
Both repositories defensively clear approval on resume replacement. Extension
preparation and fill/edit acknowledgements require current approval when a package
exists; package preparation selects exactly that package's resume, with no fallback.
Approval is rechecked before returning prepared fields. Browser payload authorization now requires a specifically approved package; manual
applications without packages must create and approve one before browser autofill.

Acceptance must use a disposable macOS account/VM or the verified fixed-path native
acceptance configuration described in `NATIVE_ACCEPTANCE_REPORT.md`. Use synthetic
records, mock AI, disabled discovery, and no production database or Keychain
credentials. Chrome testing requires a separate browser profile. Confirm the actual
database path before loading any fixture; changing only shell `HOME` is not sufficient
evidence of native path isolation. Verify:

1. Packaged/dev startup with fresh isolated SQLite and all discovery sources disabled.
2. Parent exclusions and mock AI analysis, single repair, simultaneous batch starts,
   daily/per-run caps, cancellation, storage failure, and app restart after interruption.
3. Immutable reservation/terminal audit pairs count once across restart; interrupted
   attempts retain capacity and require explicit reanalysis.
4. Approve resume A, replace with B, restart, confirm tracker B and revoked approval;
   Chrome preparation must fail until B is approved, then authorize only B's PDF.
5. Submitted resume lineage and audit history survive package changes and failures.

Phase 2B now uses durable SQLite reservation accounting and native `BEGIN IMMEDIATE`
transactions on a single retained connection. Separate processes share the same daily
cap. Daily usage counts reserved analysis slots; one slot allows at most two attempted
calls including repair. Provider cost remains unknown, and failures/interruption never
refund capacity. A one-hour active-job lease prevents concurrent ownership; UTC defines
the daily boundary. Native dispatch records the attempt before HTTP and checks current
reservation/job/day/preferences. The acceptance build omits that HTTP capability.

Package selection/revocation, tracker references/history, job state, revision and
append-only package audit writes commit or roll back together. Direct tracker resume
edits that disagree with a package are rejected; use Application Queue to replace and
reapprove. Meaningful job-content/requirements, location or compensation updates revoke
approval and archive/invalidate analyses. Formatting-only and source tracking changes
preserve approval. Evidence inheritance also applies to deterministic scoring.

Chrome handoff uses protocol 2: prepared payloads have a 60-second single-use token bound
to extension/page, package and approval revisions, semantic job content and SHA-256
resume/payload fingerprints. The application consumes/rechecks the token before browser
fill; stale, expired, tampered and replayed requests fail. Already-delivered browser data
cannot be recalled, and a consume-to-DOM race remains. Installed Chrome testing needs a
separate isolated native host/bridge because acceptance deliberately disables IPC.

See `NATIVE_ACCEPTANCE_REPORT.md` for actual packaged harness, process-interruption,
two-process cap and routed UI evidence. Continued mock acceptance is GO; live OpenAI
and real autofill remain NO-GO. Reproduce isolated setup with
`scripts/prepare-native-acceptance.py`; build with the returned `tauri.acceptance.json`
and launch only with its marked `CC_ACCEPTANCE_ROOT`. `CC_ACCEPTANCE_UI=1` mounts the
normal product UI using the verified temporary repository and forced mock runtime.
`CC_ACCEPTANCE_BUDGET_PROBE=1` / `2` launch the synchronized budget probes, and
`CC_ACCEPTANCE_INTERRUPT_PROBE=1` stages uncommitted synthetic writes for process-death
rollback testing. Never use these variables with the production identifier.


## Phase 2C isolated extension acceptance

`scripts/phase2c/` creates an unregistered test host, empty disposable browser directory,
loopback-only extension artifact and synthetic forms. `CC_ACCEPTANCE_BRIDGE=1` enables
an acceptance-only IPC listener; the normal bridge/credentials/registrations remain
untouched. Browser commands are limited to preparation, authorization and acknowledgement
against exact loopback fixture URLs. No paid/discovery/submission capability is added.

Actual framed stdio/socket/app/SQLite tests passed positive and negative authorization,
interruption, busy-lock recovery and native restart cases. **These are not Chrome native
messaging tests**: no extension was loaded or host registered. See the report for blockers.

A production correctness defect was reproduced: payload SHA-256 currently depends on
JSON key insertion order, while Rust native transport can reorder keys. The transport
acceptance script records this as FAIL and exits 1. Test-only raw JSON forwarding avoids
that transformation; production hashing was not changed under the constrained scope.
Canonical payload hashing and cross-serialization regression require a separately
authorized production change before installed autofill acceptance. Live APIs remain NO-GO.

The combined IPC/jsdom fixture also reproduced unsupported country inference: a city-only
synthetic profile is assigned United States without country evidence. That diagnostic
returns FAIL/exit 1. The production country resolver remains unchanged and is another
NO-GO reason; file attachment is BLOCKED in jsdom rather than claimed as Chrome success.


## Phase 2D correctness and authorization

Protocol 3 and `cc-json-sha256-v1` now protect prepared payloads using the shared production
canonical JSON module. Rust key reordering is exercised by test IPC; equivalent object keys
hash identically while arrays, values, types and null/missing retain their defined meanings.
Legacy/unversioned tokens fail closed; existing resume/package record fingerprints retain
their prior contract. Candidate-answer inputs are also bound to durable authorization.
Preparation uses a SQLite snapshot, and changed claims/sensitive/evidence inputs reject old
prepared answers.

Country now requires explicit reviewed country claims; city, region and phone do not imply
country, nationality, citizenship or immigration status. Uncertain/conflicting country or
legal answers remain unresolved. Popup/worker sender identity/context and actual tab/destination
checks precede actions; native/app origin and reviewed destination rules also fail closed.
Manifest permissions remain unchanged; unsupported sites are rejected at runtime.

File preparation, attachment and verification are distinct states. Missing/interrupted file
APIs return partial errors, preserve independent successful fields, avoid duplicate mutations,
and require fresh authorization for retry. Incomplete fill is not acknowledged as completion.
Controlled file simulation is not genuine Chrome upload.

See `NATIVE_ACCEPTANCE_REPORT.md` for actual passing Phase 2D transport/native results and
`CHROME_ISOLATED_INTEGRATION_PLAN.md` for the documentation-only approval gate. No Chrome
extension/host was installed or registered. Genuine Chrome, real autofill and live OpenAI
remain outside the verified/authorized scope; visible UI retest was blocked by the locked Mac.

## Phase 2D.1 evidence freshness and PDF provenance

Completed analyses now persist `cc-match-evidence-v1`: the bounded job-specific packet plus
local reviewed parent/fact provenance. Relevant item/fact/skill mutations invalidate dependent
AI and package approval transactionally; authoritative match reads also reconcile legacy/direct
writes. Historical outputs remain auditable; no invalidation calls a provider or consumes budget.
Cosmetic display order and UI-only settings do not alter this contract. Supporting references
are persisted reviewed data, not permission to crawl external files or URLs.

Approval records contain `cc-pdf-sha256-v1` byte provenance, in addition to resume-record hashes.
Approval/reuse verifies a bounded native snapshot, SHA-256 and readable one-page PDF. Missing,
changed or legacy path-only provenance requires fresh approval. Native delivery checks the
expected digest and uses one verified buffer; browser tokens bind that digest. Consumption
failure commits revocation/rejection and cannot be undone by restoring/reapproving the PDF.
Stale AI cannot justify approval; an explicit deterministic-only choice removes AI justification
without generating anything. Source-file checks are on sensitive reuse, not a filesystem watcher.

Protocol remains 3 and canonical payload hash `cc-json-sha256-v1`. See the Phase 2D.1 report for
334 frontend / 35 Rust / 12 Python passes and actual 16-scenario native plus restart evidence.
No genuine Chrome integration, live provider, production records or submissions were exercised.

Evidence invalidation also recomputes the deterministic score/filter from current evidence,
clears AI-only rejection/recommendation fields and restores eligible filtered-out jobs for
explicit review. Current deterministic exclusions remain enforced.

## Phase 2F.1 local personalized feed

Jobs now consumes a separate deterministic `cc-job-fit-v1` snapshot through `loadFitFeed`.
Eligibility (eligible / needs confirmation / disqualified) is separate from local ranking;
unsupported or ambiguous requirements are never converted into legal confidence. Full local
evidence uses shared privacy/inheritance rules without remote prompt caps. Remote AI caps,
request approval, budgets, immutable audits, package approval and PDF/browser provenance remain
unchanged. No model runs on feed/detail display.

Reviewed jurisdiction-scoped eligibility declarations use an explicit user-confirmed locked
`job_fit_eligibility` claim, saved transactionally with stale-review checks. This does not update
application answers automatically. `job_fit` safety records cache local assessment fingerprints;
job/evidence changes revalidate on authoritative read, without background polling. Exact versus
possible application history is reconciled conservatively, including conflicting requisitions.

Use `/#/preview?scenario=fit` for an ephemeral all-synthetic preview. Native acceptance additionally
supports `CC_ACCEPTANCE_UI=1 CC_ACCEPTANCE_JOBS_FEED=1` only with a marked fixed-path acceptance
root and acceptance identifier. See `JOBS_FEED_PHASE_2F1_REPORT.md` for actual results and blocked
native visual acceptance. These modes grant no live provider/discovery or Chrome capabilities.

## Phase 2F.2 local job import

Jobs → Add a job now provides a transient URL/text/named-fixture preview, complete source text,
reviewed corrections, the existing deterministic fit/evidence inspector, conservative duplicate
and application-history review, then explicit transactional Save. URL parsing never fetches:
only four exact synthetic fixture mappings provide content; other recognized URLs require a
manual description. No source polling, provider request, application, package or browser token
is created by import. Original text and correction provenance persist separately on the job.

See `JOB_IMPORT_PHASE_2F2_REPORT.md` for the 67 focused tests, actual packaged keyboard/narrow UI
and save/restart evidence, parser limitations and deferred live retrieval/security boundaries.

Phase 2F.2.1 advances local fit snapshots to `cc-job-fit-v2`: shared exact section-heading
recognition, mandatory/preferred context, explicit professional duration categories, positive-only
internship/project equivalence and conservative unknown category/schedule handling. Old local fit
caches recompute; job semantic fingerprints, candidate evidence, AI/package/PDF/browser contracts
are unchanged. See the appended import closure report for 121 focused passes and actual every-stage
native cancellation plus complete 720px keyboard correction. Kill-during-import, VoiceOver speech
and native timing remain unverified; no live retrieval/provider permission is added.

## Phase 2F.3 explicit Jobs preference refinement

Jobs reuses `rejected` for skipped postings; a transactional `job_skip` safety record adds the
explicit reason, note, previous status, decision/requisition revision and confirmation provenance.
No passive browsing signals are collected. An optional, separately confirmed `job_preference`
record refines feed priority only. Existing profile/Candidate Brain search preferences are not
silently rewritten: their broad aggregates lack per-decision provenance, enablement and revisions.

`cc-job-preference-v1` supports exact city/region components, arrangement, exact role title,
annual same-currency compensation minimum and explicit technology/domain text. Missing or ambiguous
information contributes no adjustment. Per-category alternatives contribute +3 for alignment or
−6 for known mismatch/avoidance, globally bounded to −18…+9. Technical fit is retained unchanged;
priority is separately clamped to 0…100 and never creates a score from unknown fit. Eligibility and
application-history gates still run before recommendation sorting. Explanations and the preference
fingerprint accompany each row. Preference changes recalculate ranking on query invalidation/read.

Skips/restores and preference edits/enablement/removal/restoration use existing SQLite transactions
and append before/after audit snapshots under `job_preference_audit`. Removed scopes remain
restorable; conflicting duplicate scopes reject. No schema migration, provider, discovery,
application-history, package approval or browser-authorization capability was added. See
`JOB_PREFERENCES_PHASE_2F3_REPORT.md` for newly executed checks and native acceptance limitations.

## Phase 2F.4 reviewed synthetic application history

Applications → Import synthetic history selects bundled CSV/JSON fixture files through the existing
named-fixture isolation pattern. It does not open arbitrary files, read email, follow URLs or call
providers. Native file-read commands were inspected but cannot restrict selection to synthetic data,
so they are deliberately not used or broadened. All rows initially Skip; transient corrections and
explicit reconciliation choices require a refreshed dry-run and final confirmation.

`cc-synthetic-history-v1` preserves source namespace/row identity, original values, normalized fields,
source-content and record fingerprints. Evidence is confirmed, possible, unresolved or not an
application. Company-only evidence stays unresolved. The existing tracker remains canonical: only
accepted identifiable applications create/update tracker rows; evidence-only records stay separate
from application state. Distinct requisitions and submission events are retained; possible/conflicting
matches are never silently merged. Historical date gaps remain blank rather than becoming today.

Existing SQLite transactions atomically write tracker, `application_history_entry`, append-only
service audit and idempotence batch records. Reviewed plans bind source/corrections/actions plus
current tracker, saved-job identities and accepted entries; stale plans fail closed. Jobs uses the
existing exact/possible reconciliation and additionally requires durable source proof consistent
with imported tracker identity before showing an exact Applied match. Missing or inconsistent proof
remains uncertain. Technical fit, eligibility, preferences, job state, packages, PDF and browser
approval are unchanged. Reimport labels distinguish raw source classification from the accepted
reviewed classification.

Conservative corrections preserve source/audit and remove erroneous exact confirmation; they are
not complete batch undo. Current JSON backup does not export these safety-table provenance records;
full selective history backup/restore is a prerequisite before real-history use. Restoring tracker
markers alone cannot establish an exact Applied match. See `APPLICATION_HISTORY_PHASE_2F4_REPORT.md`
for schema, executed checks, native evidence and remaining limitations. No real history access or
future email/browser integration is authorized by this increment.
