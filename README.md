# CareerCompiler

CareerCompiler is a private Mac desktop application for Mir Athfan Ali. It keeps a local, editable career memory and compiles job-specific, evidence-grounded resume drafts from verified user facts.

## Current Features

- Tauri 2 desktop shell with React, Vite, TypeScript strict mode, Tailwind CSS, React Router, TanStack Query, React Hook Form, and Zod.
- Local SQLite persistence through the official Tauri SQL plugin.
- Idempotent seed data for Mir's profile, education, projects, facts, and skills.
- Career Memory CRUD for items, facts, tags, evidence status, ordering, and skills.
- Four-step tailoring workflow: job input, mock/OpenAI analysis, local evidence scoring, resume generation/editor.
- Claim validation that blocks unsupported source facts, prohibited facts, unsupported numbers, and unknown skills.
- ATS-safe one-page PDF generation using `@react-pdf/renderer`, with page counting through `pdf-lib`.
- Local Resume Library and Settings for profile, AI provider/model, API key status, backup/export/import, and sample-data reset.

## Architecture

```text
src/
  app/
  components/
  features/
    career-memory/
    dashboard/
    tailoring/
    resume-library/
    settings/
  lib/
    ai/
    database/
    resume/
    tailoring/
  schemas/
  stores/
  types/
src-tauri/
  src/
    commands/
    keychain.rs
  migrations/
```

Business logic lives under `src/lib`; React components call repositories and pure tailoring/validation helpers.

## Prerequisites

- Node.js and npm
- Rust/Cargo available on PATH. In this environment Rust is installed under `~/.cargo/bin`.
- Xcode command-line tools

## Install and Run

```bash
npm install
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:dev
```

Useful commands:

```bash
npm run dev
npm run lint
npm run typecheck
npm run test:run
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:build
```

## Local Storage

Normal app data is stored in a local SQLite database named `careercompiler.db` through the Tauri SQL plugin. Arrays such as skill tags and metric tokens are stored as validated JSON text.

## API Key Storage

OpenAI keys are stored in macOS Keychain with:

- Service: `com.mirathfan.careercompiler`
- Account: `openai-api-key`

The frontend can set, replace, test, and delete the key, but it never receives the saved full key. `OPENAI_API_KEY` is supported as a development fallback. Do not put real secrets in `.env`.

## Mock Mode

Mock AI is the default. It returns deterministic job analysis data and keeps the full app usable offline.

## OpenAI Mode

OpenAI mode calls the Responses API through a Rust Tauri command. The browser never calls OpenAI directly. The request uses Structured Outputs with the JSON schema corresponding to `JobAnalysis`.

## Editing Career Facts

Open Career Memory, run the seed process if needed, select an item, and edit individual facts. Keep facts atomic, mark questionable claims as `needs_review`, and mark anything that should never be used as `prohibited`.

## Claim Validation

Every generated bullet must cite one or more `sourceFactIds`. Validation rejects missing, disabled, or prohibited source facts, flags facts needing review, checks numeric tokens against cited facts, rejects unsupported percentages, and ensures rendered skills exist in the skill database.

## Exporting a Resume

The editor shows validation status and estimated page count. Export uses a native save dialog, renders a PDF, checks the actual page count with `pdf-lib`, and writes only a one-page PDF with no blocking validation errors.

## Known Limitations

- OpenAI generation is limited to job analysis in Milestone 1; resume generation is deterministic from selected facts.
- The Resume Library "regenerate" action duplicates the saved version as a placeholder extension point.
- Page fitting uses deterministic estimation before export and exact PDF page count during export.
- There is no cloud sync, login, DOCX export, cover-letter generation, job scraping, or hosted backend.

## Milestone 2 Recommendations

- Add OpenAI-backed resume bullet generation constrained to supplied source facts.
- Add richer resume template controls and locked-item semantics.
- Improve PDF fit heuristics with live rendered measurements.
- Add import from existing resumes and richer manual approval workflows for edited warnings.
