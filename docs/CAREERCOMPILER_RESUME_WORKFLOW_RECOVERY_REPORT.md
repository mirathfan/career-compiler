# CareerCompiler Résumé Workflow Recovery Report

Date: 2026-11-13T18:11:04.300810+00:00

## A. Executive summary and status

**Overall: PARTIAL.** Local PDF/DOCX extraction, reviewed intake, job-responsive ordering, explicit child approval and synthetic SQLite persistence are implemented and tested. Real XeLaTeX PDFs demonstrate different evidence-supported document order. Interactive native file selection, in-app PDF preview/export and native restart remain unverified because the UI tool rejects the approved acceptance identity. No native app was launched in this run.

| Feature | Status | Verified scope / limit |
|---|---|---|
| Local text PDF/DOCX extraction | COMPLETE for the bounded text-only scope | Real parser/browser fixtures; no OCR, visual-layout import or arbitrary file access |
| Reviewed intake and SQLite save/undo | COMPLETE | Explicit approval/rejection, duplicate review, needs-review facts, transaction rollback and reopen |
| Profile-based Master creation | PARTIAL | Works with an explicitly selected saved job; current schema cannot store a jobless résumé |
| Job-specific child generation | COMPLETE for bounded reviewed ordering | Backend/AI outputs reorder existing projects and skills, retain grounded wording, preserve locks and create a child only after review |
| Exact child → real PDF | PARTIAL | Actual renderer/XeLaTeX, one-page check, text comparison and visual inspection passed; native preview/download interaction unverified |
| LinkedIn URL → manual description → tailoring | COMPLETE for manual fallback | Source URL retained; no direct LinkedIn retrieval claim |
| Interactive native acceptance | BLOCKED | Approved application identity returned `Invalid app`; no bypass attempted |

Current verification: **874 frontend tests passed, two existing skips; 42 Rust tests passed; typecheck, lint, Rustfmt, Clippy, frontend and native debug builds passed.** All model-backed test activity used mocks. No live provider verification is claimed.

## B. Preservation and current repository baseline

Authoritative source: `/Users/athfan/Desktop/career-compiler`. Branch `ui-ux-overhaul`; HEAD `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`. The initial 1,309-file source inventory exactly matched the prior audit snapshot, including modes. Existing tracked and untracked work was retained.

Recovery/evidence root: [career-compiler-resume-recovery-20261113-174944](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944). Verified archive: [source-before.tar.gz](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/source-before.tar.gz), SHA-256 `5625b720a8b6116140e9a9f98898a1a1aa45be8af1d5ab614f8c010aa9c5f5bf`. Every archived member and file mode was verified. Modified pre-existing files also have individual copies under `/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/before/`.

The prior audit's older dependency/build metadata was not treated as proof of current runtime integrity. This sprint captured 63,528 fresh pre-existing dependency/build/runtime metadata entries and verified installed direct dependency versions against the lockfile. Final comparison found no changes to those pre-existing entries. Only four absent parser dependency directories were added. This is metadata preservation, not a claim that every pre-existing binary was rehashed.

[Final preservation manifest](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/final-preservation.json) records all source hashes/modes, additions, replacements, unchanged counts, and archive verification. Eleven pre-existing source files changed; thirteen implementation/test files and this report were added; zero files were removed. The 31 protected Git metadata files, including index, branch refs and HEAD, remain equal. No Git operations changed history or refs. Codex-generated objects/transient refs were not edited or used as inputs.

No new independent development copy was created. Checks reused the established verification environment at `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/verification-source`, with its dedicated HOME, temporary directories, cache and offline Rust toolchain. Source parity was checked; see [QA parity evidence](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/qa-source-parity.json).

Rollback, **not executed**: first compare current files against the final manifest and stop if later user work differs. Restore only the eleven listed modified files from verified `before/` copies, preserving modes. Move newly added sprint files into a new quarantine directory rather than deleting them. If reverting dependencies, quarantine only the four new package directories after verifying they have no later changes, and restore the two package manifests together. Do not run reset, clean, checkout, npm ci, migrations or blanket archive extraction. Recheck the original source manifest; leave existing recovery materials intact.

## C. PDF/DOCX import implementation and supported limits

`ResumeFileInput` accepts an explicitly selected File. Extraction does not accept local paths or remote URLs. Extension, nonzero size, magic bytes and read length must agree. A SHA-256 reference identifies the original bytes. PDF text extraction is lazy-loaded and uses a bundled PDF.js worker; DOCX decompression runs in a dedicated worker. Cancellation terminates worker work; failures are visible and save nothing.

Limits: 10,000,000 input bytes; 100,000 extracted characters; 40 PDF pages; 15-second extraction deadline; DOCX maximum 512 archive entries, 32 MB declared expansion, 8 MB per entry and 2 MB main document XML. DOCX validates central-directory metadata before bounded streaming decompression, checks actual XML output size, and rejects encryption, path traversal, duplicate archive names, unsafe archive paths, macros/embedded objects, oversized content and XML entity/DOCTYPE declarations. No archive entries are written to disk. Only WordprocessingML text is interpreted; text is rendered through React, not injected as HTML.

PDF processing consumes bytes only, disables XFA/font rendering/system-font loading and worker fetching, and calls text extraction rather than a document viewer or scripting API. Password-protected, corrupt, over-page-limit and image-only documents produce actionable errors. No OCR or password collection. Multicolumn PDFs and DOCX tables preserve extractable text but may require reading-order correction. DOCX headers, footers, floating text boxes, graphics and exact styling are not imported. This is a bounded ordinary-document parser, not a guarantee for every PDF encoding or DOCX dialect.

New exact dependencies: `pdfjs-dist@6.5.438` and `fflate@0.8.3`. Existing `pdf-lib` generates synthetic fixtures but has no compatible text extraction service. PDF.js supplies maintained local text extraction; fflate supplies a small browser ZIP stream reader without another document service. The lock adds 14 package entries including PDF.js optional `@napi-rs/canvas@1.1.1` platform packages. Only the matching macOS ARM binary package and its parent were installed locally. Install scripts were disabled; no system software was installed. All pre-existing lock entries were retained verbatim, including platform metadata. See [dependency change manifest](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/dependency-change.json) and [registry integrity evidence](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/parser-registry.json).

Dependency references: [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html), [PDF.js releases](https://github.com/mozilla/pdf.js/releases), [fflate source/documentation](https://github.com/101arrowz/fflate).

## D. Reviewed profile/evidence intake

Uploaded content enters the existing Smart Career Intake. The original extraction remains visible separately from the editable review text. Conservative local structure suggestions recognize Projects, Experience, Education and Skills headings, paragraph titles, explicit organization separators and bullet claims. Dates/contact information are not guessed; ambiguous lines and long/unassigned bullets are flagged for correction. This remains a limited deterministic parser, not a general semantic résumé reader.

Existing proposal validation, field editing, duplicate/conflict handling, rejection, explicit saving and import undo are reused. Facts start `needs_review`; file appearance does not independently verify them. The browser PDF and parallel DOCX journeys each rejected an injected unsupported 99-percent claim and saved exactly three needs-review facts. Neither extraction nor acceptance created a résumé version. Original source-file hashes remained equal before and after tests.

SQLite testing exposed an older transaction defect: intake/undo manually issued BEGIN while nested repository writes now use the transaction service. Both methods now enter the existing `repository.transaction` boundary before reading or writing. Native use retains the existing pinned-connection command bridge; no new command, permission or schema was introduced. Real SQL.js tests prove import rollback, undo, child rollback and reopen. New Master and child services normalize résumé objects through the existing serializer and revalidate evidence at save; Master previews are bound to a digest and stale/altered previews are rejected.

The original document is not copied into the résumé library, and exact binary/source-layout lineage is not modeled as an imported résumé version. Provenance is a source digest plus the existing intake records/fact references; original files remain at their user-selected locations. A future archived-source relationship would require separately reviewed storage design.

## E. Actual job-to-résumé tailoring pipeline

Saved job → existing provider analysis → deterministic evidence scoring → existing bounded generation request/planner → existing validated generation/repair pipeline → opt-in job-specific base transformer → semantic before/after review → explicit save of a new child → existing LaTeX serializer/PDF export.

The new wrapper reuses `createControlledResumeVariantFromBase`. It carries the proposed ranked order into unlocked projects, work items and bullets, while keeping locked items at their positions. It reorders only existing approved base skills; a new job keyword cannot add a skill. Existing grounded rewrite/addition proposals remain subject to validation and bullet review. No automatic omission was added. Conservative regeneration and single-bullet editing retain their previous transformer behavior.

Generation no longer automatically saves a child. The user accepts/rejects included bullet proposals, reviews ordering/content changes and selects **Save reviewed child**. Save checks the source version is current, the selected job still exists, evidence remains valid and included bullets are approved, then creates a new version transactionally. Interrupted saves leave no orphan. Unsaved generated drafts now set the existing editor dirty flag so navigation/close protections still apply. PDF export waits for a saved child and the existing claim/contact/one-page gates.

## F. Root cause of previously identical outputs

The old base transformer deliberately retained source order, and the tailoring page treated every source career item as locked. The deterministic plans could select different project orders while the final child retained the source's ordering and skills. Semantic diff also failed to expose project-level moves because it compared bullet indexes only within a section.

The fix is specific to job tailoring: respect actual explicit locks, apply ranked ordering to movable content, reorder existing skills, and report project/work-item position changes. The diff now uses indexes within each section kind so adding a project does not falsely report an experience move. This was not a stale-preview-only issue, nor proof that the entire model pipeline ignored the job.

## G. Backend versus AI comparison evidence

Both children use the same approved synthetic Master and three supported facts: backend API/database work; agent/tool-calling/evaluation work; TypeScript reliability work. The fixture explicitly verifies imported facts in a separate synthetic step before generation; document import itself never performs that verification.

| Compared property | Backend Engineer | AI Engineer |
|---|---|---|
| First project | Backend Platform | Agent Evaluation |
| Second project | Agent Evaluation | Backend Platform |
| Skill order | Docker, FastAPI, PostgreSQL, Python, TypeScript, LangChain, OpenAI | Python, TypeScript, Docker, FastAPI, LangChain, OpenAI, PostgreSQL |
| Included facts/wording | Same three supported factual statements | Same three supported factual statements |
| Structure | Projects, experience, education, skills | Same section kinds; different project placement |
| PDF text | Backend project appears first | Agent project appears first |

The retained wording is appropriate: those claims already express the verified work; inventing new metrics or paraphrases would not improve evidence. The important distinction is visible document emphasis, not version IDs or scores. No omission is needed for this short one-page fixture. The mock analyzer still has generic full-stack positioning and limited AI skill vocabulary; its ranking/plan is not evidence that every possible requirement is met. Agent orchestration/tool calling/model integration/evaluation are supported by the agent fact; inference expertise is not claimed. Backend API, PostgreSQL, Docker and automated tests are supported by the backend fact. Missing requirements remain gaps.

[Pipeline evidence](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/recovery-pipeline.json) contains the exact jobs, source versions, plans, selected fact IDs, diffs and rendered LaTeX. The synthetic test asserts each final bullet matches a retrieved source fact and retains its ID. [SQLite fixture](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/synthetic-recovery.sqlite3) is synthetic and was reopened with integrity_check=ok; Master, submitted version, application identity and both children were equal after reopen.

## H. Exact child-version and PDF validation

Common parent: `resume-f76c7477-cecf-4b42-9a9a-d6ab441f5352`. Submitted fixture: `recovery-submitted`; application `recovery-history` retained its submitted-version reference and existing synthetic PDF hash.

| Output | Exact child version | Pages | PDF | SHA-256 |
|---|---|---:|---|---|
| backend | `resume-d2adba9f-23bb-4d0d-9d2e-d9b1bb80909f` | 1 | [backend PDF](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/pdf-backend/recovery-backend.pdf) | `1f35940f0d3f4745b371c0d440056d8d993fcfe08754dcee046a8c780e1201a9` |
| ai | `resume-adb9f712-985d-46e6-b618-3669cc218ef4` | 1 | [ai PDF](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/pdf-ai/recovery-ai.pdf) | `3e05ebf7d7ea5c8599821a5dbd54d9e2e9f58951cea7b28e074a46440a6be85f` |

The actual app's `renderResumeLatex` rendered each saved child; XeLaTeX compiled it with shell escape disabled in dedicated evidence directories. Every approved bullet appears in extracted PDF text; project order differs in both text and rendered pages. Poppler confirmed one page each. Both rendered pages were visually inspected: readable, no observed clipping/overlap; whitespace is expected for a short synthetic profile. [PDF verification](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/pdf-results.json), [visual review](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/pdf-visual-review.json), [backend render](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/pdf-backend/page.png), [AI render](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/pdf-ai/page.png).

This verifies the real renderer/compiler and exact synthetic source-to-output identity. It does **not** verify the native export dialog, app PDF viewer, downloaded-path registration or packaged desktop restart in this run.

## I. UI changes and workflow

Résumés now distinguishes **Import existing résumé**, **Create résumé**, and **Tailor for job**. Profile explains that document extraction produces reviewed career records, not a layout-preserving Master replacement. File extraction has a loading state, cancellation and actionable failure messages. Existing intake supports corrections before saving.

Create résumé previews a new Master from approved profile evidence and requires review before saving. Because `resume_versions.job_id` is a non-null foreign key, it asks for a saved job and explains the association. No placeholder job or migration is created. Existing versions remain intact.

Tailoring shows real semantic content/order differences, a review acknowledgement and a separate child-save action. Browser UI acceptance passed at 1440×900; import controls were inspected at 720×800 with no horizontal overflow. Screenshots are actual browser test UI, not native screenshots: [import review](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/import-review.png), [tailoring review](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/tailoring-review.png), [saved child](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/child-saved.png), [compact import](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/compact-import.png), [DOCX review](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/docx-import-review.png).

## J. LinkedIn URL/manual fallback

The actual browser journey entered a LinkedIn URL, received the unsupported-direct-retrieval fallback, chose **Paste description instead**, reviewed parsed fields, saved the job with its cleaned original URL, then used that job for reviewed tailoring. SQL pipeline jobs also retain manual-paste provenance. No LinkedIn content was fetched, no authentication circumvented and no direct extraction success claimed.

## K. Privacy and data protection

The new document path is local even when the synthetic Settings provider is OpenAI. It never invokes the remote extraction branch. Browser tests blocked all non-localhost requests and observed zero attempted external requests and zero page errors. No automatic résumé upload, credentials, arbitrary paths, model-generated commands or new native permissions were introduced. Existing remote generation and outbound contracts are unchanged; live behavior was not tested.

All records and document files used here are synthetic. Production databases and credentials were never opened, queried or modified. This statement is based on isolated execution and path scope, not a prohibited inspection/hash of production records. Native guards, Tauri capabilities, credential code, Rust source and migrations retain their baseline hashes. Existing recovery artifacts were not modified. No commit, push, deployment, external message or submission occurred.

## L. Test commands and results

All npm/Rust commands below ran through `/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/check.py` in `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/verification-source`, using isolated HOME/temp/cache and offline dependency resolution. Logs and result JSON record exact command, cwd, timestamp and exit code.

| Actual command | Result | Evidence |
|---|---|---|
| `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run test:run` | 874 passed; 2 existing skips; 104 files passed | [frontend-final.log](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/frontend-final.log) |
| `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo test --manifest-path src-tauri/Cargo.toml --locked --offline` | 42 passed; 0 failed | [rust-tests.log](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/rust-tests.log) |
| `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run typecheck` | PASS | [typecheck-verified.log](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/typecheck-verified.log) |
| `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run lint` | PASS | [lint-verified.log](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/lint-verified.log) |
| `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo fmt --manifest-path src-tauri/Cargo.toml --check` | PASS | [rustfmt.log](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/rustfmt.log) |
| `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked --offline -- -D warnings` | PASS | [clippy.log](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/clippy.log) |
| `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run tauri:build -- --debug --no-bundle` | PASS; includes tsc + Vite frontend build; debug native binary, no bundle/deployment | [native-build-verified.log](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/native-build-verified.log) |

Additional focused runs: 18 import/tailoring/intake tests passed; 17 diff/review regression tests passed; the updated main workflow's three tests passed. Final full-suite results above include all new tests and existing Copilot, profile/action undo, application next actions/history, résumé revisions, coordinated preparation, eligibility, generation and persistence coverage. Two skips remain pre-existing; none were added or removed.

Actual browser command: `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/browser-recovery.mjs`. Eight real-file parser cases and six workflow stages passed. [Browser results](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/browser-results.json); [input-file hash preservation](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/fixture-preservation.json). The owned Playwright browser closed in finally. The owned Vite PTY was stopped with Ctrl-C and its endpoint refused connections afterward; [closure evidence](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/session-closure.json).

Actual PDF verification command: `python3 /Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/verify-pdfs.py`. Its JSON lists both complete XeLaTeX commands, per-child paths and hashes. Poppler `pdfinfo`, `pdftotext -layout` and `pdftoppm -png -scale-to 1500` checked the produced documents. Synthetic SQLite uses SQL.js with the actual SqliteRepository and transactions, not a mock persistence implementation; browser UI uses the existing MemoryRepository fixture, separately identified.

Initial failures were retained in evidence: wrong PDF.js option/import, nested intake transaction, jobless Master foreign key, unnormalized optional résumé fields, fixture lineage normalization, outdated navigation/early-save expectations, missing jsdom dialog methods, and generated-draft dirty state. These were corrected and the complete suite rerun. The DOCX browser scenario initially reused its in-memory fixture across hash navigation; an explicit reload established a fresh fixture, then the same assertions passed. Assertions were not weakened; child-before-approval, Master equality, stale preview, unsupported claims and rollback checks were strengthened.

Build warning: existing/application and parser chunks exceed Vite's 500 kB warning threshold. PDF extraction and its worker are loaded on demand. This is a build warning, not a failed build. No packaged native interaction pass is inferred from compilation.

## M. Source files and dependencies changed

- Modified [package-lock.json](/Users/athfan/Desktop/career-compiler/package-lock.json)
- Modified [package.json](/Users/athfan/Desktop/career-compiler/package.json)
- Added [src/features/career-memory/ResumeFileInput.tsx](/Users/athfan/Desktop/career-compiler/src/features/career-memory/ResumeFileInput.tsx)
- Modified [src/features/career-memory/SmartCareerIntake.tsx](/Users/athfan/Desktop/career-compiler/src/features/career-memory/SmartCareerIntake.tsx)
- Modified [src/features/profile/ProfilePage.tsx](/Users/athfan/Desktop/career-compiler/src/features/profile/ProfilePage.tsx)
- Added [src/features/resume-library/ProfileMasterCreator.tsx](/Users/athfan/Desktop/career-compiler/src/features/resume-library/ProfileMasterCreator.tsx)
- Modified [src/features/resume-library/ResumeEntryPoints.test.tsx](/Users/athfan/Desktop/career-compiler/src/features/resume-library/ResumeEntryPoints.test.tsx)
- Modified [src/features/resume-library/ResumeLibraryPage.tsx](/Users/athfan/Desktop/career-compiler/src/features/resume-library/ResumeLibraryPage.tsx)
- Modified [src/features/tailoring/TailorResumePage.test.tsx](/Users/athfan/Desktop/career-compiler/src/features/tailoring/TailorResumePage.test.tsx)
- Modified [src/features/tailoring/TailorResumePage.tsx](/Users/athfan/Desktop/career-compiler/src/features/tailoring/TailorResumePage.tsx)
- Modified [src/lib/database/sqliteRepository.ts](/Users/athfan/Desktop/career-compiler/src/lib/database/sqliteRepository.ts)
- Added [src/lib/import/docxExtraction.worker.ts](/Users/athfan/Desktop/career-compiler/src/lib/import/docxExtraction.worker.ts)
- Added [src/lib/import/docxText.ts](/Users/athfan/Desktop/career-compiler/src/lib/import/docxText.ts)
- Added [src/lib/import/pdfText.ts](/Users/athfan/Desktop/career-compiler/src/lib/import/pdfText.ts)
- Added [src/lib/import/resumeDocument.ts](/Users/athfan/Desktop/career-compiler/src/lib/import/resumeDocument.ts)
- Added [src/lib/import/resumeIntake.ts](/Users/athfan/Desktop/career-compiler/src/lib/import/resumeIntake.ts)
- Added [src/lib/import/resumeRecovery.test.ts](/Users/athfan/Desktop/career-compiler/src/lib/import/resumeRecovery.test.ts)
- Modified [src/lib/resume/diff.ts](/Users/athfan/Desktop/career-compiler/src/lib/resume/diff.ts)
- Added [src/lib/tailoring/jobSpecificVariant.test.ts](/Users/athfan/Desktop/career-compiler/src/lib/tailoring/jobSpecificVariant.test.ts)
- Added [src/lib/tailoring/jobSpecificVariant.ts](/Users/athfan/Desktop/career-compiler/src/lib/tailoring/jobSpecificVariant.ts)
- Added [src/lib/tailoring/profileMaster.ts](/Users/athfan/Desktop/career-compiler/src/lib/tailoring/profileMaster.ts)
- Added [src/lib/tailoring/resumeRecoveryPipeline.test.ts](/Users/athfan/Desktop/career-compiler/src/lib/tailoring/resumeRecoveryPipeline.test.ts)
- Added [src/lib/tailoring/reviewedChild.ts](/Users/athfan/Desktop/career-compiler/src/lib/tailoring/reviewedChild.ts)
- Modified [src/stores/resumeEditorStore.ts](/Users/athfan/Desktop/career-compiler/src/stores/resumeEditorStore.ts)
- Added this report: [docs/CAREERCOMPILER_RESUME_WORKFLOW_RECOVERY_REPORT.md](/Users/athfan/Desktop/career-compiler/docs/CAREERCOMPILER_RESUME_WORKFLOW_RECOVERY_REPORT.md).

Parsing code supplies bounded local extraction; intake changes route it into existing review. New tailoring services bind reviewed previews/children to current records. The repository change repairs existing transaction integration. UI changes expose the three workflows; tests cover the resulting behavior. No Rust, capability, migration, AI provider or native-guard files changed.

## N. Native interactive acceptance limitations

The computer-use tool rejected `com.mirathfan.careercompiler.acceptance.run83554983eeb14244b579898f3d784624` with `Invalid app`. [Exact blocker](/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/native-tooling-blocker.json). Per authorization, no alternate identity, process inspection, native launch, permission expansion or guard workaround was attempted. Tauri dev startup, native picker interaction, native PDF preview/download, keyboard focus and app restart are **BLOCKED / UNVERIFIED** in this run. Browser interaction and SQLite reopen are separately proven, not substitutes for those native checks.

Owner native checklist, using only the existing authorized synthetic environment and rebuilt test application: confirm the isolated test identity and database root first; import `/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/resume.pdf`, inspect/correct text, reject a false claim, save approved records, verify they remain needs-review; repeat with `/Users/athfan/Desktop/career-compiler-resume-recovery-20261113-174944/resume.docx`. Verify synthetic facts explicitly, save backend and AI jobs through manual import, create/choose one Master, generate each draft, verify no child before approval, approve/save each child, export/open each one-page PDF and confirm project order. Record version IDs; restart the isolated app and verify both children plus original/submitted versions. Cancel the file picker and export dialog and verify no mutation. Close only that owned test app. Do not use production records for this checklist.

## O. Remaining blockers and limits

Native interaction is blocked as above. Job-independent Master creation needs a separately approved schema design; current creation requires a saved job. Import is text/structure recovery, not faithful document-layout conversion; it does not archive original binaries or infer uncertain dates/contact fields. Complex layouts may need manual correction. No OCR, DOC/RTF, macros, automatic omissions or broad résumé rewriting were added. The deterministic mock analyzer remains limited; no paid/live provider verification occurred. Automatic retention of every draft's UI context through native restart was not newly verified.

## P. Recommended next product improvement

First complete the owner native checklist on the verified synthetic environment, especially WKWebView worker loading, native file selection and exact PDF export identity. Then improve deterministic résumé field/date association with a broader synthetic layout corpus, retaining the correction-first review model. Separately design a safe additive model for job-independent Master résumés and archived source relationships. Broader AI writing permissions are unnecessary for these next improvements.

## Q. Simple owner instructions

1. **Import:** Résumés → Import existing résumé → Select PDF or DOCX. Check the original extraction and edit review text if necessary. Generate a proposal; correct fields, reject wrong claims and resolve duplicates. Save only approved changes. Review the resulting facts before making them eligible for résumé generation. Your file and existing Master remain unchanged.
2. **Create:** Save a job first. Résumés → Create résumé → select the associated saved job → Preview profile résumé. Review the preview, check the acknowledgement and Save new Master. Missing/unreviewed project or work evidence must be resolved first.
3. **Tailor:** Résumés → Tailor for job, select the saved job and open its résumé workflow. Review job analysis, choose and confirm an existing source résumé, adjust genuine locks/controls and Create tailored variant. Inspect before/after differences; accept or reject bullet proposals, confirm the content/order review, then Save reviewed child.
4. **Preview/export:** Inspect the existing résumé preview. Resolve validation/contact warnings and save the reviewed child before Export PDF. The existing export pipeline enforces an actual one-page check. Inspect the resulting PDF and retain the exact child version for application provenance. Native dialog/viewer behavior still needs the isolated checklist above.
