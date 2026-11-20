# Standalone Master storage — owner approval proposal

Status: **DESIGN APPROVED FOR IMPLEMENTATION AND SYNTHETIC TESTING ONLY; NOT REGISTERED OR RUN AGAINST PRODUCTION**.

The owner conditionally approved this design on 2026-11-15. The dedicated native runner is now implemented under `cfg(test)` in `src-tauri/src/migration012/`. See `docs/MIGRATION_012_SYNTHETIC_VERIFICATION_REPORT.md` for current evidence and the remaining approval boundary. The reviewed SQL below is unchanged. The subsequent explicit maintenance adapter is documented in `docs/MIGRATION_012_ADAPTER_PREPARATION_REPORT.md`: its owner mode remains disabled before filesystem access, while its synthetic mode reuses this same runner. No real-data execution is authorized by adapter preparation.

The current `resume_versions.job_id` is `TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE`. Neither the planner nor PDF renderer needs a job. Removing UI validation alone cannot fix persistence.

## Minimal schema change

Make `job_id` nullable while retaining its foreign key and existing delete behavior. Add `CHECK(job_id IS NOT NULL OR kind = 'master')`. Existing rows retain their job associations, IDs, JSON, locks, lineage, export paths, timestamps and application references. Only new general Masters may have SQL `NULL`; the existing domain representation is an empty `jobId` string. Tailored/imported versions keep their job requirement.

Exact proposed table body: [012_standalone_master_resume.sql](012_standalone_master_resume.sql). It copies all 22 current columns and recreates all four explicit indexes. It creates no jobs and changes no existing Master designation.

The bundled native SQLite is 3.46.0; synthetic SQL.js uses 3.49.1. These cannot directly drop a NOT NULL constraint. SQLite documents direct `ALTER COLUMN ... DROP NOT NULL` as added in 3.53.0. The compatible route is its documented create/copy/drop/rename procedure. This proposal appends migration history; its DDL is a **lossless table rebuild**, not purely additive ALTER/ADD DDL. It is therefore not being slipped into startup migrations. [SQLite ALTER TABLE documentation](https://www.sqlite.org/lang_altertable.html)

## Owner decision required

The nullable-job schema design and synthetic runner implementation are approved. Enabling an owner-invoked real-data migration path and applying it to a real database still require separate explicit approval supported by successful native tests and a verified backup of that exact database. The current authorization expressly forbids production migration or automatic production startup migration.

Do not paste this SQL into the current migration loop. That loop issues statements through a pooled plugin connection without wrapping the rebuild in one native transaction. Existing repository transaction commands deliberately reject DDL and PRAGMA control; do not weaken their general-purpose permissions.

## Required implementation and preflight before any real use

1. Establish exclusive application ownership and a verified SQLite backup, including WAL state, through the existing backup safeguards. Never copy an actively written main file alone. Preserve the backup separately.
2. Verify exact expected schema through migration 11: all columns/defaults/constraints, four indexes, foreign-key relationships and migration IDs. Refuse unexpected indexes, triggers, views, unknown migration IDs or an existing `resume_versions_standalone_v12` table. Do not drop unfamiliar objects.
3. Compare all table rows and stored references using local digests/counts; keep private content out of logs. Check integrity and foreign keys before changing anything.
4. Retain one exclusively owned native connection for the entire operation. Set `PRAGMA foreign_keys=OFF` **before** `BEGIN IMMEDIATE`. Run the proposed SQL body. This temporary connection-local setting prevents cascades during replacement; it is not a global security change.
5. Before commit, compare every original value in every table except the intended schema metadata. Require `PRAGMA foreign_key_check` to return no rows and `PRAGMA integrity_check` to return `ok`. Check all four indexes and the new constraint. Preserve every résumé ID, submitted résumé/PDF reference, favorite/archive, safety record, application/provenance record and conversation.
6. Only after successful validation, insert `schema_migrations(id,name,applied_at)` with ID `12`, name `standalone_master_resume`, and the actual timestamp on that same transaction. Record migration success/failure through the existing metadata-only audit. `COMMIT`; restore `PRAGMA foreign_keys=ON` before releasing the connection; reopen and recheck.
7. On any failure, `ROLLBACK`, restore foreign keys, verify the original schema/data and preserve evidence. If backup recovery is necessary, stop all owned writers first and quarantine failed files; do not delete records or silently retry with weaker checks.

The dedicated runner is implemented and native-tested for fresh, exclusively owned synthetic databases only. Production application of the migration is **not authorized or enabled**. Fresh-install production registration also remains pending, so the current app still disables Save on the old schema while allowing reviewed preparation and PDF preview. The test-only runner cannot resolve or accept an existing production database path.

## Synthetic verification performed

`src/lib/database/standaloneMasterPersistence.test.ts` runs the exact proposed body only on fresh synthetic in-memory SQLite. It verifies an interrupted rebuild rolls back, all legacy résumé columns and submitted application/favorite references survive, non-Masters cannot use NULL, an interrupted save rolls back, a new Master needs zero jobs, a later child has its actual selected job, and serialization/reopen preserves exact records. It does not constitute native migration-runner or production-migration acceptance.

Evidence: `/Users/athfan/Desktop/career-compiler-standalone-master-20261115/standalone-master.sqlite3` and `standalone-persistence.json`. All records there are synthetic. Current source, backups and test results are described in `docs/STANDALONE_MASTER_RESUME_REPORT.md`.
