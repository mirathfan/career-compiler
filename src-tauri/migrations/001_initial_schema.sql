PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profile (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  headline TEXT NOT NULL,
  city TEXT NOT NULL,
  region TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  portfolio_url TEXT NOT NULL,
  linked_in_url TEXT NOT NULL,
  github_url TEXT NOT NULL,
  work_authorization_note TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS career_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('project', 'employment', 'education')),
  title TEXT NOT NULL,
  organization TEXT NOT NULL,
  location TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  short_description TEXT NOT NULL,
  url TEXT NOT NULL,
  repository_url TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS career_facts (
  id TEXT PRIMARY KEY,
  career_item_id TEXT NOT NULL REFERENCES career_items(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  evidence_status TEXT NOT NULL CHECK(evidence_status IN ('user_provided', 'verified', 'needs_review', 'prohibited')),
  source_note TEXT NOT NULL,
  skill_tags_json TEXT NOT NULL,
  role_tags_json TEXT NOT NULL,
  metric_tokens_json TEXT NOT NULL,
  importance INTEGER NOT NULL CHECK(importance BETWEEN 1 AND 5),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  proficiency_note TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  role_title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  raw_description TEXT NOT NULL,
  analysis_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resume_versions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  content_json TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft', 'approved', 'exported')),
  last_export_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
