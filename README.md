# CareerCompiler

CareerCompiler is Mir Athfan Ali's private, local-first Mac desktop application for turning reviewed career evidence into job-specific, one-page LaTeX resumes. It stores data in local SQLite, sends only an explicit evidence allow-list to the selected AI provider, and treats deterministic validation as authoritative.

## Daily Workflow

1. Choose **Tailor Resume** or press `Command+Option+T`.
2. Paste a job from the clipboard with an explicit button and review the raw text.
3. Analyze the job, confirm one of six role profiles, and explicitly save the job.
4. Inspect ranked evidence or accept the recommended selection.
5. Generate with the deterministic mock provider or OpenAI.
6. Review source facts, validation, semantic diff, and one-page fit.
7. Approve bullets, export the `Mir Resume` through XeLaTeX, and save an application record.

Clipboard content is never monitored and is not persisted until **Save job and score evidence** is selected. Export is blocked when required contact fields are missing, validation errors remain, bullets are unapproved, XeLaTeX fails, or the rendered PDF is not exactly one page.

## Features

- Tauri 2, React, Vite, strict TypeScript, local SQLite, and additive migrations.
- Automatic database backup before upgrades from an existing schema, plus recorded migration outcomes.
- Configurable `Mir Resume` with an approved font list, safe sizing and spacing ranges, ordering controls, and deterministic live preview.
- Full-stack, AI, forward deployed, mobile, backend, and general software-engineering role profiles that remain user-overrideable.
- Structured mock and OpenAI generation with per-stage prompt versions, a strict evidence allow-list, and one guarded repair.
- Local validation for sources, items, dates, organizations, skills, metrics, duplicates, and unsupported claims.
- Resume review with accept/reject, locks, manual edits, undo/redo, saved drafts, semantic diff, and approved variants.
- Applications screen with statuses, dates, notes, associated versions, PDF reveal, and duplication.
- Career Copilot with local conversation history, cited internal sources, hybrid career search, pending write confirmations, and resume-base recommendations.
- Resume Library search with submitted, ready, draft, favorite, and archived organization plus child-version creation from older bases.
- Evaluation Lab with six fixtures, deterministic ranking, mock runs, confirmed paid OpenAI runs, objective metrics, comparisons, preferred results, and variant saving.
- Career-fact source traceability, review queue, and controlled local README/JSON/TOML/text evidence import.
- First-run checks, XeLaTeX diagnostics, redacted diagnostics report, and versioned JSON backup preview/restore.

## Architecture

```text
src/features/       routed desktop workflows
src/lib/ai/         providers, structured requests, prompts, pipeline
src/lib/database/   migrations, repositories, backup and restore
src/lib/evaluation/ fixtures, objective metrics, comparisons
src/lib/import/     deterministic untrusted-file extraction
src/lib/search/     normalized search documents, hybrid ranking, optional vectors
src/lib/copilot/    Career Copilot read tools, citations, pending actions
src/lib/resume/     validation, diff, fitting, safe LaTeX, PDF checks
src/lib/tailoring/  role profiles, evidence ranking, planning
src/stores/         persisted resume review draft and history
src-tauri/          Keychain, OpenAI, XeLaTeX, and bounded file commands
```

React never receives an OpenAI key. Rust resolves it from macOS Keychain using service `com.mirathfan.careercompiler` and account `openai-api-key`; `OPENAI_API_KEY` is only a development fallback. Keys, full prompts, job descriptions, private notes, resume content, and temporary LaTeX files are excluded from diagnostics and backups as applicable.

## Prerequisites

- Node.js and npm
- Rust/Cargo, normally under `~/.cargo/bin`
- Xcode command-line tools
- MacTeX or TinyTeX with `xelatex`, `geometry`, `fontspec`, `xcolor`, and `hyperref`

Install MacTeX with `brew install --cask mactex-no-gui`, then open Settings and select **Retry diagnostics**. The renderer searches `/Library/TeX/texbin`, `/usr/local/bin`, `/opt/homebrew/bin`, and `PATH`; it never falls back to a different PDF engine.

## Run And Verify

```bash
npm install
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:dev
```

```bash
npm run lint
npm run typecheck
npm run test:run
PATH="$HOME/.cargo/bin:$PATH" cargo fmt --manifest-path src-tauri/Cargo.toml --check
PATH="$HOME/.cargo/bin:$PATH" cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:build
```

Generate the six deterministic role PDFs with the production LaTeX serializer:

```bash
npx --yes tsx@4.23.1 --tsconfig tsconfig.app.json scripts/generate-evaluation-pdfs.ts
```

## OpenAI Development Tests

Enable Developer mode in Settings. **Test connection** confirms key status, makes one minimal Structured Outputs request, validates it locally, and reports model, duration, and token usage. **Run paid full-pipeline test** requires confirmation and runs one small analysis-to-validation fixture without saving it. Automated tests never call OpenAI.

## Backup And Privacy

Settings can export a schema-versioned JSON backup and preview conflicts before merge or replacement. Restore requires confirmation and runs transactionally. Existing SQLite databases are checkpointed and copied beside the database before additive migrations. Backups include profile, career memory, jobs, resumes, variants, applications, settings, template options, and safe evaluation summaries; they never include Keychain data, API keys, or disposable LaTeX files.

## Bundle Report

Route-level lazy loading, a lazy resume preview, and export-only loading of `pdf-lib` reduced the largest production chunk from `965.41 kB` to `424.50 kB`. The largest chunk is now the PDF utility and loads only when exporting; Vite emits no chunk-size advisory.

## Documentation

- [Data model](docs/data-model.md)
- [AI pipeline](docs/ai-pipeline.md)
- [Generation validation](docs/generation-validation.md)
- [Resume rendering](docs/resume-rendering.md)
- [Resume versioning](docs/resume-versioning.md)
- [Evaluation framework](docs/evaluation-framework.md)
- [Runtime diagnostics](docs/runtime-diagnostics.md)
- [Local evidence import](docs/local-evidence-import.md)
- [Application tracking](docs/application-tracking.md)
- [Prompt versions](docs/prompt-versions.md)
- [Career Copilot](docs/career-copilot.md)
- [Hybrid retrieval](docs/hybrid-retrieval.md)
- [Resume recommendations](docs/resume-recommendations.md)
- [Internal citations](docs/internal-citations.md)
- [Agent tools](docs/agent-tools.md)
- [Embedding privacy](docs/embedding-privacy.md)
- [Resume Library search](docs/resume-library-search.md)

## Known Limitations

- Live OpenAI behavior requires a user-supplied key and explicit manual testing.
- Career Copilot currently uses deterministic local tools; the versioned OpenAI agent prompt exists but streaming model-backed chat is deferred.
- Semantic search is optional and disabled by default; FTS/fallback search remains the required path.
- XeLaTeX remains an external prerequisite. A portable TeX distribution would materially increase package size and maintenance risk, so it is deferred.
- Contact email and phone are intentionally not seeded; the user must enter them before final export.
- Fitting stops at readable limits and requests a manual edit instead of truncating content or exporting multiple pages.
- There is no cloud sync, authentication, automated job submission, DOCX export, scraping, or fabricated ATS score.
