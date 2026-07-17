# CareerCompiler

CareerCompiler is a local-first AI-assisted job application and resume-management desktop app that creates evidence-grounded resumes, prepares application answers, and supervises browser autofill while keeping final submission under user control.

Current status: **supervised beta**. The core application works, but all generated resumes, answers, and browser-filled application fields should be reviewed by the user. Workday is currently unsupported, and live ATS compatibility is still being expanded.

## Core Capabilities

- Candidate Brain for structured claims, preferences, career stories, approved answer memory, and sensitive-answer locking.
- Smart Career Intake for bounded, review-first extraction from explicitly selected local evidence files.
- Job ingestion and analysis with role profiles, required skills, and deterministic evidence scoring.
- Evidence-grounded resume generation with source fact citations, validation, semantic diffing, bullet approval, and one-page checks.
- XeLaTeX PDF generation with LaTeX escaping, approved template settings, and exact one-page export enforcement.
- Resume Library with search, favorites, archived versions, lineage, and child-version creation from prior bases.
- Career Copilot with local cited records, hybrid search, and pending write-action proposals.
- Application tracking for saved jobs, statuses, notes, submitted resume links, recruiters, and follow-up dates.
- Grounded application-answer preparation with confidence, evidence/story references, edit tracking, and manual-review states.
- Chrome Manifest V3 extension with macOS native messaging, pairing, supervised autofill, manual-edit preservation, resume upload authorization, and strict manual-submission enforcement.

## Architecture

```text
React + TypeScript frontend
Tauri + Rust desktop backend
SQLite local persistence
macOS Keychain for API secrets
XeLaTeX resume pipeline
Chrome Manifest V3 extension
macOS native messaging bridge
OpenAI and mock AI providers
```

Key directories:

```text
src/features/       routed desktop workflows
src/lib/ai/         providers, structured requests, prompts, pipeline
src/lib/database/   migrations, repositories, backup and restore
src/lib/evaluation/ fixtures, objective metrics, comparisons
src/lib/import/     deterministic untrusted-file extraction
src/lib/applications field classification and grounded application answers
src/lib/search/     normalized search documents, hybrid ranking, optional vectors
src/lib/copilot/    Career Copilot read tools, citations, pending actions
src/lib/resume/     validation, diff, fitting, safe LaTeX, PDF checks
src/lib/tailoring/  role profiles, evidence ranking, planning
src/stores/         persisted resume review draft and history
src-tauri/          Keychain, OpenAI, XeLaTeX, native host, and bounded file commands
apps/careercompiler-extension/ Chrome extension scanner/filler package
```

React never receives an OpenAI key. Rust resolves it from macOS Keychain using service `com.mirathfan.careercompiler` and account `openai-api-key`; `OPENAI_API_KEY` is only a development fallback. Keys, full prompts, job descriptions, private notes, resume content, temporary LaTeX files, and generated PDFs are excluded from diagnostics and backups as applicable.

## Development History

CareerCompiler was developed incrementally:

1. Candidate profile and resume-generation foundation
2. XeLaTeX rendering and one-page validation
3. Candidate Brain and structured career memory
4. Smart Career Intake and Career Copilot
5. Grounded application-answer generation
6. Chrome extension autofill
7. Secure native messaging bridge
8. Full product audit and blocker fixes
9. Upcoming UI/UX overhaul

The current stable checkpoint is the audited supervised-beta application. The next branch is reserved for UI and UX redesign work.

## Safety Principles

- Generated resume bullets must cite source facts; CareerCompiler must not fabricate candidate claims.
- Sensitive answers are user-controlled and can be locked.
- API keys stay in macOS Keychain and are never committed, logged, exported, or stored in SQLite.
- Final application submission is manual; the extension must not click submit buttons or bypass CAPTCHA or anti-bot controls.
- User data is stored locally by default.
- Mock mode is available for testing without paid API use.
- Imported evidence is untrusted, allowlisted by file type and size, and reviewed before saving.

## Prerequisites

- macOS with Xcode command-line tools and Tauri desktop prerequisites.
- Node.js and npm. No Node engine is pinned in `package.json`; use a current Node/npm toolchain compatible with the checked-in lockfile.
- Rust/Cargo. The Rust package declares `rust-version = "1.77.2"` in `src-tauri/Cargo.toml`; Rust may be installed under `~/.cargo/bin`.
- XeLaTeX through MacTeX, TinyTeX, or TeX Live. The app needs `xelatex`, `geometry`, `fontspec`, `xcolor`, and `hyperref`.
- Chrome for extension testing.

Install MacTeX with:

```bash
brew install --cask mactex-no-gui
```

The renderer searches `/Library/TeX/texbin`, `/usr/local/bin`, `/opt/homebrew/bin`, and `PATH`; it never falls back to a different PDF engine.

## Run And Verify

```bash
npm install
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:dev
```

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

Generate deterministic role PDFs locally when PDF QA is needed:

```bash
npx --yes tsx@4.23.1 --tsconfig tsconfig.app.json scripts/generate-evaluation-pdfs.ts
```

Generated PDFs belong under `output/` and are intentionally ignored.

## Chrome Extension

The extension package lives in `apps/careercompiler-extension/`.

```bash
npm run extension:build
```

Setup and pairing instructions: [docs/extension-setup.md](docs/extension-setup.md)

The extension is supervised. It prepares and fills fields for user review, preserves manual edits, requires desktop approval for application actions, and keeps final submission under user control.

## OpenAI Development Tests

Enable Developer mode in Settings. **Test connection** confirms key status, makes one minimal Structured Outputs request, validates it locally, and reports model, duration, and token usage. **Run paid full-pipeline test** requires confirmation and runs one small analysis-to-validation fixture without saving it. Automated tests never call OpenAI.

## Backup And Privacy

Settings can export a schema-versioned JSON backup and preview conflicts before merge or replacement. Restore requires confirmation and runs transactionally. Existing SQLite databases are checkpointed and copied beside the database before additive migrations. Backups include profile, career memory, jobs, resumes, variants, applications, settings, template options, and safe evaluation summaries; they never include Keychain data, API keys, generated PDFs, native-host credentials, or disposable LaTeX files.

## Documentation

- [Architecture](docs/architecture.md)
- [Security and privacy](docs/security-and-privacy.md)
- [Candidate Brain](docs/candidate-brain.md)
- [Application autofill](docs/application-autofill.md)
- [Full product audit](docs/full-product-audit.md)
- [Data model](docs/data-model.md)
- [AI pipeline](docs/ai-pipeline.md)
- [Generation validation](docs/generation-validation.md)
- [Resume rendering](docs/resume-rendering.md)
- [Resume versioning](docs/resume-versioning.md)
- [Evaluation framework](docs/evaluation-framework.md)
- [Runtime diagnostics](docs/runtime-diagnostics.md)
- [Local evidence import](docs/local-evidence-import.md)
- [Application tracking](docs/application-tracking.md)
- [Extension setup](docs/extension-setup.md)
- [Prompt versions](docs/prompt-versions.md)
- [Career Copilot](docs/career-copilot.md)
- [Hybrid retrieval](docs/hybrid-retrieval.md)
- [Resume recommendations](docs/resume-recommendations.md)
- [Internal citations](docs/internal-citations.md)
- [Agent tools](docs/agent-tools.md)
- [Embedding privacy](docs/embedding-privacy.md)
- [Resume Library search](docs/resume-library-search.md)

## Known Limitations

- Workday is unsupported.
- Live ATS compatibility still requires supervised testing; Generic, Greenhouse-style, Lever-style, and Ashby-style forms are the current focus.
- Large resume PDFs may require manual upload because Chrome native messaging responses are bounded.
- OpenAI usage requires the user's own API key and billing.
- Packaged macOS signing and notarization may still be pending.
- XeLaTeX remains an external prerequisite.
- Contact email and phone are intentionally not seeded; the user must enter them before final export.
- Fitting stops at readable limits and requests a manual edit instead of truncating content or exporting multiple pages.
- Semantic search is optional and disabled by default; FTS/fallback search remains the required path.
- The production build currently succeeds with a Vite chunk-size advisory for the main app bundle.
- External beta readiness has not been reached.

## License

All rights reserved.
