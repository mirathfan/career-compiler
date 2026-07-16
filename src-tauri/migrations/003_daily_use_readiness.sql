ALTER TABLE career_facts ADD COLUMN source_type TEXT NOT NULL DEFAULT 'user_statement';
ALTER TABLE career_facts ADD COLUMN source_reference TEXT NOT NULL DEFAULT '';
ALTER TABLE career_facts ADD COLUMN verification_date TEXT NOT NULL DEFAULT '';
ALTER TABLE career_facts ADD COLUMN last_reviewed_date TEXT NOT NULL DEFAULT '';
ALTER TABLE career_facts ADD COLUMN notes TEXT NOT NULL DEFAULT '';

ALTER TABLE resume_versions ADD COLUMN prompt_versions_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE resume_versions ADD COLUMN layout_profile_id TEXT NOT NULL DEFAULT 'general-software-engineer';
ALTER TABLE resume_versions ADD COLUMN template_settings_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE app_settings ADD COLUMN template_settings_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE app_settings ADD COLUMN developer_mode INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_settings ADD COLUMN ui_state_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  job_url TEXT NOT NULL,
  resume_version_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('preparing','ready','applied','interview','rejected','offer','withdrawn')),
  applied_date TEXT NOT NULL,
  referral_contact TEXT NOT NULL,
  notes TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evaluation_summaries (
  id TEXT PRIMARY KEY,
  fixture_id TEXT NOT NULL,
  fixture_name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('ranking','mock','openai')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_versions_json TEXT NOT NULL,
  role_profile_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  selected_career_item_ids_json TEXT NOT NULL,
  selected_fact_ids_json TEXT NOT NULL,
  validation_issues_json TEXT NOT NULL,
  preferred INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS migration_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_version INTEGER NOT NULL,
  to_version INTEGER NOT NULL,
  success INTEGER NOT NULL,
  backup_path TEXT NOT NULL,
  error_code TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_resume ON applications(resume_version_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_fixture ON evaluation_summaries(fixture_id, created_at);
