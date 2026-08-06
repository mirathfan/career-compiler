# Database Schema

The application schema is managed additively by `src/lib/database/migrations.ts`. Existing installations receive a native SQLite copy before pending migrations, and migration outcomes are recorded without row contents.

## Migration 9: job search automation

- `job_sources`: public provider configuration, polling interval, health timestamps, and a safe last error.
- `jobs`: the legacy canonical table is extended with provider identity, normalized title/location, HTML and text descriptions, workplace/employment metadata, compensation, discovery/last-seen dates, canonical/apply URLs, content hash, provider payload, lifecycle status, closed date, and changed-since-analysis flag. Legacy `company`, `role_title`, `source_url`, and `raw_description` columns remain for compatibility.
- `job_matches`: current deterministic/AI/combined scores, breakdown and reasons, filter decisions, matched Career Memory IDs, missing requirements, compatibility classifications, sponsorship/citizenship classifications, and analysis provenance.
- `job_match_analysis_history`: immutable snapshots for material reanalysis.
- `job_duplicate_events`: canonical job, incoming provider ID, deduplication signal, confidence, and timestamp.
- `job_search_preferences`: a singleton JSON preference document plus the indexed automation-enabled flag.
- `application_packages`: one package per job, linked resume ID, generation/validation state, suggested answers, unresolved questions, and approval timestamps.
- `application_answer_vault`: verified reusable values with sensitive/manual-confirmation flags. Values are never written to logs.
- `job_automation_runs`: persisted status, aggregate metrics, bounded structured errors, and grouped summary.

Existing `applications` remains the canonical tracker, and `resume_versions.job_id` remains resume lineage. Application packages do not duplicate either responsibility.

## Status transitions

`new → filtered_out` for hard deterministic rejection. Eligible jobs move through `analysis_pending → matched/saved → resume_pending → resume_ready → ready_to_apply`; tracker outcomes can synchronize `applied`, `rejected`, `interviewing`, or `offer`. `closed` and `archived` are terminal discovery states unless a user explicitly restores the record.

## Backup boundary

Normal career-data backups continue to exclude API keys, temporary files, compiler output, and raw OpenAI responses. Provider payloads are public job data but are currently not added as a new standalone backup collection; extended jobs remain compatible with existing job backup records.
