# CareerCompiler OpenAI Provider Test

Date: 2026-07-17

## Summary

CareerCompiler can run the core OpenAI-backed workflow for supervised job analysis, Smart Career Intake extraction, resume planning, resume generation, validation, and PDF export.

The audit found and fixed one real-provider blocker: OpenAI rejected the Smart Career Intake structured-output schema because the provider-facing schema allowed arbitrary `existingValue` object properties. The schema now requires `existingValue: null`, and the prompt clarifies that local validation fills existing-record context.

Overall verdict: **core OpenAI resume generation is working; the complete product workflow is partially provider-backed.** Application-answer generation and Career Copilot currently run deterministic local engines, not OpenAI calls, so they were tested for safe behavior and citations rather than real-provider quality.

## Sources And Model

- OpenAI model/docs checked: <https://developers.openai.com/models> and <https://platform.openai.com/docs/guides/structured-outputs>
- Real job posting used for supervised test: Rezolve Ai, Full Stack Software Engineer, Lever posting at <https://jobs.lever.co/groupbyinc/ab35d3bb-adf9-47ca-9338-3fe1051ad1ed>
- Model used for the isolated audit profile: `gpt-5.6-luna`
- App default model remains `gpt-5.6`, which is documented by OpenAI as a valid GPT-5.6 alias; no default-model code change was needed.

## Secret Handling

- Confirmed the API key exists through macOS Keychain status only.
- Did not read, print, copy, log, or store the full key.
- Key source was reported as `keychain`, with only a 4-character masked suffix available.
- Tracked-file secret scan found no unredacted OpenAI key.
- Temporary provider harness used the same Rust command path as the app and never accepted the key through env vars, files, SQLite, localStorage, or logs.

Relevant app paths:

- Key status/write commands: `src-tauri/src/commands/keychain_commands.rs`
- OpenAI Responses API command: `src-tauri/src/commands/ai.rs`
- Frontend OpenAI provider: `src/lib/ai/openAIProvider.ts`

## Real Provider Calls

The passing run made five successful measured OpenAI calls plus one intentional invalid-model probe:

| Feature | Result | Tokens |
| --- | --- | ---: |
| Minimal connectivity | Pass | 81 |
| Invalid model handling | Pass, returned `unsupported_model` | n/a |
| Smart Career Intake | Pass | 6,711 |
| Job analysis | Pass | 981 |
| Resume plan | Pass | 9,717 |
| Resume generation | Pass | 11,628 |

Measured passing-run token usage: 21,262 input, 7,856 output, 29,118 total. Estimated cost with `gpt-5.6-luna` pricing: about `$0.0684`.

An earlier first attempt intentionally stopped after exposing the Smart Career Intake `schema_rejection`; the fixed run above is the authoritative workflow result.

## Feature Results

### Settings And Connectivity

Status: **Pass**

- Provider selection, model name, and developer-mode settings persisted across repository restart.
- Minimal structured connectivity succeeded.
- Invalid-model error was mapped to the safe user-facing category `unsupported_model`.
- The packaged UI exposes key status with masked suffix only.

### Smart Career Intake

Status: **Pass for supported proposal types; partial for full Candidate Brain coverage**

- Real OpenAI extraction produced 28 proposed changes from sanitized candidate material.
- Local validation accepted 9 record creates and 1 update, rejected or flagged conflicts/duplicates, and did not infer sensitive work-authorization or future-sponsorship fields.
- The current schema supports profile, career item, career fact, skill, and relationship proposals.
- It does not yet support saving career stories, approved reusable application answers, candidate preferences, or sensitive answers from provider extraction.

Fix made:

- `src/schemas/careerImport.ts` now uses `existingValue: { type: "null" }` in the provider schema.
- `src/lib/ai/prompts.ts` tells the model to return `existingValue` as null.
- `src/schemas/schemas.test.ts` adds a regression test to prevent reintroducing arbitrary `additionalProperties: true`.

### Job Analysis

Status: **Pass**

- Real job analysis extracted company, role title, seniority, role categories, required/preferred skills, location requirements, and lack of work-authorization language from the Rezolve Ai posting.
- No candidate facts were invented during job analysis.

### Retrieval And Resume Generation

Status: **Pass**

- Resume request context included 56 selected facts, 11 selected career items, and 59 approved skills.
- No `needs_review` facts were included in the resume generation request.
- Resume generation completed without repair.
- Deterministic claim validation returned 0 errors and 0 warnings.
- Generated PDF exported as a one-page letter PDF.
- Visual PDF QA found no clipping, overlap, unreadable glyphs, or page spill.

Generated artifact for local review:

- `tmp/real-provider-audit/CareerCompiler_OpenAI_Provider_Test.pdf`

### Application Answers

Status: **Partial**

- Application fields were detected, generated, saved, and persisted.
- Every generated answer required review.
- Unsafe fields such as Python years, sponsorship, salary, technical challenge, and why-role remained `user_required`.
- This product path is not currently OpenAI-backed. `src/lib/applications/answerEngine.ts` assembles answers deterministically from verified/user-provided evidence, stories, approved answers, and locked sensitive answers.

### Career Copilot

Status: **Partial**

- Five Copilot questions were answered using local deterministic tooling.
- Responses included tool-call records and internal citations.
- Exact application lookup worked against saved local application data.
- This product path is not currently OpenAI-backed. `src/lib/copilot/careerCopilot.ts` creates deterministic messages with provider `deterministic` and model `local-career-copilot`.

### Extension And Submission Safety

Status: **Build/test only; no real submission**

- No real job application was submitted.
- The audit created a local application record only.
- Browser-extension packaging is covered by `npm run extension:build` in the final verification pass.

## Remaining Product Gaps

1. Smart Career Intake cannot yet persist provider-extracted stories, reusable approved answers, preferences, or sensitive-answer proposals.
2. Application-answer generation uses deterministic local assembly; if real provider answers are desired, it needs an explicit OpenAI path with source citations, sensitive-field gating, and no-submit review.
3. Career Copilot uses deterministic local read tools; if real provider Copilot is desired, it needs a separate provider-backed implementation that preserves citation and pending-write guarantees.
4. The tested workflow used a sanitized isolated profile, not the user's real career records.

## Verification Commands

Targeted provider audit used a temporary local bridge and ignored Vitest harness under `tmp/real-provider-audit/`:

```bash
CC_OPENAI_BRIDGE="/Users/athfan/Desktop/career-compiler/src-tauri/target/debug/cc_openai_bridge" CC_OPENAI_MODEL="gpt-5.6-luna" ./node_modules/.bin/vitest run tmp/real-provider-audit/real-provider-audit.test.ts --config vite.config.ts
```

PDF visual QA:

```bash
pdfinfo tmp/real-provider-audit/CareerCompiler_OpenAI_Provider_Test.pdf
pdftoppm -png -r 160 tmp/real-provider-audit/CareerCompiler_OpenAI_Provider_Test.pdf tmp/pdfs/openai-provider-audit/provider-test
```

Final verification pass:

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test:run` | Pass, 23 files / 92 tests |
| `npm run build` | Pass |
| `npm run extension:build` | Pass |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | Pass |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` | Pass |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Pass, 21 Rust tests |
| `npm run tauri:dev` | Pass, Vite ready and Tauri dev binary launched |
| `npm run tauri:build` | Pass, built `src-tauri/target/release/bundle/macos/CareerCompiler.app` |
| Packaged app smoke launch | Pass, launched from built `.app` with isolated `HOME`; startup log empty |
