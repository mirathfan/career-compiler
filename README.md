# CareerCompiler

CareerCompiler is a private, local-first Mac desktop application for Mir Athfan Ali. It keeps an editable career memory and compiles job-specific resumes from an explicit allow-list of user-selected facts.

## Current Features

- Tauri 2 desktop shell with React, Vite, TypeScript strict mode, Tailwind CSS, React Router, TanStack Query, React Hook Form, and Zod.
- Local SQLite persistence through the official Tauri SQL plugin, with additive migrations and JSON backup/restore.
- Deterministic evidence scoring plus user controls for required, excluded, and locked evidence.
- Mock and OpenAI providers for job analysis, resume planning, grounded generation, guarded repair, and AI bullet shortening.
- OpenAI Responses API calls through Rust only, using strict Structured Outputs and the model selected in Settings.
- Local validation for sources, items, organizations, dates, skills, numeric claims, percentages, duplicates, wording, and length.
- Review state with source facts, reasons, keywords, semantic diff, accept/reject, manual editing, locks, and deterministic fallback.
- Parent-linked resume versions, real regeneration, old-version preservation, and reusable approved bullet variants.
- Concrete quality checks rather than a fabricated ATS score.
- Two content presets: `Mir Standard` and `AI and Full-Stack`.
- ATS-safe XeLaTeX PDF generation with one-page validation, selectable text, and clickable textual links.

## Architecture

```text
src/
  app/                         routing and application shell
  features/                    Career Memory, Tailor, Library, Settings
  lib/ai/                      providers, prompts, allow-list request, pipeline
  lib/database/                migrations and repository implementations
  lib/resume/                  validation, diff, quality, fitting, LaTeX, PDF count
  lib/tailoring/               evidence scoring, planning, generation, regeneration
  schemas/                     strict Zod and JSON Schema contracts
  stores/                      resume review/editor session state
src-tauri/
  src/commands/                OpenAI, XeLaTeX, file, and Keychain commands
  migrations/                  SQL migration mirrors
```

React never receives the OpenAI API key and never calls OpenAI directly. The model receives only the strongly typed generation request built from selected evidence. Local validation remains the source of truth after generation.

## Prerequisites

- Node.js and npm
- Rust/Cargo; this environment installs it under `~/.cargo/bin`
- Xcode command-line tools
- MacTeX or TinyTeX with `xelatex`, `geometry`, `fontspec`, `xcolor`, and `hyperref`

The PDF renderer searches `/Library/TeX/texbin/xelatex`, `/usr/local/bin/xelatex`, `/opt/homebrew/bin/xelatex`, and then `PATH`.

## Install And Run

```bash
npm install
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:dev
```

Verification and packaging:

```bash
npm run lint
npm run typecheck
npm run test:run
PATH="$HOME/.cargo/bin:$PATH" cargo fmt --manifest-path src-tauri/Cargo.toml --check
PATH="$HOME/.cargo/bin:$PATH" cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:build
```

Generate the deterministic Loop sample with the same LaTeX serializer:

```bash
npx --yes tsx@4.23.1 --tsconfig tsconfig.app.json scripts/generate-sample-pdf.ts
```

## Grounded Generation

The pipeline is:

```text
job description -> structured analysis -> local evidence ranking -> user selection
-> structured plan -> AI resume -> local validation -> one guarded repair
-> review and semantic diff -> one-page fitting -> XeLaTeX -> saved version
```

Disabled, prohibited, unselected, and explicitly excluded facts are not sent. Every bullet must cite allowed `sourceFactIds`; every item, date, organization, skill, and numeric token is checked against the request after generation. The centralized prompt version is persisted with each resume version.

## API Key Storage

OpenAI keys are stored in macOS Keychain:

- Service: `com.mirathfan.careercompiler`
- Account: `openai-api-key`

The frontend receives only status and a masked suffix. `OPENAI_API_KEY` is supported as a development fallback. Never put a real key in `.env`, SQLite, localStorage, logs, prompts saved to disk, or generated files.

## PDF Export

`src/lib/resume/latex.ts` escapes all user content and creates a fixed XeLaTeX document. Rust compiles it in a unique temporary directory with `-no-shell-escape` and deletes the source, log, and auxiliary files after reading the PDF. Export is blocked unless all included bullets are approved, local validation has no errors, and `pdf-lib` confirms exactly one page.

The renderer does not guess missing contact details. XeTeX ActualText is enabled and ligatures and automatic hyphenation are controlled so extracted text remains ATS-readable.

## Documentation

- `docs/ai-pipeline.md`
- `docs/generation-validation.md`
- `docs/data-model.md`
- `docs/resume-versioning.md`
- `docs/resume-rendering.md`

## Known Limitations

- Live OpenAI behavior requires a valid user-supplied key and is not called by automated tests.
- XeLaTeX is an external local prerequisite; the app reports a clear export error when it is unavailable.
- Automatic fitting stops at readable limits and asks for a manual edit rather than truncating content or exporting two pages.
- Per-bullet and per-section regeneration currently uses a full structured resume call, then applies only the requested grounded replacement.
- There is no cloud sync, account system, DOCX export, cover-letter generation, job scraping, hosted backend, or invented ATS score.
- Packaging targets the macOS `.app`; DMG generation is not configured.
