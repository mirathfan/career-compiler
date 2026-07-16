export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: 1,
    name: "initial_schema",
    sql: `
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

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

      CREATE TABLE IF NOT EXISTS app_settings (
        id TEXT PRIMARY KEY,
        ai_provider TEXT NOT NULL,
        model_name TEXT NOT NULL,
        default_template_id TEXT NOT NULL,
        default_export_directory TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_career_facts_item ON career_facts(career_item_id);
      CREATE INDEX IF NOT EXISTS idx_resume_versions_job ON resume_versions(job_id);
    `,
  },
  {
    id: 2,
    name: "grounded_generation_and_versioning",
    sql: `
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
    `,
  },
  {
    id: 3,
    name: "daily_use_readiness",
    sql: `
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
    `,
  },
];
