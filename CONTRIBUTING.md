# Contributing

CareerCompiler is a private local-first desktop app. Keep changes small, evidence-grounded, and easy to verify.

## Architecture

- Keep business logic outside React components.
- Use `src/lib/database` for migrations, repositories, seed data, backup, and restore.
- Use `src/lib/ai` for AI provider contracts and OpenAI command calls.
- Use `src/lib/tailoring`, `src/lib/resume`, and `src/lib/applications` for deterministic resume and application behavior.
- Use `src/features/*` for routed UI screens.
- Keep Chrome extension behavior in `apps/careercompiler-extension/` and native bridge behavior in `src-tauri/src/extension_bridge.rs`.

## Safety Rules

- Do not fabricate resume claims, skills, employers, dates, awards, metrics, or leadership evidence.
- Generated bullets must cite `sourceFactIds`; local validation decides export readiness.
- Do not automatically submit applications, click submit buttons, bypass CAPTCHA, or defeat anti-bot controls.
- Do not store API keys in source, SQLite, localStorage, logs, backups, extension bundles, or generated files.
- Do not commit personal profile data, real resumes, generated PDFs, local databases, backups, native-host credentials, pairing codes, or application answers.
- Use sanitized fixtures and test data only.
- Keep migrations additive and compatible with existing local databases.
- Preserve manual-edit and manual-submission safeguards in the extension.

## Verification

Run the relevant checks for every meaningful change. For release or publication checkpoints, run the full suite:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run extension:build
PATH="$HOME/.cargo/bin:$PATH" cargo fmt --manifest-path src-tauri/Cargo.toml --check
PATH="$HOME/.cargo/bin:$PATH" cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:build
```

Add focused regression tests for bug fixes. Report exact failures honestly when a check cannot be run.
