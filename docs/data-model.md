# Data Model

CareerCompiler stores normal application data in local SQLite through the official Tauri SQL plugin. The in-browser development fallback uses the same repository interface and normalizes older localStorage records.

Core tables:

- `profile`: editable candidate identity, contact links, and optional work-authorization note.
- `career_items`: projects, employment, and education with exact dates and links.
- `career_facts`: atomic evidence with status, tags, metric tokens, importance, and enabled state.
- `skills`: editable approved skill vocabulary.
- `jobs`: pasted descriptions and structured analysis JSON.
- `resume_versions`: immutable-style saved drafts and exports.
- `approved_bullet_variants`: reusable reviewed language linked to source facts and a career item.
- `app_settings`: provider, model, template, export directory, and tailoring defaults.
- `applications`: local job-application state linked to a job and resume version.
- `evaluation_summaries`: safe objective metrics and configuration identifiers, without raw prompts or resumes.
- `migration_events`: success or failure, version range, automatic backup path, safe error code, and timestamp.

## Migration 2

Migration `grounded_generation_and_versioning` is additive and preserves the Milestone 1 database. It adds these columns to `resume_versions`:

- `parent_resume_version_id`
- `generation_provider`
- `generation_model`
- `prompt_version`
- `generation_metadata_json`
- `deterministic_baseline_json`

It adds `tailoring_defaults_json` to `app_settings`, creates `approved_bullet_variants`, and adds indexes for resume parent lookup and variant item lookup. Existing rows receive conservative defaults and are normalized when read.

Arrays and structured fields are stored as JSON text and parsed through typed repository helpers. Backup payload version 2 includes approved variants and the expanded resume metadata. Seed IDs remain deterministic, so reset and seed operations do not create duplicates.

Evidence statuses remain distinct: `user_provided`, `verified`, `needs_review`, and `prohibited`. The app never upgrades a user-provided fact to externally verified without an explicit user action.

## Migration 3

Migration `daily_use_readiness` is additive. It adds source type, source reference, verification date, last reviewed date, and notes to career facts. Resume versions gain all prompt-version IDs, the role layout profile, and a snapshot of template settings. Application settings gain validated template options, developer mode, and persisted UI state.

Before applying pending migrations to an existing database, the repository checkpoints SQLite WAL data and asks Rust to copy only `careercompiler.db` to a timestamped sibling file. Migration SQL and the schema-version insert run in one transaction. Failure rolls back the transaction, retains the copy, records a safe failure event where possible, and surfaces the backup path. Tests execute migrations from both Milestone 1 and Milestone 2 databases and verify preserved rows.

## Backup Schema 3

JSON backups contain profile, career items and facts, skills, jobs, resumes, approved variants, applications, settings, template settings, and evaluation summaries. Imports reject oversized or secret-like payloads, normalize schema 1 and 2 defaults, show counts and matching-ID conflicts, require confirmation, and support merge or replace in a transaction. Keychain secrets, API keys, temporary LaTeX files, and disposable directories are outside the data model and never exported.
