# Job Automation Implementation Plan

## Existing systems to reuse

- Extend the additive migration runner and the `AppRepository` SQLite/memory implementations. The legacy `jobs` table remains the canonical job identity so existing resume lineage, search, Career Copilot, and application records keep working.
- Reuse Career Memory (`career_items`, `career_facts`, and `skills`) as the only evidence set for matching and later resume generation.
- Reuse the current grounded tailoring pipeline, claim validation, numeric validation, XeLaTeX renderer, PDF checks, and `resume_versions.job_id` relationship. Job automation will prepare records for that pipeline, not create an alternate renderer.
- Reuse the existing `applications` tracker and browser-extension bridge. An approved application package will create or update an application draft; opening/filling never marks it submitted.
- Reuse TanStack Query, repository context, routed feature pages, structured-error conventions, and mock/local development repository.
- Reuse the OpenAI Responses API command and Structured Outputs mechanism for a later opt-in match-analysis call. Deterministic filtering and scoring remain useful with AI disabled.

## New modules

- `src/lib/job-automation`: domain schemas, text normalization/classification, source adapters, deduplication, eligibility filters, deterministic scoring, run orchestration, scheduling policy, notification summaries, and safe application-package/answer-vault helpers.
- `src/features/job-radar`: source/preference/run management.
- `src/features/match-inbox`: qualified-job review, filtering, status changes, and handoff to resume tailoring.
- `src/features/application-queue`: approved package review and connection to the existing application tracker/extension.
- A bounded Rust public-job-board fetch command restricted to the documented Greenhouse, Lever, and Ashby HTTPS hosts. It performs GET-only requests, limits response size, and never submits an application.

## Database migration

Migration 9 additively extends `jobs` with normalized provider fields while retaining legacy columns used by the existing app. It creates `job_sources`, `job_matches`, `job_match_analysis_history`, `job_duplicate_events`, `job_search_preferences`, `application_packages`, `application_answer_vault`, and `job_automation_runs`, plus indexes and explicit status checks. `application_packages.resume_version_id` references the existing resume library; existing `applications.job_id` remains the tracker connection.

The migration is exercised against both a fresh database and an upgraded database containing legacy job/resume rows. Existing databases continue to receive the native pre-migration copy already enforced by `SqliteRepository.initialize`.

## Data flow

1. The scheduler policy decides whether a manual or overdue-on-launch run may start and prevents overlap.
2. Enabled sources are fetched independently through a provider adapter. Payloads are runtime-validated, normalized, converted to text, and retained as JSON for local debugging.
3. Deduplication checks provider ID, canonical URL, exact company/title/location, content hash, and conservative near-identical repost similarity in that order. The reason is recorded.
4. Deterministic eligibility rules run before any paid call. Rejected jobs are persisted as `filtered_out` with structured reasons.
5. Eligible jobs receive an explainable score from title/seniority, skills, experience, location/workplace, project/domain evidence, and recency. Career Memory IDs are recorded with the match.
6. Jobs meeting the configured threshold enter Match Inbox. AI enhancement is opt-in and capped; validated AI scoring can contribute 30% while deterministic scoring remains 70%.
7. Resume preparation delegates to the existing Tailor Resume route using the saved job ID. Validated resume versions can be linked into an application package and then the existing application tracker.
8. The browser extension may fill an explicitly approved package and authorized resume, highlights unresolved fields, and stops before final submission. A user action is required to mark an application applied.

## Security boundaries

- Adapters use only unauthenticated public ATS GET endpoints; there is no authenticated LinkedIn scraping, generic crawler, CAPTCHA handling, proxy rotation, or submission endpoint.
- Provider identifiers are validated before URL construction. The native fetch command allow-lists exact HTTPS hosts, applies a timeout, bounded retries, and a response-size ceiling.
- Imported provider HTML is treated as untrusted text and is never executed.
- AI receives only selected, enabled, non-prohibited evidence IDs and non-sensitive job text. Answer-vault values are excluded from AI context by default.
- Consequential and demographic answers always require manual confirmation. No package or extension action can perform final submission.
- Errors and run metrics omit answer-vault values, contact details, credentials, and API keys.

## Testing strategy

- Fixture-backed unit tests cover Greenhouse, Lever, and Ashby validation/normalization; HTML conversion; title/location normalization; content hashing; deduplication; seniority/experience/sponsorship/citizenship classification; filtering; deterministic and combined scoring; and answer-vault protections.
- Repository and migration tests cover fresh/upgrade schema, duplicate updates, package persistence, filtered-job behavior, run metrics, and memory-repository parity.
- UI smoke tests verify the app works with no sources and that application handoff remains manual.
- The full TypeScript lint/typecheck/test suite, Rust formatting/clippy/tests, Tauri development startup, and production build are run before handoff where local prerequisites permit.

## Major risks and mitigations

- Public ATS payloads evolve. Zod schemas accept documented optional fields while rejecting missing identity/title/URL data; malformed postings are isolated per job.
- Tauri WebView CORS varies. Production fetches use a small native GET-only transport with a strict host allow-list.
- The legacy jobs schema is widely referenced. Migration 9 is additive and mapping code supplies compatibility defaults instead of replacing the table.
- Automated resume generation can spend money or overproduce. Default mode is manual, paid analysis/preparation requires explicit opt-in, and per-run caps are enforced.
- Desktop scheduling cannot run while the app is closed. The UI states this and the scheduler runs once on launch only when overdue; the collector/orchestrator is UI-independent for future cloud reuse.
- The full milestone spans discovery, AI, PDF generation, and browser integration. Work is delivered in stable vertical slices; unimplemented portions are documented as limitations rather than represented as complete.
