# CareerCompiler Codex Guide

## Project Shape

CareerCompiler is a private local-first Mac desktop app built with Tauri 2, React, Vite, TypeScript strict mode, Tailwind CSS, SQLite via the official Tauri SQL plugin, TanStack Query, React Hook Form, Zod, and `@react-pdf/renderer`.

Keep business logic outside React components:

- `src/lib/database` for migrations, repositories, seed data, backup/import.
- `src/lib/ai` for AI provider interfaces and OpenAI command calls.
- `src/lib/tailoring` for evidence scoring, planning, and deterministic resume generation.
- `src/lib/resume` for validation, filename handling, compaction, PDF rendering/page count.
- `src/features/*` for routed UI screens.

## Commands

```bash
npm install
npm run lint
npm run typecheck
npm run test:run
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:dev
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:build
```

Rust may be installed under `~/.cargo/bin` even if it is not on the default shell PATH.

## Evidence Rules

CareerCompiler is an evidence-grounded resume compiler, not a generic rewriter. Generated bullets must cite `sourceFactIds`. Do not invent technologies, employers, projects, metrics, dates, awards, or leadership claims. Prohibited facts must be excluded. Unsupported percentages are validation errors.

## API Keys

Never store an OpenAI API key in SQLite, localStorage, source code, logs, or generated files. Use macOS Keychain through Rust commands with service `com.mirathfan.careercompiler` and account `openai-api-key`. `.env.example` may document `OPENAI_API_KEY`; never create a real `.env` with a secret.

## Completion Requirements

Before claiming a milestone is working, run the npm lint/typecheck/test suite, Rust tests, Tauri dev startup, and Tauri build where feasible. Report exact failures honestly.
