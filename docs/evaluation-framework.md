# Evaluation Framework

Evaluation Lab runs six local fixtures: full-stack, AI engineer, forward deployed engineer, mobile engineer, backend engineer, and ML systems/performance. Each fixture has a job description, expected role categories, ordered preferred and optional career items, de-emphasized items, evidence-backed required skills, prohibited fact IDs, a zero unsupported-claim limit, and a one-page expectation.

## Modes

- **Ranking only** runs deterministic evidence ranking, planning, and fallback generation with no provider call.
- **Mock suite** exercises the complete structured generation and validation pipeline offline.
- **Live OpenAI suite** requires a confirmation that multiple paid calls will be made.

Safe summaries store fixture and configuration IDs, prompt versions, selected item and fact IDs, validation issues, objective metrics, duration, and token counts. They do not store API keys, raw prompts, job descriptions, private notes, or resume bodies.

## Metrics And Comparison

Metrics report expected and unexpected items, represented and missing required skills, high-relevance facts used, unsupported claims and numbers, duplicates, bullet-length violations, one-page success, validation success, lock preservation, duration, and token usage. Unsupported claims and numbers must remain zero. There is no ATS score.

Select two session results to compare provider, model, prompt versions, profile, template, evidence, items, facts, bullets, validation, skills, one-page state, usage, duration, and semantic differences. CareerCompiler does not declare a winner. The user can mark one stored summary preferred and can explicitly save included bullets as approved variants.

## Reproducible Artifacts

```bash
npx --yes tsx@4.23.1 --tsconfig tsconfig.app.json scripts/generate-evaluation-pdfs.ts
```

This creates six one-page XeLaTeX PDFs under `output/pdf/evaluation`. The generator fails on unsupported claims, unsupported numbers, LaTeX failure, or a page count other than one.
