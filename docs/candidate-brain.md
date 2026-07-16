# Candidate Brain

Candidate Brain extends Career Memory from resume evidence into reusable application memory.

## Stored Records

- `candidate_claims`: structured facts with a verification status, evidence IDs, lock flag, and timestamps.
- `sensitive_answers`: explicit user-controlled answers for work authorization, sponsorship, salary, relocation, travel, clearance, demographic selections, and background-check consent.
- `candidate_preferences`: target roles, avoided roles, locations, salary floor, writing tone, answer length, and reuse preferences.
- `career_stories`: reusable STAR-style stories with tags, competencies, technologies, evidence IDs, approval state, and archive state.
- `approved_application_answers`: reusable answer memory keyed by normalized application-question type.

Only `verified` and `user_confirmed` claims and stories are eligible for generated application answers by default. Existing `career_facts` remain eligible only when they are `verified` or `user_provided` and enabled.

## Sensitive Answers

Sensitive and legal answers are never inferred. If an answer is missing, the application answer engine returns `user_required`. Locked sensitive answers are copied exactly as saved and can only be changed from the Candidate Brain screen.

Voluntary demographic answers should remain blank unless the user explicitly saves a value.

## Profile Import

Smart Career Intake remains the review-first ingestion path for pasted resumes, biographies, project notes, and prior AI-generated profiles. Imported facts are proposed, validated locally, and saved only after user approval.

## Completeness

The Candidate Brain screen computes a practical completeness indicator from contact data, education, core projects, portfolio links, target roles, sensitive answers, and approved story coverage. It is a review aid, not an ATS score.
