# CareerCompiler Native Acceptance Report

Date: 2026-10-14 (America/Chicago)
Branch: `ui-ux-overhaul`; base commit `7ba0dee`. All changes remain uncommitted.

## Phase 2D.1 — evidence invalidation and PDF provenance (2026-10-14)

**GO for continued isolated/mock acceptance. NO-GO for live OpenAI or real autofill.**
This section supersedes the two evidence/PDF correctness blockers in the historical
Phase 2D sections below. Genuine Chrome installation/registration remains unexecuted and
requires separate approval. Branch remains `ui-ux-overhaul`, base `7ba0dee`; all current
modified/untracked work, including concurrent UI work, is preserved. No commit or push.

### Root causes and authoritative contracts

**Completed evidence freshness:** batch reuse checked only job content. The review binding
already protected a pending/in-flight request, but its evidence fingerprint was not persisted
on a completed analysis, and evidence mutations did not invalidate completed records.

`cc-match-evidence-v1` now hashes the actual bounded job-specific evidence packet plus
persisted provenance for supplied facts/parents: parent type, title, employer, location,
dates/current state, descriptions and references; fact statement, eligibility/enabled state,
tags, numeric claims, importance, source type/reference/note, verification/review dates and
reviewed notes. Eligibility and sensitivity filtering determine packet membership, including
newly eligible evidence. Fingerprints are local only: supporting notes/references are not
added to model requests. Timestamp fields and cosmetic display order are excluded; parent
selection now uses deterministic ID order so rearranging UI cards cannot change the packet.
Irrelevant excluded evidence that does not affect the packet does not invalidate it.

Both production SQLite and memory repositories reconcile completed analyses on authoritative
`getJobMatch`/`listJobMatches` reads. Career-item/fact/skill saves/deletes run in a transaction
with invalidation and history; reads also detect raw SQL/import/legacy writes. Native SQLite
uses the existing retained connection and `BEGIN IMMEDIATE` boundary, serializing concurrent
writers/read validation. Changed or missing/version-incompatible fingerprints archive the
prior analysis, mark the current record stale, remove AI score/recommendation/qualification
contribution, and revoke dependent package approval. Historical accepted output is retained
as audit data. No provider call or new reservation is made by invalidation. In-flight acceptance
also compares persisted provenance, not only displayed packet text.

**PDF provenance:** prior approval hashed resume JSON and its export path; file bytes could
change while both remained identical. `cc-pdf-sha256-v1` now records SHA-256 and byte length
in the durable approval revision/audit. Approval and sensitive reuse request a bounded native
snapshot (maximum 5 MiB), recompute its digest in the frontend, parse the same bytes with
pdf-lib, and require an unencrypted, readable one-page PDF. Missing/unreadable/corrupt files
fail closed. Legacy path-only approvals require explicit reapproval; no existing record is
silently upgraded. Resume-record fingerprint semantics remain compatible.

Native browser-file preparation requires the expected approved digest, reads the source once,
and rejects mismatching bytes. It creates an exclusive private copy and returns inline bytes
from that verified buffer; it does not reopen the source for delivery. Tokens/payloads bind
PDF digest in addition to existing job/resume/package/approval/candidate/answer-policy bindings.
PDF failure observed during token consumption commits approval/tracker revocation and rejected
token state before returning the error, rather than rolling that security state back. Restoring
the original bytes or reapproving cannot revive that rejected token. Already consumed capacity
and tokens are never refunded/reset.

### Production changes

- `evidenceFreshness.ts`, `evidencePacket.ts`, `aiTypes.ts`, `aiBatch.ts`, `batchReview.ts`:
  versioned evidence contract, completed/in-flight checks and deterministic packet selection.
- `sqliteRepository.ts`, `memoryRepository.ts`: authoritative transactional reads/mutations,
  conservative legacy handling, package invalidation and immutable history.
- `pdfProvenance.ts`, `applicationPackages.ts`, `safety.ts`: parsed byte provenance, approval
  revision binding, stale-analysis approval gate and current-file reuse checks.
- `fillAuthorization.ts`, extension protocol/request processor: expected PDF digest, payload
  binding, durable rejection/revocation and single-use behavior.
- Native `extension_bridge.rs` and command registration: bounded snapshot reader and
  digest-checked one-buffer delivery. No new Chrome permissions/host registrations.
- Isolated bridge/harness adjusted to use the same expected digest contract; harness explicitly
  selects deterministic-only justification before reapproving a job with stale AI. It does not
  bypass the new gate or spend a new analysis reservation.

Existing safety-record JSON gains additive version/fingerprint fields; no schema migration,
production database or credential access was needed. Historical revisions remain immutable.
Old analyses become stale on validation; old approval/token provenance fails closed.

### Dependency model

| Change | Completed AI | Package/approval | Prepared browser authorization |
|---|---|---|---|
| Relevant stored evidence/provenance | Stale; archive; AI contribution removed | Revoke dependent approval; current evidence review required | Reject against current package/candidate/evidence binding |
| Meaningful job requirements/content | Existing job invalidation remains | Existing atomic revocation remains | Reject job/revision mismatch |
| Resume record/selection | AI unchanged unless evidence changes | Existing replacement/revision revocation | Reject resume/revision mismatch |
| PDF bytes at same path | AI unchanged | Fail sensitive gate; require fresh approval; detected consumption revokes | Reject digest/approval mismatch; rejected token cannot revive |
| Cosmetic order/UI-only preferences | Preserve valid AI | Preserve approval | Existing answer-input binding can conservatively reject changed candidate metadata |

Package approval cannot use stale AI justification: the service and repository approval
boundary reject a stale analysis. An explicit deterministic-only choice removes AI justification;
resume selection, validation, PDF verification and separate approval still apply. No automatic
resume generation, reanalysis or submission was introduced.

### Regression and acceptance evidence

Two new frontend files contain **29 regression cases** covering fact edits/disabling,
parent disabling, employment/education details, eligibility/sensitivity, supporting reference
removal and reviewed corrections, cosmetic order/settings, missing/unknown legacy provenance,
SQLite restart/direct writes, concurrent edit/read ordering, rollback on history failure,
unchanged/changed/missing/permission-denied/corrupt PDF contracts, old tokens/reapproval,
evidence→package→tracker→handoff consistency, exact native snapshot digest and PDF parsing.
Permission failures are mocked at the frontend boundary and actually exercised in native Rust.
Two additional evidence regressions reproduced stale AI-only rejection and missing current
deterministic rejection. Invalidation now recomputes local score, matched IDs, eligibility,
warnings and job classification; stale AI cannot keep a job filtered out, while genuine
deterministic exclusions remain enforced.
Two new Rust tests cover real temporary filesystem missing/corrupt/unreadable/same-path bytes
and concurrent replacement; any successful read has the expected digest, never replacement bytes.

The initial evidence regression run reproduced **8 failures / 1 pass** before the fix.
Intermediate failures from changed approval semantics and test hook cleanup were corrected;
no failures were suppressed. Explicit synthetic PDF-reader mocks in unit setup support existing
fictional-path fixtures; they are not used by the native acceptance app. Actual native parsing,
file changes and SQLite are exercised below.

| Scenario | Result | Evidence |
|---|---|---|
| Final packaged native harness | PASS | 16 scenarios; `phase2d1/final-stage-one.json` |
| Same-path PDF replacement / stale token | PASS | Actual native snapshot and synthetic PDF rewrite; consume rejected, approval/tracker revoked; restore/reapprove cannot revive token |
| Evidence correction / stale completed analysis | PASS | Actual SQLite mutation removed AI influence and approval, preserved accepted history and unchanged reservation count |
| Full process restart | PASS | 2 scenarios; new PID, persisted stale analysis, verified PDF approval, 11 tracker history events and daily usage 3 |
| Failed file reads / concurrent replacement | PASS | Real temporary Rust filesystem tests plus frontend/native parser regressions; no false completion |
| Isolated dev startup | PASS | Actual product app startup, temporary SQLite path verified in `ui-startup.json`; no further GUI workflow claim |
| Genuine Chrome/real FileList upload | NOT VERIFIED | Not executed or authorized; no extension installed or host registered |
| Phase 2D GUI workflow repeat | NOT VERIFIED this phase | Deliberately not repeated; historical actual GUI results remain below |
| Live OpenAI/ATS/real application | NOT VERIFIED | Explicitly prohibited |

Complete verification: **334 frontend tests / 47 files**, **35 Rust tests**, **12 Python tests**
passed; lint, typecheck, Rust formatting, Clippy with warnings denied, extension build,
acceptance/ordinary production builds, isolated dev startup and whitespace checks passed.
Counts include preserved concurrent UI work. The existing Vite >500 KiB warning remains.
The ordinary production bundle was built and never launched. Logs/results are under
`docs/native-acceptance-evidence/phase2d1/`; no PDF bytes/database backup/full browser payload
was copied into the report evidence directory.

### Process isolation

Exact tested SQLite path:
`/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-z27ya7ee/native.sqlite3`.
It was absent before launch in the direct marked temporary root. The packaged acceptance
identifier was checked as `com.mirathfan.careercompiler.acceptance` before execution.
Startup PIDs were 8021 (initial), 8356 (restart), 9269 (isolated dev); each startup recorded
the actual fixed SQLite URL. The artifact records `PRAGMA database_list`, integrity/FK checks
and zero submitted trackers. Only synthetic records/PDFs and mocked ATS/AI were used.
The acceptance command registry has the bounded PDF reader but omits paid provider, Keychain,
production SQL-plugin, live discovery and normal browser bridge capabilities. Its PDF reader
allows only the two explicit synthetic fixture paths and rejects symlinks. Root/marker guards
remain enforced. Isolated UI startup forces mocks and disables scheduler/extension polling.
Owned native/dev processes were stopped. No production file/database inspection, notifications,
real browser autofill, application submissions, account/model changes or installation occurred.

Final-code native rerun after the rejection-flag regression: **16 PASS + 2 restart PASS**,
at temporary root `careercompiler-native-bez30pxm/native.sqlite3` under the same temp parent
above, with recorded initial PID 11562 and restart PID 12106. Final-code artifacts/logs
are prefixed `final-` or suffixed `-final`; final SQLite integrity/FK/submission checks passed.
Both final processes were stopped. The earlier root also remains preserved as synthetic evidence.

### Remaining limitations and readiness

- Current file verification is a sensitive-boundary check, not an external-file watcher. Cached
  UI snapshots can remain visible until query refresh; authoritative decision/approval/handoff
  reads revalidate. Cross-process pixel updates are not claimed to be instantaneous.
- Supporting evidence means persisted reviewed facts/source references/notes; arbitrary referenced
  URLs/files are not crawled or reopened. External supporting-file edits require explicit reviewed
  import/update to become candidate evidence. PDF byte integrity does not prove semantic resume accuracy.
- Filesystem and SQLite are not one atomic resource. A source can change after the final check;
  delivery uses the already verified buffer, so changed bytes are not substituted. Later ACKs
  recheck the source. Snapshot copies are not claimed to resist a malicious same-user filesystem
  actor; genuine Chrome/manual selection still needs digest/attachment acceptance. Already delivered
  browser content cannot be recalled.
- Preparation/ACK errors can roll back their surrounding transaction; current provenance is still
  checked at every subsequent gate. Consumption rejection specifically persists revocation/rejected
  state. No successful completion is written on a failed check.
- Native bracket/bounds validation is supplemented by frontend PDF parsing. Direct native file
  authorization alone is not approval authority; the application revision/digest/token gates remain required.
- Genuine Chrome sender metadata, native messaging and real DataTransfer/FileList behavior remain
  unverified. No change to Chrome permissions or registration was made. Broad pre-existing permissions,
  jurisdiction-specific legal-answer modeling, and older synthetic migration/production SQL-plugin
  coexistence acceptance remain separate review/testing work.
- Reserved analysis slots are not USD billing protection; real provider transport/cost remains untested.

Both requested local authoritative correctness gaps are now guarded and covered by synthetic/native
regressions. Installed Chrome integration is ready only for separate plan review and explicit execution
approval; this task does not grant that approval. Live API or real autofill remains **NO-GO**.

## Phase 2D closure evidence — 2026-10-14

This section supersedes earlier counts below; earlier observations remain historical.
Branch `ui-ux-overhaul`, base `7ba0dee`, existing modified/untracked work preserved.
No commits, deployment, production database access, paid calls, live discovery,
notifications, submissions, Chrome installation/registration or account changes occurred.

### Implemented fixes and regression coverage

- Replaced native WebView `window.confirm` with a real analysis approval dialog in Job
  Radar and Match Inbox. Users inspect jobs, preferences and the complete eligible evidence
  packet before dispatch. Cancel/Escape/unmount resolve without approval. New dialog,
  Match Inbox integration and reviewed-batch tests cover this workflow.
- A transactional review fingerprint binds job, evidence, preferences, model and provider.
  Changed context is rejected before reservation; changes during a response discard the
  analysis. Error paths invalidate query caches so interrupted recovery is immediately visible.
- Durable reservations own their original UTC day. Archiving a prior-day analysis no longer
  creates phantom current-day usage; uncertain attempted legacy capacity is retained.
  Three budget regressions cover original-day and legacy accounting. No uncertain refunds.
- Evidence privacy checks now include skill/role tags and metric tokens, not only statements.
  Three regressions capture the actual mocked provider request and exclude sensitive facts.
- Resume instruction metadata now agrees with the actual scanned HTML input type. The
  earlier hybrid failure was reproduced, fixed and re-executed successfully.
- Adjacent address/legal resolvers reject unsupported jurisdiction-qualified authorization,
  phone-country-prefix and implicit country answers; semantic metadata is included and
  camelCase/hyphenated names normalized. These are targeted heuristic tests, not proof of
  comprehensive legal-language interpretation.
- Durable browser tokens bind `cc-application-answers-v2`; tokens issued under missing/older
  answer policies fail closed. Protocol 3 and `cc-json-sha256-v1` remain unchanged. Existing
  canonicalization regressions demonstrate insertion-order independence across Rust/JS,
  bounded deterministic serialization and rejection of legacy/tampered tokens.
- File filling verifies the same File object remains selected after page events, rejecting
  replacement bytes even with identical metadata. Controlled DOM regression only.

Primary files: `JobMatchApprovalDialog.tsx`, `useJobMatchApproval.tsx`, JobRadarPage,
MatchInboxPage, `batchReview.ts`, `aiBatch.ts`, `budget.ts`, `evidencePacket.ts`,
`answerEngine.ts`, `fillAuthorization.ts`, requestProcessor and extension content script.
New `token_restart_acceptance.py` controls two isolated native subprocesses and checks
unused-token persistence and single use within the original 60-second expiry.

### Executed acceptance results

| Scenario | Result | Actual evidence/limitations |
|---|---|---|
| Native review/evidence inspection | PASS | Actual packaged product UI, eligible evidence displayed; screenshots/AX in phase2d-closure. |
| Cancel button, Escape, restart with pending dialog | PASS | Actual UI; no new reservation or resumed approval. |
| Valid mocked analysis | PASS | Ashby analysis became valid; adding it to queue left package unapproved. |
| Invalid evidence then repair | PASS | Greenhouse became valid_after_repair after one mocked repair. |
| Provider error, permanent invalid response, explicit retry | PASS | Actual UI showed failure/deterministic fallback; explicit valid retry succeeded without refunding failed capacity. |
| Stale review and error-cache recovery | PASS | Synthetic evidence fault injection during open dialog rejected approval before calls; failed recovered state appeared immediately. |
| Daily cap and restart persistence | PASS | Actual UI cap 3/3; restart restored valid/failed/stale analyses and revoked package state. Three slots, four mocked attempts; no live provider cost claim. |
| Mock search/job change invalidation | PASS | Forced mock update invalidated dependent analysis and package; approval disabled. |
| Native transactions, partial failures, concurrent authorization | PASS | Isolated transport/fault harness: 26 transport checks, SQLite lock timeout/retry, interrupted host consumption retained and replay rejected. |
| Synthetic file delivery/partial fill | PASS | Six native-transport plus jsdom checks, including native synthetic PDF delivery and partial failure without completion ACK. This is not Chrome success. |
| Unused token across process restart | PASS | Controlled restart 0.616 s; 59,488 ms TTL remaining; first consumption accepted, replay rejected. |
| In-flight cancellation | PASS (harness) | Deferred mocked native harness; not clicked through product UI during dispatch. |
| Genuine installed Chrome sender/upload/native messaging | NOT VERIFIED | No browser extension installation or native host registration authorized or performed. |
| Live OpenAI/ATS/submission | NOT VERIFIED | Explicitly prohibited. |

Original failures and diagnostics are retained. The file-input metadata failure was fixed.
A manual token-restart diagnostic expired before consumption; the controlled test subsequently
passed without extending expiry. Blank/stale automation captures resolved with a fresh CUA
session and raised native window; they do not establish a product startup defect.

### Verification and isolation

Latest complete frontend suite: **289 tests / 41 files PASS**. Rust **33 PASS**, Python
**12 PASS**. Lint, typecheck, Rust formatting, Clippy with warnings denied, extension build,
acceptance production build, ordinary production build, isolated dev startup and diff whitespace
checks passed. Counts include preserved concurrent UI/dashboard work, not solely this task.
The ordinary production bundle was built but never launched. Existing Vite chunk warning remains.
Logs and actual synthetic UI captures are in `docs/native-acceptance-evidence/phase2d-closure/`.

UI databases were verified at direct marked temporary roots `careercompiler-native-29qhoqa_`
and `careercompiler-native-b4nty1zs` under
`/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/`, each `native.sqlite3`.
Final packaged harness uses `careercompiler-native-p3cq9m_n`; final bridge uses
`careercompiler-native-l3ya6x3y`. Startup logs record exact SQLite URL, acceptance app identity
and process ID. Guards require the synthetic-only marker and canonical temporary path;
acceptance mode disables production SQL-plugin startup, Keychain/provider access, external
opener, discovery scheduler, notifications and extension polling. Mock scenario selection is
available only after verified isolation and does not alter saved account/model settings.
Production data was not inspected to establish isolation.

Final-code rerun: packaged native stage one **14 PASS**, process restart **2 PASS**,
authorization transport **26 PASS**, hybrid native/controlled DOM **6 PASS**.
Results are saved as `final-*.json` in phase2d-closure. Owned final acceptance processes
were stopped; final `git diff --check` passed.

### Remaining blockers and decision

**GO for further isolated mocked acceptance and review of the separate Chrome plan.
NO-GO for live OpenAI requests or real application autofill.**

Remaining blockers: genuine Chrome sender metadata and FileList/upload behavior; comprehensive
jurisdiction-specific reviewed legal answers; automatic invalidation of every completed analysis
when candidate evidence changes; same-path external PDF replacement provenance; production
SQL-plugin coexistence and older synthetic migration/backup acceptance. Browser mutation and
SQLite cannot be atomic, already delivered content cannot be recalled, and uncertain consumption
must remain consumed. Reserved analysis capacity (up to two attempts) is not actual USD cost.
The existing broad extension permission set was preserved; permission reduction requires its own
review. Installation/registration remains separately approval-dependent.

## Phase 2D current decision

**GO for continued isolated synthetic acceptance and review of the approval-gated Chrome
plan. NO-GO for real autofill or a live OpenAI experiment.** No extension was installed,
loaded, enabled or registered; no normal Chrome profile/configuration, production database,
real candidate/application, credentials or account/model settings were accessed or changed.
No live discovery, real ATS access, notifications, submissions, commit, push or deployment.
Source edits were explicitly authorized for this phase; all existing dirty work was retained
on `ui-ux-overhaul`, base `7ba0dee`.

### Verified baseline and fixes

Before edits, the actual tree passed **173 frontend tests and 31 Rust tests**, confirming
Phase 2C's baseline. The two production failures were reproduced by its real transport/DOM
diagnostics, and their original evidence remains under phase2c.

| Issue | Root cause | Production change |
|---|---|---|
| Reordered JSON rejected | Payload SHA-256 depended on JSON insertion order; Rust Value serialization reordered keys. | Shared `authorizationContract.js` provides versioned canonical serialization/digest, used by desktop authorization and worker verification. Test bridge now deliberately applies Rust Value normalization in both directions; no key-order workaround. |
| Invented United States | Address resolver treated any city/region as evidence of US country. | Country uses only explicit verified/user-confirmed country claims; missing/conflicting evidence returns empty/user-required/review. No nationality/citizenship/birth-country/immigration/phone-country-code inference. Explicit city/state/phone values retained; declared conflicts and missing postal code remain unresolved. Unreviewed/unlocked sensitive legal answers are not auto-filled. |
| Untrusted browser sender/destination | Worker/content listeners ignored sender metadata, allowed generic page scopes, and could reacquire a different active tab. | Exact extension ID/origin/context checks, own popup/worker only, no content-tab senders. Worker uses actual tab URL, pins tab ID/URL, checks scan consistency and passes expectedPageUrl; content checks current document before mutation and detects changed question/control. Native/app boundaries enforce supported destinations and original reviewed job destination. |
| Partial file-fill false/uncaught success | DataTransfer/setter errors escaped the listener; completion could be acknowledged despite failed fields. | Per-field error isolation; explicit prepared/attached/failed/not_verified states; post-event attachment checks; successful fields retained; incomplete/interrupted fill returns actionable error and no completion ACK. Identical successful field/file retry is idempotent and duplicate tokens rejected. |
| Candidate answers becoming stale | Prior token binding covered package/job/resume but not revised country/legal/evidence inputs. | Preparation uses one SQLite snapshot/transaction; durable token binding also hashes current candidate-answer inputs. Changed reviewed claims/sensitive/evidence sources reject old tokens. Hash stays local; no private source context is sent to a provider. |

Primary files: extension `authorizationContract.js/.d.ts`, background/content, desktop
`fillAuthorization.ts`, protocol/request processor, application answer engine, native bridge
validation and test identity configuration, regression files, existing acceptance scripts.
No schema migration was required; operational JSON records gained explicit version fields.

### Canonicalization and compatibility contract

Protocol is now **3**, payload hashVersion **cc-json-sha256-v1**. Both desktop and extension
import the same production module. Native serializes parsed JSON; the desktop authoritative
processor and extension hash the resulting JSON values with that shared contract. Objects'
enumerable keys sort by UTF-16 code-unit order recursively; arrays retain order. Values/types,
null vs missing, package/revision/content metadata are preserved. Undefined optional object
members follow JSON wire omission; top-level/array undefined, sparse/extended arrays,
functions, symbols, getters, cycles, exotic objects, nonfinite/unsafe-integer numbers,
unpaired surrogates and excessive nesting are rejected. Finite fractions use ECMAScript JSON
number spelling; 1/1.0/1e0 and -0/0 normalize consistently. Unicode is not NFC-normalized;
distinct string values remain distinct. This is a bounded JSON contract, not an RFC 8785 claim.

Returned authorization carries its version and payloadHash; the worker verifies canonical
content before native consume, and the desktop checks durable hash/version, fresh approval,
revisions, expiry, destination, candidate input fingerprint and single-use state atomically.
Previously issued/unversioned tokens and protocol 2 requests fail closed, including completion
ACKs. No old token is rewritten or reinterpreted. Existing resume-record/package fingerprints
retain the legacy contract so approvals are not silently migrated; new payload digests are
separate/versioned. Resume JSON reordering may still conservatively invalidate approval.
App, worker and native host need matching protocol 3 artifacts before any installed testing;
no installed copy was updated here.

### Security boundaries and remaining risks

Production manifest permissions remain unchanged, including the pre-existing all_urls
injection scope. No browser permission/API was added. Runtime operations are narrowed to
exact HTTPS Greenhouse/Lever/Ashby hosts (including both Greenhouse hostnames), with no
credentials in URLs, custom ports, lookalike domains, file URLs or production loopback.
Only the verified acceptance runtime permits its exact five loopback fixtures. Native command
allowlisting/schema checks happen before credential/config access on rejected browser commands.
Package preparation cannot redirect a reviewed existing job merely by matching company/title.

Sender metadata is browser-supplied, not taken from message body; missing/forged fields fail
closed. Actual Chrome worker metadata remains NOT VERIFIED: optional fields in Chrome's API
may require a reviewed interoperability change after observation. Never disable checks to pass
a test. all_urls remains a permission-minimization risk; changes need separate approval.

The separate test host now requires TEST_EXTENSION_ID in its marked root, validates 32 a-p
characters and rejects missing/invalid/symlinked identity configuration. It can be bound to an
observed future ID without changing production registration. Current execution still uses a
synthetic caller, not Chrome. Credential-free test IPC is not production authentication and
cannot defend against same-user OS spoofing; do not promote it to production.

Browser DOM and SQLite cannot be atomic. Data already delivered/filled cannot be recalled.
Authorization may commit after a host dies or a response is lost; it remains consumed and a
retry must prepare a new token. Page/form mutation after checks can still cause partial work;
post-attachment verification and question/URL checks reduce it but do not eliminate the gap.
File mutation outside a saved resume record and actual browser attachment still need Chrome
acceptance. No real billing/provider transport was exercised; daily caps count reservations,
not USD cost, and uncertain attempts are not refunded.

### Actual isolated execution

Native IPC root:

```text
/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-w73vguip
```

Fixed DB is `<root>/native.sqlite3`; native PRAGMA confirmed that exact path before migration/
fixture writes. Marked temporary directory, separate acceptance identifier, restrictive CSP,
absent SQL plugin/production bridge/Keychain/providers/discovery/opener/notifications remain.
The prelaunch generic metadata says production extensionIPC false; CC_ACCEPTANCE_BRIDGE=1
explicitly starts only the test listener. It does not register a Chrome host. Packaged
identifier was inspected before launch. Test profile remains empty and unregistered.

| Scenario | Status | Actual evidence / limitation |
|---|---|---|
| Production key-order diagnostic | PASS | Real Python stdio → Unix socket → packaged app → WebView → SQLite, with native Value key reordering. Production canonical function accepted equivalent content. |
| Native transport acceptance | PASS | 26/26 cases: routing, malformed/version/origin/command denial, valid/replay/tampered/expired/concurrent tokens, revoked package/resume/job invalidation, PDF delivery, no submission. |
| Country and partial file recovery | PASS hybrid | Real native approved payload → real production content script in jsdom: name/contact, unknown empty, country empty, zero submit/manual next step, PDF prepared, partial/not_verified file error visible. Six checks pass; not Chrome. |
| SQLite locked timeout and explicit retry | PASS | Deadline error observed under held synthetic writer lock; retry after release succeeded. No uncertain token restored. |
| Host interruption before consume commit | PASS | Live host forwarded while SQLite writer lock prevented commit, was killed, then app consumed after release. Retry rejected. |
| App restart | PASS | Unconsumed fresh token survived, consumed once and replay rejected; existing package/approval/audit snapshots preserved, revoked/stale states not reapproved. |
| Separate native baseline harness | PASS | Fresh separate root, all initial scenarios including mocked AI, native XeLaTeX, atomic fault rollback/retry; new process restored state. |
| Routed product UI | PASS for executed scenarios | Resumed after unlock: mock ATS discovery, score/evidence display, package creation, resume replacement/reapproval, tracker synchronization, content-change revocation and full process restart. Actual screenshots/AX logs retained. AI approval dialog completion remains NOT VERIFIED. |
| Genuine Chrome messaging/upload | BLOCKED / NOT VERIFIED | No extension load or registration authorized/performed. Controlled DataTransfer simulation is not real Chrome upload. |
| Live OpenAI/ATS/autofill/submission | NOT VERIFIED | Prohibited and not attempted. |

Separate baseline/UI root:
`/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-6ey6pawz`.
Original packaged initial PID 83582 and restart PID 84604 passed. Product UI uses this same
synthetic DB, not the intentionally fault-injected IPC dataset. Paths/logs/screenshots/results
are recorded under `docs/native-acceptance-evidence/phase2d/`.

### Regression and verification

Added production tests exercise nested reordered JSON, arrays/types/null/missing, Unicode,
escaping/numbers and unsupported inputs, version compatibility, candidate-input staleness,
country/international/conflicting/location/legal assumptions, actual worker sender routing,
unsupported current tab, content sender/destination/question changes, file preparation errors,
missing/interrupted DataTransfer, controlled attachment/duplicate suppression, partial field
recovery, replay and fresh retry. Native tests cover exact origins, command schema and hash
version. Python tests cover identity config and existing path/framing boundaries.

Final verification: **247 frontend tests across 34 files, 33 Rust tests and 12 Python
host tests passed**. Lint, typecheck, Rust formatting, Clippy with warnings denied, extension
build, standard production build and packaged acceptance build passed. Diff/whitespace
checks passed. The existing Vite >500 KiB chunk warning remains; no new compiler warnings.
Isolated dev startup passed on loopback 5199 with fixed-path preflight and restart acceptance
in PID 87802; logs retained. Standard production bundle was built, never launched.

The initial routed UI launch in PID 85006 was blocked by the locked Mac. On 2026-10-14,
after the user requested continuation, actual native product UI acceptance resumed in
PID 96318, followed by a full process restart in PID 97369. Both used the verified fixed
temporary database above; bundle identifier, marker, non-symlink DB and startup path were
checked before interaction. No production source edits were needed in this continuation.

| Resumed actual product UI scenario | Result | Evidence |
|---|---|---|
| Match scores and evidence inspection | PASS | Three synthetic jobs; 74/69/57 displayed initially; stale/failed AI fallback visible; Greenhouse details show only fact-eligible. ui-match-evidence.txt/png. |
| Resume replacement and fresh approval | PASS | Approved B → select A: approval required, Open Application absent → approve A → select B: revoked again → approve B. ui-revoked.txt. No external link opened. |
| Tracker synchronization | PASS | Ready-to-fill tracker shows Synthetic resume B, zero submitted; ui-tracker.txt/png. |
| Mock ATS discovery and content invalidation | PASS | Forced fixture adapters returned 0 added, 3 updated, 1 scored; Greenhouse deterministic score restored to 86. Package became not_validated/unapproved with requirements-changed message and disabled approval. ui-job-invalidation.txt. |
| Package creation | PASS | Add to Queue created an Ashby draft requiring a resume and approval; restored after restart. |
| Cancellation and recovery display | PASS for safe cancellation only | Analyze Qualified Jobs returned cancelled before any request was sent; no confirmation dialog was exposed. Subsequent source-disabled search cleared the error and returned zero fetched/scored. ui-cancelled.txt. Successful UI AI approval/batch execution NOT VERIFIED; harness coverage is separate. |
| Full product process restart | PASS | Restart restored Ashby draft and revoked Greenhouse package with resume B; did not restore approval. ui-restart.txt/png. |
| Final isolation/invariants | PASS | SQLite integrity ok, no FK violations, all sources disabled, automation false, mock mode true, zero submitted records; tracker preparing/B, package B unapproved/not_validated, 16 audit records. ui-resumed-isolation.json. |

Actual screenshots are [match evidence](native-acceptance-evidence/phase2d/ui-match-evidence.png),
[tracker](native-acceptance-evidence/phase2d/ui-tracker.png), and
[restart](native-acceptance-evidence/phase2d/ui-restart.png). This continuation did not exercise
profile import, PDF generation, fault injection or Chrome file attachment through the visible
UI; those remain harness-only or NOT VERIFIED as described above. All test app processes
were stopped. The previous 247/33/12 suite and build results apply to unchanged production
code; only documentation/evidence changed here, followed by a fresh whitespace check.

`final-isolation.json` records clean integrity/FK checks, zero submitted records, explicit
new token hash versions and the empty disposable browser profile. Runtime isolation is
proved by construction/preflight; no production DB was opened/hashed to compare it.
Production extension manifest and browser permission declarations have no diff. An intermediate
regression run rejected old example.com positive fixtures under the new production ATS policy;
those synthetic fixtures were moved to allowed fake ATS paths, without visiting any site or
weakening the allowlist. Historical failure logs remain distinguishable from final results.

### Approval-gated next step

[Chrome isolated integration plan](CHROME_ISOLATED_INTEGRATION_PLAN.md) lists the exact
future profile/extension/host/process/cleanup side effects, observed ID/metadata checks,
protocol/hash agreement, file attachment, submission traps and evidence requirements.
It is documentation only. The existing generic TEST_REQUEST template still needs a browser
scan/fill driver and genuine sender observation before claiming an installed workflow.

GO to review that plan and continue synthetic testing. Chrome execution requires separate
explicit approval. Real autofill remains NO-GO until genuine sender/IPC/upload/recovery
acceptance; live OpenAI remains NO-GO until a separately authorized isolated/bounded live
provider transport experiment is reviewed. Neither is authorized by this report.

## Historical Phase 2C decision

**GO for continued synthetic test-harness IPC. NO-GO for installed production autofill or live OpenAI.**

Phase 2C implemented and executed test-only infrastructure. It did **not** install an
extension, register a Chrome native host, modify a normal Chrome profile, access a real
account/candidate/database, visit an ATS, call a provider, notify, or submit anything.
Production payload hashing and country inference have reproduced correctness defects (below).
The constrained iteration authorized isolated/mock data and temporary test-harness code;
that production authorization-algorithm change was not made. No commit/push/deploy.

### Communication architecture audit

1. Production background worker connects to `com.mirathfan.careercompiler` through
   Chrome `connectNative`. Installed host manifest uses exact extension origins; the
   app installer copies the native binary into its support directory and writes the
   user-level Chrome registration. No installer was invoked in Phase 2C.
2. Chrome launches the host using a caller origin argument. Native framing uses bounded
   JSON messages (1 MiB Chrome-side, 2 MiB desktop IPC), protocol 2, and an allowed command
   list. Production requests require origin/extension identity agreement and a paired
   credential checked against its stored SHA-256 hash. Ping/pair have separate routes.
3. The host forwards requests to the desktop Unix socket. The app queues requests and
   the WebView repository processor prepares grounded answers and checks approval.
4. `issueFillAuthorization` binds a token to current package/approval revisions, job and
   resume fingerprints, extension/page and full payload hash. `consumeFillAuthorization`
   checks durable state and consumes it in a SQLite transaction; fill acknowledgement
   rechecks it. Expiry is 60 seconds. Revocation, replacement and changed content fail.
5. Production manifest grants `<all_urls>`, and content scripts use ATS heuristics rather
   than a strict supported-site allowlist. Background runtime listener ignores sender
   metadata. Ordinary pages cannot directly use `nativeMessaging`, and there is no
   `externally_connectable` manifest declaration, but compromised extension/content
   contexts warrant sender/origin validation and narrower permissions before release.
6. Browser form text/options/URLs are untrusted inputs, not approval authority. The
   native host exposes no generic SQL/filesystem/provider command route. Capture and
   preparation can still write local drafts; pairing does not make page text trustworthy.
7. Trust boundaries: page/isolated content world → worker → Chrome origin/host → Unix
   socket → desktop request processor → transaction/repository → narrowly authorized PDF.
   A same-user OS process can spoof an origin string on a socket. Production credentials
   matter; the test bridge intentionally proves no adversarial same-user authentication.
8. Main's native-host argument route ran before app isolation preflight. Added a test
   boundary guard: acceptance bundles or acceptance environment variables cannot enter
   production native-host mode. They must use the separate test wrapper.

Installed platform metadata: macOS, Google Chrome **155.0.8059.40**. Registration and
framing mechanics were checked against [Chrome's official native messaging documentation](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).
The normal user registration location is outside this test root. Its manifests/profile
were neither inspected nor changed. A generated manifest alone is not registration.

### Test architecture and isolation

New files: `src-tauri/src/acceptance_bridge.rs`, acceptance-only startup/host-mode guards,
`src/lib/acceptance/NativeBridgeAcceptanceApp.tsx`, `scripts/phase2c/` host/preparer/server/
transport/restart/failure/DOM scripts, isolated fixture HTML/JS, and fixture regression tests.

Actual successful wire-preserving test root:

```text
/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-xp1z9xue
```

Database: `<root>/native.sqlite3`, independently confirmed by native `PRAGMA database_list`
before initialization. `bridge-ready.json` records verified paths and process identity.
The original marked temporary-root/acceptance-identifier boundary remains; no SQL plugin,
Keychain, paid provider, discovery, opener, notification or production bridge handler is
registered. `CC_ACCEPTANCE_BRIDGE=1` starts only the test listener at `<root>/s` (0600),
within a 0700 marked root. Missing/mismatched configuration fails closed. Existing sockets
are never overwritten; stopped test sockets were explicitly removed only inside this root.
Restart seed logic retains existing local jobs/packages and cannot reapprove revoked ones.

`prepare.py` writes an **unregistered** separate host manifest named
`com.mirathfan.careercompiler.acceptance`, a fixed-root wrapper and an empty disposable
`browser-profile/`. It never writes Chrome's normal registration directory. Test extension
artifact permissions are narrowed to `http://127.0.0.1:5297/*`; production manifest and
worker permissions were not changed. The fixed `aaaaaaaa…` identity is a synthetic caller,
not an observed installed Chrome extension ID. Future installation must bind the actual
observed ID; this artifact is not certified ready to install unchanged. No pairing/account
credentials are used or created; nonempty credentials are rejected by the test listener.

Executed chain: Python host **real stdio framing → real Unix socket → packaged native app
→ WebView processor → durable SQLite**. Origin is supplied by the test controller, **not
Chrome**. Test worker/Chrome native messaging were not executed. Only ping, preparation,
authorization and fill acknowledgement are accepted; URLs are restricted to five exact
loopback fixture URLs, fields ≤100, total frames ≤1 MiB, and request deadlines five seconds.
Expired queued requests are not returned for processing; already-started operations may
finish after a transport timeout and must be treated as uncertain completion.

Test PDF access is restricted to exactly two synthetic PDFs inside the marked root,
with symlink rejection, `%PDF-` header and 700 KiB bound. Browser messages cannot invoke
this filesystem command directly. Logs/report snapshots include synthetic metadata only;
PDFs, prepared field/file payloads and SQLite files stay temporary and are not checked in.

### Synthetic forms and DOM boundary

Five loopback pages simulate Greenhouse, Lever, Ashby, manual multi-step and dynamic fields.
They contain names/contact, employment/education/skills, sponsorship/work-authorization,
select/radio, required/optional, unknown questions, upload and validation controls.
A submission trap intercepts click, submit, `submit()` and `requestSubmit()`; server POSTs
are forbidden. CSP forbids network connections/form actions/frames; server has an exact
file allowlist and traversal requests return 404. There are no real ATS pages.

The real content script was executed in jsdom fixtures: passwords excluded, unknown
answers unresolved, vanished fields fail safely, required controls remain invalid when
unanswered, final submit is untouched, and next-step navigation remains manual.
This is **DOM fixture testing, not installed Chrome autofill**. Employment/education/skills,
sensitive-answer conflict combinations and actual Chrome file upload remain unverified as
an installed workflow; fixture presence is not success evidence.

### Findings, fixes and retained failures

**Production payload fingerprint failure:** `digest()` hashes insertion-order JSON.
Rust `serde_json::Value` reorders object keys across native transport. The same logical
prepared payload then fails its digest check. First real transport run reproduced rejection
of valid/concurrent payloads; final diagnostic explicitly sends a key-reordered equivalent
and records **FAIL**, returning exit code 1. Production algorithm remains unchanged.
It needs a separately authorized canonical payload serialization/hash change with a real
cross-serialization regression, while preserving expiry, content binding and single-use
checks. That is a correctness failure, not an authorization bypass; it must not be hidden.

The test-only bridge now carries original request/response JSON as strings to preserve
wire order. It still parses/validates commands and uses unchanged application authorization
services. This workaround is specific to the synthetic transport; it does not certify or
repair the production Chrome bridge. Valid positive controls now succeed, so negative
cases are no longer merely rejection due to the key-order defect.

Timer polling initially timed out while the Mac was locked. The test bridge now signals
pending requests via Tauri events and serializes processing. Initial timeout and failed
transport logs are retained; the lock's exact contribution was not conclusively isolated.
After the user unlocked the Mac, raising the synthetic window revealed READY; its actual
screenshot is retained. No normal browser/profile was opened by UI automation.

A bridge restart originally reran the baseline harness's exactly-three-jobs assertion
against a database with five additional local fixture jobs. That harness assumption failed;
bridge orchestration was corrected to initialize the baseline only on an empty fixture DB.
The baseline harness is rerun separately on a fresh root, without weakening its assertions.
An intermediate host-mode guard compile required an explicit Tauri runtime type; the build
failure was corrected and final checks rerun.

**Unsupported country inference:** the real IPC/jsdom run selected United States from a
profile that specified only “Fixture City”, with no country evidence. Inspection confirms
`applications/answerEngine.ts` returns United States for any nonempty city/region. The
country diagnostic therefore records FAIL; this is not a supplied synthetic fact. The
production resolver must require explicit country evidence or leave the answer unresolved.
That production logic was not changed under the test-only scope.

### Acceptance results

| Scenario | Status | Evidence / limit |
|---|---|---|
| Framed host/socket/native handshake and routing | PASS | Actual subprocess/socket/app execution; no Chrome claim. |
| Protocol, unsupported commands, external URLs, wrong caller, malformed/truncated/oversized frames | PASS | Real host transport rejects; arbitrary-file/database/provider commands never execute. |
| Current approved package, synthetic PDF delivery, unresolved unknown answer | PASS | Real packaged preparation and durable token creation. |
| Valid consumption, replay, tampered package metadata/fingerprint, expiry, concurrent consumption | PASS in test transport | Exactly one concurrent success; durable current-state validation. |
| Revoked approval, replaced resume and changed requirements | PASS in test transport | Explicit synthetic SQLite fault injection; rejection tested through actual IPC, not a UI mutation/audit workflow. |
| Native host killed during consumption | PASS | Retry can succeed only if dispatch never consumed; later replay fails. Completed consumption is never released. |
| SQLite busy/transport timeout and explicit retry | PASS | Held synthetic write lock, observed deadline error, released lock and retried successfully. |
| Native app restart | PASS | Local package/approval/audit snapshots unchanged; revoked/stale states not reapproved; unused token survives restart then consumes once and rejects replay. |
| Unsupported country inference | **FAIL** | Synthetic city-only profile receives an invented country; production resolver unchanged. |
| Production key-order serialization | **FAIL** | Logically equivalent reordered payload rejected; final transport script intentionally retains exit 1. |
| Fixture server and traversal protection | PASS | Five pages served over loopback; strict CSP and exact file allowlist. |
| Actual synthetic bridge UI | PASS | READY shown after user unlock and window raise; screenshot is evidence only for bridge UI. |
| Installed Chrome native messaging, extension restart/reconnect | BLOCKED | No extension load or host registration authorized/performed. |
| Genuine Chrome form fill/file upload, navigation recovery, interrupted attachment | NOT VERIFIED | DOM/IPC tests do not substitute for installed browser execution. |
| Live providers/discovery/ATS/submission | NOT VERIFIED | Prohibited and never attempted. |

Detailed terminal outputs and JSON are in `docs/native-acceptance-evidence/phase2c/`.
The wire-preserving transport run has **25 PASS and 1 FAIL** (the production digest diagnostic).
Failure/retry checks have 2 PASS; durable restart checks and fresh-token restart checks pass.
Verification: **173 frontend tests across 32 files**, **31 Rust tests**, and **9 Python
host tests passed**. Lint/typecheck, formatting, Clippy with warnings denied, extension
build and production/acceptance builds passed. Diff/whitespace checks passed. Vite retains
its non-fatal bundle-size warning. Initial dev startup also showed a duplicate embedded
plist linker warning from constructing Tauri context in both binary and library; the
startup guard now shares one library context constructor, and final builds/dev were rerun.

Separate native baseline root:
`/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-1po40lso`.
Packaged initial and full process restart passed (`baseline-stage-one/two.json`, actual
screenshots and logs). The test bridge's additional jobs are not mixed into this harness. Final isolated dev
startup on loopback 5199 passed in PID 70153; the duplicate plist warning is absent in
`dev-final.log`. Final native-host-mode rejection returned exit 2 before production IPC
(`native-host-route-guard.json`). A request after stopping the app failed closed
(`stopped-app-fail-closed.json`). All test app/server processes were stopped.

The final host-interruption experiment held a SQLite write lock, observed host forwarding,
verified the host was alive and token still prepared, then killed it before commit could
occur. After lock release the application consumed authorization; retry was rejected.
`interruption-results.json` documents uncertain completion without releasing authorization.

Combined real IPC + jsdom non-file fill checks passed for synthetic name/contact, unresolved
unknown question, untouched submit/manual next-step and native PDF delivery. The added
country diagnostic records FAIL and the DOM script exits 1. The first
full DOM fill threw because jsdom lacks `DataTransfer`; that log is retained. Subsequent
non-file testing deliberately withheld the file instruction and reports attachment BLOCKED,
not successful upload or implemented fallback. The content script's uncaught file-assignment
exceptions can leave a partial DOM fill after authorization consumption; installed browser
error reporting/recovery needs separate acceptance and possible production hardening.

`final-isolation-database.json` records clean integrity/FK checks, zero submitted records,
consumed/prepared token counts and the still-empty disposable browser directory.

### Remaining limits and exact next actions

- **NO-GO** for real autofill: remove unsupported country inference, fix the production canonical payload digest and add a
  cross-Rust/Chrome serialization regression. Narrow/validate worker sender/site boundaries
  before deployment; production `<all_urls>` and ignored sender metadata remain unchanged.
- Genuine Chrome testing needs explicit scope for loading the loopback-only test extension
  with native messaging into a disposable profile and registering the separate host only
  in that isolated user-data directory, after verifying Chrome's lookup and actual ID.
  No normal-profile registration, normal pairing credentials or security-setting changes
  are proposed. Those actions were not performed under this iteration's boundary.
- Same-user origin spoofing is not prevented by the credential-free test host. It must never
  be promoted to production. Same-user local DoS/resource exhaustion is not fully hardened.
- Browser DOM and SQLite cannot be atomic. Already-delivered content cannot be recalled;
  consumption may precede a failed or interrupted fill. Safe retry prepares a new payload
  and token, never restores consumed authorization, and never submits.
- PDF delivery passed through real IPC. Native Chrome `DataTransfer` attachment, mutation
  after approval, validation errors and partial attachment require installed testing.
- **NO-GO** for a budget-limited live provider experiment: this phase adds no paid capability
  or billing evidence and retains Phase 2B's live-provider restrictions. A later experiment
  requires separate explicit authorization and an isolated bounded transport/token policy.

## Phase 2B verified baseline

**GO for further isolated mocked native/UI acceptance. NO-GO for live OpenAI requests or real browser autofill.**

This section supersedes the historical Phase 2 report below. No paid calls, live boards,
notifications, submissions, production databases, or real candidate records were used.
No changes were committed, pushed, or deployed. Existing working-tree work was preserved.

### Root causes and fixes

| Area | Root cause | Implemented enforcement |
|---|---|---|
| Cross-process AI caps | JavaScript overlap guards and history reads could race across processes. | Durable `ai_budget` reservations are counted and inserted inside SQLite `BEGIN IMMEDIATE`; each native transaction owns one connection. Separate processes serialize against the same database. Reservations survive interruption/failure and are never refunded. |
| Package/tracker consistency | Multiple independent writes could leave approval, resume selection, tracker and history disagreeing. | Repository transactions now encompass selection, revocation, tracker/history, job state, approval revision and append-only audit records. Repository-level resume/job updates invalidate dependencies. Alternate tracker writes are transactional and reject package/resume mismatches. Crash/timeout rolls back uncommitted writes. |
| Browser freshness | Prepared content could outlive approval or selected content and be replayed. | Protocol 2 uses opaque, 60-second, single-use tokens bound to extension, page URL, package revision, approval revision, semantic job fingerprint, SHA-256 resume and full payload fingerprints. The application consumes authorization atomically immediately before fill, and rechecks the acknowledgement. Missing approved packages are rejected. Version 1 is rejected. |
| Job changes | Description-only change detection missed compensation/location changes and did not centrally revoke approval. | Normalized content fingerprint includes description/requirements, compensation, location, workplace, employment type, department, title and company. Meaningful changes archive old analysis, mark it stale, revoke package approval and invalidate tracker readiness atomically. Formatting-only/source tracking changes preserve approval. |
| Deterministic evidence | UI inspection showed enabled children of disabled parents and sensitive/unreviewed facts as matched IDs. | Local scoring now requires eligible parents and verified/user-provided, nonsensitive facts, matching AI evidence eligibility. Historical records remain historical. |
| UI budget consent | Mock analysis was described as paid, and zero remaining capacity appeared as a successful empty batch. | Consent distinguishes mock versus paid providers, reservations versus up to two provider calls, and unknown cost. Job Radar reports blocked eligibility/cap starts as an error. |

Primary files: `src-tauri/src/transactions.rs`, native AI/bridge/startup commands;
repository interfaces, memory/SQLite implementations and additive migration 10;
`job-automation/{budget,aiBatch,safety,applicationPackages,scoring,evidencePacket}.ts`;
`extension/{fillAuthorization,protocol,requestProcessor}.ts`; extension background/content;
Job Radar/Match Inbox; isolated runtime, native harness and startup injection.
No production migration was executed. Migration parser preserves trusted trigger bodies.
SQLite triggers prevent deletion/reset of budget reservations and modification/deletion of
package audit records. These protections assume trusted local repository/desktop code;
they do not defend against a person directly replacing/editing the SQLite database.

### Budget semantics

One reservation permits one analysis with at most one repair: **up to two attempted
provider calls**. The configured daily cap counts analyses/reservations, not dollars.
Dispatch is recorded before native network execution. Provider-side execution is uncertain
if a process dies or a response is lost, so capacity is retained. `actualCostUsd` stays
`null`; no billing, refunds or actual live spend were measured. UTC days determine daily
accounting. An active one-hour job lease prevents overlapping analyses of that job;
interrupted work can delay retry until lease expiry, without releasing its old capacity.
The native live dispatch guard validates reservation/day/job/content/preferences/call
sequence before HTTP, but **no real HTTP dispatch was exercised**.

### Isolation and actual process evidence

Actual Phase 2B root:

```text
/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-__e9l9l1
```

Database: `<root>/native.sqlite3`. Native `PRAGMA database_list` confirmed this exact path
before repository initialization/migrations. The acceptance identifier remains
`com.mirathfan.careercompiler.acceptance`. Startup rejects a missing/unmarked/non-temporary
root and a production identifier with acceptance environment variables. Transaction
commands resolve the same fixed database and reject symlinks. Native acceptance registers
no SQL plugin, Keychain/OpenAI, external discovery, notifications, opener or extension
bridge handlers. Packaged CSP forbids remote connections. Actual product UI is mounted
only after isolated policy and repository verification; it receives that repository,
forces mock providers and fixture discovery, and disables launch scheduler/extension
request polling. Temporary PDFs are rendered with native XeLaTeX. No production file
was opened, queried, hashed or copied to establish isolation.

Evidence is in `docs/native-acceptance-evidence/phase2b/`; JSON/logs contain synthetic
records only. Temporary databases/PDFs are not included in the repository.

### Executed acceptance results

| Scenario | Status | Actual evidence / limitation |
|---|---|---|
| Packaged native initial harness | PASS | `stage-one.json`, `harness-pass.png`: synthetic profile import, real ATS adapters against fixtures, deterministic scoring, mocked AI, allowlist exclusion, cancellation, failure/recovery, caps, native PDF export, package approval/replacement/reapproval, job staleness, transaction fault rollback/retry. |
| Full harness process restart | PASS | `stage-two.json`, `harness-restart-pass.png`: disk-backed state restored in a new process. |
| Simultaneous native budget reservations | PASS | Two barrier-synchronized OS processes PID 44914/44915 each requested three reservations against cap 3 for UTC day 2026-10-14; grants 3 + 0. Persisted total 3, attempted calls 0, provider calls 0, actual cost unknown. `budget-probe-1/2.json`, process logs. |
| Interruption before transaction commit | PASS | PID 45161 wrote uncommitted package/tracker/revision/audit changes. An independent reader saw committed state. Terminating the process left all four changes rolled back, audit absent, earlier budget reservations retained, integrity/FK checks clean. `interrupt-ready.json`, `interruption-and-budget-verification.json`. |
| Actual product UI startup/home | PASS after retry | Native routed Home showed synthetic records, `ui-home.png`; initial blank WebView is retained in `product-ui-blank-startup.png` and its log. Startup checkpoints added; initial blank cause is not conclusively diagnosed. |
| Actual UI mock discovery/match display | PASS | Enabled synthetic Greenhouse/Lever/Ashby sources, clicked Run Search Now: 0 added/3 updated/1 scored, no HTTP. `ui-fixture-discovery.png`; actual Match Inbox scores/history inspected. |
| Actual UI evidence inspection | PASS | Disabled parent + enabled child displayed in Evidence Database, `ui-disabled-parent-evidence.png`. AI exclusion already executed by harness. Deterministic ID defect discovered and regression added. |
| Actual UI package creation | PASS | Created a second, unapproved Ashby package through Add to Queue. `ui-created-second-package.png`. |
| Actual UI resume selection/approval/replacement/reapproval | PASS | Greenhouse: selected A, approved; replaced B, approval revoked and Open Application disappeared; reapproved B. `ui-approved-a.png`, `ui-replaced-b-unapproved.png`, `ui-reapproved-b.png`. |
| Actual UI tracker synchronization | PASS | Applications Ready to fill shows Synthetic resume B, `ui-tracker-synchronization.png`. No submission button was used. |
| Actual UI provider failure history | PASS | Lever displays failed repair/local validation audit and prior attempts. `ui-match-failure-history.png`. Provider-failure execution/recovery itself was performed by harness, not a new UI call. |
| Browser protocol authorization tests | PASS automated | Valid/single-use, replay, tamper, expiry, wrong page/extension, revoked approval, changed content/revision and missing-package cases. DOM fixtures cover expired authorization and supported ATS selectors. This is not installed Chrome/native messaging acceptance. |
| Installed Chrome end-to-end | BLOCKED by deliberate isolation | Acceptance build omits native extension IPC and production credentials/socket must not be used. Requires a separate isolated host/bridge setup before installed testing. |
| Real ATS/OpenAI/autofill/submission | NOT VERIFIED | Explicitly prohibited; no live integration success claimed. |

### Regression and verification coverage

Added tests cover concurrent reservations, interrupted/failed capacity retention, distinct
UTC days with active-job leases, semantic job updates (requirements, compensation,
location, sponsorship text), unchanged/formatting-only updates, authorization replay and
content binding, package rollback/retry, deterministic evidence inheritance and native
connection interruption/reopen. Both memory and SQLite/native paths are exercised.

Final frontend suite: **170 tests passed across 32 files**, lint/typecheck passed.
Rust: **29 tests passed**, formatting check and Clippy with warnings denied passed.
Extension build passed. Packaged acceptance and standard production builds passed
(non-fatal Vite chunk-size warning). Diff/whitespace checks passed. Isolated dev startup
bound only loopback `127.0.0.1:5199`, passed native preflight, and executed restart acceptance
in PID 53593 (`verification-dev.log` and `dev-stage-two.json`). Hot reload during concurrent
build/source edits produced an import/HMR error in an earlier dev run; that log is retained.
The fresh dev start executed successfully. No normal production app was launched.

Final packaged initial/restart rerun used an additional marked root:
`/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-0cyoy39a`.
PID 51859 initial harness and PID 52276 restart passed; deterministic scores changed
from 92/80/75 to 86/74/69 after exclusion of ineligible evidence.
See `final-stage-one.json`, `final-stage-two.json` and final harness screenshots.
After the alternate tracker guard was added, another fresh packaged initial/restart
run passed in root
`/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-mnflmqvz`
(PID 54369 initial / PID 54540 restart). See `last-stage-one.json`,
`last-stage-two.json`, `last-harness-restart-pass.png` and logs.

Actual routed UI full process restart passed: both packages and approved B restored
(`ui-restart-persistence.png`). UI budget-cap error was actually clicked and displayed
3/3 reservations (`ui-budget-cap-error.png`); fixture discovery cleared the error;
all sources were then disabled with automation paused (`ui-recovered-sources-disabled.png`).
Actual Local rescore displayed only `fact-eligible` (`ui-corrected-evidence-scoring.png`).
Read-only inspection of the temporary DB verified approved B/current tracker, second
unapproved package, audit records, disabled sources and clean integrity/FK checks
(`final-ui-database-verification.json`).

A first fault-injection run failed with a database lock because the harness restored a
bound root method onto the transactional facade. It was corrected to remove the override,
preserving the facade's transaction connection. The failing screenshot/log remains
`initial-fault-injection-lock.*`; both reruns verified rollback and successful retry.
A restart screenshot briefly showed a blank/stale window despite a PASS JSON artifact;
rebinding automation to the current app revealed the completed UI. Blank captures are
therefore observation failures, not proof of a reproduced product startup bug. The initial
product blank capture is retained; its precise cause remains uncertain.

### Remaining risks and readiness

- Installed Chrome transport, pairing, file handoff and authoritative handshake are not
  executed together. **NO-GO for real autofill**; GO to prepare a separately isolated
  Chrome native host using only synthetic pages/records. Both app and extension must
  use protocol 2; old versions deliberately fail closed.
- Data already delivered to a browser cannot be recalled. Approval can change after
  the authoritative consume check and before DOM mutation. Expiry/local checks narrow
  this gap, but cannot make SQLite and a browser DOM one atomic operation.
- Resume fingerprints bind saved resume/template/validation/export-path content, and
  payload SHA-256 binds delivered file bytes. An external PDF replacement at the same
  path without a corresponding resume record update is not an approval-record change;
  file/export provenance needs installed handoff testing before real autofill.
- USD cost is unknown and provider transport/usage reconciliation has not been tested.
  **NO-GO for a small live OpenAI test** until an explicitly authorized isolated live
  transport configuration, bounded request/token policy, synthetic allowlist and budget
  instrumentation are reviewed and tested. Current build intentionally blocks it.
- Interrupted discovery runs remain recorded as running and may require explicit
  recovery; no automatic external retry was added. Long transaction timeout is 120s,
  SQLite busy timeout 10s; lock/timeout errors fail rather than grant budget.
- Schema/repository/native actor changes passed fresh isolated migrations, not an
  upgrade of a real production database. Production SQL-plugin coexistence and migration
  backup must be exercised on a disposable copied synthetic older database before release.
- Blank UI captures remain unresolved observation evidence; stale process/window bindings
  were reproduced in automation and corrected by rebinding. A product startup defect was
  not conclusively reproduced; successful UI execution does not erase those captures.

## Historical Phase 2 report (prior baseline)

## Decision

**GO for continued isolated mock acceptance. NO-GO for a live OpenAI test in the current acceptance configuration.**

The packaged macOS application executed the synthetic acceptance harness successfully,
then quit and relaunched in a separate process with state restored. This is actual
Tauri WebView → Rust → disk-backed SQLite execution, not merely Vitest or sql.js.
It does **not** certify the normal routed product UI, official SQL-plugin transport,
installed Chrome integration, or real OpenAI requests. Live testing needs a separately
reviewed, explicitly authorized, bounded provider test that retains the fixed database
boundary; this build deliberately cannot call OpenAI or access Keychain credentials.

## Environment and isolation guarantees

The preparer `scripts/prepare-native-acceptance.py` creates a mode-0700 temporary
directory with a `synthetic-only` marker, an acceptance configuration, and prelaunch
metadata. Neither preparer nor acceptance code reads the production database.

Actual temporary root:

```text
/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-g4z_wkqu
```

Actual database, confirmed by native `PRAGMA database_list` before repository migrations:

```text
/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-g4z_wkqu/native.sqlite3
```

The bundle identifier is `com.mirathfan.careercompiler.acceptance`. Its separately
reported app-config directory is:

```text
/Users/athfan/Library/Application Support/com.mirathfan.careercompiler.acceptance
```

This directory is distinct from the fixed SQLite path above. No production path was
opened or hashed to establish isolation. No shell `HOME` substitution was used.

Before launch, the generated root and database URI were inspected, the database did
not yet exist, and the built bundle's identifier was read from `Info.plist`. Native
startup validates the identifier and canonical marked temporary root before building
the application. Missing/mismatched configuration fails closed. An actual negative test ran the standard
bundle with the acceptance variable: it exited 101 at this guard before constructing
the application or loading a database. Startup logs the
isolation preflight before frontend SQL initialization. The harness independently
asserts the actual SQLite path before initializing any schema or synthetic records.

Acceptance mode:

- Does not install the general SQL, filesystem, dialog, opener, or logging plugins.
- Does not start extension IPC or mount the normal App, launch scheduler, extension
  polling, settings screen, or other routed feature pages.
- Registers only environment inspection, bounded acceptance-artifact writes,
  fixed-path SQLite queries, and the existing XeLaTeX renderer.
- Does not register OpenAI, Keychain, live-board, browser-opening or extension handlers.
  Native invocation attempts for these were actually rejected in both processes.
- Rejects general SQL-plugin loading, including `sqlite:careercompiler.db`, without
  opening a connection. The general SQL plugin is absent, rather than trusted to
  enforce its path scopes.
- Rejects ATTACH, DETACH, VACUUM, extension loading, and directory-changing SQL.
  Database and artifact symlinks are rejected. Native queries have no caller-supplied
  database path.
- Uses a CSP that permits local app assets/IPC and denies external fetch destinations.
- Uses explicit mock providers and injected ATS fixture transports. All URLs in
  postings point to `example.invalid`; no application page is opened.
- Persists `automationEnabled=false`; all three source rows are disabled after fixture
  ingestion. No notification plugin/handler or delivery mechanism runs.

These are application-level boundaries verified for this harness, not a claim of an
OS sandbox against malicious native code. SQLite and XeLaTeX are real native runtimes;
ATS and AI behavior are mocks. XeLaTeX uses the existing escaped serializer and renderer,
with shell escape disabled and disposable compilation directories.

## Executed acceptance scenarios

PASS means actually executed and checked in the packaged native harness. Every AI or
ATS PASS below is explicitly mocked. FAIL means a reproduced defect. BLOCKED means an
external/environment obstacle. NOT VERIFIED means not attempted.

| # | Final result | Execution and evidence |
| --- | --- | --- |
| 1 | PASS | Packaged native window launched; actual database path asserted; paid APIs, Keychain, board fetching, bridge installation and general SQL loading rejected. |
| 2 | PASS, repository ingestion | Synthetic JSON profile round-tripped and saved through `SqliteRepository`; enabled/disabled/sensitive parent evidence persisted. File chooser and Candidate Brain import UI are NOT VERIFIED. |
| 3 | PASS, mocked ATS | Three distinct Greenhouse/Lever/Ashby payloads passed through the real adapters and runner using injected fixture transport. No live discovery occurred. |
| 4 | PASS | Three eligible native SQLite matches received deterministic scores 92, 80 and 75. Native ineligible-job rejection fixtures beyond these three are NOT VERIFIED; unit filter coverage remains separate. |
| 5 | PASS, mocked AI | Explicit `MockAIProvider` result validated and stored with reservation/terminal audit records. No OpenAI request was sent. |
| 6 | PASS, injected failures | Overlapping start rejected; cancellation stopped between jobs; permanent semantic-repair failure fell back; later batch succeeded; 3/day cap blocked forced reanalysis. An interrupted running state was staged for restart. This is not an OS power-loss test. |
| 7 | PASS | Captured mock request included eligible child evidence and excluded enabled children of disabled and sensitive parents. |
| 8 | PASS | Unapproved application package created in temporary native SQLite. |
| 9 | PASS, deterministic test PDFs | Two synthetic resumes serialized safely and compiled by native XeLaTeX; pdf-lib confirmed exactly one page each; PDFs attached as resume A/B. Model resume generation and human visual PDF QA are NOT VERIFIED. |
| 10 | PASS | Resume A approved; tracker references A and becomes ready. |
| 11 | PASS | Replacement with B revoked approval; tracker references B; preparation gate rejects until fresh approval. |
| 12 | PASS | Resume B reapproved; tracker and package agree. |
| 13 | PASS, separate native process | App quit fully and relaunched. Three jobs, approved B package/tracker, four history events and daily usage 3 survived. Staged running analysis recovered to failed/deterministic fallback without a new AI attempt. |
| 14 | PASS | Material Greenhouse fixture description change archived prior analysis, marked it stale and removed AI score influence. |
| 15 | PASS, injected write failure | Tracker write deliberately failed after approval revocation; preparation remained blocked; explicit retry recovered tracker/package; prior recorded history survived. Full transaction/crash atomicity remains NOT VERIFIED. |

The initial native attempt **FAILED** in the newly added acceptance transport while
decoding PRAGMA integer values as text. Screenshot and preflight log were retained.
The runtime decoder was corrected and tested against actual in-memory native SQLite
integer/real/null/text values. The subsequent initial and restart runs both passed.
There are no unresolved environment BLOCKED scenarios in this run.

Read-only inspection of **only the temporary synthetic database** after shutdown found:

- `PRAGMA integrity_check`: `ok`.
- `PRAGMA foreign_key_check`: no violations.
- One synthetic profile; three mock jobs; three disabled sources.
- One approved resume-B package; matching ready tracker; empty `submitted_at`.
- Four retained tracker-history events and six AI-history rows for three attempts.

## Evidence

- [Prelaunch metadata](native-acceptance-evidence/prelaunch.json)
- [Exact acceptance configuration](native-acceptance-evidence/tauri.acceptance.json)
- [Initial native results](native-acceptance-evidence/stage-one.json)
- [Separate-process restart results](native-acceptance-evidence/stage-two.json)
- [Independent read-only SQLite inspection](native-acceptance-evidence/sqlite-verification.json)
- [Wrong-identifier guard log](native-acceptance-evidence/wrong-identifier-preflight.log)
- [Initial preflight log](native-acceptance-evidence/native-stage-one-retest.log)
- [Restart preflight log](native-acceptance-evidence/native-stage-two.log)
- [Isolated dev startup log](native-acceptance-evidence/native-dev-startup.log)
- [Native dev restart results](native-acceptance-evidence/dev-stage-two.json)
- [Initial transport failure screenshot](native-acceptance-evidence/initial-transport-blocker.png)
- [Initial PASS screenshot](native-acceptance-evidence/native-initial-pass.png)
- [Initial PASS screenshot, bottom](native-acceptance-evidence/native-initial-pass-bottom.png)
- [Restart PASS screenshot](native-acceptance-evidence/native-restart-pass.png)

The original temporary SQLite database and two PDFs remain in the marked root for
inspection. They are not copied into the repository. Evidence JSON/logs/screenshots
contain only synthetic records and isolation paths.

## Bugs discovered and changes

1. **Same-resume recovery no-op:** the package service returned early for an unchanged,
   unapproved selection even when a preceding tracker write had failed. Removed that
   early return; retry now synchronizes the tracker while retaining the approval gate.
   Added a SQLite-fixture regression for the exact failure/retry sequence.
2. **Acceptance SQLite decoder:** declared column metadata is insufficient for computed
   values/PRAGMA rows. Decode runtime SQLite value types, including null. Added a native
   SQLite regression; captured the actual initial failure and successful retest.
3. **SQL path-scope assumption:** inspection of installed `tauri-plugin-sql` 2.4.0 shows
   `commands::load` passes the supplied URI to `DbPool::connect` without checking a
   command scope; `path_mapper` accepts an absolute path. Configured `db` scopes alone
   are not an isolation guarantee. Acceptance mode therefore omits the plugin and
   uses a fixed-path SQLx SQLite command. Production plugin behavior is unchanged.
4. **Fixture preparation corrections:** Ashby requires `apiVersion`; identical descriptions
   across the three mock boards triggered expected deduplication. Fixtures now have
   valid schemas and distinct descriptions. These were harness defects, not product bugs.

New acceptance code lives in `src/lib/acceptance`, `src-tauri/src/acceptance.rs`, and the
preparer script. Bootstrap selects the dedicated harness before normal initialization.
`sqlx` is now a direct dependency using the already-installed transitive version; the
lockfile adds the dependency edge. No schema migration was introduced.

## Architecture assessment and remaining risks

### Package/tracker atomicity: recommended follow-up

Native injected failure confirmed fail-closed approval, but separate records can be
out of sync until explicit retry. The failed transition itself is not guaranteed an
append-only audit event; the existing successful history is preserved, not a complete
transaction journal. A single Rust command should validate current state, acquire one
SQLite connection, begin a transaction, write package/tracker/job and immutable audit,
and commit together. Do not use separate JS `BEGIN`/`COMMIT` plugin calls: the current
plugin uses a connection pool. This is a larger persistence change, not implemented here.

### Cross-process AI caps: protection required for multiple instances

The JavaScript guard protects one runtime. Persisted reservations protect restart and
single-runtime failures, but two independent processes can still read the same daily
capacity and reserve it concurrently. A native transactional reservation/lease with
an atomic daily-cap check is the durable solution. A single-instance policy is useful
additional defense. No multi-process concurrency test was run; use one instance only.

### Stale extension payloads: incomplete revocation

The desktop checks current package approval before preparing/acknowledging data and
again before returning a prepared payload. These checks cannot recall a payload already
sent to Chrome or fields already filled. Bind a fill token to package ID, approval
revision, resume/content hash, job-content hash and expiry; require native revalidation immediately before
fill/upload and revoke export references on replacement. Installed Chrome, expiry and
revocation behavior are NOT VERIFIED in this run; extension IPC was deliberately absent.

### History after interruption

Successful events and AI reservations survive native process restart. Package failure
recovery retains earlier history. A failure between revocation and tracker-history write
can omit the transition audit, and submitted-record preservation was regression-tested
in SQL fixtures rather than exercised with a submitted native application. Transactional
append-only audit is still needed for complete interruption consistency.

### Approved packages after material job changes

The stale-analysis test clears AI influence, but the existing approved package remains
approved after the posting changes. Its PDF is not automatically regenerated or approval
revoked. Approval should eventually bind to the job-content hash and be invalidated when
that hash changes. The native evidence demonstrates this remaining gap; the test does
not certify resume suitability for the changed posting.

### Background discovery

The dedicated harness does not mount the scheduler and native fetching is unavailable;
source rows and automation are disabled. This proves acceptance-mode suppression. It
is not a test of a scheduled live run in the normal product. No native notifications,
external pages, submissions, real candidate records or production tracker were accessed.

## Verification

- Frontend lint/typecheck: PASS.
- Vitest: PASS, 31 files / 147 tests, including both fixture acceptance stages.
- Rust formatting and Clippy (`-D warnings`): PASS.
- Rust tests: PASS, 28 tests including isolation boundaries and native SQLite decoding.
- Extension build: PASS; no installed-extension integration claim.
- Acceptance Tauri build and packaged launch/restart: PASS.
- Standard production Tauri build: PASS; bundled `CareerCompiler.app` without launching its production workflow.
- Isolated Tauri dev startup: PASS; loopback Vite on port 5199, debug native binary, isolation preflight and newly written restart results. The CUA binding to the earlier packaged app could not capture the unbundled debug window; dev screenshot observation was BLOCKED, while native dev execution is proven by its JSON/log. The dev session was stopped.
- Diff/whitespace review: PASS.
- Existing non-fatal Vite bundle-size warning remains.

No commit, push, deployment, paid request, live-board access, notification or application
submission was performed. The working tree's previous changes remain intact.


## Reproduction

From the repository, run `python3 scripts/prepare-native-acceptance.py` and use its
printed path as `CC_ACCEPTANCE_ROOT`. Build with `npm run tauri:build -- --config
<root>/tauri.acceptance.json`, then launch **only** the Acceptance bundle's executable
with the same environment variable. Read `<root>/stage-one.json`, quit the application,
relaunch it and read `stage-two.json`. The identifier/root guard blocks an incorrect
bundle or absent root. Do not substitute `HOME` or use the normal application workflow.
For isolated dev startup use `npm run tauri:dev -- --config <root>/tauri.acceptance.dev.json`
with the same variable; the loopback server uses port 5199. The harness is automatic
and intended solely for disposable synthetic databases, not arbitrary existing data.
