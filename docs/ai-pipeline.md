# AI Pipeline

CareerCompiler exposes one provider interface with two implementations:

- `MockAIProvider` is deterministic, offline, and provides valid and intentionally invalid fixtures.
- `OpenAIProvider` calls the OpenAI Responses API only through `run_openai_structured` in Rust.

The provider supports job analysis, resume planning, tailored resume generation, validation repair, and grounded bullet shortening. The configured model is read from Settings for every call.

## Allow-List Request

`buildResumeGenerationRequest` creates the only candidate data the model may use. It includes target-job data, saved profile fields, selected career items, selected facts, approved skills, relevant approved variants, and explicit constraints. It excludes repository-only notes, disabled facts, disabled items, prohibited facts, user-excluded facts, and facts not selected by ranking or the user.

The request is parsed with Zod before it reaches a provider. Strict JSON Schemas for analysis, planning, generation, repair, and shortening live under `src/schemas`.

## OpenAI Boundary

Rust resolves the key from macOS Keychain or the development environment and sends a Responses API request with strict `text.format` JSON Schema. The command returns only structured output text plus safe duration and token fields. It maps authentication, network, rate-limit, structured-response, and server failures to stable codes without returning full provider response bodies.

Prompts are centralized in `src/lib/ai/prompts.ts` and have independent version identifiers for analysis, planning, generation, repair, bullet regeneration, and bullet shortening. Every generated resume stores the complete version map. Prompts prohibit invented history, metrics, dates, technologies, organizations, and impact; they require source IDs and concise role-specific language. See `docs/prompt-versions.md`.

## Generation Flow

1. Analyze the saved job description.
2. Rank evidence deterministically and apply user selection.
3. Ask the provider for a structured resume plan.
4. Reject an out-of-bounds plan and use the local deterministic plan instead.
5. Save a deterministic baseline for review and recovery.
6. Ask the provider for a strict `TailoredResume`.
7. Parse the schema and run local claim validation.
8. If errors exist, send the invalid response, issues, and original allow-list through one repair request.
9. Validate once more; remaining errors block approval and export.

No automated test calls a live OpenAI endpoint. Rust tests cover request serialization, response parsing, usage metadata, error mapping, and secret redaction. TypeScript fixtures cover valid, unsupported-number, missing-source, invented-skill, repairable, and non-repairable generation.

Safe persisted metadata contains provider, model, request type, success, duration, returned token counts, error code, repair state, fallback state, and compaction actions. It does not contain keys, prompts, response bodies, or unnecessary contact data.

## Explicit OpenAI Verification

Developer mode in Settings exposes two actions and neither runs automatically. The connectivity action first reports masked key status, then sends one minimal strict Structured Outputs request and reports provider, configured model, duration, token usage, and a stable safe error category. Authentication, missing-key, rate-limit, unsupported-model, network, schema, and provider errors are mapped without returning the response body.

The full-pipeline action requires a paid-request confirmation and runs one small development fixture through analysis, evidence selection, planning, generation, validation, and the normal guarded repair. The result is not persisted. Evaluation Lab provides a separately confirmed six-fixture live mode. Automated tests use mock or ranking-only modes and never require a key.

## Role Profiles

The selected role profile contributes ordered preferred and optional career items, section and summary defaults, bullet budgets, skill ordering, role tags, and emphasis/de-emphasis terms. It affects deterministic scoring and the generation constraints, but users can change the profile and every control before generation. A manual evidence override remains authoritative unless the fact is disabled, prohibited, or missing its career item.
