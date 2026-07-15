# Generation Validation

Local validation is authoritative. A schema-valid model response is still rejected when it is not grounded in the exact generation request.

## Blocking Errors

Errors block approval and export. They cover:

- missing or unselected source facts
- disabled or prohibited evidence
- missing or mismatched career item IDs
- invented projects, employers, schools, organizations, locations, or dates
- skills outside the approved skill set
- unsupported numeric tokens or percentages
- mutated profile and education fields
- bullets without source facts

Errors involving nonexistent or prohibited evidence cannot be manually approved.

## Warnings

Warnings cover needs-review evidence, near duplicates, repeated opening phrases, vague wording, excessive length, missing context, and similar quality concerns. The review UI shows warnings immediately after manual edits. Only explicitly safe warnings can be acknowledged, and the approved warning code is stored in the resume content.

## Repair

When initial AI content has errors, the pipeline sends one repair request containing the same allow-list, the invalid structured response, and deterministic validation issues. The repaired response is parsed and validated again. There is no second automatic repair and validators are never weakened to make output pass.

The user can retry, switch to mock mode, restore the deterministic fallback, or return to evidence selection without losing the current selection. Save-dialog cancellation is treated as cancellation, not an application error.

## Quality Panel

Quality checks report counts and explanations rather than an invented score. They include represented required and preferred skills, supported responsibilities, unsupported claims, duplicate and long bullets, weak openings, available metrics, unused high-relevance facts, one-page fit, contact completeness, and saved-link completeness.
