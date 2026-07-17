# CareerCompiler UI/UX Overhaul

## Scope

This pass rebuilt the visible product shell and core workflows into a quieter, denser desktop app experience for an evidence-grounded resume compiler. It intentionally did not change resume generation, evidence validation, OpenAI contracts, SQLite migrations, Keychain handling, or LaTeX rendering.

Updated areas:

- Global app shell, sidebar IA, route persistence, shortcuts, page spacing, responsive layout, and state surfaces.
- Dashboard, Candidate Brain, Career Memory, Smart Career Intake, Tailor Resume, Resume Library, Applications, Browser Extension, Career Copilot, Evaluation, and Settings.
- Shared primitives in `src/components/ui.tsx` for badges, status chips, page sections, stat cards, filters, tabs, progress checklists, alerts, skeletons, and loading panels.
- Global tokens and layout rules in `src/index.css`.

## Product Direction

- CareerCompiler now behaves like a working desktop tool, not a marketing site: compact navigation, scannable panels, restrained color, and visible operational status.
- First-run states lead with guided intake and sensitive answer review. Seed data remains available, but is demoted to a development detail.
- Sensitive application answers are visually separated from ordinary facts and are available from both Candidate Brain overview and the dedicated Sensitive Answers tab.
- Tailoring now reads as a gated production workflow: job analysis, evidence scoring, generation review, validation, one-page readiness, and export blockers.
- Library and Applications moved away from dense tables into scan-friendly workflow cards with status, ownership, date, notes, and primary actions.
- Query-backed nav shortcuts are now exact-match aware, so Candidate Brain, Career Stories, Answer Library, Smart Career Intake, and Evidence Database no longer show as active at the same time.

## Screenshot Artifacts

Local before/after screenshots were captured under:

- `docs/ui-ux-overhaul/before/`
- `docs/ui-ux-overhaul/after/`

These PNGs are intentionally ignored by git because they may contain seeded profile details. Useful local references include:

- Before: `before/00-dashboard-empty-1440.png`, `before/candidate-brain-1440.png`, `before/tailor-1440.png`, `before/candidate-brain-narrow-900.png`
- After: `after/dashboard-1440.png`, `after/candidate-brain-1440-v3.png`, `after/career-stories-1440-v2.png`, `after/smart-intake-1440-v3.png`, `after/applications-viewport-1440.png`, `after/career-stories-viewport-900-v2.png`

Browser QA signals from the final capture:

- `/candidate-brain`: one active sidebar link, `Candidate Brain`; 1440px width, no horizontal overflow.
- `/candidate-brain?tab=stories`: one active sidebar link, `Career Stories`; 1440px and 900px widths, no horizontal overflow.
- `/career-memory?intake=1`: one active sidebar link, `Smart Career Intake`; 1440px width, no horizontal overflow.

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | Pass | TypeScript strict build completed. |
| `npm run lint` | Pass | `oxlint .` completed. |
| `npm run test:run` | Pass | 22 files, 90 tests. |
| `npm run build` | Pass | Vite build completed; existing large chunk warning remains for app/pdf bundles. |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | Pass | No Rust formatting changes needed. |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` | Pass | No warnings. |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Pass | 21 Rust tests passed. |
| `npm run tauri:dev` | Pass | Vite became ready and `target/debug/career_compiler` launched; process was stopped after startup validation. |
| `npm run tauri:build` | Pass | Built `/src-tauri/target/release/bundle/macos/CareerCompiler.app`. |
| PDF visual QA | Pass | Rendered existing sample resume PDF to PNG; one page, no clipping, overlap, or unreadable glyphs observed. |

## Boundaries

- No live OpenAI calls were run.
- No browser-extension external submission flow was executed.
- No user data was transmitted outside the local app.
- The generated screenshot artifacts are local QA evidence only and are not committed.
