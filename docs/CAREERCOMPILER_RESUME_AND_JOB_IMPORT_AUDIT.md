# CareerCompiler résumé and job import audit

## A. Executive summary

**PARTIAL — existing defects repaired; missing integrations and native verification remain.** Audit performed 13 November 2026 against `/Users/athfan/Desktop/career-compiler`. This is a functional repair, not another AI feature sprint.

| Owner-reported problem | Classification | Actual finding |
|---|---|---|
| Is internet access working? | **WORKING** for one public host diagnostic; native connectivity **UNVERIFIED**; error classification **FIXED** | A bounded, unauthenticated public Greenhouse request returned HTTP 200. The app has specific ATS/OpenAI transports, not a general website importer. No live native request or paid AI call was made. |
| How do I upload/create a résumé? | PDF/DOCX upload **MISSING**; intake grounding/discoverability **FIXED**; structured creation **WORKING** in synthetic tests | Résumés now links to existing reviewed text intake. Mock intake previously injected canned education/achievements unrelated to input; that defect is fixed. Complete profiles create a Master and child; incomplete evidence blocks creation. |
| Does tailoring change the résumé for each job? | Job-specific ranking **WORKING**; meaningful final retargeting **UNVERIFIED / not demonstrated in these mock scenarios** | Backend and AI jobs produce different first project selections. The conservative merge retains the Master's order/content; all three rendered documents are identical. This is not a successful meaningful-tailoring acceptance. |
| Why does a LinkedIn URL fail? | Direct retrieval **MISSING**; manual fallback **FIXED** | The Add a job resolver only handles exact local fixtures. It never fetched this LinkedIn URL. Fallback now retains a validated source URL and the manually pasted description through reviewed saving. |

No observed LinkedIn result is classified EXTERNALLY BLOCKED: no LinkedIn request was made, so authentication, expiry or anti-bot blocking cannot be diagnosed. The external-service failure categories are tested with synthetic responses.

Evidence directory (**E** throughout): `/Users/athfan/Desktop/career-compiler-functional-audit-20261113-165547`. Current baseline: branch `ui-ux-overhaul`, HEAD `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`. All 1,302 source files and the working-tree status matched the Sprint 4.4 recorded state before edits. Sprint 4.2, 4.3 and 4.4 reports were reviewed as historical evidence, not counted as new passes.

## B. Actual internet connectivity architecture

- Tauri's production CSP is currently `null`; its capability file grants existing core/dialog/filesystem/opener/SQL capabilities. These are unchanged. CSP does not establish whether a particular network request succeeds.
- `src-tauri/src/commands/job_sources.rs` performs native `reqwest` HTTPS requests to exactly `boards-api.greenhouse.io`, `api.lever.co`, `api.eu.lever.co` and `api.ashbyhq.com`. It is not arbitrary SQL, arbitrary file access or a general URL fetch command.
- ATS adapters construct known JSON API endpoints from validated board identifiers. Native requests retain 1–30 second timeouts, a 5 MB response bound, two native attempts and bounded redirects. The frontend retains its existing default two attempts, maximum three. No retry or spend budgets were increased.
- Initial and redirected URLs now share the same validation: HTTPS, port 443, approved host, no credentials or fragment. Disallowed hosts, local/private IP targets, file URLs and unsafe redirects fail closed. Responses must have a JSON media type.
- Outside Tauri, the adapter uses browser fetch, subject to browser CORS/network behavior. Verified synthetic runtime routes source requests to fixtures. Browser tests below used this isolated runtime, not the production transport.
- OpenAI requests use the existing native Responses endpoint, Keychain resolver, structured schemas, validation and applicable budget gates. Copilot retains its existing `store:false` behavior. Nothing in this audit changes credentials, provider settings, outbound authorization or budget rules. Actual owner configuration was not read. Live provider connectivity remains unverified.
- The extension uses paired native messaging and explicit supported ATS-page actions. Its existing manifest contains broad host permissions, but the action dispatcher validates supported application URLs and pinned authorization. It is not the Add a job URL retriever or a LinkedIn import integration. No extension installation, pairing, browser-session access or security change occurred.

| Capability | Current implementation |
|---|---|
| General public HTTP/HTTPS website import | No general-purpose import endpoint. Desktop ATS retrieval permits specific HTTPS API hosts only. |
| Retrieve a posting from arbitrary URL in Add a job | Missing; exact synthetic fixture URLs and manual text are supported. |
| Live discovery from configured ATS boards | Implemented for Greenhouse, Lever and Ashby; adapter normalization tested with fixtures. Actual native feed retrieval not exercised here. |
| Configured model requests | Implemented and mocked in tests; no live/paid verification. |
| Local operation | Profile, evidence, jobs, application tracking, local Copilot, deterministic/mock generation and review work without a remote provider. XeLaTeX requires an installed local runtime. |

## C. Verified network capabilities and failures

At `2026-11-13T16:59:30Z`, a Python read-only GET to `https://boards-api.greenhouse.io/v1/boards/stripe` returned HTTP **200**, `application/json`, 30 bytes in 0.131 seconds. It used no supplied cookies/authentication, disabled redirects, and enforced 12 seconds / 64 KiB bounds. Only diagnostic metadata and a response digest were retained. This proves host reachability from the tool environment at that time, not general connectivity of the owner's running desktop app. See `E/public-network-diagnostic.json`.

Native and browser error handling now distinguishes authentication required (401), access denied (403), missing source (404/410), rate limit (429), timeout, connection failure, invalid JSON, blocked host/redirect and unexpected content type. Permanent failures are not repeatedly retried by the frontend. Unknown transport strings are sanitized rather than displaying possible private URLs. Missing provider credentials remain the existing provider/keychain error, not an offline diagnosis. No misleading global Online badge was added.

## D. Résumé upload: supported, broken or missing

**PDF upload: MISSING. DOCX upload: MISSING. Scanned/image-only OCR: MISSING.** There is no document file chooser/parser in Résumés or Smart Career Intake. No PDF/DOCX file-selection success is claimed.

Existing alternatives:

1. **Profile → Import experience / Smart Career Intake** accepts pasted text and a structured career-package JSON string. It reconstructs proposed career records, not an editable copy of the source document or its layout. It requires review and approved persistence; import batches support existing undo.
2. **Career evidence → supported local evidence file** has the native chooser for `.md`, `.json`, `.toml`, `.txt`. Native validation enforces regular bounded UTF-8 content, maximum **1,000,000 bytes**. Unit tests cover oversized and valid reads and PDF/DOCX/PNG extension rejection. Native chooser interaction was blocked by tooling.
3. Local/mock text extraction is deliberately limited: recognizable project titles/headings, bullet statements and skill tags. It does not fully parse arbitrary employment, contact, education and date layouts. Missing information must be entered/reviewed in Profile. Structured package import remains a separate validated format (10 MB text limit).

The mock provider previously added an Illinois Institute of Technology Master's degree to unrelated résumé text and replaced project-report input with canned CareerCompiler accomplishments. It also selected adversarial fixtures based on ordinary input phrases. Ordinary mock intake now passes the **actual supplied text** into the existing deterministic extractor. New locally extracted facts default to `needs_review`. Focused tests verify no injected school, degree, canned achievements or unrelated metrics, and review before persistence. Input text is not rewritten into a fictional résumé.

A synthetic UI test confirmed that generating a proposal did not mutate profile, facts, jobs, résumés, applications or history. The complete synthetic creation fixture's education/work experience were explicitly seeded structured records; their presence in the output is **not evidence of complete résumé-text extraction**.

## E. Existing résumé creation workflow

`Résumés → Create a resume` routes to the existing job-first tailoring screen. After job analysis/save, users choose an existing base or **Create starter Master Resume** from structured profile/evidence, then confirm the base. There is no separate polished profile-only creation wizard in this route.

The Master service combines profile header, enabled education, eligible career facts, project/work records and skills. Needs-review/prohibited evidence is excluded. The synthetic complete profile produced Projects, Experience, Education and Skills, with all three bullets bound to real fixture fact IDs. A profile with no eligible experience was blocked with an actionable error and no résumé write.

Existing library options include Duplicate, Mark as master and Edit for non-Master versions. Reconstructed structured versions can therefore be designated as Master; an uploaded PDF cannot. `Mark as master` operates on a saved version and resets its parent/base linkage. Ordinary Edit saves the selected child version. Those direct edit/promotion paths were not used in this audit's preservation scenario; use Duplicate before changing a version already used by an application. This report does not claim universal immutability of every manual edit path.

The preview is an in-app HTML rendering until PDF compilation/export. Generated drafts have claim validation, source fact references and explicit review. PDF export is enabled only after the relevant review/validation requirements. Native preview/download/export, Finder reveal and file-dialog cancellation were not exercised this run.

## F. How job-specific tailoring actually works

Pipeline inspected/tested: structured profile and eligible evidence → selected job → analysis → deterministic fact scoring/planning → selected base → bounded generation request → mock/configured provider → local claim validation → conservative base/child merge → review → escaped LaTeX → XeLaTeX/page validation → native export.

| Required scenario | Actual result |
|---|---|
| A: Complete profile | **PASS** for structured Master creation, real evidence references, browser preview and standalone one-page PDF. Native download unverified. |
| B: Backend Engineer | **PASS** for Backend requirements affecting evidence ranking/proposed first project, child lineage and validation. **Not demonstrated**: meaningful final wording/selection change after conservative merge. |
| C: AI Engineer | **PASS** for a different proposed first project using AI evidence; same preservation/validation. Final rendered content remains identical to Master/Backend in these mock fixtures. |
| D: Incomplete profile | **PASS**: no invented experience; UI blocks starter creation from unreviewed-only evidence. |
| E: Existing résumé | **MISSING** direct document import; reviewed text reconstruction plus profile completion and Master creation are available. Existing saved structured versions are usable bases. |

`E/resume-functional-audit.json` records `audit-master`, `audit-backend-job-child`, `audit-ai-job-child`, a separate `audit-submitted` and its synthetic application linkage. Master, submitted content and application identity remained exactly unchanged through both child creations. All selected bullets cite supplied facts and match their text. Backend proposes `audit-backend` first; AI proposes `audit-ai` first. The controlled merge intentionally retains base sections/order, and default mock generation retains these facts' wording. The browser displays **0 categorized changes / No semantic changes** for this case.

Three real XeLaTeX PDFs passed page count, text extraction and visual inspection. All have the expected synthetic name/headline/sections, three exact evidence-backed bullets, readable type, no observed clipping/overlap and **one Letter page**. Input LaTeX SHA-256 for all three: `46234522b5896c07971c758248836360f6f271052d956d74cc07846e8090f74f`. Rendered PNG hashes also match. Different PDF byte hashes reflect independently compiled artifacts, not different résumé content. Version-to-input/output bindings are in `E/pdf-results.json`.

Artifacts: [Master PDF](/Users/athfan/Desktop/career-compiler-functional-audit-20261113-165547/pdf-master/resume.pdf), [Backend child PDF](/Users/athfan/Desktop/career-compiler-functional-audit-20261113-165547/pdf-backend/resume.pdf), [AI child PDF](/Users/athfan/Desktop/career-compiler-functional-audit-20261113-165547/pdf-ai/resume.pdf). These are standalone synthetic render checks, not native exports or submitted application files.

## G. LinkedIn URL reproduction and root cause

`jobImport.ts → content()` classifies/canonicalizes URLs, then resolves only exact entries in `importFixtures`. For any other URL, `previewJobImport()` returns `CONTENT_UNAVAILABLE` without a request. Recognizing `linkedin` does not mean the integration can retrieve LinkedIn.

Tests cover standard `/jobs/view/`, tracking parameters, `lnkd.in` short URL, sign-in/checkpoint URL and a nonfixture Lever posting. They all remain unsaved and make no fetch call. Invalid schemes/private targets/token-bearing URLs fail validation. An expired, public structured-data, redirected or gated page cannot be distinguished by this resolver because it does not fetch pages. No synthetic HTML is presented as evidence of an unimplemented generic HTML/JSON-LD parser. No cookies, authenticated LinkedIn session, bypass or scraper was used.

## H. Supported job-source extraction behavior

Greenhouse, Lever and Ashby adapters normalize their supported API JSON payloads, including HTML-to-text descriptions. Existing fixture tests cover complete job import and safe rendering of hostile text. Exact local fixture URLs can preview/save as explicitly labelled synthetic data. A real nonfixture ATS URL pasted into Add a job is still unsupported there; configured source discovery is a separate workflow.

Manual import keeps the original full text and source provenance. Explicitly labelled Company, Title, Location, Requisition and Compensation fields are parsed; original restrictive requirements and required/preferred sections remain available for review. Work arrangement is reported with its existing certainty semantics, not guaranteed inferred truth. Missing employment type, date, salary or source ID remains missing unless supplied by the source/review. Native JSON adapters reject HTML sign-in responses rather than pretending they are postings.

## I. LinkedIn failure fallback

The dialog now says CareerCompiler could not retrieve the LinkedIn posting directly and offers **Paste description instead**. It additionally explains that direct LinkedIn retrieval is not implemented and no request was made.

Fallback carries the canonical source URL into a labelled optional field. The user pastes the complete description, reviews extracted fields/unknowns, fit/eligibility, duplicates/history, then explicitly confirms Save job. The saved record retains the source URL, exact description, original input and `manual_paste` provenance. It is never labelled remotely extracted.

A second defect surfaced during this actual UI journey: unsaved job-search preferences receive new timestamps on each read, falsely making the preview stale before the first save. The review fingerprint now ignores those metadata timestamps only. Actual preference value changes still reject stale acceptance. Source text is preserved without trimming its original contents; whitespace-only input is rejected.

## J. UX issues discovered

Fixed discoverability: **Import résumé text** now appears beside **Create a resume**. Library/Profile copy explains supported text reconstruction, missing PDF/DOCX uploads, job-first creation, base selection and preserved child creation. The previously misleading “Paste or upload” language now says “Paste text”. Input labels are accessible; Source URL help is a description rather than part of its control name.

At 1440×900, the actual React app completed library → text proposal, LinkedIn fallback → reviewed save, and complete-profile Master → child → reviewed HTML preview. At 720×800, library, intake and job-import dialog had no horizontal overflow; Escape dismissed the dialog and restored Add a job focus. Browser screenshots were visually inspected. Compact intake requires vertical scrolling to reach the composer; this is not a native keyboard/VoiceOver pass.

Screenshots: [résumé entry](/Users/athfan/Desktop/career-compiler-functional-audit-20261113-165547/resume-entry.png), [LinkedIn explanation](/Users/athfan/Desktop/career-compiler-functional-audit-20261113-165547/linkedin-unavailable.png), [manual review](/Users/athfan/Desktop/career-compiler-functional-audit-20261113-165547/manual-job-review.png), [reviewed child preview](/Users/athfan/Desktop/career-compiler-functional-audit-20261113-165547/resume-export-ready.png), [compact import](/Users/athfan/Desktop/career-compiler-functional-audit-20261113-165547/compact-job-import.png).

## K. Reproduced defects fixed

1. Canned résumé education/achievements injected by mock intake → actual-input deterministic extraction.
2. Unreviewed local intake facts classified as already user-provided → default `needs_review`.
3. LinkedIn fallback lost the source URL → validated optional provenance retained across preview/save.
4. First import rejected as stale solely from default preference timestamps → stable value-based fingerprint, genuine stale-value rejection retained.
5. Generic source-fetch failures concealed cause → bounded safe categories, permanent-failure retry suppression, consistent redirect validation and JSON content check.
6. Hidden intake/misleading upload and creation copy → direct library link and accurate descriptions using existing screens.

No document parser, LinkedIn scraping, schema migration, replacement AI system or new mutation permission was introduced.

## L. Missing major features requiring approval

- **PDF/DOCX import:** explicit native file selection, extension/magic/size validation, local text extraction, scanned-document detection, an optional separately approved OCR design, bounded structured proposals, field-level provenance, review before save, duplicate handling and a safe reconstructed-Master/child creation path. Preserve the input document; do not pretend its original layout is editable. No parser/OCR installed here.
- **Real URL retrieval:** first consider a bounded resolver for the already-supported public ATS APIs with explicit source identity/redirect rules. LinkedIn needs a separately approved supported data-access approach; browser authentication scraping is not an acceptable implicit fallback.
- **Tailoring clarity:** explain no-op generation before saving a child; separately scope an explicit reviewed selection/reordering flow if the conservative merge should change. Do not silently remove Master material or invent mock rewrites to make the audit pass.
- Manual library editing/promotion of previously submitted versions deserves an explicit preservation review; the tested creation path is safe, but that is not a blanket guarantee about every edit path.

## M. Synthetic and native test results

All automated checks ran in the **existing** verification source copy, not against production databases:
`/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/verification-source`.

`E/check.py` uses the established dedicated QA HOME/temp/cache, offline package tooling, removes acceptance runtime activation and injects only the evidence output path. Unit tests use MemoryRepository and established synthetic SQLite/SQL.js fixtures. Browser tests use fresh MemoryRepository state and mocked providers; nonlocal browser requests are blocked. Reloading that browser fixture reseeds it, so **no restart-persistence claim is made from browser reloads**. Existing persistence/approval/undo/provenance tests passed in the full suite.

Executable prefixes (exact):

```text
NODE=/Users/athfan/.local/node-v22.23.4/bin/node
NPM=/Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js
CARGO=/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo
```

Each command is recorded with exact argv/cwd/exit code/time in `E/*-result.json`, with its full log beside it. These are actual current-run results:

| Command after `python3 E/check.py <label>` | Result |
|---|---|
| `NODE node_modules/vitest/vitest.mjs run --maxWorkers=1` | **PASS: 850 tests, 2 existing skips, 101 files**. Includes Jobs/import/persistence, résumés, career intake, Career AI approval/undo, history/provenance and existing regression suites. |
| Focused nine-file run listed in `focused-final-result.json` | **PASS: 87 tests** before final test-type/label corrections. Initial failing reproduction logs retained. |
| `NODE NPM run test:run -- src/lib/tailoring/resumeFunctionalAudit.test.ts src/features/resume-library/ResumeEntryPoints.test.tsx` | **PASS: 4 tests**, after correcting a test's invalid project-count literal and Testing Library options; stronger evidence assertions retained. This run generated the final PDF inputs. |
| `NODE NPM run test:run -- src/features/jobs/JobImportDialog.test.tsx` | **PASS: 5 tests**, after final exact accessible Source URL label adjustment. |
| `NODE NPM run test:run -- src/lib/job-automation/adapters/networkFailures.test.ts` | **PASS: 19 tests**, including 8 additional browser HTTP/JSON/connection/timeout/cancellation cases added after the full run. Do not report 858 as a single full-suite run. |
| `NODE NPM run typecheck` | **PASS**, final rerun. Initial new-test type errors fixed, not suppressed. |
| `NODE NPM run lint` | **PASS: 0 errors, 1 existing no-control-regex warning** in untouched `applicationActionContract.ts`. |
| `CARGO test --manifest-path src-tauri/Cargo.toml --locked --offline` | **PASS: 42 tests**, zero failures. Includes 2 new source validation/classification tests; evidence-file test extended. |
| `CARGO fmt --manifest-path src-tauri/Cargo.toml --check` | **PASS**. |
| `CARGO clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --offline -- -D warnings` | **PASS**. |
| `NODE NPM run build` | **PASS**, existing >500 kB chunk warning. |
| `NODE NPM run tauri:build -- --debug --no-bundle -- --locked --offline` | **PASS**, executable compiled only, not launched/distributed. |
| `NODE E/browser-audit.mjs`; `NODE E/browser-compact.mjs` | **PASS**, real React UI with synthetic repository; no external requests or page errors; owned browsers closed in finally. |
| Existing TinyTeX `xelatex -no-shell-escape -interaction=nonstopmode -halt-on-error -file-line-error resume.tex` | **PASS ×3**, dedicated `E/pdf-{master,backend,ai}` directories/HOME/runtime. |
| Bundled Poppler `pdfinfo`, `pdftotext -layout`, `pdftoppm -png -scale-to 1400 -singlefile` | **PASS ×3**, text/page checks and visual inspection; exact commands/paths in PDF artifacts. |

Native UI: **UNVERIFIED / TOOLING BLOCKED**. `cua.getApp("com.mirathfan.careercompiler.acceptance.run83554983eeb14244b579898f3d784624")` returned `Invalid app: ...`. This run stopped native access there. No native application, production app, historical process, SQLite acceptance database or credential was opened. Native dev startup, physical keyboard, file chooser, true restart, PDF preview/export and live adapter checks are not passes. No guard/permission bypass attempted.

The owned browser test server was closed via its own control handle; its localhost endpoint refused connection afterward. The wrapper's KeyboardInterrupt is the recorded intentional shutdown, not a build failure. No unrelated process was inspected or signalled.

### Exact owner-only native follow-up

Use only the already-authorized isolated environment after its checks pass: identity above; root `/private/tmp/careercompiler-native-q45or6l9`; HOME `.../runtime-home`; only expected database `.../native.sqlite3`. Follow the unchanged guarded build/launch/stop controls and prerequisites in the [existing owner checklist](/Users/athfan/Desktop/career-compiler-sprint4-4-evidence-20261113-161244/OWNER_NATIVE_CHECKLIST.md), using this audit's final manifest for source/QA parity. Stop on changed/missing markers or unexpected preexisting state; do not reset the database.

For this audit specifically: (1) verify `repository_verified` and exact synthetic database path before any test; (2) use a synthetic complete profile with three verified facts, two distinct projects and no real contacts; (3) Résumés → Import résumé text, paste the synthetic project, generate a proposal and cancel—verify no saved changes; (4) Jobs → Add a job, paste a synthetic LinkedIn URL, use manual fallback, verify retained URL and all four reviewed steps; (5) Create a resume → analyze/save Backend job → create/confirm Master → generate/review child; preserve IDs/content, repeat for AI job and inspect actual semantic differences; (6) exercise native PDF preview/export only where the unchanged harness permits it, check one page/content/version and cancellation; missing handlers mean BLOCKED, not permission to grant more; (7) quit through the owned control, restart/reverify identity and confirm saved records; (8) close only that owned session and retain exit evidence. No paid model calls or production records.

## N. Exact source files changed

11 existing files modified:

- `src/lib/jobs/jobImport.ts` — manual URL provenance, text validation, stable preference fingerprint.
- `src/features/jobs/JobImportDialog.tsx` — clear retrieval failure/fallback, URL field/provenance, accessible label.
- `src/features/jobs/JobImportDialog.test.tsx` — fallback review/save and exact control-name regression.
- `src/lib/ai/mockProvider.ts` — remove canned intake substitution; actual-input local extraction.
- `src/lib/import/careerIntake.ts` — new local facts require review.
- `src/features/career-memory/SmartCareerIntake.tsx` — accurate supported-input copy and labels.
- `src/features/profile/ProfilePage.tsx` — reconstruction/file-format explanation and evidence link.
- `src/features/resume-library/ResumeLibraryPage.tsx` — intake entry point and job-first workflow explanation.
- `src/lib/job-automation/adapters/shared.ts` — safe failure categories and bounded retry decisions.
- `src-tauri/src/commands/job_sources.rs` — consistent safe URL/redirect checks, response type and diagnostic categories/tests.
- `src-tauri/src/commands/files.rs` — tests only: reject PDF/DOCX/PNG as evidence text files; production reader unchanged.

7 additions including this report:

- `src/lib/jobs/jobImportFallback.test.ts`
- `src/lib/job-automation/adapters/networkFailures.test.ts`
- `src/lib/import/intakeGrounding.test.ts`
- `src/lib/tailoring/resumeFunctionalAudit.test.ts`
- `src/features/resume-library/ResumeEntryPoints.test.tsx`
- `src/test/resumeAuditFixture.ts`
- `docs/CAREERCOMPILER_RESUME_AND_JOB_IMPORT_AUDIT.md`

Exact before/after hashes and modes, including previously untracked files, are in `E/changes.json`; `E/functional-audit.patch` covers this audit only. No deletions.

## O. Production-data and credential preservation

Recovery: `E/source-before.tar.gz`, SHA-256 `7ad11976608a5f9b9207d9bb3a1eff57c69e95e917323748effee33562dd5995`, verified 1,302 source members and modes. Per-file original copies are under `E/before`. Existing work was not reset/stashed/cleaned, and existing candidate/recovery materials were not edited. No new full development copy was created.

Final integrity results are recorded in `E/final-preservation.json`: **source/recovery PASS**, overall preservation **PARTIAL** because of the separate excluded-tree limitation. All 1,309 final source files match the tested copy; the 1,291 unchanged original files and all source modes match baseline. Eight protected Git entries, branch/HEAD/index, native acceptance guards, production Tauri configuration, migration source and provider interface are unchanged. All 1,251 candidate files and both existing source/Git recovery archives verify. Commands owned by this audit directed their generated output to the existing QA/evidence paths. Separately observed original build-output drift is described below; it is not claimed unchanged.

Production database contents, Keychain entries and browser credentials were **not read**. The attempted strict comparison against the **historical Sprint 2.7** excluded-file inventory failed and was retained as `E/verify-preservation.py`; it is not reported as passing. Follow-up metadata inspection found 40,325 matches and 16,800 differences: 16,786 under `node_modules`, 14 under `src-tauri/target`; four historical paths are absent. Fourteen present build artifacts have timestamps during this audit, latest `2026-11-13T17:03:55Z`. There was no new pre-audit excluded-tree inventory, so absent-file timing and complete runtime preservation cannot be established. No exception turns that failed check into a pass.

`E/excluded-metadata-check.json` records every difference. `E/qa-output-independence.json` verifies separate, nonsymlink original/QA directories and distinct file identities for the checked binaries/fingerprints/source. The original generated-output activity was not attributed to a process; no process inspection or interference was attempted. The independent `E/verify-source-and-recovery.py` completes source/Git/archive checks while preserving the **PARTIAL** result. This is not a content audit of external production databases or a Keychain export. No production migration, live application, paid provider call, security-setting change, commit, push or deployment occurred.

Rollback is source-only: first compare current files to `E/changes.json` to detect later user edits. Restore only the 11 changed files from verified `E/before` with their recorded modes; move the 7 added files into a new quarantine directory instead of deleting them. Verify all baseline source hashes/modes and protected Git state. Stop on intervening drift. Do not restore an entire old repository, run a Git reset or touch databases/credentials. No rollback was needed.

## P. Clear user instructions

**Bring in an existing résumé:** In Résumés select **Import résumé text**. Copy the text from your own document into the Career information field; choose **Resume text**. This does not upload a PDF/DOCX or retain layout. In local/mock mode, structured project titles, bullets and skill tags work best. Generate a proposal, inspect every field/evidence status and save only approved records. Add missing education/work/contact details in Profile. Confirm facts before using them in generation. If the action says **Extract with OpenAI**, it is a separately configured remote action; it was not tested live here.

**Create a résumé:** Complete Profile and reviewed Career evidence. Select **Create a resume**, paste/select a job description, analyze it and save/score evidence. If no base exists, select **Create starter Master Resume**; then confirm it. Select evidence and generation controls, create the child, inspect the before/after diff and source citations. A no-change diff is a no-op, not proof of tailoring.

**Tailor an existing saved version:** Use it as the explicit base for the selected job. Review the proposed evidence, final content and any missing requirements. Original Master and submitted identities were preserved by this tested child-creation path. Use a duplicate for direct edits to an already-used version. Review/approve bullets, fix validation errors, save, then use Export PDF with a working XeLaTeX runtime. Confirm actual page count and content; the on-screen page estimate is not the final PDF count.

**Import a posting:** Jobs → **Add a job** → **Complete job description**. Paste the full posting and optional source URL. For a failed LinkedIn URL, choose **Paste description instead**; the URL is retained. Review fields, source text, fit/eligibility and duplicates/history, then confirm **Save job**. The URL is provenance, not proof that the page was fetched. For supported live company feeds, configure the existing Greenhouse/Lever/Ashby source workflow; arbitrary URL extraction remains missing.

These fixes are in source. This audit did not replace or relaunch the owner's installed/running application; that instance may still show the previous UI until built and safely relaunched through the owner's normal workflow.

## Q. Recommended next implementation priority

First complete the owner-operated isolated native checks above, including actual file dialogs/export. Then approve a focused **reviewed PDF/DOCX text-import → structured profile → new Master** implementation, with scanned-file rejection initially and exact source/provenance preservation. Address the no-op tailoring explanation and submitted-version edit/promotion safeguards before presenting generation as a dependable one-click tailored résumé. A supported public ATS URL resolver is a separate bounded task. Do not add more AI autonomy or an authenticated LinkedIn scraper as part of these fixes.
