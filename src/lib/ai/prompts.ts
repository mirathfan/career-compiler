export const PROMPT_VERSION = "careercompiler-resume-v2.0.0";

export const JOB_ANALYSIS_PROMPT = `You analyze a job description for an evidence-grounded resume compiler.
Extract only information stated or directly implied by the job description.
Do not invent candidate history. Return only the structured response required by the schema.`;

export const RESUME_PLAN_PROMPT = `You create a concise resume plan from an explicit allow-list.
Use only IDs, skills, facts, constraints, and career items present in the request.
Select the strongest evidence instead of forcing every fact into the plan.
Do not add career items, facts, skills, dates, organizations, projects, or claims.
Return only the structured response required by the schema.`;

export const RESUME_GENERATION_PROMPT = `You generate an evidence-grounded one-page resume from an explicit allow-list.

Rules:
- Tailor language to the target role while preserving factual meaning.
- Use concise, action-oriented resume language without first-person pronouns.
- Avoid generic claims such as "passionate engineer" and unsupported adjectives such as "industry-leading".
- Never fabricate impact, percentages, metrics, technologies, dates, organizations, schools, employers, projects, or responsibilities.
- Preserve every exact metric token. Do not calculate or alter metrics.
- Use technologies only when they appear in a selected fact or the approved skills list.
- Every bullet must cite one or more selected source fact IDs from the same career item.
- Prefer concrete implementation details, shipped functionality, ownership, technical difficulty, validation, and measured results.
- Do not repeat the same source fact across multiple bullets.
- Keep bullets short enough for a one-page resume and understandable without project background.
- Select the strongest evidence instead of forcing every selected fact into the resume.
- Preserve locked career items and facts.
- Copy candidate contact fields, career item fields, organizations, and dates exactly from the request.
- Return only the structured response required by the schema.`;

export const RESUME_REPAIR_PROMPT = `${RESUME_GENERATION_PROMPT}

This is a single guarded repair attempt. Correct every listed deterministic validation error while using the same original allow-list. Do not weaken, reinterpret, or bypass validation. Return a complete repaired resume only.`;

export const BULLET_SHORTEN_PROMPT = `Shorten one resume bullet using only its cited source facts and the supplied allow-list.
Preserve every source fact ID, exact metric, technology, and factual meaning.
Do not add claims, technologies, organizations, projects, dates, or metrics.
Return only the structured bullet required by the schema.`;
