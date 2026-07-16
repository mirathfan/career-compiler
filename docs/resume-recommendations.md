# Resume Recommendations

Resume recommendations compare a target saved job against prior resume versions. The scorer is deterministic and stores component scores in `resume_recommendations`.

Components:

- role category overlap
- required and preferred skill overlap
- responsibility similarity
- evidence and fact coverage
- career item coverage
- validation health
- recency
- submitted-resume signal
- user preference through favorites/archives

The overall score is a ranking aid, not an ATS score. Application outcomes do not dominate the score, and the UI does not imply that a prior interview, rejection, or offer was caused by a resume.

Using a recommendation as a base creates a child resume version with `parentResumeVersionId` set to the source version. The source resume is preserved unchanged.
