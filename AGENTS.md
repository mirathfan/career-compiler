# CareerCompiler Codex Guide

## Project Shape

CareerCompiler is a private local-first Mac desktop app built with Tauri 2, React, Vite, TypeScript strict mode, Tailwind CSS, SQLite via the official Tauri SQL plugin, TanStack Query, React Hook Form, Zod, and XeLaTeX PDF rendering.

Keep business logic outside React components:

- `src/lib/database` for migrations, repositories, seed data, backup/import.
- `src/lib/ai` for AI provider interfaces and OpenAI command calls.
- `src/lib/tailoring` for evidence scoring, planning, and deterministic resume generation.
- `src/lib/evaluation` for role fixtures, objective metrics, and generation comparisons.
- `src/lib/import` for bounded deterministic extraction from explicitly selected local evidence files.
- `src/lib/search` for normalized search documents, FTS/fallback ranking, vector-provider abstractions, and resume recommendations.
- `src/lib/copilot` for Career Copilot read tooling, citation construction, context limits, and pending write-action proposals.
- `src/lib/resume` for validation, diff, quality, filename handling, compaction, LaTeX serialization, and PDF page count.
- `src/features/*` for routed UI screens.

## Commands

```bash
npm install
npm run lint
npm run typecheck
npm run test:run
PATH="$HOME/.cargo/bin:$PATH" cargo fmt --manifest-path src-tauri/Cargo.toml --check
PATH="$HOME/.cargo/bin:$PATH" cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:dev
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:build
```

Rust may be installed under `~/.cargo/bin` even if it is not on the default shell PATH.
XeLaTeX is a runtime prerequisite. Use MacTeX or TinyTeX and verify `xelatex` is available before PDF QA.

## Evidence Rules

CareerCompiler is an evidence-grounded resume compiler, not a generic rewriter. Generated bullets must cite `sourceFactIds`. Do not invent technologies, employers, projects, metrics, dates, awards, or leadership claims. Prohibited facts must be excluded. Unsupported percentages are validation errors.

The OpenAI generation request is an allow-list contract. Never add repository-only notes, disabled facts, prohibited facts, or unselected facts to it. Local validation, not the model, decides whether content can be exported. A failed first response gets at most one automatic repair.

Imported evidence is untrusted. Read only explicitly selected allowlisted text files, never execute imported content, keep prompt-like text out of extraction, and require approval before saving a candidate fact. Imported facts begin as `needs_review`.

## API Keys

Never store an OpenAI API key in SQLite, localStorage, source code, logs, or generated files. Use macOS Keychain through Rust commands with service `com.mirathfan.careercompiler` and account `openai-api-key`. `.env.example` may document `OPENAI_API_KEY`; never create a real `.env` with a secret.

## LaTeX Safety

All resume data must pass through `escapeLatex` in `src/lib/resume/latex.ts`. Do not interpolate model or user text into LaTeX commands without escaping. Keep XeLaTeX shell escape disabled, compile in a disposable directory, avoid logging source or compiler output, and preserve the exact one-page PDF check.

Template options must pass `ResumeTemplateSettingsSchema`. Font names come only from `APPROVED_RESUME_FONTS`; numeric options remain within their defined ranges. Do not add an alternate renderer or arbitrary command-line flags.

## Persistence Safety

All schema changes are additive. Existing databases require a native copy before pending migrations, and migration success or failure must be recorded without storing private SQL or row content. JSON restore must be previewed, validated, confirmed, and transactional. Never put API keys, temporary build files, or raw OpenAI responses in a backup.

Jobs pasted from the clipboard remain transient until the user explicitly saves them. Live OpenAI connectivity, full-pipeline, and evaluation actions must never run automatically and must clearly identify paid requests.

## Career Copilot and Search

Use exact repository/SQLite reads for exact factual questions such as submitted resume, application status, creation dates, lineage, and source facts. Use search documents, FTS5 when available, deterministic fallback ranking, and optional semantic providers only for retrieval problems that need search.

Career Copilot answers must cite internal records that were actually included in context. When evidence is missing, say so rather than filling gaps. Write tools must create pending actions with before/after values and require explicit confirmation before mutating SQLite.

Semantic search defaults to disabled. Do not send career data to a remote embedding provider unless the user has opted in through Settings. Never embed API keys, emails, phone numbers, or private notes unless the relevant explicit setting allows that class of data.

## Completion Requirements

Before claiming a milestone is working, run the npm lint/typecheck/test suite, Rust tests, Tauri dev startup, and Tauri build where feasible. Report exact failures honestly.
