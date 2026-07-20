# Resume Review and Optimizer Implementation Plan

## Architecture Audit

CareerCompiler already has the core safety architecture needed for resume review:

- `ResumeVersion` is the persisted version boundary. It stores `contentJson`, `resumeDocumentJson`, validation issues, status, lineage fields, template settings, generation metadata, and export path.
- `ResumeDocument` is the canonical structured representation, while `TailoredResume` remains the renderer/editing model used by tailoring, validation, preview, and PDF export.
- Master Resume safety is represented by `kind: "master"` plus lineage fields. Child variants are already created through `parentResumeVersionId` and `baseResumeVersionId`.
- Controlled edits are already supported through `createControlledResumeVariantFromBase`, `useResumeEditorStore`, semantic diffs, and per-bullet approval/rejection.
- Claim validation exists in `src/lib/resume/validation.ts` and already blocks missing source facts, unselected facts, disabled/prohibited facts, unsupported numbers/percentages, unsupported technologies, invented skills, invented career items, mutated career item fields, mutated education dates, duplicates, vague bullets, repeated openers, and locked-content removal.
- PDF rendering is separate from quality. `renderResumePdfBytes` and `countPdfPages` verify XeLaTeX output and actual page count, while `calculateResumeQuality` performs non-PDF quality checks.
- Saved jobs provide optional `analysisJson`. When present, that analysis can power role-fit, keyword, skill, and responsibility scoring without making a new paid provider call.

## Gaps Filled By This Feature

- A persisted structured `ResumeReview` scorecard.
- Three review modes: general, job-specific, and pre-submission.
- A safety-aware `ResumeImprovementProposal` model.
- A persisted `ResumeImprovementRun` connecting original review, child resume, improved review, exact diff, and PDF render status.
- Deterministic local scoring that treats PDF compilation as only one input, not proof of quality.
- A safe auto-improvement pass that never edits the Master Resume and never adds unreviewed facts.
- Resume Library UI controls for review, improvement, score comparison, exact changes, remaining weaknesses, approval/rejection, restore-original navigation, and another pass.

## Implementation Approach

1. Extend domain and repository contracts with review and improvement-run models.
2. Add additive SQLite migration tables for `resume_reviews` and `resume_improvement_runs`.
3. Add memory and SQLite repository implementations, backup/import support, and safe normalization.
4. Implement `src/lib/resume/review.ts` for:
   - deterministic review scoring,
   - mode-specific strictness,
   - factual risk classification,
   - safe improvement proposal generation,
   - child variant creation,
   - validation after edits,
   - semantic diff generation.
5. Wire Resume Library:
   - select resume,
   - optional target job,
   - review mode selector,
   - review action,
   - scorecard display,
   - improve action,
   - before/after comparison,
   - exact changes,
   - remaining weaknesses,
   - approve/reject/edit/restore/run-another controls.
6. Add tests for review scoring, pre-submission blocking, child variant safety, repository persistence, and migrations.

## Safety Rules

- Never mutate a `kind: "master"` resume during improvement.
- Improvement always creates a child `ResumeVersion`.
- Safe edits are limited to removal/exclusion, ordering, approved layout compaction, and section-order adjustments.
- No new facts, skills, projects, dates, employers, degrees, metrics, or technologies are introduced.
- Existing validation runs before and after improvement.
- Pre-submission review blocks approval for unsupported claims, missing contact data, date mutations, education/career item mutations, fabricated metrics, project/employment misclassification, page overflow, unreadable layout, and unresolved sensitive conflicts.
- PDF render success is recorded separately from quality score and cannot by itself mark a resume ready.
