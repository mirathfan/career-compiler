# CareerCompiler Codex Guide

## Project Shape

CareerCompiler is a private local-first Mac desktop app built with Tauri 2, React, Vite, TypeScript strict mode, Tailwind CSS, SQLite via the official Tauri SQL plugin, TanStack Query, React Hook Form, Zod, and XeLaTeX PDF rendering.

Keep business logic outside React components:

- `src/lib/database` for migrations, repositories, seed data, backup/import.
- `src/lib/ai` for AI provider interfaces and OpenAI command calls.
- `src/lib/tailoring` for evidence scoring, planning, and deterministic resume generation.
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

## API Keys

Never store an OpenAI API key in SQLite, localStorage, source code, logs, or generated files. Use macOS Keychain through Rust commands with service `com.mirathfan.careercompiler` and account `openai-api-key`. `.env.example` may document `OPENAI_API_KEY`; never create a real `.env` with a secret.

## LaTeX Safety

All resume data must pass through `escapeLatex` in `src/lib/resume/latex.ts`. Do not interpolate model or user text into LaTeX commands without escaping. Keep XeLaTeX shell escape disabled, compile in a disposable directory, avoid logging source or compiler output, and preserve the exact one-page PDF check.

## Completion Requirements

Before claiming a milestone is working, run the npm lint/typecheck/test suite, Rust tests, Tauri dev startup, and Tauri build where feasible. Report exact failures honestly.
