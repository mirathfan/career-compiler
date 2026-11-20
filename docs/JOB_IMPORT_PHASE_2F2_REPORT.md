# Phase 2F.2 — Local Job Import Acceptance

Date: 2026-10-15 (America/Chicago). Branch `ui-ux-overhaul`, HEAD `7ba0dee`.

**Implemented and functionally accepted for local synthetic/mock-only use.** No live extraction,
paid provider, real autofill or external submission was performed or authorized. Existing dirty
work and Phase 2F.1 evidence are preserved. No commit, push, deployment or competing task.

## Reused capabilities and boundaries

- Greenhouse, Lever and Ashby **normalizeJob** methods and shared `normalizedJob`, title/location
  normalization, canonical URL helpers. Import never calls adapter `fetchJobs` or fetch policies.
- Existing deterministic `assessJobFit`, filtered career evidence packet, citation inspector and
  `reconcileApplication`; no second fit engine or application tracker is created.
- Existing semantic `jobFingerprint`, repository `saveJob` and atomic `transaction`, including
  native SQLite transaction protections. No schema changes, new permissions or Rust changes.
- Existing Jobs feed, saved status, resume-preparation/approval/browser gates and Phase 2F.1.1
  focus/scroll recovery. Import does not start matching, resume generation or an application.
- Existing discovery deduplication is broader than appropriate for manual review (including
  company/title/location matches). Import therefore uses a conservative review classifier and
  never invokes its automatic merge behavior. Discovery behavior itself was not changed.

Before implementation, inspected the Jobs, manual Tailor input, adapters/normalizer, fit/history,
job persistence and approval/fingerprint services plus the acceptance/automation/security reports.
The existing manual Tailor workflow remains available; the Jobs Add a job button now opens the
new import dialog rather than entering provider-based analysis.

## Implemented files

| File | Purpose |
| --- | --- |
| `src/lib/jobs/jobImport.ts` | Typed input/draft/correction/preview/save contract, URL boundary, section grouping, conservative duplicates, read-only fit preview and authoritative transactional save |
| `src/lib/jobs/jobImportFixtures.ts` | Four exact synthetic URL mappings and complete synthetic description; static local data only |
| `src/features/jobs/JobImportDialog.tsx` | Four-stage native modal, labelled fields, complete source, evidence, duplicate review, explicit confirmation, cancel/Escape and in-memory draft reuse |
| `src/features/jobs/ImportProvenance.tsx` | Plain-text original description, retrieval type, timestamps, parsed-versus-corrected audit and content revision |
| `JobsPage.tsx`, `JobWorkspace.tsx`, `FitExplanation.tsx` | Existing feed entry point and provenance; read-only eligibility in import fit preview; explicit focus restoration after modal close |
| `src/index.css` | Scoped modal bounds, native centering, wrapping, readable source text and narrow layout |
| Import service/persistence/performance/dialog tests, `JobsPage.test.tsx` | Focused regression coverage and synthetic measurement; jsdom dialog lifecycle shim confined to test files |

## Input and normalization contract

Three distinct typed modes: `url`, `text`, `fixture`. Fixture mode selects a named built-in local
synthetic ATS response, not an arbitrary file or live source. URL mode resolves only the exact
allowlisted synthetic posting URLs displayed in the UI. Text accepts 20–100,000 characters;
correction annotations are separately bounded to 5,000. Runtime schemas validate input, correction
fields, import identity and timestamps at the service boundary, not only in React.

Preview states are CONTENT_UNAVAILABLE, NEEDS_REVIEW, DUPLICATE_FOUND and READY_TO_SAVE. Draft and
step state stay in the mounted dialog only; Save returns a persisted job. No draft table,
localStorage record, application, approved package or browser authorization is created.
Cancellation preserves the draft while the Jobs screen remains mounted. Unsaved drafts are
intentionally lost on application restart; saved imports persist.

The complete original JD is retained, including restrictive and unrecognized wording. Supported
ATS payloads pass through existing normalizers; manual text uses explicit `Company:`, `Title:`,
`Location:`, `Requisition:`, `Compensation:`, `Employment type:`, `Posted:` and `Posting status:`
lines where present. Compensation requires explicit currency/numeric range; absent currency is
never manufactured. A closed status is honored; imported status otherwise does not establish
that a posting is currently open. Missing dates are not replaced with the import date.

Source section grouping preserves responsibilities, required/preferred qualifications and all
unclassified text. Existing fit reasons supply exact clauses for supported experience, education,
graduation, skills, location, start-date and legal checks. This is bounded deterministic parsing,
not exhaustive natural-language extraction. Field certainty distinguishes EXPLICITLY_STATED,
NOT_PROVIDED, AMBIGUOUS and UNKNOWN. Uncertainty and missing content remain visible.

User corrections can review company, title, location, work arrangement, requisition, compensation
and currency. Additional experience/graduation/legal clarifications are appended as **reviewed
annotations**, retaining all original restrictions. They cannot erase source text or alter
candidate evidence. Every preview revision recomputes the semantic job fingerprint and fit.
Existing job updates retain the repository's invalidation contract; this importer deliberately
blocks exact-duplicate overwrite rather than silently editing an already approved posting.

`sourcePayloadJson.version = cc-job-import-v1` stores original input/type, retrieval method,
fixture ID when applicable, original full text, parsed normalized fields, source payload,
correction field/parsed value/corrected value/timestamp, import/review timestamps, review status
and fingerprint. Original text and corrections are displayed separately after reopening.

## URL security contract

No generic fetch endpoint, DNS lookup, browser navigation, redirect handling, file opening or
provider command was introduced. URL parsing uses the platform URL parser and pure string checks.
Only public-shaped HTTPS URLs without credentials, fragments, nonstandard ports, private/IP/local
hosts, sensitive query keys/values or recognized embedded token shapes are accepted. Unsupported
schemes, malformed inputs, numeric/encoded loopback and IPv6 addresses fail closed. Invalid input
errors do not echo the URL; no input logging was added. Credentials used in synthetic rejection
checks are not retained in evidence logs.

Recognized supported ATS structures are Greenhouse `/board/jobs/requisition`, Lever
`/board/requisition` and Ashby `/board/requisition`. Other structures are not claimed as supported
adapters. Employer-style domains are explicitly **unverified**, not declared official by hostname.
LinkedIn, Jobright, Handshake, YC and Wellfound receive classification only, never retrieval.
Meaningful requisition paths/query identity remain distinct; tracking-only parameters are removed.
Exact synthetic fixture mappings are not hostname-wide fabricated fallbacks.

This no-transport design is the primary SSRF boundary; it is **not** authorization or an audited
network-fetch allowlist for a future phase. DNS rebinding, redirects and response limits would
need a separate reviewed design before any live retrieval. No packet-capture claim is made.

Untrusted JD text is rendered through React text nodes/preformatted text, never HTML, executable
Markdown or `dangerouslySetInnerHTML`. Selecting a built-in fixture does not grant arbitrary file
access. Tests exercise hostile HTML-like source, unknown URLs and credential/query attacks.

## Duplicate, history and save consistency

Exact identity requires a compatible canonical URL/company/role or scoped ATS requisition.
URL-derived provider/board scope supports identity across configured source IDs. Conflicting
requisitions remain POSSIBLE_MATCH. Conflicting company/title metadata for a URL is reviewable;
a shared authoritative ATS requisition remains an existing posting even after a display-field
correction. Same company alone is insufficient; different roles/requisitions are not merged.
Reposts without authoritative equivalence are possible matches. Existing application reconciliation
is reused and application statuses/history are never updated by import.

Exact matches offer Open existing job and block Save. Possible duplicate/application matches
require an additional explicit review acknowledgement before saving a separate posting.

Save requires full-description confirmation, company/title and current review fingerprint. Inside
one repository transaction it re-reads candidate evidence, jobs and application history, rebuilds
the preview, verifies freshness/duplicates, then saves. A stale preview must be refreshed and
reconfirmed. A stable draft ID plus provenance comparison makes overlapping/retried saves
idempotent; a changed retry cannot overwrite the committed import. Failures propagate without
calling the success callback. SQLite rollback/reopen regression injects an error after the job
INSERT, verifies no row remains, then retries and reloads persisted provenance.

## Executed acceptance

| Scenario | Automated/local result | Actual native result |
| --- | --- | --- |
| A Synthetic ATS URL | PASS: all three ATS normalizers plus employer fixture | PASS: Greenhouse URL, full source, evidence, duplicate review, explicit save, existing feed |
| B Missing source | PASS: employer/unknown/recognized platform URLs return CONTENT_UNAVAILABLE; fetch spy unused | PASS: unknown employer URL displayed unavailable/manual alternative |
| C Eligibility uncertainty | PASS: ambiguous sponsorship stays NEEDS_CONFIRMATION | PASS: manually pasted case-by-case sponsorship remained Needs confirmation at 720px |
| D Exact duplicate | PASS: same scoped requisition blocked, including metadata correction | PASS: repeated URL showed EXACT MATCH; Save disabled; cancelled without a write |
| E Possible duplicate | PASS: reposts/conflicting IDs/company-role matches remain distinct with acknowledgement | PASS: manual same-company/role posting showed POSSIBLE MATCH, required acknowledgement, saved separately; no history merge |
| F Cancellation/draft | PASS: preview is read-only, cancel callbacks at every stage, actual parent close/reopen retains draft | PASS: Escape on input/duplicate stage restored Add a job focus; pending manual draft cancellation left 21 jobs/one committed import; reopening retained it. Native cancellation at every individual intermediate stage is NOT VERIFIED |
| G Save/restart | PASS: SQLite exported/reopened after failed write and after successful save | PASS: full native process restart; both imports and the reviewed location correction/original description/timestamps restored |
| H Meaningful change | PASS: meaningful annotations change fingerprint/fit; formatting-only changes retain semantic fingerprint | PASS: 7 professional years annotation recomputed fit to Excluded; removing transient annotation restored Needs confirmation before save |
| I Unsafe URL | PASS: scheme, credentials, sensitive/encoded keys, IP/private/local targets rejected | PASS: credential-bearing synthetic URL rejected with generic error; no content retrieval |
| J Keyboard | PASS: modal controls and existing Jobs/citation focus regressions | PASS: complete desktop URL import via keyboard (including evidence inspect/close and explicit save); native 720px controls, final keyboard acknowledgements/save and Escape tested. Full keyboard-only correction workflow at 720px is NOT VERIFIED |

Desktop native window was 1280×820 points. Existing trusted AX controls set the actual native
window to **720×800 points**, verified by CoreGraphics (`native-720-bounds.txt`). Screenshots are
actual synthetic acceptance-window captures, not browser viewport simulations. Long content was
scrollable; reviewed duplicate confirmation/actions wrapped and remained usable at 720px.

An actual native defect was discovered and fixed: WebKit pointer-opened modal cancellation
returned focus to the page container. Jobs now supplies the actual Add a job button ref, and
close restores it only after a previously open dialog closes. No initial-load/global focus jump.
The corrected native Escape and successful-save results both focused Add a job. Modal centering
was also explicitly scoped to avoid the app's CSS reset removing the native default margin.

CUA sometimes omits a focused-element line for text inputs. A bounded keyboard-target scan could
not identify Company; no correction was performed during that scan. The completed desktop
keyboard import did not require a field correction. The separate native manual location correction
used labelled AX field editing. This limitation is not presented as a successful keyboard-only
correction test. Actual VoiceOver speech and native paint latency remain NOT VERIFIED.

### Test/build evidence

**67 tests across 7 focused files PASS**, lint PASS, typecheck PASS, acceptance Tauri production
build PASS, whitespace check PASS. No frontend test failures were suppressed. Initial failures
exposed jsdom's absent native dialog lifecycle APIs and overly broad test expectations of the
existing parser; test-only lifecycle shims and explicit supported-versus-unsupported wording
coverage address those distinctions. The parser was not changed to make fixtures pass.

Rust/native persistence code, extension and Python implementations were not changed, so their
historical full-suite baselines were not rerun. The acceptance build compiles the native product;
SQLite repository rollback/restart and actual packaged save/restart were exercised separately.
Actual native process death **during** an import commit is NOT VERIFIED; deterministic SQL failure
and repository reopen are not falsely described as that process-interruption scenario.

## Local performance observations

Apple M4, macOS/darwin arm64, Node 24.12.0, Vitest/jsdom, MemoryRepository. Five warm samples;
preparation excluded. Raw samples are in `performance.json`:

| Operation | Median | Observed range |
| --- | --- | --- |
| Group sections from 100,000-character JD | 0.369 ms | 0.341–1.497 ms |
| Conservative duplicate scan, 500 synthetic records | 2.884 ms | 2.029–4.090 ms |
| Full preview, 20 jobs plus synthetic career snapshot | 5.876 ms | 4.671–11.046 ms |

These are local computation observations, not native GUI paint, SQLite IPC, screen-reader or
end-to-end responsiveness measurements. No improvement claim or production throughput guarantee.

## Isolation and artifacts

Only the retained marked root was used:
`/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-kbz3c8za/native.sqlite3`.
Bundle identifier `com.mirathfan.careercompiler.acceptance`; explicit acceptance root/UI/Jobs
flags; native preflight plus repository `PRAGMA database_list` agree. Runtime forced mocks,
zero configured sources, disabled discovery/polling, no production HTTP/Keychain capability,
and bridgeMode false remain in place. No alternate root or production bundle was launched.

Final database: **22 synthetic jobs** (20 retained plus two explicitly saved imports), **0 packages**,
**0 AI reservations/authorizations**, integrity **ok**, **0 foreign-key violations**. One existing
`synthetic-applied` fixture-history row remains unchanged; **zero actual external submissions**.
Candidate records were not modified by this workflow. Owned native processes are stopped.

Evidence under `docs/job-import-evidence/phase2f2/` includes:

- Tests, lint, typecheck, final build and raw performance logs/JSON.
- Native input/URL preview, unavailable content, duplicate/uncertainty/changed-requirement screenshots.
- Keyboard event/focus transcripts and native save/restart/provenance captures.
- Native 720px bounds and existing AX resize source/result.
- Before/cancel/after-restart database checks and native process/path/startup JSON.
- Unsafe validation error transcription with rejected input omitted (identified as transcription,
  not an accessibility snapshot).

Native executed PIDs: 87318 initial checks, 88213 corrected dialog/workflow, 89315 restart, and
90354 final layout smoke. Startup logs retain their identities. No new permissions, browser
installation/registration, credentials, account/model/security changes, paid APIs, live URLs,
notifications, real records or submissions were used. No commit/push/deploy or branch change.

## Remaining limitations and recommendation

- No live URL retrieval, generic scraper or arbitrary payload-file importer. Named local fixture
  selection is the supported payload input. Unsupported sites require manual full-JD paste.
- Deterministic parsing remains conservative: standalone `Required qualifications:` can add a
  manual-review reason, and wording such as “production engineering experience” may remain
  Needs Confirmation rather than an automatic disqualification. Restrictive source text remains
  visible and projects do not satisfy professional experience. No broad parser redesign here.
- Corrections append clarifications; there is no silent removal of source restrictions or import
  overwrite/merge of existing approved jobs. Unrecognized metadata requires manual review.
- Drafts survive dialog close/reopen in the mounted screen, not process termination. Persisted
  imports survive actual native restart. Actual kill-during-save remains unverified.
- VoiceOver, reliable native paint timings, exhaustive narrow keyboard correction and cancellation
  at every individual native step remain NOT VERIFIED. Component results are distinguished above.

GO for continued isolated local/mock import use. Next bounded increment should address conservative
section-heading/experience parsing with targeted fixtures and complete the remaining accessibility
checks before considering any separately reviewed retrieval design. **NO-GO for live fetching,
paid models, real autofill or submissions.** No later phase was started or authorized by this work.


## Phase 2F.2.1 — Import Correctness and Accessibility

2026-10-15 (America/Chicago). **Targeted parser and native accessibility closure PASS.**
The remaining deterministic process-interruption check is NOT VERIFIED; this is not a claim of
universal failure recovery or assistive-technology certification. Historical results above remain
intact; the formerly unverified every-stage cancellation and 720px keyboard correction are
superseded only by the actual execution described here.

### Root causes and production changes

1. The fit engine split every nonempty line into a requirement candidate. A standalone Required
   Qualifications heading therefore matched the fallback `required` rule. Added shared
   `requirementClauses.ts`: only exact known section headings (optional Markdown prefix/colon)
   are structural metadata. Original full text remains unchanged. Malformed/mixed headings and
   substantive unsupported requirements are still reviewable. The import section preview uses
   the same heading recognizer.
2. The old duration regex allowed professional/industry/commercial immediately before experience,
   missing production/software/engineering/development phrases, while treating an unspecified
   “years of experience” as professional employment. Recognition now requires an explicit known
   professional category for automatic employment-year comparison. Narrow supported categories
   include professional engineering, production engineering, production software engineering,
   industry software development and full-time professional development. Generic/relevant/academic
   experience durations remain Needs Confirmation, with their original wording.
3. Section context keeps preferred qualifications optional. Required headings do not hide unknown
   substantive requirements; explicit preferred clauses stay optional, while mixed mandatory and
   preferred wording requires review. User-reviewed additional constraints form a separate required
   section, rather than accidentally inheriting a preceding preferred section.
4. Only eligible dated employment counts toward professional duration. Coursework, personal or
   unpaid independent projects and hackathons do not become employment years. Internship inclusion
   requires positive posting language; negated equivalence is not acceptance. Explicit project
   equivalence permits manual review, never a numeric project-to-employment conversion. Scoped
   engineering/software requirements do not silently use unrelated job titles; insufficient category
   evidence stays uncertain. Full-time hours are not inferred from dates: sufficient duration with
   unverified schedule remains reviewable. This is conservative tenure checking, not a general
   occupational/FTE verifier.
5. `FIT_ASSESSMENT_VERSION` is now **cc-job-fit-v2**. `fitFeed` binds this into evidence cache keys
   and refuses legacy cached assessments. Existing snapshots recompute without provider work.
   Semantic job-content hashing, candidate evidence filtering, package/approval/PDF/browser
   authorization contracts and URL validation are unchanged.

Changed production files: `requirementClauses.ts`, `fitAssessment.ts`, `fitFeed.ts`, and the
shared heading use in `jobImport.ts`. No new parser/model dependency, schema, native capability,
background work or Jobs redesign. No production UI changes were needed to complete keyboard editing:
the earlier focus-observation gap was resolved using an already authorized **read-only** native AX
query while all actual navigation/editing remained CUA keyboard input.

### Regression verification

**121 focused tests across 8 files PASS**: new parser boundaries, existing deterministic fit,
fit cache persistence, job import/security, transactional import persistence/recovery, import
accessibility, Jobs navigation and citation focus. **27 new parser boundary cases** cover exact
headings, mandatory/preferred sections, each requested professional category, generic/ambiguous
and missing duration, positive/negated internship/project equivalence, no project conversion,
non-employment evidence, unrelated employment titles, full-time uncertainty, legal independence,
formatting/meaningful revisions, citation validity and legacy-cache recomputation.

Initial reproduction: 14 of the first 20 boundary cases failed against the previous implementation;
6 already passed. Those failures were corrected, not suppressed. Earlier import tests expecting
production-engineering uncertainty now assert the stronger explicit professional requirement.
Lint PASS, typecheck PASS, acceptance production build PASS, whitespace check PASS. No historical
full frontend/Rust/Python suites were repeated. Rust, PDF/extension authorization and persistence
implementations were not changed. Existing rollback/reopen regression was rerun as part of the
focused suite; it is not relabelled as process-death testing.

### Every-stage actual native cancellation

The packaged acceptance app used the existing marked root and actual **720×800-point** window,
verified by CoreGraphics. The Mac was initially locked; a later authorized CUA check found the
desktop accessible and all pending GUI scenarios below were then executed. They are not BLOCKED
in the final result. Only the acceptance window was captured.

| Native state cancelled | Result | Reopen observation |
| --- | --- | --- |
| Initial input | PASS | Input stage retained; no saved job |
| Source/content preview | PASS | Complete parsed source preview retained |
| Manual correction | PASS | Unsaved location edit retained in form only |
| Fit/evidence review | PASS | Draft remained at fit stage; no candidate eligibility write action available |
| Duplicate review | PASS | Same exact existing posting shown; Save remained blocked |
| Ready-to-save confirmation | PASS | Confirmation checked and Save enabled before Cancel; reopening retained the current in-memory review state, with no persisted job |

All six used the actual Cancel import control and restored native focus to **Add a job**. Native
AX/screenshot before and after each stage is retained. SQL checkpoints after each consecutive pair
remained **22 jobs, 1 existing synthetic history row, 0 packages, only 22 job_fit cache records**.
No job deletion path ran; no application, package, AI reservation, browser authorization or submission
was created. Reopened drafts are volatile screen state, not package approval or process-persistent
records. Unsaved drafts still do not survive application termination.

### Complete native 720px keyboard correction — PASS

After input-mode setup, the complete workflow used **keyboard input only**:

1. Enter on focused Add a job opened the modal.
2. Tab reached the full-JD field; keyboard paste supplied the synthetic Keyboard Closure Labs JD.
3. Enter on Preview opened the correction form.
4. Four Tab presses from its heading reached Location. Read-only ApplicationServices AX query
   reported `AXRole AXTextField`, `AXTitle Location`, `AXValue Seattle, WA`.
5. Command+A and keyboard paste changed it to `Seattle, WA (keyboard reviewed)`; a second read-only
   AX query and visible focus screenshot confirmed the exact field/value. No AX setValue/pointer
   edit was used during this workflow.
6. Tab/Enter advanced through fit and evidence inspection. The source's **3 years of production
   engineering experience** correctly showed Excluded with 0 documented employment years; the
   standalone heading was absent as a requirement. Missing Rust in Preferred Qualifications was
   shown separately as a preferred gap. Legal checks remained independent.
7. Keyboard navigation reached duplicate review, checked explicit confirmation with Space and
   activated Save. Focus returned to Add a job.
8. Keyboard Back returned to the saved row; Enter reopened details. Keyboard expansion of Import
   provenance, Original complete description and Reviewed corrections showed original text and
   `location: Seattle, WA → Seattle, WA (keyboard reviewed)` with its timestamp.

All meaningful transitions have action/focus logs and actual screenshots. CUA omitted some focused
text-field lines; native read-only AX observation resolved that limitation without new permissions,
settings changes or pointer substitution. The saved job remains **Excluded**; saving a posting is
not approval to apply. Score and eligibility remain distinct. Its complete source, reviewed
correction and confirmation provenance were independently verified through the temporary SQLite.

### Controlled interruption — NOT VERIFIED

Inspected existing `runNativeInterruptionProbe`: it assumes an existing approved package/tracker,
begins a transaction, modifies package/tracker/revision/audit records, emits `interrupt-ready.json`
and pauses before COMMIT. It does **not** pause a reviewed import transaction. The retained import
root has zero packages. The test bridge also has no reviewed-import pause command.

Consequently no independently disposable copy was created or killed: the precondition for a
relevant deterministic import interruption test is absent. The retained original root was not
used for a risky kill experiment. No timing-based termination or production test hook was added.
SQL failure-after-INSERT plus repository reopen remains PASS, and earlier native save/restart
remains historical PASS, but neither establishes actual process death during import commit.

### Evidence and safety

New evidence is under `docs/job-import-evidence/phase2f2/closure/`:

- `parser-before.log`, `tests.log`, `lint.log`, `typecheck.log`, build logs.
- `cancel-*-before.txt/.png`, `cancel-*-after.txt`, `ready-reopened.*` and
  `native-cancellation-checks.json` for the six executed cancellation states.
- `keyboard-location-before.*`, `keyboard-location-after.*`,
  `keyboard-location-focus-before.txt`, `keyboard-location-focus-after.txt`, plus the scoped
  read-only AX source used for observation.
- `keyboard-actions.json`, `keyboard-fit-review.*`, `keyboard-saved.*`,
  `keyboard-reopened-provenance.*` for actual keyboard flow/provenance.
- Native path/startup JSON, verified 720px bounds and resize log/source, initial/final safety JSON.

PID **94293** ran against the retained
`/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-kbz3c8za/native.sqlite3`.
Native preflight and actual repository paths agree. The original 22 jobs survived cancellation;
only the explicitly saved keyboard test added one, yielding **23 synthetic jobs**. SQLite integrity
`ok`, foreign-key violations **0**, packages **0**, AI reservations/authorizations **0**, configured
sources **0**. Existing `synthetic-applied` history is unchanged; actual external submissions **0**.
All local fit snapshots use v2. Candidate records, production data and credentials were untouched.
No discovery, paid provider, real ATS/autofill, notifications, browser installation/registration,
security/account/model settings, commit/push/deploy or competing coding task was used. Original dirty
paths remain present and branch/HEAD stay `ui-ux-overhaul` / `7ba0dee`. Only owned test processes
were stopped after checks.

**Recommendation:** GO for continued isolated local/mock import use. The two targeted parser issues,
every-stage native cancellation and full 720px keyboard correction are closed. Actual kill-during-import,
VoiceOver announcements and reliable native interaction timing remain **NOT VERIFIED**. Those precise
limits prevent claiming comprehensive failure/accessibility certification; no later increment, live
retrieval, paid API, real autofill or submission is authorized. No permission approval is pending.

Final build smoke: PID **96894** booted the final compiled source and reached
`repository_verified` on the same 23-job temporary database; startup and Jobs JSON are retained
with `final-` names. The complete native cancellation/keyboard cycles above used PID 94293;
the final additional software-title scoping guard was covered by its new regression and final
build/boot, without repeating those unchanged native UI workflows. Both owned processes stopped.
