ALTER TABLE resume_versions ADD COLUMN parent_resume_version_id TEXT NOT NULL DEFAULT '';
ALTER TABLE resume_versions ADD COLUMN generation_provider TEXT NOT NULL DEFAULT 'deterministic';
ALTER TABLE resume_versions ADD COLUMN generation_model TEXT NOT NULL DEFAULT '';
ALTER TABLE resume_versions ADD COLUMN prompt_version TEXT NOT NULL DEFAULT '';
ALTER TABLE resume_versions ADD COLUMN generation_metadata_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE resume_versions ADD COLUMN deterministic_baseline_json TEXT;

ALTER TABLE app_settings ADD COLUMN tailoring_defaults_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS approved_bullet_variants (
  id TEXT PRIMARY KEY,
  career_item_id TEXT NOT NULL REFERENCES career_items(id) ON DELETE CASCADE,
  source_fact_ids_json TEXT NOT NULL,
  text TEXT NOT NULL,
  role_categories_json TEXT NOT NULL,
  skill_tags_json TEXT NOT NULL,
  target_job_id TEXT NOT NULL DEFAULT '',
  creation_source TEXT NOT NULL CHECK(creation_source IN ('ai', 'deterministic', 'user')),
  approved_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resume_parent ON resume_versions(parent_resume_version_id);
CREATE INDEX IF NOT EXISTS idx_approved_variants_item ON approved_bullet_variants(career_item_id);
