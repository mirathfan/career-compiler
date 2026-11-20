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
  {
    id: 4,
    name: "career_copilot_hybrid_retrieval",
    sql: `
      ALTER TABLE app_settings ADD COLUMN semantic_search_mode TEXT NOT NULL DEFAULT 'disabled' CHECK(semantic_search_mode IN ('disabled','openai','local'));
      ALTER TABLE app_settings ADD COLUMN allow_remote_embeddings INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE app_settings ADD COLUMN allow_private_notes_in_embeddings INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE app_settings ADD COLUMN allow_contact_fields_in_copilot_context INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE applications ADD COLUMN submitted_resume_version_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN submitted_pdf_path TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN submitted_pdf_hash TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN follow_up_date TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN recruiter TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN hiring_manager TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN referral TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN source TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN salary_range TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN location_type TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN sponsorship_notes TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN next_action TEXT NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS career_copilot_threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        active_context_type TEXT NOT NULL,
        active_context_id TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS career_copilot_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES career_copilot_threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
        content TEXT NOT NULL,
        structured_content_json TEXT NOT NULL DEFAULT '{}',
        tool_calls_json TEXT NOT NULL DEFAULT '[]',
        internal_citations_json TEXT NOT NULL DEFAULT '[]',
        pending_actions_json TEXT NOT NULL DEFAULT '[]',
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        token_usage_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS search_documents (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        parent_entity_type TEXT NOT NULL DEFAULT '',
        parent_entity_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        normalized_text TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        content_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(entity_type, entity_id, parent_entity_type, parent_entity_id)
      );

      CREATE TABLE IF NOT EXISTS search_embeddings (
        id TEXT PRIMARY KEY,
        search_document_id TEXT NOT NULL REFERENCES search_documents(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        vector_json TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(search_document_id, provider, model)
      );

      CREATE TABLE IF NOT EXISTS resume_recommendations (
        id TEXT PRIMARY KEY,
        target_job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        candidate_resume_version_id TEXT NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
        overall_score REAL NOT NULL,
        role_score REAL NOT NULL,
        skill_score REAL NOT NULL,
        responsibility_score REAL NOT NULL,
        evidence_score REAL NOT NULL,
        career_item_score REAL NOT NULL,
        recency_score REAL NOT NULL,
        validation_score REAL NOT NULL,
        explanation_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(target_job_id, candidate_resume_version_id)
      );

      CREATE TABLE IF NOT EXISTS resume_favorites (
        resume_version_id TEXT PRIMARY KEY REFERENCES resume_versions(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS resume_archives (
        resume_version_id TEXT PRIMARY KEY REFERENCES resume_versions(id) ON DELETE CASCADE,
        archived_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS saved_application_answers (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL DEFAULT '',
        application_id TEXT NOT NULL DEFAULT '',
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        source_fact_ids_json TEXT NOT NULL DEFAULT '[]',
        source_citation_ids_json TEXT NOT NULL DEFAULT '[]',
        approval_status TEXT NOT NULL CHECK(approval_status IN ('draft','approved','rejected')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS career_imports (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_title TEXT NOT NULL,
        source_reference TEXT NOT NULL,
        created_at TEXT NOT NULL,
        approved_count INTEGER NOT NULL,
        rejected_count INTEGER NOT NULL,
        merged_count INTEGER NOT NULL,
        records_created_json TEXT NOT NULL,
        records_updated_json TEXT NOT NULL,
        safe_source_hash TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        undo_snapshot_json TEXT NOT NULL,
        undone_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS search_index_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        safe_message TEXT NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_copilot_threads_updated ON career_copilot_threads(updated_at);
      CREATE INDEX IF NOT EXISTS idx_copilot_messages_thread ON career_copilot_messages(thread_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_search_documents_entity ON search_documents(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_search_documents_parent ON search_documents(parent_entity_type, parent_entity_id);
      CREATE INDEX IF NOT EXISTS idx_search_documents_hash ON search_documents(content_hash);
      CREATE INDEX IF NOT EXISTS idx_search_embeddings_document ON search_embeddings(search_document_id);
      CREATE INDEX IF NOT EXISTS idx_resume_recommendations_job ON resume_recommendations(target_job_id, overall_score);
      CREATE INDEX IF NOT EXISTS idx_applications_follow_up ON applications(follow_up_date);
      CREATE INDEX IF NOT EXISTS idx_applications_submitted_resume ON applications(submitted_resume_version_id);
      CREATE INDEX IF NOT EXISTS idx_saved_answers_job ON saved_application_answers(job_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_career_imports_created ON career_imports(created_at);
    `,
  },
  {
    id: 5,
    name: "candidate_brain_and_application_autofill",
    sql: `
      ALTER TABLE applications ADD COLUMN automation_mode TEXT NOT NULL DEFAULT 'manual' CHECK(automation_mode IN ('manual','autofill_manual_submit'));
      ALTER TABLE applications ADD COLUMN application_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN ats_platform TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN match_score REAL;
      ALTER TABLE applications ADD COLUMN submitted_at TEXT NOT NULL DEFAULT '';
      ALTER TABLE applications ADD COLUMN job_snapshot_json TEXT;
      ALTER TABLE applications ADD COLUMN status_history_json TEXT NOT NULL DEFAULT '[]';

      CREATE TABLE IF NOT EXISTS candidate_claims (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        value_json TEXT NOT NULL,
        verification_status TEXT NOT NULL CHECK(verification_status IN ('verified','user_confirmed','inferred','unverified','conflicting')),
        evidence_ids_json TEXT NOT NULL DEFAULT '[]',
        locked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sensitive_answers (
        id TEXT PRIMARY KEY,
        answer_key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        value_json TEXT NOT NULL,
        verification_status TEXT NOT NULL CHECK(verification_status IN ('verified','user_confirmed','inferred','unverified','conflicting')),
        locked INTEGER NOT NULL DEFAULT 0,
        requires_review INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS candidate_preferences (
        id TEXT PRIMARY KEY,
        preferences_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS career_stories (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        competencies_json TEXT NOT NULL DEFAULT '[]',
        situation TEXT NOT NULL DEFAULT '',
        problem TEXT NOT NULL DEFAULT '',
        actions_json TEXT NOT NULL DEFAULT '[]',
        result TEXT NOT NULL DEFAULT '',
        metrics_json TEXT NOT NULL DEFAULT '[]',
        technologies_json TEXT NOT NULL DEFAULT '[]',
        evidence_ids_json TEXT NOT NULL DEFAULT '[]',
        verification_status TEXT NOT NULL CHECK(verification_status IN ('verified','user_confirmed','inferred','unverified','conflicting')),
        approved INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS approved_application_answers (
        id TEXT PRIMARY KEY,
        normalized_question_type TEXT NOT NULL,
        original_question TEXT NOT NULL,
        answer TEXT NOT NULL,
        applicable_role_families_json TEXT NOT NULL DEFAULT '[]',
        applicable_industries_json TEXT NOT NULL DEFAULT '[]',
        applicable_skills_json TEXT NOT NULL DEFAULT '[]',
        source_story_ids_json TEXT NOT NULL DEFAULT '[]',
        source_claim_ids_json TEXT NOT NULL DEFAULT '[]',
        tone TEXT NOT NULL DEFAULT '',
        approved_by_user INTEGER NOT NULL DEFAULT 1,
        do_not_reuse INTEGER NOT NULL DEFAULT 0,
        use_count INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS application_fields (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        original_question TEXT NOT NULL,
        normalized_question_type TEXT NOT NULL,
        detected_field_type TEXT NOT NULL,
        generated_answer_json TEXT NOT NULL DEFAULT '""',
        final_answer_json TEXT NOT NULL DEFAULT '""',
        answer_source TEXT NOT NULL CHECK(answer_source IN ('fixed_profile','locked_sensitive','approved_answer','tailored_ai','user_required')),
        confidence REAL NOT NULL,
        requires_review INTEGER NOT NULL DEFAULT 1,
        user_edited INTEGER NOT NULL DEFAULT 0,
        approved INTEGER NOT NULL DEFAULT 0,
        do_not_reuse INTEGER NOT NULL DEFAULT 0,
        claim_ids_json TEXT NOT NULL DEFAULT '[]',
        story_ids_json TEXT NOT NULL DEFAULT '[]',
        warnings_json TEXT NOT NULL DEFAULT '[]',
        reasoning_summary TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_candidate_claims_category ON candidate_claims(category, verification_status);
      CREATE INDEX IF NOT EXISTS idx_sensitive_answers_key ON sensitive_answers(answer_key);
      CREATE INDEX IF NOT EXISTS idx_career_stories_approved ON career_stories(approved, archived, updated_at);
      CREATE INDEX IF NOT EXISTS idx_approved_answers_question ON approved_application_answers(normalized_question_type, approved_by_user);
      CREATE INDEX IF NOT EXISTS idx_application_fields_application ON application_fields(application_id, requires_review);
      CREATE INDEX IF NOT EXISTS idx_applications_autofill ON applications(automation_mode, ats_platform);
    `,
  },
  {
    id: 6,
    name: "canonical_resume_documents",
    sql: `
      ALTER TABLE resume_versions ADD COLUMN kind TEXT NOT NULL DEFAULT 'tailored' CHECK(kind IN ('master','tailored','imported'));
      ALTER TABLE resume_versions ADD COLUMN base_resume_version_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE resume_versions ADD COLUMN resume_document_json TEXT NOT NULL DEFAULT '';

      CREATE INDEX IF NOT EXISTS idx_resume_versions_kind ON resume_versions(kind, created_at);
      CREATE INDEX IF NOT EXISTS idx_resume_versions_base ON resume_versions(base_resume_version_id);
    `,
  },
  {
    id: 7,
    name: "resume_review_optimizer",
    sql: `
      CREATE TABLE IF NOT EXISTS resume_reviews (
        id TEXT PRIMARY KEY,
        resume_id TEXT NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
        job_id TEXT NOT NULL DEFAULT '',
        review_mode TEXT NOT NULL CHECK(review_mode IN ('general','job_specific','pre_submission')),
        overall_score REAL NOT NULL,
        category_scores_json TEXT NOT NULL,
        strengths_json TEXT NOT NULL,
        weaknesses_json TEXT NOT NULL,
        critical_issues_json TEXT NOT NULL,
        recommended_changes_json TEXT NOT NULL,
        factual_risk_level TEXT NOT NULL CHECK(factual_risk_level IN ('low','medium','high','critical')),
        ready_to_submit INTEGER NOT NULL DEFAULT 0,
        generated_at TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS resume_improvement_runs (
        id TEXT PRIMARY KEY,
        source_resume_id TEXT NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
        improved_resume_id TEXT NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
        job_id TEXT NOT NULL DEFAULT '',
        review_mode TEXT NOT NULL CHECK(review_mode IN ('general','job_specific','pre_submission')),
        original_review_id TEXT NOT NULL REFERENCES resume_reviews(id) ON DELETE CASCADE,
        improved_review_id TEXT NOT NULL REFERENCES resume_reviews(id) ON DELETE CASCADE,
        applied_proposal_ids_json TEXT NOT NULL DEFAULT '[]',
        skipped_proposal_ids_json TEXT NOT NULL DEFAULT '[]',
        diff_json TEXT NOT NULL DEFAULT '[]',
        pdf_status TEXT NOT NULL CHECK(pdf_status IN ('not_rendered','rendered','failed')),
        pdf_page_count INTEGER,
        pdf_error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_resume_reviews_resume ON resume_reviews(resume_id, generated_at);
      CREATE INDEX IF NOT EXISTS idx_resume_reviews_job ON resume_reviews(job_id, generated_at);
      CREATE INDEX IF NOT EXISTS idx_resume_improvement_runs_source ON resume_improvement_runs(source_resume_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_resume_improvement_runs_improved ON resume_improvement_runs(improved_resume_id, created_at);
    `,
  },
  {
    id: 8,
    name: "resume_review_provider_audit",
    sql: `
      ALTER TABLE resume_reviews ADD COLUMN review_source TEXT NOT NULL DEFAULT 'deterministic' CHECK(review_source IN ('deterministic','hybrid'));
      ALTER TABLE resume_reviews ADD COLUMN pdf_page_count INTEGER;
      ALTER TABLE resume_reviews ADD COLUMN pdf_visual_reviewed INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE resume_reviews ADD COLUMN request_metadata_json TEXT NOT NULL DEFAULT '[]';

      ALTER TABLE resume_improvement_runs ADD COLUMN rejected_proposal_ids_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE resume_improvement_runs ADD COLUMN pdf_path TEXT NOT NULL DEFAULT '';
      ALTER TABLE resume_improvement_runs ADD COLUMN pass_number INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE resume_improvement_runs ADD COLUMN stop_reason TEXT NOT NULL DEFAULT '' CHECK(stop_reason IN ('','no_safe_changes','negligible_improvement','maximum_passes'));
    `,
  },
  {
    id: 9,
    name: "job_search_automation",
    sql: `
      CREATE TABLE IF NOT EXISTS job_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        company_name TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK(source_type IN ('greenhouse','lever','ashby','manual_url','email_import')),
        source_identifier TEXT NOT NULL,
        careers_url TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        polling_interval_hours INTEGER NOT NULL DEFAULT 24 CHECK(polling_interval_hours BETWEEN 1 AND 720),
        last_checked_at TEXT NOT NULL DEFAULT '',
        last_success_at TEXT NOT NULL DEFAULT '',
        last_error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(source_type, source_identifier)
      );

      ALTER TABLE jobs ADD COLUMN source_id TEXT;
      ALTER TABLE jobs ADD COLUMN external_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN normalized_title TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN description_html TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN description_text TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN location TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN normalized_location TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN workplace_type TEXT NOT NULL DEFAULT 'unspecified' CHECK(workplace_type IN ('remote','hybrid','on_site','unspecified'));
      ALTER TABLE jobs ADD COLUMN employment_type TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN department TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN salary_min REAL;
      ALTER TABLE jobs ADD COLUMN salary_max REAL;
      ALTER TABLE jobs ADD COLUMN salary_currency TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN salary_interval TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN posted_at TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN discovered_at TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN application_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN canonical_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN source_payload_json TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE jobs ADD COLUMN automation_status TEXT NOT NULL DEFAULT 'new' CHECK(automation_status IN ('new','filtered_out','analysis_pending','matched','saved','resume_pending','resume_ready','ready_to_apply','applied','rejected','interviewing','offer','archived','closed'));
      ALTER TABLE jobs ADD COLUMN closed_at TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN changed_since_analysis INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS job_matches (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
        deterministic_score REAL NOT NULL CHECK(deterministic_score BETWEEN 0 AND 100),
        ai_score REAL CHECK(ai_score BETWEEN 0 AND 100),
        combined_score REAL NOT NULL CHECK(combined_score BETWEEN 0 AND 100),
        score_breakdown_json TEXT NOT NULL DEFAULT '{}',
        score_reasons_json TEXT NOT NULL DEFAULT '[]',
        hard_reject INTEGER NOT NULL DEFAULT 0,
        hard_reject_reasons_json TEXT NOT NULL DEFAULT '[]',
        warnings_json TEXT NOT NULL DEFAULT '[]',
        matched_skill_ids_json TEXT NOT NULL DEFAULT '[]',
        matched_project_ids_json TEXT NOT NULL DEFAULT '[]',
        matched_fact_ids_json TEXT NOT NULL DEFAULT '[]',
        missing_requirements_json TEXT NOT NULL DEFAULT '[]',
        strengths_json TEXT NOT NULL DEFAULT '[]',
        concerns_json TEXT NOT NULL DEFAULT '[]',
        recommended_resume_profile TEXT NOT NULL DEFAULT '',
        sponsorship_status TEXT NOT NULL DEFAULT 'not_mentioned' CHECK(sponsorship_status IN ('explicitly_available','explicitly_unavailable','not_mentioned','unclear')),
        citizenship_requirement TEXT NOT NULL DEFAULT 'not_mentioned' CHECK(citizenship_requirement IN ('required','not_required','not_mentioned','unclear')),
        experience_compatibility TEXT NOT NULL DEFAULT 'unclear' CHECK(experience_compatibility IN ('strong','moderate','weak','incompatible','unclear')),
        location_compatibility TEXT NOT NULL DEFAULT 'unclear' CHECK(location_compatibility IN ('strong','moderate','weak','incompatible','unclear')),
        analysis_model TEXT NOT NULL DEFAULT '',
        analysis_prompt_version TEXT NOT NULL DEFAULT '',
        analysis_json TEXT NOT NULL DEFAULT '{}',
        analyzed_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_match_analysis_history (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        content_hash TEXT NOT NULL,
        deterministic_score REAL NOT NULL,
        ai_score REAL,
        combined_score REAL NOT NULL,
        analysis_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_duplicate_events (
        id TEXT PRIMARY KEY,
        incoming_external_id TEXT NOT NULL,
        canonical_job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL,
        confidence REAL NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_search_preferences (
        id TEXT PRIMARY KEY,
        automation_enabled INTEGER NOT NULL DEFAULT 0,
        preferences_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS application_packages (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
        resume_version_id TEXT NOT NULL DEFAULT '',
        cover_letter_text TEXT NOT NULL DEFAULT '',
        selected_resume_profile TEXT NOT NULL DEFAULT '',
        generation_status TEXT NOT NULL DEFAULT 'not_started' CHECK(generation_status IN ('not_started','pending','ready','failed')),
        validation_status TEXT NOT NULL DEFAULT 'not_validated' CHECK(validation_status IN ('not_validated','valid','invalid')),
        validation_errors_json TEXT NOT NULL DEFAULT '[]',
        suggested_answers_json TEXT NOT NULL DEFAULT '{}',
        unresolved_questions_json TEXT NOT NULL DEFAULT '[]',
        generated_at TEXT NOT NULL DEFAULT '',
        approved_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS application_answer_vault (
        id TEXT PRIMARY KEY,
        answer_key TEXT NOT NULL UNIQUE,
        value_json TEXT NOT NULL,
        category TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        sensitive INTEGER NOT NULL DEFAULT 0,
        requires_manual_confirmation INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_automation_runs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK(status IN ('running','completed','partial','failed')),
        sources_checked INTEGER NOT NULL DEFAULT 0,
        jobs_fetched INTEGER NOT NULL DEFAULT 0,
        jobs_added INTEGER NOT NULL DEFAULT 0,
        jobs_updated INTEGER NOT NULL DEFAULT 0,
        jobs_deduplicated INTEGER NOT NULL DEFAULT 0,
        jobs_filtered INTEGER NOT NULL DEFAULT 0,
        jobs_analyzed INTEGER NOT NULL DEFAULT 0,
        resumes_generated INTEGER NOT NULL DEFAULT 0,
        errors_json TEXT NOT NULL DEFAULT '[]',
        summary_json TEXT NOT NULL DEFAULT '{}'
      );

      UPDATE jobs SET
        normalized_title = lower(trim(role_title)),
        description_text = raw_description,
        discovered_at = created_at,
        last_seen_at = updated_at,
        application_url = source_url,
        canonical_url = source_url
      WHERE normalized_title = '';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_source_external ON jobs(source_id, external_id) WHERE source_id IS NOT NULL AND external_id <> '';
      CREATE INDEX IF NOT EXISTS idx_jobs_canonical_url ON jobs(canonical_url);
      CREATE INDEX IF NOT EXISTS idx_jobs_normalized_identity ON jobs(company, normalized_title, normalized_location);
      CREATE INDEX IF NOT EXISTS idx_jobs_content_hash ON jobs(content_hash);
      CREATE INDEX IF NOT EXISTS idx_jobs_automation_status ON jobs(automation_status, discovered_at);
      CREATE INDEX IF NOT EXISTS idx_job_sources_enabled ON job_sources(enabled, last_checked_at);
      CREATE INDEX IF NOT EXISTS idx_job_matches_score ON job_matches(hard_reject, combined_score DESC);
      CREATE INDEX IF NOT EXISTS idx_job_match_history_job ON job_match_analysis_history(job_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_duplicate_events_job ON job_duplicate_events(canonical_job_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_automation_runs_started ON job_automation_runs(started_at DESC);
    `,
  },
  { id: 10, name: "durable_authorization_records", sql: `
    CREATE TABLE IF NOT EXISTS safety_records (
      id TEXT NOT NULL, kind TEXT NOT NULL, value_json TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(kind,id)
    );
    CREATE INDEX IF NOT EXISTS idx_safety_records_kind ON safety_records(kind,created_at);
    CREATE TRIGGER IF NOT EXISTS immutable_package_audit_update BEFORE UPDATE ON safety_records WHEN OLD.kind='package_audit'
      BEGIN SELECT RAISE(ABORT,'package audit is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS immutable_package_audit_delete BEFORE DELETE ON safety_records WHEN OLD.kind='package_audit'
      BEGIN SELECT RAISE(ABORT,'package audit is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS durable_budget_delete BEFORE DELETE ON safety_records WHEN OLD.kind='ai_budget'
      BEGIN SELECT RAISE(ABORT,'reserved budget cannot be refunded'); END;
    CREATE TRIGGER IF NOT EXISTS immutable_budget_day BEFORE UPDATE ON safety_records WHEN OLD.kind='ai_budget' AND (OLD.kind <> NEW.kind OR OLD.id <> NEW.id OR json_extract(OLD.value_json,'$.day') <> json_extract(NEW.value_json,'$.day') OR json_extract(NEW.value_json,'$.attemptedCalls') < json_extract(OLD.value_json,'$.attemptedCalls') OR (json_extract(OLD.value_json,'$.state')='finished' AND json_extract(NEW.value_json,'$.state') <> 'finished'))
      BEGIN SELECT RAISE(ABORT,'reserved budget day is immutable'); END;
  ` },
  { id: 11, name: "private_job_notes", sql: "ALTER TABLE jobs ADD COLUMN notes TEXT NOT NULL DEFAULT '';" },
];
