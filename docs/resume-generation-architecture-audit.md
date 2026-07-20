# Resume Generation Architecture Audit

Date: 2026-07-18

## Root Causes

The sparse resume came from the default Tailor Resume path in `src/features/tailoring/TailorResumePage.tsx`. The `generateResume` handler built a `ResumeGenerationRequest` from ranked Candidate Brain facts, called `generateEvidenceGroundedResume`, then saved the returned `TailoredResume` as a new root resume with `parentResumeVersionId: ""`.

- No base resume was selected because the default flow never required or read one. Existing resume versions were only queried for a sidebar/source panel and library display.
- Candidate Brain records were used to reconstruct the document. `buildResumeGenerationRequest` created an allow-list from `scoreCareerFacts` and `splitEvidence`, and `generateResumeFromAllowedEvidence` built sections directly from those selected facts.
- Employment history disappeared because the generator only rendered employment sections that had selected facts inside the content budget. If employment facts scored below projects, the Experience section was empty.
- Only a handful of skills appeared because `createResumePlanFromRequest` selected exact matches to required/preferred job skills, and `generateResumeFromAllowedEvidence` sliced that reduced list into the resume.
- Project dates and links disappeared because generated sections copied dates only from `CareerItem` records, where dates may be blank, and the `ResumeCareerItemSection` document shape did not carry project/repository URLs.
- Raw URLs appeared in the preview header because `ResumePreview` joined header fields directly. PDF export already supported linked labels through `urlDisplay`, but the app preview did not.
- The document used far less than the page because the generated resume was constrained by a small fact-derived content budget rather than starting with a complete professional base document.
- Internal test/build counts became primary bullets because metric-bearing facts received a scoring boost even when their `sourceType` was supporting verification evidence such as `test_result` or `build_output`.
- Resume lineage was not respected in the default tailoring flow. Saved generated resumes had no parent/base id; only the library regeneration path attempted to create a child version.
- The UI presented the generated-from-scratch document as a tailored resume. The button label, page title, and library status did not distinguish root generation from controlled tailoring.

## Architectural Fix

The tailoring flow now treats saved resumes as source documents. Users must confirm a base resume before creating a job-specific variant. The app duplicates the confirmed base, merges AI proposals as pending controlled edits, shows a before-and-after diff against the base, and saves the result with `kind: "tailored"`, `parentResumeVersionId`, and `baseResumeVersionId`.

The app also has a canonical `ResumeDocument` model stored with each `ResumeVersion`, so a resume version carries structured document content, document kind, template id, parent/source metadata, and section order in addition to the legacy `TailoredResume` rendering payload.
