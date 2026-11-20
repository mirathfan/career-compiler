-- PROPOSAL ONLY. Not registered in migrations.ts and not executed at startup.
-- Requires an exclusively owned, verified-backup database connection.
-- On that SAME connection: foreign_keys=OFF BEFORE BEGIN IMMEDIATE.
-- Execute this body, compare all old rows/references/indexes, run foreign_key_check
-- and integrity_check, then record migration success and COMMIT. On ANY failure:
-- ROLLBACK. Always restore foreign_keys=ON before releasing the connection.
-- Refuse unexpected source columns/indexes/triggers/views or an existing temp table.
CREATE TABLE resume_versions_standalone_v12 (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  content_json TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','approved','exported')),
  last_export_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  parent_resume_version_id TEXT NOT NULL DEFAULT '',
  generation_provider TEXT NOT NULL DEFAULT 'deterministic',
  generation_model TEXT NOT NULL DEFAULT '',
  prompt_version TEXT NOT NULL DEFAULT '',
  generation_metadata_json TEXT NOT NULL DEFAULT '{}',
  deterministic_baseline_json TEXT,
  prompt_versions_json TEXT NOT NULL DEFAULT '{}',
  layout_profile_id TEXT NOT NULL DEFAULT 'general-software-engineer',
  template_settings_json TEXT NOT NULL DEFAULT '{}',
  kind TEXT NOT NULL DEFAULT 'tailored' CHECK(kind IN ('master','tailored','imported')),
  base_resume_version_id TEXT NOT NULL DEFAULT '',
  resume_document_json TEXT NOT NULL DEFAULT '',
  CHECK(job_id IS NOT NULL OR kind = 'master')
);
INSERT INTO resume_versions_standalone_v12 (
  id,job_id,name,template_id,content_json,validation_json,status,last_export_path,
  created_at,updated_at,parent_resume_version_id,generation_provider,generation_model,
  prompt_version,generation_metadata_json,deterministic_baseline_json,prompt_versions_json,
  layout_profile_id,template_settings_json,kind,base_resume_version_id,resume_document_json
) SELECT
  id,job_id,name,template_id,content_json,validation_json,status,last_export_path,
  created_at,updated_at,parent_resume_version_id,generation_provider,generation_model,
  prompt_version,generation_metadata_json,deterministic_baseline_json,prompt_versions_json,
  layout_profile_id,template_settings_json,kind,base_resume_version_id,resume_document_json
FROM resume_versions;
DROP TABLE resume_versions;
ALTER TABLE resume_versions_standalone_v12 RENAME TO resume_versions;
CREATE INDEX idx_resume_versions_job ON resume_versions(job_id);
CREATE INDEX idx_resume_parent ON resume_versions(parent_resume_version_id);
CREATE INDEX idx_resume_versions_kind ON resume_versions(kind, created_at);
CREATE INDEX idx_resume_versions_base ON resume_versions(base_resume_version_id);
