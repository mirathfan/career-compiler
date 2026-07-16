# Internal Citations

Career Copilot attaches `InternalCitation` records to assistant answers. A citation identifies the record type, record id, optional parent record, visible label, and short detail.

Supported citation targets include:

- career facts
- career items
- approved bullet variants
- jobs and job requirements
- applications and notes
- resumes and resume bullets
- evaluation summaries
- Career Copilot summaries

Rules:

- Never cite records that were not retrieved into context.
- Candidate-specific claims need career fact, resume bullet, approved variant, application, or resume citations.
- Company-specific claims must come from saved job descriptions or user-provided notes.
- When no supporting record exists, Copilot must say it cannot find enough evidence.
