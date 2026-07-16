# Prompt Versions

Prompt identifiers are centralized in `src/lib/ai/prompts.ts`. Every generated resume and evaluation summary records the complete map so output can be compared without persisting raw system prompts.

## Current Versions

| Stage | Version | Meaningful change |
| --- | --- | --- |
| Job analysis | `careercompiler-job-analysis-v3.0.0` | Clarifies direct job-description extraction and no candidate-history invention. |
| Planning | `careercompiler-plan-v3.0.0` | Enforces the selected evidence, role-profile constraints, locks, and content budget. |
| Resume generation | `careercompiler-resume-v3.0.0` | Adds daily-use role positioning, concise one-page language, and exact source/metric preservation. |
| Repair | `careercompiler-repair-v3.0.0` | Keeps one guarded repair on the original allow-list and requires all local issues to be addressed. |
| Bullet regeneration | `careercompiler-bullet-regeneration-v3.0.0` | Records regenerated-section and bullet behavior separately from the initial generation version. |
| Bullet shortening | `careercompiler-bullet-shortening-v3.0.0` | Preserves source IDs, factual meaning, technologies, and exact metrics during fitting. |

## History

- `v1`: deterministic Milestone 1 workflow without live structured resume generation.
- `v2`: OpenAI Responses API, strict Structured Outputs, planning, guarded repair, regeneration, and shortening used one primary generation identifier.
- `v3`: per-stage identifiers, role-profile metadata, evaluation comparisons, template snapshots, and explicit daily-use development tests.

Changing wording that can materially affect structured output requires a new stage version and an entry here. Refactors that do not alter prompt semantics do not require a version bump. Raw prompts remain hidden in normal UI; developer mode exposes test controls and version identifiers, not secrets.
