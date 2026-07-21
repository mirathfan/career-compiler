# Resume Review Real-World Acceptance Test

Date: 2026-07-20 (America/Chicago)

## Verdict

The Resume Review and Auto-Improvement workflow passed a complete packaged-app acceptance test against the user's actual current resume and saved Confido job. The app reviewed the rendered PDFs with OpenAI, produced persisted structured scorecards, applied only three explicitly approved deterministic safe edits to a child, regenerated a one-page XeLaTeX PDF, and reviewed that child again.

The improved resume is professionally usable and now passes CareerCompiler's strict submission-readiness gate. The initial run correctly blocked on the AURA Founder title and employment classification; the user subsequently confirmed that AURA is their app under KASAT Labs and that the Founder/self-employment title and Nov 2025-present dates are accurate. CareerCompiler saved that confirmation as a structured `user_confirmed` claim and a new pre-submission review returned 77, medium risk, ready to submit, with zero critical issues. The Master Resume and its original PDF remained unchanged, and no job application was submitted.

## Tested Revisions

- Resume Review implementation: `9952b91` (`feat: add evidence-grounded resume review optimizer`)
- Acceptance fixes: `df8d460` (`fix: harden resume optimizer acceptance workflow`)
- Branch: `ui-ux-overhaul`
- Implementation plan: `docs/resume-review-optimizer.md`

The test began with the implementation commit at `HEAD` and an otherwise dirty tree containing only the acceptance fixes under review. Personal PDFs, rendered images, the application database, API responses, and temporary evidence remained ignored and untracked.

## Test Data

- Resume: current saved Master Resume, identified by the Full-Stack and AI Software Engineer headline and the expected AURA/KASAT Labs, Tech Mahindra, Client Bookstore Platform, AURA Styling Intelligence Engine, Forge, Illinois Institute of Technology, and Dayanand Sagar University records.
- Resume ID: `resume-master-current-20260718`
- Target job: Confido, New Grad Software Engineer
- Job ID: `job-confido-new-grad-software-engineer-20260718`
- Provider/model: OpenAI Responses API through CareerCompiler's hybrid provider, `gpt-5.6`
- Contact information: redacted from this report.

No application record was created during the test. The only existing application predates this acceptance run.

## Architecture Boundary

The implementation keeps deterministic and model behavior distinct:

| Concern | Implementation used in this test |
| --- | --- |
| Deterministic local checks | Structured resume validation, source-fact allow-list checks, career item/education equality checks, unsupported number and skill checks, duplicate initiative detection, missing contacts, page count, summary length, bullet length, repeated openers, skill density/grouping, local score components, factual risk, and readiness gates. |
| PDF geometry/layout | XeLaTeX rendering, PDF byte validation, actual page count, approved template bounds, and persisted render status. Compilation alone never marks a resume good or ready. |
| OpenAI text review | Structured review of the allow-listed `ResumeDocument`, validation results, verified Candidate Brain records, and selected job analysis. |
| OpenAI visual review | The actual rendered PDF is attached as a Base64 `input_file` with `detail: high`; the API receives both PDF text and page images. `pdfVisualReviewed` is persisted. |
| Local proposals | Deterministic safe operations for summary removal, verified-skill grouping, and bounded readability settings. Application requires the exact approved proposal IDs. |
| OpenAI proposals | Model-generated rewrites and classification/content suggestions. Every model proposal is forced to `needs_review`; none is auto-applied. |

The actual PDF-input behavior follows the OpenAI [file input documentation](https://developers.openai.com/api/docs/guides/file-inputs), which specifies that vision-capable models receive extracted PDF text and page images and supports explicit high-detail page processing.

The API key was confirmed present in macOS Keychain under CareerCompiler's configured service/account. Its value was never read into the report, logged, stored in SQLite, or committed.

## Deterministic Result

- The rendered original was one Letter-size page.
- All displayed skills were in the enabled verified-skill inventory.
- All 14 fact-bearing bullets retained `sourceFactIds` and passed the local allow-list checks.
- Local validation found no unsupported-claim errors and two warnings.
- The visible degree wording exactly matched the current structured source record: `Master of Applied Science, Computer Science (AI Specialization)`. No degree conflict was raised.
- AURA exists as both an Experience item and a Project with matching dates. The duplicate coverage was detected.
- At the start of acceptance, AURA's saved source record contained the current organization, title, and dates, but there was no independent verified Candidate Claim for the Founder/leadership and employment classification. The strict gate therefore required confirmation rather than rewriting it.
- In the follow-up, the user explicitly confirmed the Founder/self-employment classification, KASAT Labs organization, and Nov 2025-present dates. This was saved as `user_confirmed` claim `candidate-claim-47cb959f-3171-4970-a88e-081098a48c63`, linked to the existing AURA experience and project records.
- The original summary contained 56 words, skills were a flat 32-token list, one bullet exceeded the long-bullet threshold, and repeated/feature-list phrasing reduced conciseness.

## Original Reviews

### Job-Specific

Review ID: `resume-review-cbf0fa00-283f-479b-b4c8-03a667f56b4a`

- Overall: **71**
- Factual risk: medium
- Ready to submit: no
- Actual PDF visually reviewed: yes

| Category | Score |
| --- | ---: |
| Visual quality | 70 |
| ATS readability | 75 |
| Content strength | 47 |
| Factual safety | 86 |
| Role fit | 74 |
| Technical depth | 83 |
| Conciseness | 60 |
| Skills quality | 69 |

### Pre-Submission

Review ID: `resume-review-3cf3e80a-f342-4c52-a9d9-fe2b7a58c002`

- Overall: **49**
- Factual risk: critical
- Ready to submit: no
- Actual PDF visually reviewed: yes

| Category | Score |
| --- | ---: |
| Visual quality | 71 |
| ATS readability | 76 |
| Content strength | 47 |
| Factual safety | 86 |
| Role fit | 75 |
| Technical depth | 84 |
| Conciseness | 60 |
| Skills quality | 68 |

The strict mode applied an overall readiness penalty even though the factual-safety category remained 86. This is intentional: a high category score cannot override a critical unresolved classification issue.

## Initial Critical Findings

1. The AURA `Founder` leadership title and employment classification are not independently confirmed in Candidate Brain.
2. The AURA organization and current dates exist in the structured source record, but should be explicitly confirmed before the resume is submitted.
3. AURA appears in both Experience and Projects with overlapping dates/content. Consolidation could improve focus, but deleting or reclassifying either item is not safe without user confirmation.

The first two findings were resolved by explicit user confirmation in Candidate Brain. The duplicate AURA coverage remains a non-blocking content-quality issue because confirmation of the underlying venture does not by itself authorize deleting or merging resume sections.

Other quality findings included the long/repetitive summary, dense ungrouped Skills section, feature-list bullets, repeated `Built` openers, an internal test-count-heavy Forge bullet, bottom-page density, and limited direct evidence for some Confido-specific concepts. The reviewer did not invent missing financial-data, NLP, CPG, or rapid-learning evidence.

## Proposal Quality

The original job-specific review persisted 14 proposals. Every proposal included before text, after text, rationale, evidence, category, priority, expected score impact, safety, `safeToAutoApply`, and `confirmationRequired`.

Risky proposals for AURA classification/consolidation, summary rewriting, bullet rewriting, metrics emphasis, and model-suggested layout changes remained `needs_review`. The workflow does not silently alter degree wording, founder wording, dates, company names, projects, metrics, or job classification.

## Applied Improvements

The user-facing `Improve with approval` path created child resume `resume-9a51bcbf-c1ec-409f-97d1-b849b507e4a2` from the Master.

- `parentResumeVersionId`: `resume-master-current-20260718`
- `baseResumeVersionId`: `resume-master-current-20260718`
- Source job: Confido job ID above
- Improvement run: `resume-improvement-run-51c15851-a1ec-4262-bd30-e931cb803301`
- Pass: 1 of maximum 2
- Stop reason: `no_safe_changes`
- Applied proposal IDs: 3
- Skipped/pending proposal IDs: 11
- Explicitly rejected proposal IDs: 0
- PDF status: rendered, one page

Exact applied edits:

1. Removed the 56-word summary. This adds no claim and recovers page space.
2. Reorganized the same 32 verified skills into Frontend & Mobile, Backend & Data, AI / ML, Cloud & Tools, and Core CS groups. No skill was added, removed, or renamed.
3. Raised the approved body font from 9.1pt to 9.25pt and spacing from 0.86 to 0.90, then re-rendered and rechecked the page count.

No title, employer, project, date, bullet, metric, technology, URL target, or education value changed. No project was removed. The approved-warning state was reset because any content/layout revision must be revalidated; that state change is not a factual mutation.

## Improved Review

Review ID: `resume-review-51849577-56ee-4566-b16c-34f0606aee4e`

- Overall: **78** (`+7`)
- Factual risk: medium
- Ready to submit: no
- Actual improved PDF visually reviewed: yes

| Category | Original | Improved | Change |
| --- | ---: | ---: | ---: |
| Visual quality | 70 | 88 | +18 |
| ATS readability | 75 | 79 | +4 |
| Content strength | 47 | 57 | +10 |
| Factual safety | 86 | 86 | 0 |
| Role fit | 74 | 77 | +3 |
| Technical depth | 83 | 85 | +2 |
| Conciseness | 60 | 68 | +8 |
| Skills quality | 69 | 79 | +10 |

Resolved or improved: summary repetition, flat skill-wall formatting, font/spacing readability, page balance, ATS skill scanning, and general conciseness.

Still open at this stage: AURA Founder/employment confirmation, duplicate AURA coverage, confirmation of future/current chronology visible in the July 2026 resume, several feature-list/repeated-opener bullets, and lower-page density. A second automatic pass was not offered because no further material safe operation remained.

## Confirmed Final Pre-Submission Review

After the user confirmed the AURA founder venture, CareerCompiler persisted the claim through the normal Candidate Brain repository path and reran the strict review against the same improved child and rendered PDF.

Review ID: `resume-review-f8dffa73-6c4e-4542-8a12-12003c52b29d`

- Overall: **77**
- Factual risk: medium
- Ready to submit: **yes**
- Critical issues: **0**
- Actual PDF attached and `pdfVisualReviewed`: yes
- Final Approve control: enabled, not clicked during acceptance

| Category | Score |
| --- | ---: |
| Visual quality | 86 |
| ATS readability | 78 |
| Content strength | 56 |
| Factual safety | 86 |
| Role fit | 76 |
| Technical depth | 85 |
| Conciseness | 68 |
| Skills quality | 79 |

The confirmed leadership claim removed the deterministic and model factual blocker without changing resume text. Remaining recommendations are non-blocking and confirmation-required: consolidate duplicate AURA coverage, shorten the 35-word opening AURA bullet, reduce repeated `Built` openers, clarify the Forge testing relationship, prioritize target-relevant skills, and increase layout spacing only after content consolidation and a one-page PDF recheck.

## Factual Preservation

- Master structured content SHA3-256 before: `EB4322BF7B1D8A5208782551089AE2F0624B42F3125E50BE7B774541F80BD6D5`
- Master structured content SHA3-256 after: `EB4322BF7B1D8A5208782551089AE2F0624B42F3125E50BE7B774541F80BD6D5`
- Master PDF SHA-256 before/after: `d74072235b07eca341f90c744f2cee5f8d7802179599bddbb3105bf6f9f7456e`
- Master PDF modification time remained `2026-07-18 15:03:48`.
- Canonical fact-bearing Master/child projection SHA-256: `817afb74cd1addebb36bbd88687d82eef4cc5cbaef3dc2cea25409ff1440c6bc` for both.
- Improved PDF SHA-256: `26f82b743ab62da91127be2e63bb7994b80dc1ab32905821df310cc450c3cbc2`

The canonical projection covers the header, education, experience and projects (including technologies, URLs, repository URLs, bullets, and citations), skills, and section order. This proves the safe pass preserved verified facts while changing only summary presence, skill presentation, and approved template settings.

## PDF Visual Result

The improved XeLaTeX output is a one-page PDF 1.7 document on a 612 x 792 point Letter page. Manual raster inspection and layout-preserving text extraction confirmed:

- readable 9.25pt body text;
- no clipping, overlap, or page overflow;
- clean education date alignment;
- categorized ATS-readable Skills;
- link labels instead of exposed raw URLs;
- retained Experience, Projects, Education, metrics, citations, and project technology subtitles;
- usable bottom margin and improved page balance.

The lower half remains dense and AURA remains duplicated because consolidation requires separate content-edit approval. After the Founder/self-employment claim was confirmed, the same PDF passed the final pre-submission gate and is professionally usable for submission. A final human proofread remains prudent, especially for chronology and duplicate emphasis.

The private PDF and raster image were inspected from ignored local paths and were not committed.

## Protection Tests

- Master resume improvement always creates a child and never overwrites the parent.
- Only exact explicitly approved safe proposal IDs can be applied.
- Model proposals remain pending and cannot auto-apply.
- Rejected/unselected proposals were not applied.
- Stale reviews are rejected before child creation.
- Automatic optimization is capped at two passes.
- A pass stops when the gain is negligible or no material safe operation remains.
- Re-running skill categorization on an already grouped resume produces no duplicate/no-op proposal.
- Unsupported claims, uncited facts, mutated career fields, fabricated metrics, and unverified skills remain validation failures.
- Critical/high-risk factual findings force `readyToSubmit = false`, independent of numeric score.
- Child technology arrays, project URL, and repository URL survive normalization, persistence, deterministic baseline storage, rendering, and review.

## Bugs Found And Fixed

1. Legacy saved job analysis could be wrapped as `{ analysis, snapshot }`, causing review startup to fail. Added a compatible validated reader and tests.
2. The original hybrid path did not prove visual review of the actual PDF. Added Base64 PDF `input_file` transport with high detail, Rust request validation/redaction, metadata, and tests.
3. Model proposals could not be trusted as auto-safe. All model proposals are now forced to confirmation-required `needs_review`; only deterministic operations can be safe.
4. Safe operations were not service-enforced by exact approval IDs. The service now rejects implicit/unapproved changes.
5. An improved review could report ready despite a critical factual finding. Readiness now has an independent critical/high-risk factual gate.
6. Review selection could reuse a result from the wrong mode/job. Selection is now keyed by resume, mode, and target job.
7. Repeated skill grouping could create a no-op second pass. Grouped resumes no longer receive the deterministic grouping proposal.
8. `technologies`, project `url`, and `repositoryUrl` were omitted by the normalization schema during child creation. The structured schema/normalizer now preserves them, with pure and persisted integration tests.
9. Review/migration metadata did not fully record source, PDF visual status, token use, rejected proposals, pass number, stop reason, and persisted PDF path. Additive migration and repository support now preserve the audit trail.

During post-fix acceptance, two manual review runs were superseded because an older `career_compiler` process was still running while the bundle was rebuilt. The process-name mismatch was identified, the stale process was stopped, and the final score/artifact above came from a freshly launched corrected bundle. This was a test-environment issue, not an automatic duplicate request; the two superseded draft children were left untouched rather than deleting user data without approval.

## API Usage

- Model: `gpt-5.6` (the alias currently maps to GPT-5.6 Sol)
- Paid OpenAI calls during acceptance and factual-confirmation follow-up: 8
- Input tokens: approximately 69,131
- Output tokens: approximately 43,969
- Total tokens: approximately 113,100
- Schema failures: 0
- Repair attempts: 0
- Automatic duplicate calls: 0
- Superseded manual calls due to the stale test process: 2
- Approximate list-price cost: **$1.66**

The cost uses OpenAI's current [model pricing](https://developers.openai.com/api/docs/models), $5 per million input tokens and $30 per million output tokens for the `gpt-5.6` alias, and excludes any account-specific discounts or cached-token adjustments.

## Verification

All required commands passed from the acceptance-fix tree:

| Command | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test:run` | Passed: 25 files, 105 tests |
| `npm run build` | Passed; Vite emitted a non-failing chunk-size advisory |
| `npm run extension:build` | Passed |
| `cargo fmt --check` | Passed |
| `cargo clippy --all-targets --all-features -- -D warnings` | Passed |
| `cargo test` | Passed: 23 Rust tests |
| `npm run tauri:build` | Passed |
| Packaged application smoke launch | Passed from the release `.app` bundle |

Packaged application:

`/Users/athfan/Desktop/career-compiler/src-tauri/target/release/bundle/macos/CareerCompiler.app`

## Known Limitations

- The reviewer can detect insufficient evidence but cannot independently prove founder/employment classification. This test resolved that boundary correctly through a user-confirmed Candidate Brain claim.
- Visual judgment remains partly model-based and should be paired with deterministic page checks and human inspection, as done here.
- In the confirmed final review, one model rationale incorrectly stated that no raster page image was included. The tested request path attached the PDF as a high-detail `input_file`, request metadata persisted `pdfVisualReviewed = true`, and the PDF was independently rendered and inspected. Provider self-descriptions of input availability should therefore be treated as advisory rather than transport evidence.
- The lower page remains content-dense until the user confirms whether duplicate AURA coverage can be consolidated or approves targeted bullet edits.
- OpenAI score variation is expected across runs. Safety gates and local validation, not score alone, decide submission readiness.
- Superseded draft children created during acceptance remain in the local library. They are not application artifacts and should only be removed through an explicit user action.
