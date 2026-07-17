import type Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  ApplicationRecord,
  ApplicationFieldRecord,
  ApprovedApplicationAnswer,
  ApprovedBulletVariant,
  BackupPayload,
  CandidateClaim,
  CandidatePreferences,
  CareerCopilotMessage,
  CareerCopilotPendingAction,
  CareerCopilotThread,
  CareerStory,
  CareerImportProposal,
  CareerImportRecord,
  CareerFact,
  CareerItem,
  DashboardMetrics,
  EvaluationSummary,
  FactUsage,
  Job,
  MigrationEvent,
  Profile,
  ResumeArchive,
  ResumeFavorite,
  ResumeRecommendation,
  ResumeVersion,
  SavedApplicationAnswer,
  SearchDiagnostics,
  SearchDocument,
  SearchFilters,
  SearchResult,
  SensitiveAnswer,
  Skill,
} from "../../types/domain";
import { PROMPT_VERSIONS } from "../ai/prompts";
import { createId, nowIso } from "../utils";
import {
  emptyGenerationMetadata,
  normalizeGenerationMetadata,
  normalizeTailoredResume,
  normalizeValidationIssues,
} from "../resume/normalize";
import { buildSearchDocuments } from "../search/documentModel";
import { deterministicSearch } from "../search/text";
import { applyCareerImportToState } from "./careerImportPersistence";
import { createCareerMemoryExportProposal } from "../import/careerIntake";
import { migrations } from "./migrations";
import { defaultSettings, seedCareerFacts, seedCareerItems, seedProfile, seedSkills } from "./seed";
import type { AppRepository, ApprovedVariantFilters, CareerFactFilters } from "./repository";

type TauriDatabase = Database;
type Row = Record<string, unknown>;

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asBool(value: unknown) {
  return value === 1 || value === true;
}

function parseArray(value: unknown) {
  if (typeof value !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJson(value: unknown, fallback: unknown) {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function jsonText(value: unknown) {
  return JSON.stringify(value ?? null);
}

function valueJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function defaultCandidatePreferences(existing?: Partial<CandidatePreferences> | null): CandidatePreferences {
  const now = nowIso();
  return {
    id: existing?.id ?? "candidate-preferences-default",
    targetRoles: existing?.targetRoles ?? [],
    avoidedRoles: existing?.avoidedRoles ?? [],
    industries: existing?.industries ?? [],
    preferredCompanyStage: existing?.preferredCompanyStage ?? "",
    preferredEngineeringEnvironment: existing?.preferredEngineeringEnvironment ?? "",
    preferredLocations: existing?.preferredLocations ?? [],
    salaryFloor: existing?.salaryFloor ?? "",
    preferredTechnologies: existing?.preferredTechnologies ?? [],
    writingTone: existing?.writingTone ?? "direct, specific, and concise",
    answerLengthPreference: existing?.answerLengthPreference ?? "standard",
    wordsToAvoid: existing?.wordsToAvoid ?? ["thrilled", "passionate"],
    reuseApprovedAnswers: existing?.reuseApprovedAnswers ?? true,
    generateCoverLetters: existing?.generateCoverLetters ?? false,
    automaticallyChooseResume: existing?.automaticallyChooseResume ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: existing?.updatedAt ?? now,
  };
}

function splitStatements(sql: string) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function mapProfile(row: Row): Profile {
  return {
    id: asString(row.id),
    fullName: asString(row.full_name),
    headline: asString(row.headline),
    city: asString(row.city),
    region: asString(row.region),
    email: asString(row.email),
    phone: asString(row.phone),
    portfolioUrl: asString(row.portfolio_url),
    linkedInUrl: asString(row.linked_in_url),
    githubUrl: asString(row.github_url),
    workAuthorizationNote: asString(row.work_authorization_note),
    updatedAt: asString(row.updated_at),
  };
}

function mapCareerItem(row: Row): CareerItem {
  return {
    id: asString(row.id),
    type: row.type as CareerItem["type"],
    title: asString(row.title),
    organization: asString(row.organization),
    location: asString(row.location),
    startDate: asString(row.start_date),
    endDate: asString(row.end_date),
    isCurrent: asBool(row.is_current),
    shortDescription: asString(row.short_description),
    url: asString(row.url),
    repositoryUrl: asString(row.repository_url),
    displayOrder: Number(row.display_order ?? 0),
    enabled: asBool(row.enabled),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapCareerFact(row: Row): CareerFact {
  return {
    id: asString(row.id),
    careerItemId: asString(row.career_item_id),
    statement: asString(row.statement),
    evidenceStatus: row.evidence_status as CareerFact["evidenceStatus"],
    sourceNote: asString(row.source_note),
    sourceType: (asString(row.source_type) || "user_statement") as CareerFact["sourceType"],
    sourceReference: asString(row.source_reference),
    verificationDate: asString(row.verification_date),
    lastReviewedDate: asString(row.last_reviewed_date),
    notes: asString(row.notes),
    skillTags: parseArray(row.skill_tags_json),
    roleTags: parseArray(row.role_tags_json),
    metricTokens: parseArray(row.metric_tokens_json),
    importance: Number(row.importance ?? 3),
    enabled: asBool(row.enabled),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapSkill(row: Row): Skill {
  return {
    id: asString(row.id),
    name: asString(row.name),
    category: asString(row.category),
    proficiencyNote: asString(row.proficiency_note),
    enabled: asBool(row.enabled),
  };
}

function mapCandidateClaim(row: Row): CandidateClaim {
  return {
    id: asString(row.id),
    category: asString(row.category),
    value: parseJson(row.value_json, null),
    verificationStatus: row.verification_status as CandidateClaim["verificationStatus"],
    evidenceIds: parseArray(row.evidence_ids_json),
    locked: asBool(row.locked),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapSensitiveAnswer(row: Row): SensitiveAnswer {
  return {
    id: asString(row.id),
    key: asString(row.answer_key) as SensitiveAnswer["key"],
    label: asString(row.label),
    value: parseJson(row.value_json, null),
    verificationStatus: row.verification_status as SensitiveAnswer["verificationStatus"],
    locked: asBool(row.locked),
    requiresReview: asBool(row.requires_review),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapCandidatePreferences(row: Row): CandidatePreferences {
  return defaultCandidatePreferences(
    parseJson(row.preferences_json, {
      id: asString(row.id),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
    }) as Partial<CandidatePreferences> as CandidatePreferences,
  );
}

function mapCareerStory(row: Row): CareerStory {
  return {
    id: asString(row.id),
    title: asString(row.title),
    tags: parseArray(row.tags_json),
    competencies: parseArray(row.competencies_json),
    situation: asString(row.situation),
    problem: asString(row.problem),
    actions: parseArray(row.actions_json),
    result: asString(row.result),
    metrics: parseArray(row.metrics_json),
    technologies: parseArray(row.technologies_json),
    evidenceIds: parseArray(row.evidence_ids_json),
    verificationStatus: row.verification_status as CareerStory["verificationStatus"],
    approved: asBool(row.approved),
    archived: asBool(row.archived),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapApprovedApplicationAnswer(row: Row): ApprovedApplicationAnswer {
  return {
    id: asString(row.id),
    normalizedQuestionType: row.normalized_question_type as ApprovedApplicationAnswer["normalizedQuestionType"],
    originalQuestion: asString(row.original_question),
    answer: asString(row.answer),
    applicableRoleFamilies: parseArray(row.applicable_role_families_json),
    applicableIndustries: parseArray(row.applicable_industries_json),
    applicableSkills: parseArray(row.applicable_skills_json),
    sourceStoryIds: parseArray(row.source_story_ids_json),
    sourceClaimIds: parseArray(row.source_claim_ids_json),
    tone: asString(row.tone),
    approvedByUser: asBool(row.approved_by_user),
    doNotReuse: asBool(row.do_not_reuse),
    useCount: Number(row.use_count ?? 0),
    lastUsedAt: asString(row.last_used_at),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapJob(row: Row): Job {
  const analysis = row.analysis_json ? JSON.parse(asString(row.analysis_json)) : null;
  return {
    id: asString(row.id),
    company: asString(row.company),
    roleTitle: asString(row.role_title),
    sourceUrl: asString(row.source_url),
    rawDescription: asString(row.raw_description),
    analysisJson: analysis,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapResume(row: Row): ResumeVersion {
  return {
    id: asString(row.id),
    jobId: asString(row.job_id),
    name: asString(row.name),
    templateId: asString(row.template_id),
    contentJson: normalizeTailoredResume(parseJson(row.content_json, {})),
    validationJson: normalizeValidationIssues(parseJson(row.validation_json, [])),
    status: row.status as ResumeVersion["status"],
    lastExportPath: asString(row.last_export_path),
    parentResumeVersionId: asString(row.parent_resume_version_id),
    generationProvider:
      (asString(row.generation_provider) || "deterministic") as ResumeVersion["generationProvider"],
    generationModel: asString(row.generation_model),
    promptVersion: asString(row.prompt_version),
    promptVersionsJson: {
      ...PROMPT_VERSIONS,
      ...(parseJson(row.prompt_versions_json, {}) as Partial<ResumeVersion["promptVersionsJson"]>),
    },
    layoutProfileId:
      (asString(row.layout_profile_id) || "general-software-engineer") as ResumeVersion["layoutProfileId"],
    templateSettingsJson: {
      ...defaultSettings.templateSettings,
      ...(parseJson(row.template_settings_json, {}) as Partial<ResumeVersion["templateSettingsJson"]>),
    },
    generationMetadataJson: normalizeGenerationMetadata(
      parseJson(row.generation_metadata_json, emptyGenerationMetadata),
    ),
    deterministicBaselineJson: row.deterministic_baseline_json
      ? normalizeTailoredResume(parseJson(row.deterministic_baseline_json, {}))
      : null,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapApplication(row: Row): ApplicationRecord {
  return {
    id: asString(row.id),
    jobId: asString(row.job_id),
    company: asString(row.company),
    role: asString(row.role),
    jobUrl: asString(row.job_url),
    resumeVersionId: asString(row.resume_version_id),
    submittedResumeVersionId: asString(row.submitted_resume_version_id),
    submittedPdfPath: asString(row.submitted_pdf_path),
    submittedPdfHash: asString(row.submitted_pdf_hash),
    status: row.status as ApplicationRecord["status"],
    appliedDate: asString(row.applied_date),
    followUpDate: asString(row.follow_up_date),
    referralContact: asString(row.referral_contact),
    recruiter: asString(row.recruiter),
    hiringManager: asString(row.hiring_manager),
    referral: asString(row.referral),
    source: asString(row.source),
    salaryRange: asString(row.salary_range),
    locationType: asString(row.location_type),
    sponsorshipNotes: asString(row.sponsorship_notes),
    nextAction: asString(row.next_action),
    notes: asString(row.notes),
    automationMode: (asString(row.automation_mode) || "manual") as ApplicationRecord["automationMode"],
    applicationUrl: asString(row.application_url) || asString(row.job_url),
    atsPlatform: asString(row.ats_platform),
    matchScore: row.match_score === null || row.match_score === undefined ? null : Number(row.match_score),
    submittedAt: asString(row.submitted_at),
    jobSnapshotJson: row.job_snapshot_json ? (parseJson(row.job_snapshot_json, null) as Job | null) : null,
    statusHistoryJson: parseJson(row.status_history_json, []) as ApplicationRecord["statusHistoryJson"],
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapApplicationField(row: Row): ApplicationFieldRecord {
  return {
    id: asString(row.id),
    applicationId: asString(row.application_id),
    originalQuestion: asString(row.original_question),
    normalizedQuestionType: row.normalized_question_type as ApplicationFieldRecord["normalizedQuestionType"],
    detectedFieldType: asString(row.detected_field_type),
    generatedAnswer: parseJson(row.generated_answer_json, ""),
    finalAnswer: parseJson(row.final_answer_json, ""),
    answerSource: row.answer_source as ApplicationFieldRecord["answerSource"],
    confidence: Number(row.confidence ?? 0),
    requiresReview: asBool(row.requires_review),
    userEdited: asBool(row.user_edited),
    approved: asBool(row.approved),
    doNotReuse: asBool(row.do_not_reuse),
    claimIds: parseArray(row.claim_ids_json),
    storyIds: parseArray(row.story_ids_json),
    warnings: parseArray(row.warnings_json),
    reasoningSummary: asString(row.reasoning_summary),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapSearchDocument(row: Row): SearchDocument {
  return {
    id: asString(row.id),
    entityType: row.entity_type as SearchDocument["entityType"],
    entityId: asString(row.entity_id),
    parentEntityType: asString(row.parent_entity_type) as SearchDocument["parentEntityType"],
    parentEntityId: asString(row.parent_entity_id),
    title: asString(row.title),
    normalizedText: asString(row.normalized_text),
    metadataJson: parseJson(row.metadata_json, {}) as Record<string, unknown>,
    contentHash: asString(row.content_hash),
    updatedAt: asString(row.updated_at),
  };
}

function mapCareerCopilotThread(row: Row): CareerCopilotThread {
  return {
    id: asString(row.id),
    title: asString(row.title),
    activeContextType: (asString(row.active_context_type) || "all") as CareerCopilotThread["activeContextType"],
    activeContextId: asString(row.active_context_id),
    summary: asString(row.summary),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    archivedAt: asString(row.archived_at),
  };
}

function mapCareerCopilotMessage(row: Row): CareerCopilotMessage {
  const tokenUsage = parseJson(row.token_usage_json, {}) as Partial<CareerCopilotMessage["tokenUsageJson"]>;
  return {
    id: asString(row.id),
    threadId: asString(row.thread_id),
    role: row.role as CareerCopilotMessage["role"],
    content: asString(row.content),
    structuredContentJson: parseJson(row.structured_content_json, {}) as Record<string, unknown>,
    toolCallsJson: parseJson(row.tool_calls_json, []) as CareerCopilotMessage["toolCallsJson"],
    internalCitationsJson: parseJson(row.internal_citations_json, []) as CareerCopilotMessage["internalCitationsJson"],
    pendingActionsJson: parseJson(row.pending_actions_json, []) as CareerCopilotMessage["pendingActionsJson"],
    provider: row.provider as CareerCopilotMessage["provider"],
    model: asString(row.model),
    promptVersion: asString(row.prompt_version),
    tokenUsageJson: {
      inputTokens: tokenUsage.inputTokens ?? null,
      outputTokens: tokenUsage.outputTokens ?? null,
      totalTokens: tokenUsage.totalTokens ?? null,
    },
    createdAt: asString(row.created_at),
  };
}

function mapResumeRecommendation(row: Row): ResumeRecommendation {
  return {
    id: asString(row.id),
    targetJobId: asString(row.target_job_id),
    candidateResumeVersionId: asString(row.candidate_resume_version_id),
    overallScore: Number(row.overall_score ?? 0),
    roleScore: Number(row.role_score ?? 0),
    skillScore: Number(row.skill_score ?? 0),
    responsibilityScore: Number(row.responsibility_score ?? 0),
    evidenceScore: Number(row.evidence_score ?? 0),
    careerItemScore: Number(row.career_item_score ?? 0),
    recencyScore: Number(row.recency_score ?? 0),
    validationScore: Number(row.validation_score ?? 0),
    explanationJson: parseJson(row.explanation_json, {
      reasons: [],
      matchingSkills: [],
      matchingResponsibilities: [],
      reusableContent: [],
      requiredChanges: [],
      submitted: false,
    }) as ResumeRecommendation["explanationJson"],
    createdAt: asString(row.created_at),
  };
}

function mapSavedApplicationAnswer(row: Row): SavedApplicationAnswer {
  return {
    id: asString(row.id),
    jobId: asString(row.job_id),
    applicationId: asString(row.application_id),
    question: asString(row.question),
    answer: asString(row.answer),
    sourceFactIds: parseArray(row.source_fact_ids_json),
    sourceCitationIds: parseArray(row.source_citation_ids_json),
    approvalStatus: row.approval_status as SavedApplicationAnswer["approvalStatus"],
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapEvaluation(row: Row): EvaluationSummary {
  return {
    id: asString(row.id),
    fixtureId: asString(row.fixture_id),
    fixtureName: asString(row.fixture_name),
    mode: row.mode as EvaluationSummary["mode"],
    provider: row.provider as EvaluationSummary["provider"],
    model: asString(row.model),
    promptVersions: {
      ...PROMPT_VERSIONS,
      ...(parseJson(row.prompt_versions_json, {}) as Partial<EvaluationSummary["promptVersions"]>),
    },
    roleProfileId: row.role_profile_id as EvaluationSummary["roleProfileId"],
    templateId: row.template_id as EvaluationSummary["templateId"],
    metrics: parseJson(row.metrics_json, {}) as EvaluationSummary["metrics"],
    selectedCareerItemIds: parseArray(row.selected_career_item_ids_json),
    selectedFactIds: parseArray(row.selected_fact_ids_json),
    validationIssues: normalizeValidationIssues(parseJson(row.validation_issues_json, [])),
    preferred: asBool(row.preferred),
    createdAt: asString(row.created_at),
  };
}

function mapMigrationEvent(row: Row): MigrationEvent {
  return {
    id: Number(row.id ?? 0),
    fromVersion: Number(row.from_version ?? 0),
    toVersion: Number(row.to_version ?? 0),
    success: asBool(row.success),
    backupPath: asString(row.backup_path),
    errorCode: asString(row.error_code),
    createdAt: asString(row.created_at),
  };
}

function mapCareerImportRecord(row: Row): CareerImportRecord {
  return {
    id: asString(row.id),
    sourceType: row.source_type as CareerImportRecord["sourceType"],
    sourceTitle: asString(row.source_title),
    sourceReference: asString(row.source_reference),
    createdAt: asString(row.created_at),
    approvedCount: Number(row.approved_count ?? 0),
    rejectedCount: Number(row.rejected_count ?? 0),
    mergedCount: Number(row.merged_count ?? 0),
    recordsCreated: parseArray(row.records_created_json),
    recordsUpdated: parseArray(row.records_updated_json),
    safeSourceHash: asString(row.safe_source_hash),
    provider: asString(row.provider),
    model: asString(row.model),
    promptVersion: asString(row.prompt_version),
    undoSnapshotJson: parseJson(row.undo_snapshot_json, {
      profile: null,
      careerItems: [],
      careerFacts: [],
      skills: [],
    }) as CareerImportRecord["undoSnapshotJson"],
    undoneAt: asString(row.undone_at),
  };
}

function mapApprovedVariant(row: Row): ApprovedBulletVariant {
  return {
    id: asString(row.id),
    careerItemId: asString(row.career_item_id),
    sourceFactIds: parseArray(row.source_fact_ids_json),
    text: asString(row.text),
    roleCategories: parseArray(row.role_categories_json),
    skillTags: parseArray(row.skill_tags_json),
    targetJobId: asString(row.target_job_id),
    creationSource: row.creation_source as ApprovedBulletVariant["creationSource"],
    approvedAt: asString(row.approved_at),
    createdAt: asString(row.created_at),
  };
}

export class SqliteRepository implements AppRepository {
  private readonly db: TauriDatabase;

  constructor(db: TauriDatabase) {
    this.db = db;
  }

  async initialize() {
    await this.db.execute("PRAGMA foreign_keys = ON");
    await this.db.execute(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
    );
    const applied = await this.db.select<Array<{ id: number }>>("SELECT id FROM schema_migrations");
    const appliedIds = new Set(applied.map((row) => Number(row.id)));
    const pending = migrations.filter((migration) => !appliedIds.has(migration.id));
    const fromVersion = Math.max(0, ...appliedIds);
    let backupPath = "";
    if (pending.length > 0 && fromVersion > 0) {
      await this.db.execute("PRAGMA wal_checkpoint(FULL)");
      const databases = await this.db.select<Array<{ file: string }>>("PRAGMA database_list");
      const databasePath = databases.find((database) => database.file)?.file ?? "";
      if (!databasePath) {
        throw new Error("migration_backup_missing|The database path could not be resolved before migration.");
      }
      backupPath = await invoke<string>("backup_database_before_migration", {
        path: databasePath,
        targetVersion: pending.at(-1)?.id ?? fromVersion,
      });
    }
    try {
      // The Tauri SQL plugin executes through a connection pool and does not expose
      // a transaction API. Manual BEGIN/COMMIT statements can run on different
      // connections and lock fresh startup migrations, so migrations run
      // statement-by-statement after the existing native backup step.
      for (const migration of pending) {
        for (const statement of splitStatements(migration.sql)) {
          await this.db.execute(statement);
        }
        await this.db.execute(
          "INSERT OR IGNORE INTO schema_migrations (id, name, applied_at) VALUES ($1, $2, $3)",
          [migration.id, migration.name, nowIso()],
        );
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      try {
        await this.db.execute(`CREATE TABLE IF NOT EXISTS migration_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_version INTEGER NOT NULL,
          to_version INTEGER NOT NULL,
          success INTEGER NOT NULL,
          backup_path TEXT NOT NULL,
          error_code TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`);
        await this.db.execute(
          `INSERT INTO migration_events (from_version, to_version, success, backup_path, error_code, created_at)
           VALUES ($1,$2,0,$3,'migration_failed',$4)`,
          [fromVersion, pending.at(-1)?.id ?? fromVersion, backupPath, nowIso()],
        );
      } catch {
        // The original migration error is more useful if even diagnostics cannot be recorded.
      }
      throw new Error(
        `migration_failed|Database migration failed after the pre-migration backup step. Backup: ${backupPath || "not required"}. ${message}`,
      );
    }
    if (pending.length > 0) {
      await this.db.execute(
        `INSERT INTO migration_events (from_version, to_version, success, backup_path, error_code, created_at)
         VALUES ($1,$2,1,$3,'',$4)`,
        [fromVersion, pending.at(-1)?.id ?? fromVersion, backupPath, nowIso()],
      );
    }
    const settings = await this.db.select<Row[]>("SELECT id FROM app_settings WHERE id = 'default'");
    if (settings.length === 0) {
      await this.saveSettings(defaultSettings);
    }
  }

  async seedSampleData() {
    let inserted = 0;
    let updated = 0;
    const countBefore = await this.countSeedRows();
    await this.saveProfile({ ...seedProfile, updatedAt: nowIso() });
    for (const item of seedCareerItems) {
      await this.saveCareerItem(item);
    }
    for (const fact of seedCareerFacts) {
      await this.saveCareerFact(fact);
    }
    for (const skill of seedSkills) {
      await this.saveSkill(skill);
    }
    const countAfter = await this.countSeedRows();
    inserted = Math.max(0, countAfter - countBefore);
    updated = seedCareerItems.length + seedCareerFacts.length + seedSkills.length + 1 - inserted;
    return { inserted, updated };
  }

  async resetSampleData() {
    await this.db.execute("DELETE FROM career_copilot_messages");
    await this.db.execute("DELETE FROM career_copilot_threads");
    await this.db.execute("DELETE FROM search_embeddings");
    await this.db.execute("DELETE FROM search_documents");
    await this.db.execute("DELETE FROM resume_recommendations");
    await this.db.execute("DELETE FROM resume_favorites");
    await this.db.execute("DELETE FROM resume_archives");
    await this.db.execute("DELETE FROM saved_application_answers");
    await this.db.execute("DELETE FROM application_fields");
    await this.db.execute("DELETE FROM approved_application_answers");
    await this.db.execute("DELETE FROM career_stories");
    await this.db.execute("DELETE FROM candidate_preferences");
    await this.db.execute("DELETE FROM sensitive_answers");
    await this.db.execute("DELETE FROM candidate_claims");
    await this.db.execute("DELETE FROM career_imports");
    await this.db.execute("DELETE FROM applications");
    await this.db.execute("DELETE FROM evaluation_summaries");
    await this.db.execute("DELETE FROM approved_bullet_variants");
    await this.db.execute("DELETE FROM resume_versions");
    await this.db.execute("DELETE FROM jobs");
    await this.db.execute("DELETE FROM career_facts");
    await this.db.execute("DELETE FROM career_items");
    await this.db.execute("DELETE FROM skills");
    await this.db.execute("DELETE FROM profile");
    await this.seedSampleData();
  }

  async getProfile() {
    const rows = await this.db.select<Row[]>("SELECT * FROM profile LIMIT 1");
    return rows[0] ? mapProfile(rows[0]) : null;
  }

  async saveProfile(profile: Profile) {
    const saved = { ...profile, updatedAt: nowIso() };
    await this.db.execute(
      `INSERT INTO profile (
        id, full_name, headline, city, region, email, phone, portfolio_url, linked_in_url,
        github_url, work_authorization_note, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT(id) DO UPDATE SET
        full_name = excluded.full_name,
        headline = excluded.headline,
        city = excluded.city,
        region = excluded.region,
        email = excluded.email,
        phone = excluded.phone,
        portfolio_url = excluded.portfolio_url,
        linked_in_url = excluded.linked_in_url,
        github_url = excluded.github_url,
        work_authorization_note = excluded.work_authorization_note,
        updated_at = excluded.updated_at`,
      [
        saved.id,
        saved.fullName,
        saved.headline,
        saved.city,
        saved.region,
        saved.email,
        saved.phone,
        saved.portfolioUrl,
        saved.linkedInUrl,
        saved.githubUrl,
        saved.workAuthorizationNote,
        saved.updatedAt,
      ],
    );
    return saved;
  }

  async listCareerItems() {
    return (await this.db.select<Row[]>("SELECT * FROM career_items ORDER BY display_order, title")).map(
      mapCareerItem,
    );
  }

  async saveCareerItem(item: Partial<CareerItem> & Pick<CareerItem, "type" | "title">) {
    const existing = item.id
      ? await this.db.select<Row[]>("SELECT * FROM career_items WHERE id = $1", [item.id])
      : [];
    const mapped = existing[0] ? mapCareerItem(existing[0]) : undefined;
    const now = nowIso();
    const saved: CareerItem = {
      id: mapped?.id ?? item.id ?? createId("career-item"),
      type: item.type,
      title: item.title,
      organization: item.organization ?? mapped?.organization ?? "",
      location: item.location ?? mapped?.location ?? "",
      startDate: item.startDate ?? mapped?.startDate ?? "",
      endDate: item.endDate ?? mapped?.endDate ?? "",
      isCurrent: item.isCurrent ?? mapped?.isCurrent ?? false,
      shortDescription: item.shortDescription ?? mapped?.shortDescription ?? "",
      url: item.url ?? mapped?.url ?? "",
      repositoryUrl: item.repositoryUrl ?? mapped?.repositoryUrl ?? "",
      displayOrder: item.displayOrder ?? mapped?.displayOrder ?? (await this.nextCareerOrder()),
      enabled: item.enabled ?? mapped?.enabled ?? true,
      createdAt: mapped?.createdAt ?? item.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.execute(
      `INSERT INTO career_items VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT(id) DO UPDATE SET
        type = excluded.type, title = excluded.title, organization = excluded.organization,
        location = excluded.location, start_date = excluded.start_date, end_date = excluded.end_date,
        is_current = excluded.is_current, short_description = excluded.short_description,
        url = excluded.url, repository_url = excluded.repository_url, display_order = excluded.display_order,
        enabled = excluded.enabled, updated_at = excluded.updated_at`,
      [
        saved.id,
        saved.type,
        saved.title,
        saved.organization,
        saved.location,
        saved.startDate,
        saved.endDate,
        saved.isCurrent ? 1 : 0,
        saved.shortDescription,
        saved.url,
        saved.repositoryUrl,
        saved.displayOrder,
        saved.enabled ? 1 : 0,
        saved.createdAt,
        saved.updatedAt,
      ],
    );
    return saved;
  }

  async deleteCareerItem(id: string) {
    await this.db.execute("DELETE FROM career_items WHERE id = $1", [id]);
  }

  async updateCareerItemOrder(ids: string[]) {
    for (const [index, id] of ids.entries()) {
      await this.db.execute("UPDATE career_items SET display_order = $1, updated_at = $2 WHERE id = $3", [
        (index + 1) * 10,
        nowIso(),
        id,
      ]);
    }
  }

  async listCareerFacts(filters: CareerFactFilters = {}) {
    let sql = "SELECT * FROM career_facts";
    const params: unknown[] = [];
    const where: string[] = [];
    if (filters.evidenceStatus) {
      where.push(`evidence_status = $${params.length + 1}`);
      params.push(filters.evidenceStatus);
    }
    if (filters.search) {
      const next = params.length + 1;
      where.push(`(statement LIKE $${next} OR skill_tags_json LIKE $${next} OR role_tags_json LIKE $${next})`);
      params.push(`%${filters.search}%`);
    }
    if (where.length) {
      sql += ` WHERE ${where.join(" AND ")}`;
    }
    sql += " ORDER BY importance DESC, statement";
    return (await this.db.select<Row[]>(sql, params)).map(mapCareerFact);
  }

  async listFactsForItem(careerItemId: string) {
    return (
      await this.db.select<Row[]>(
        "SELECT * FROM career_facts WHERE career_item_id = $1 ORDER BY importance DESC, statement",
        [careerItemId],
      )
    ).map(mapCareerFact);
  }

  async saveCareerFact(fact: Partial<CareerFact> & Pick<CareerFact, "careerItemId" | "statement">) {
    const existing = fact.id
      ? await this.db.select<Row[]>("SELECT * FROM career_facts WHERE id = $1", [fact.id])
      : [];
    const mapped = existing[0] ? mapCareerFact(existing[0]) : undefined;
    const now = nowIso();
    const saved: CareerFact = {
      id: mapped?.id ?? fact.id ?? createId("career-fact"),
      careerItemId: fact.careerItemId,
      statement: fact.statement,
      evidenceStatus: fact.evidenceStatus ?? mapped?.evidenceStatus ?? "user_provided",
      sourceNote: fact.sourceNote ?? mapped?.sourceNote ?? "",
      sourceType: fact.sourceType ?? mapped?.sourceType ?? "user_statement",
      sourceReference: fact.sourceReference ?? mapped?.sourceReference ?? "",
      verificationDate: fact.verificationDate ?? mapped?.verificationDate ?? "",
      lastReviewedDate: fact.lastReviewedDate ?? mapped?.lastReviewedDate ?? "",
      notes: fact.notes ?? mapped?.notes ?? "",
      skillTags: fact.skillTags ?? mapped?.skillTags ?? [],
      roleTags: fact.roleTags ?? mapped?.roleTags ?? [],
      metricTokens: fact.metricTokens ?? mapped?.metricTokens ?? [],
      importance: fact.importance ?? mapped?.importance ?? 3,
      enabled: fact.enabled ?? mapped?.enabled ?? true,
      createdAt: mapped?.createdAt ?? fact.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.execute(
      `INSERT INTO career_facts (
        id, career_item_id, statement, evidence_status, source_note, skill_tags_json,
        role_tags_json, metric_tokens_json, importance, enabled, created_at, updated_at,
        source_type, source_reference, verification_date, last_reviewed_date, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT(id) DO UPDATE SET
        career_item_id = excluded.career_item_id, statement = excluded.statement,
        evidence_status = excluded.evidence_status, source_note = excluded.source_note,
        source_type = excluded.source_type, source_reference = excluded.source_reference,
        verification_date = excluded.verification_date, last_reviewed_date = excluded.last_reviewed_date,
        notes = excluded.notes,
        skill_tags_json = excluded.skill_tags_json, role_tags_json = excluded.role_tags_json,
        metric_tokens_json = excluded.metric_tokens_json, importance = excluded.importance,
        enabled = excluded.enabled, updated_at = excluded.updated_at`,
      [
        saved.id,
        saved.careerItemId,
        saved.statement,
        saved.evidenceStatus,
        saved.sourceNote,
        JSON.stringify(saved.skillTags),
        JSON.stringify(saved.roleTags),
        JSON.stringify(saved.metricTokens),
        saved.importance,
        saved.enabled ? 1 : 0,
        saved.createdAt,
        saved.updatedAt,
        saved.sourceType,
        saved.sourceReference,
        saved.verificationDate,
        saved.lastReviewedDate,
        saved.notes,
      ],
    );
    return saved;
  }

  async deleteCareerFact(id: string) {
    await this.db.execute("DELETE FROM career_facts WHERE id = $1", [id]);
  }

  async bulkUpdateCareerFacts(
    ids: string[],
    changes: Partial<Pick<CareerFact, "enabled" | "evidenceStatus">>,
  ) {
    for (const id of ids) {
      if (changes.enabled !== undefined) {
        await this.db.execute(
          "UPDATE career_facts SET enabled = $1, updated_at = $2 WHERE id = $3",
          [changes.enabled ? 1 : 0, nowIso(), id],
        );
      }
      if (changes.evidenceStatus !== undefined) {
        await this.db.execute(
          "UPDATE career_facts SET evidence_status = $1, updated_at = $2 WHERE id = $3",
          [changes.evidenceStatus, nowIso(), id],
        );
      }
    }
  }

  async listSkills() {
    return (await this.db.select<Row[]>("SELECT * FROM skills ORDER BY category, name")).map(mapSkill);
  }

  async saveSkill(skill: Partial<Skill> & Pick<Skill, "name" | "category">) {
    const existing = skill.id
      ? await this.db.select<Row[]>("SELECT * FROM skills WHERE id = $1", [skill.id])
      : [];
    const mapped = existing[0] ? mapSkill(existing[0]) : undefined;
    const saved: Skill = {
      id: mapped?.id ?? skill.id ?? createId("skill"),
      name: skill.name,
      category: skill.category,
      proficiencyNote: skill.proficiencyNote ?? mapped?.proficiencyNote ?? "",
      enabled: skill.enabled ?? mapped?.enabled ?? true,
    };
    await this.db.execute(
      `INSERT INTO skills VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, category = excluded.category,
        proficiency_note = excluded.proficiency_note, enabled = excluded.enabled`,
      [saved.id, saved.name, saved.category, saved.proficiencyNote, saved.enabled ? 1 : 0],
    );
    return saved;
  }

  async deleteSkill(id: string) {
    await this.db.execute("DELETE FROM skills WHERE id = $1", [id]);
  }

  async listCandidateClaims() {
    return (await this.db.select<Row[]>("SELECT * FROM candidate_claims ORDER BY category, updated_at DESC")).map(mapCandidateClaim);
  }

  async saveCandidateClaim(claim: Partial<CandidateClaim> & Pick<CandidateClaim, "category" | "value">) {
    const existing = claim.id
      ? await this.db.select<Row[]>("SELECT * FROM candidate_claims WHERE id = $1", [claim.id])
      : [];
    const mapped = existing[0] ? mapCandidateClaim(existing[0]) : undefined;
    if (mapped?.locked && (mapped.category !== claim.category || valueJson(mapped.value) !== valueJson(claim.value))) {
      throw new Error("Locked candidate claims must be unlocked before their category or value can be changed.");
    }
    const now = nowIso();
    const saved: CandidateClaim = {
      id: mapped?.id ?? claim.id ?? createId("candidate-claim"),
      category: claim.category,
      value: claim.value,
      verificationStatus: claim.verificationStatus ?? mapped?.verificationStatus ?? "user_confirmed",
      evidenceIds: claim.evidenceIds ?? mapped?.evidenceIds ?? [],
      locked: claim.locked ?? mapped?.locked ?? false,
      createdAt: mapped?.createdAt ?? claim.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.execute(
      `INSERT INTO candidate_claims (
        id, category, value_json, verification_status, evidence_ids_json, locked, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(id) DO UPDATE SET
        category = excluded.category,
        value_json = excluded.value_json,
        verification_status = excluded.verification_status,
        evidence_ids_json = excluded.evidence_ids_json,
        locked = excluded.locked,
        updated_at = excluded.updated_at`,
      [
        saved.id,
        saved.category,
        jsonText(saved.value),
        saved.verificationStatus,
        JSON.stringify(saved.evidenceIds),
        saved.locked ? 1 : 0,
        saved.createdAt,
        saved.updatedAt,
      ],
    );
    return saved;
  }

  async deleteCandidateClaim(id: string) {
    const existing = await this.db.select<Row[]>("SELECT * FROM candidate_claims WHERE id = $1", [id]);
    const mapped = existing[0] ? mapCandidateClaim(existing[0]) : undefined;
    if (mapped?.locked) throw new Error("Locked candidate claims must be unlocked before they can be deleted.");
    await this.db.execute("DELETE FROM candidate_claims WHERE id = $1", [id]);
  }

  async listSensitiveAnswers() {
    return (await this.db.select<Row[]>("SELECT * FROM sensitive_answers ORDER BY label")).map(mapSensitiveAnswer);
  }

  async saveSensitiveAnswer(
    answer: Partial<SensitiveAnswer> & Pick<SensitiveAnswer, "key" | "label" | "value">,
  ) {
    const existing = answer.id
      ? await this.db.select<Row[]>("SELECT * FROM sensitive_answers WHERE id = $1", [answer.id])
      : await this.db.select<Row[]>("SELECT * FROM sensitive_answers WHERE answer_key = $1", [answer.key]);
    const mapped = existing[0] ? mapSensitiveAnswer(existing[0]) : undefined;
    if (mapped?.locked && valueJson(mapped.value) !== valueJson(answer.value)) {
      throw new Error("Locked sensitive answers must be unlocked before their value can be changed.");
    }
    const now = nowIso();
    const saved: SensitiveAnswer = {
      id: mapped?.id ?? answer.id ?? createId("sensitive-answer"),
      key: answer.key,
      label: answer.label,
      value: answer.value,
      verificationStatus: answer.verificationStatus ?? mapped?.verificationStatus ?? "user_confirmed",
      locked: answer.locked ?? mapped?.locked ?? false,
      requiresReview: answer.requiresReview ?? mapped?.requiresReview ?? false,
      createdAt: mapped?.createdAt ?? answer.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.execute(
      `INSERT INTO sensitive_answers (
        id, answer_key, label, value_json, verification_status, locked, requires_review, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(answer_key) DO UPDATE SET
        label = excluded.label,
        value_json = excluded.value_json,
        verification_status = excluded.verification_status,
        locked = excluded.locked,
        requires_review = excluded.requires_review,
        updated_at = excluded.updated_at`,
      [
        saved.id,
        saved.key,
        saved.label,
        jsonText(saved.value),
        saved.verificationStatus,
        saved.locked ? 1 : 0,
        saved.requiresReview ? 1 : 0,
        saved.createdAt,
        saved.updatedAt,
      ],
    );
    return saved;
  }

  async deleteSensitiveAnswer(id: string) {
    const existing = await this.db.select<Row[]>("SELECT * FROM sensitive_answers WHERE id = $1", [id]);
    const mapped = existing[0] ? mapSensitiveAnswer(existing[0]) : undefined;
    if (mapped?.locked) throw new Error("Locked sensitive answers must be unlocked before they can be deleted.");
    await this.db.execute("DELETE FROM sensitive_answers WHERE id = $1", [id]);
  }

  async getCandidatePreferences() {
    const rows = await this.db.select<Row[]>("SELECT * FROM candidate_preferences WHERE id = 'candidate-preferences-default'");
    return rows[0] ? mapCandidatePreferences(rows[0]) : null;
  }

  async saveCandidatePreferences(preferences: Partial<CandidatePreferences>) {
    const current = defaultCandidatePreferences(await this.getCandidatePreferences());
    const now = nowIso();
    const saved: CandidatePreferences = {
      ...current,
      ...preferences,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: now,
    };
    await this.db.execute(
      `INSERT INTO candidate_preferences (id, preferences_json, created_at, updated_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT(id) DO UPDATE SET preferences_json = excluded.preferences_json, updated_at = excluded.updated_at`,
      [saved.id, JSON.stringify(saved), saved.createdAt, saved.updatedAt],
    );
    return saved;
  }

  async listCareerStories(includeArchived = false) {
    return (
      await this.db.select<Row[]>(
        includeArchived
          ? "SELECT * FROM career_stories ORDER BY updated_at DESC"
          : "SELECT * FROM career_stories WHERE archived = 0 ORDER BY updated_at DESC",
      )
    ).map(mapCareerStory);
  }

  async saveCareerStory(story: Partial<CareerStory> & Pick<CareerStory, "title">) {
    const existing = story.id
      ? await this.db.select<Row[]>("SELECT * FROM career_stories WHERE id = $1", [story.id])
      : [];
    const mapped = existing[0] ? mapCareerStory(existing[0]) : undefined;
    const now = nowIso();
    const saved: CareerStory = {
      id: mapped?.id ?? story.id ?? createId("career-story"),
      title: story.title,
      tags: story.tags ?? mapped?.tags ?? [],
      competencies: story.competencies ?? mapped?.competencies ?? [],
      situation: story.situation ?? mapped?.situation ?? "",
      problem: story.problem ?? mapped?.problem ?? "",
      actions: story.actions ?? mapped?.actions ?? [],
      result: story.result ?? mapped?.result ?? "",
      metrics: story.metrics ?? mapped?.metrics ?? [],
      technologies: story.technologies ?? mapped?.technologies ?? [],
      evidenceIds: story.evidenceIds ?? mapped?.evidenceIds ?? [],
      verificationStatus: story.verificationStatus ?? mapped?.verificationStatus ?? "user_confirmed",
      approved: story.approved ?? mapped?.approved ?? false,
      archived: story.archived ?? mapped?.archived ?? false,
      createdAt: mapped?.createdAt ?? story.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.execute(
      `INSERT INTO career_stories (
        id, title, tags_json, competencies_json, situation, problem, actions_json, result,
        metrics_json, technologies_json, evidence_ids_json, verification_status, approved,
        archived, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        tags_json = excluded.tags_json,
        competencies_json = excluded.competencies_json,
        situation = excluded.situation,
        problem = excluded.problem,
        actions_json = excluded.actions_json,
        result = excluded.result,
        metrics_json = excluded.metrics_json,
        technologies_json = excluded.technologies_json,
        evidence_ids_json = excluded.evidence_ids_json,
        verification_status = excluded.verification_status,
        approved = excluded.approved,
        archived = excluded.archived,
        updated_at = excluded.updated_at`,
      [
        saved.id,
        saved.title,
        JSON.stringify(saved.tags),
        JSON.stringify(saved.competencies),
        saved.situation,
        saved.problem,
        JSON.stringify(saved.actions),
        saved.result,
        JSON.stringify(saved.metrics),
        JSON.stringify(saved.technologies),
        JSON.stringify(saved.evidenceIds),
        saved.verificationStatus,
        saved.approved ? 1 : 0,
        saved.archived ? 1 : 0,
        saved.createdAt,
        saved.updatedAt,
      ],
    );
    return saved;
  }

  async deleteCareerStory(id: string) {
    await this.db.execute("DELETE FROM career_stories WHERE id = $1", [id]);
  }

  async listApprovedApplicationAnswers(questionType?: string) {
    return (
      await this.db.select<Row[]>(
        questionType
          ? "SELECT * FROM approved_application_answers WHERE normalized_question_type = $1 ORDER BY updated_at DESC"
          : "SELECT * FROM approved_application_answers ORDER BY updated_at DESC",
        questionType ? [questionType] : [],
      )
    ).map(mapApprovedApplicationAnswer);
  }

  async saveApprovedApplicationAnswer(
    answer: Partial<ApprovedApplicationAnswer> &
      Pick<ApprovedApplicationAnswer, "normalizedQuestionType" | "originalQuestion" | "answer">,
  ) {
    const existing = answer.id
      ? await this.db.select<Row[]>("SELECT * FROM approved_application_answers WHERE id = $1", [answer.id])
      : [];
    const mapped = existing[0] ? mapApprovedApplicationAnswer(existing[0]) : undefined;
    const now = nowIso();
    const saved: ApprovedApplicationAnswer = {
      id: mapped?.id ?? answer.id ?? createId("approved-answer"),
      normalizedQuestionType: answer.normalizedQuestionType,
      originalQuestion: answer.originalQuestion,
      answer: answer.answer,
      applicableRoleFamilies: answer.applicableRoleFamilies ?? mapped?.applicableRoleFamilies ?? [],
      applicableIndustries: answer.applicableIndustries ?? mapped?.applicableIndustries ?? [],
      applicableSkills: answer.applicableSkills ?? mapped?.applicableSkills ?? [],
      sourceStoryIds: answer.sourceStoryIds ?? mapped?.sourceStoryIds ?? [],
      sourceClaimIds: answer.sourceClaimIds ?? mapped?.sourceClaimIds ?? [],
      tone: answer.tone ?? mapped?.tone ?? "",
      approvedByUser: answer.approvedByUser ?? mapped?.approvedByUser ?? true,
      doNotReuse: answer.doNotReuse ?? mapped?.doNotReuse ?? false,
      useCount: answer.useCount ?? mapped?.useCount ?? 0,
      lastUsedAt: answer.lastUsedAt ?? mapped?.lastUsedAt ?? "",
      createdAt: mapped?.createdAt ?? answer.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.execute(
      `INSERT INTO approved_application_answers (
        id, normalized_question_type, original_question, answer, applicable_role_families_json,
        applicable_industries_json, applicable_skills_json, source_story_ids_json,
        source_claim_ids_json, tone, approved_by_user, do_not_reuse, use_count,
        last_used_at, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT(id) DO UPDATE SET
        normalized_question_type = excluded.normalized_question_type,
        original_question = excluded.original_question,
        answer = excluded.answer,
        applicable_role_families_json = excluded.applicable_role_families_json,
        applicable_industries_json = excluded.applicable_industries_json,
        applicable_skills_json = excluded.applicable_skills_json,
        source_story_ids_json = excluded.source_story_ids_json,
        source_claim_ids_json = excluded.source_claim_ids_json,
        tone = excluded.tone,
        approved_by_user = excluded.approved_by_user,
        do_not_reuse = excluded.do_not_reuse,
        use_count = excluded.use_count,
        last_used_at = excluded.last_used_at,
        updated_at = excluded.updated_at`,
      [
        saved.id,
        saved.normalizedQuestionType,
        saved.originalQuestion,
        saved.answer,
        JSON.stringify(saved.applicableRoleFamilies),
        JSON.stringify(saved.applicableIndustries),
        JSON.stringify(saved.applicableSkills),
        JSON.stringify(saved.sourceStoryIds),
        JSON.stringify(saved.sourceClaimIds),
        saved.tone,
        saved.approvedByUser ? 1 : 0,
        saved.doNotReuse ? 1 : 0,
        saved.useCount,
        saved.lastUsedAt,
        saved.createdAt,
        saved.updatedAt,
      ],
    );
    return saved;
  }

  async deleteApprovedApplicationAnswer(id: string) {
    await this.db.execute("DELETE FROM approved_application_answers WHERE id = $1", [id]);
  }

  async listJobs() {
    return (await this.db.select<Row[]>("SELECT * FROM jobs ORDER BY created_at DESC")).map(mapJob);
  }

  async getJob(id: string) {
    const rows = await this.db.select<Row[]>("SELECT * FROM jobs WHERE id = $1", [id]);
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async saveJob(job: Partial<Job> & Pick<Job, "rawDescription">) {
    const existing = job.id ? await this.db.select<Row[]>("SELECT * FROM jobs WHERE id = $1", [job.id]) : [];
    const mapped = existing[0] ? mapJob(existing[0]) : undefined;
    const now = nowIso();
    const saved: Job = {
      id: mapped?.id ?? job.id ?? createId("job"),
      company: job.company ?? mapped?.company ?? "",
      roleTitle: job.roleTitle ?? mapped?.roleTitle ?? "",
      sourceUrl: job.sourceUrl ?? mapped?.sourceUrl ?? "",
      rawDescription: job.rawDescription,
      analysisJson: job.analysisJson ?? mapped?.analysisJson ?? null,
      createdAt: mapped?.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.execute(
      `INSERT INTO jobs VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(id) DO UPDATE SET
        company = excluded.company, role_title = excluded.role_title, source_url = excluded.source_url,
        raw_description = excluded.raw_description, analysis_json = excluded.analysis_json,
        updated_at = excluded.updated_at`,
      [
        saved.id,
        saved.company,
        saved.roleTitle,
        saved.sourceUrl,
        saved.rawDescription,
        saved.analysisJson ? JSON.stringify(saved.analysisJson) : null,
        saved.createdAt,
        saved.updatedAt,
      ],
    );
    return saved;
  }

  async listResumeVersions() {
    return (await this.db.select<Row[]>("SELECT * FROM resume_versions ORDER BY created_at DESC")).map(mapResume);
  }

  async getResumeVersion(id: string) {
    const rows = await this.db.select<Row[]>("SELECT * FROM resume_versions WHERE id = $1", [id]);
    return rows[0] ? mapResume(rows[0]) : null;
  }

  async saveResumeVersion(resume: Partial<ResumeVersion> & Pick<ResumeVersion, "jobId" | "contentJson">) {
    const existing = resume.id
      ? await this.db.select<Row[]>("SELECT * FROM resume_versions WHERE id = $1", [resume.id])
      : [];
    const mapped = existing[0] ? mapResume(existing[0]) : undefined;
    const now = nowIso();
    const saved: ResumeVersion = {
      id: mapped?.id ?? resume.id ?? createId("resume"),
      jobId: resume.jobId,
      name: resume.name ?? mapped?.name ?? "Tailored resume",
      templateId: resume.templateId ?? mapped?.templateId ?? defaultSettings.defaultTemplateId,
      contentJson: resume.contentJson,
      validationJson: resume.validationJson ?? mapped?.validationJson ?? [],
      status: resume.status ?? mapped?.status ?? "draft",
      lastExportPath: resume.lastExportPath ?? mapped?.lastExportPath ?? "",
      parentResumeVersionId: resume.parentResumeVersionId ?? mapped?.parentResumeVersionId ?? "",
      generationProvider: resume.generationProvider ?? mapped?.generationProvider ?? "deterministic",
      generationModel: resume.generationModel ?? mapped?.generationModel ?? "",
      promptVersion: resume.promptVersion ?? mapped?.promptVersion ?? "",
      promptVersionsJson: resume.promptVersionsJson ?? mapped?.promptVersionsJson ?? PROMPT_VERSIONS,
      layoutProfileId:
        resume.layoutProfileId ?? mapped?.layoutProfileId ?? "general-software-engineer",
      templateSettingsJson:
        resume.templateSettingsJson ?? mapped?.templateSettingsJson ?? defaultSettings.templateSettings,
      generationMetadataJson:
        resume.generationMetadataJson ?? mapped?.generationMetadataJson ?? emptyGenerationMetadata,
      deterministicBaselineJson:
        resume.deterministicBaselineJson ?? mapped?.deterministicBaselineJson ?? null,
      createdAt: mapped?.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.execute(
      `INSERT INTO resume_versions (
        id, job_id, name, template_id, content_json, validation_json, status, last_export_path,
        created_at, updated_at, parent_resume_version_id, generation_provider, generation_model,
        prompt_version, generation_metadata_json, deterministic_baseline_json,
        prompt_versions_json, layout_profile_id, template_settings_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT(id) DO UPDATE SET
        job_id = excluded.job_id, name = excluded.name, template_id = excluded.template_id,
        content_json = excluded.content_json, validation_json = excluded.validation_json,
        status = excluded.status, last_export_path = excluded.last_export_path,
        parent_resume_version_id = excluded.parent_resume_version_id,
        generation_provider = excluded.generation_provider,
        generation_model = excluded.generation_model,
        prompt_version = excluded.prompt_version,
        prompt_versions_json = excluded.prompt_versions_json,
        layout_profile_id = excluded.layout_profile_id,
        template_settings_json = excluded.template_settings_json,
        generation_metadata_json = excluded.generation_metadata_json,
        deterministic_baseline_json = excluded.deterministic_baseline_json,
        updated_at = excluded.updated_at`,
      [
        saved.id,
        saved.jobId,
        saved.name,
        saved.templateId,
        JSON.stringify(saved.contentJson),
        JSON.stringify(saved.validationJson),
        saved.status,
        saved.lastExportPath,
        saved.createdAt,
        saved.updatedAt,
        saved.parentResumeVersionId,
        saved.generationProvider,
        saved.generationModel,
        saved.promptVersion,
        JSON.stringify(saved.generationMetadataJson),
        saved.deterministicBaselineJson ? JSON.stringify(saved.deterministicBaselineJson) : null,
        JSON.stringify(saved.promptVersionsJson),
        saved.layoutProfileId,
        JSON.stringify(saved.templateSettingsJson),
      ],
    );
    return saved;
  }

  async deleteResumeVersion(id: string) {
    await this.db.execute("DELETE FROM resume_versions WHERE id = $1", [id]);
  }

  async listApprovedBulletVariants(filters: ApprovedVariantFilters = {}) {
    const rows = (
      await this.db.select<Row[]>(
        filters.careerItemId
          ? "SELECT * FROM approved_bullet_variants WHERE career_item_id = $1 ORDER BY approved_at DESC"
          : "SELECT * FROM approved_bullet_variants ORDER BY approved_at DESC",
        filters.careerItemId ? [filters.careerItemId] : [],
      )
    ).map(mapApprovedVariant);
    const factIds = filters.factIds ? new Set(filters.factIds) : null;
    const roles = filters.roleCategories
      ? new Set(filters.roleCategories.map((role) => role.toLowerCase()))
      : null;
    return rows
      .filter((variant) => !factIds || variant.sourceFactIds.every((factId) => factIds.has(factId)))
      .filter(
        (variant) =>
          !roles ||
          variant.roleCategories.length === 0 ||
          variant.roleCategories.some((role) => roles.has(role.toLowerCase())),
      );
  }

  async saveApprovedBulletVariant(
    variant: Partial<ApprovedBulletVariant> &
      Pick<ApprovedBulletVariant, "careerItemId" | "sourceFactIds" | "text">,
  ) {
    const now = nowIso();
    const existing = variant.id
      ? await this.db.select<Row[]>("SELECT * FROM approved_bullet_variants WHERE id = $1", [variant.id])
      : [];
    const mapped = existing[0] ? mapApprovedVariant(existing[0]) : undefined;
    const saved: ApprovedBulletVariant = {
      id: mapped?.id ?? variant.id ?? createId("approved-variant"),
      careerItemId: variant.careerItemId,
      sourceFactIds: variant.sourceFactIds,
      text: variant.text,
      roleCategories: variant.roleCategories ?? mapped?.roleCategories ?? [],
      skillTags: variant.skillTags ?? mapped?.skillTags ?? [],
      targetJobId: variant.targetJobId ?? mapped?.targetJobId ?? "",
      creationSource: variant.creationSource ?? mapped?.creationSource ?? "user",
      approvedAt: variant.approvedAt ?? mapped?.approvedAt ?? now,
      createdAt: mapped?.createdAt ?? variant.createdAt ?? now,
    };
    await this.db.execute(
      `INSERT INTO approved_bullet_variants (
        id, career_item_id, source_fact_ids_json, text, role_categories_json, skill_tags_json,
        target_job_id, creation_source, approved_at, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT(id) DO UPDATE SET
        career_item_id = excluded.career_item_id,
        source_fact_ids_json = excluded.source_fact_ids_json,
        text = excluded.text,
        role_categories_json = excluded.role_categories_json,
        skill_tags_json = excluded.skill_tags_json,
        target_job_id = excluded.target_job_id,
        creation_source = excluded.creation_source,
        approved_at = excluded.approved_at`,
      [
        saved.id,
        saved.careerItemId,
        JSON.stringify(saved.sourceFactIds),
        saved.text,
        JSON.stringify(saved.roleCategories),
        JSON.stringify(saved.skillTags),
        saved.targetJobId,
        saved.creationSource,
        saved.approvedAt,
        saved.createdAt,
      ],
    );
    return saved;
  }

  async deleteApprovedBulletVariant(id: string) {
    await this.db.execute("DELETE FROM approved_bullet_variants WHERE id = $1", [id]);
  }

  async listFactUsage(factId: string): Promise<FactUsage[]> {
    const resumes = await this.listResumeVersions();
    return resumes.flatMap((resume) =>
      [...resume.contentJson.projects, ...resume.contentJson.experience].flatMap((section) =>
        section.bullets
          .filter((bullet) => bullet.sourceFactIds.includes(factId))
          .map((bullet) => ({
            factId,
            resumeVersionId: resume.id,
            resumeName: resume.name,
            bulletId: bullet.id,
            bulletText: bullet.text,
          })),
      ),
    );
  }

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const facts = await this.db.select<Array<{ count: number }>>("SELECT COUNT(*) AS count FROM career_facts");
    const review = await this.db.select<Array<{ count: number }>>(
      "SELECT COUNT(*) AS count FROM career_facts WHERE evidence_status = 'needs_review'",
    );
    const jobs = await this.db.select<Array<{ count: number }>>("SELECT COUNT(*) AS count FROM jobs");
    const resumes = await this.db.select<Array<{ count: number }>>("SELECT COUNT(*) AS count FROM resume_versions");
    return {
      careerFacts: Number(facts[0]?.count ?? 0),
      factsNeedingReview: Number(review[0]?.count ?? 0),
      savedJobs: Number(jobs[0]?.count ?? 0),
      resumeVersions: Number(resumes[0]?.count ?? 0),
      recentResumes: (await this.listResumeVersions()).slice(0, 5),
    };
  }

  async listApplications() {
    return (await this.db.select<Row[]>("SELECT * FROM applications ORDER BY updated_at DESC")).map(
      mapApplication,
    );
  }

  async getApplication(id: string) {
    const rows = await this.db.select<Row[]>("SELECT * FROM applications WHERE id = $1", [id]);
    return rows[0] ? mapApplication(rows[0]) : null;
  }

  async saveApplication(
    application: Partial<ApplicationRecord> & Pick<ApplicationRecord, "company" | "role">,
  ) {
    const existing = application.id ? await this.getApplication(application.id) : null;
    const now = nowIso();
    const status = application.status ?? existing?.status ?? "preparing";
    const previousHistory = existing?.statusHistoryJson ?? [];
    const statusChanged = existing && existing.status !== status;
    const saved: ApplicationRecord = {
      id: existing?.id ?? application.id ?? createId("application"),
      jobId: application.jobId ?? existing?.jobId ?? "",
      company: application.company,
      role: application.role,
      jobUrl: application.jobUrl ?? existing?.jobUrl ?? "",
      resumeVersionId: application.resumeVersionId ?? existing?.resumeVersionId ?? "",
      submittedResumeVersionId:
        application.submittedResumeVersionId ?? existing?.submittedResumeVersionId ?? "",
      submittedPdfPath: application.submittedPdfPath ?? existing?.submittedPdfPath ?? "",
      submittedPdfHash: application.submittedPdfHash ?? existing?.submittedPdfHash ?? "",
      status,
      appliedDate:
        application.appliedDate?.trim() ||
        existing?.appliedDate ||
        (status === "applied" ? now.slice(0, 10) : ""),
      followUpDate: application.followUpDate ?? existing?.followUpDate ?? "",
      referralContact: application.referralContact ?? existing?.referralContact ?? "",
      recruiter: application.recruiter ?? existing?.recruiter ?? "",
      hiringManager: application.hiringManager ?? existing?.hiringManager ?? "",
      referral: application.referral ?? existing?.referral ?? "",
      source: application.source ?? existing?.source ?? "",
      salaryRange: application.salaryRange ?? existing?.salaryRange ?? "",
      locationType: application.locationType ?? existing?.locationType ?? "",
      sponsorshipNotes: application.sponsorshipNotes ?? existing?.sponsorshipNotes ?? "",
      nextAction: application.nextAction ?? existing?.nextAction ?? "",
      notes: application.notes ?? existing?.notes ?? "",
      automationMode: application.automationMode ?? existing?.automationMode ?? "manual",
      applicationUrl: application.applicationUrl ?? existing?.applicationUrl ?? application.jobUrl ?? "",
      atsPlatform: application.atsPlatform ?? existing?.atsPlatform ?? "",
      matchScore: application.matchScore ?? existing?.matchScore ?? null,
      submittedAt:
        application.submittedAt ??
        existing?.submittedAt ??
        (status === "applied" && !existing?.submittedAt ? now : ""),
      jobSnapshotJson: application.jobSnapshotJson ?? existing?.jobSnapshotJson ?? null,
      statusHistoryJson:
        application.statusHistoryJson ??
        (statusChanged
          ? [...previousHistory, { status, changedAt: now, note: "Status changed in CareerCompiler." }]
          : previousHistory),
      createdAt: existing?.createdAt ?? application.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.execute(
      `INSERT INTO applications (
        id, job_id, company, role, job_url, resume_version_id, status, applied_date,
        referral_contact, notes, created_at, updated_at, submitted_resume_version_id,
        submitted_pdf_path, submitted_pdf_hash, follow_up_date, recruiter, hiring_manager,
        referral, source, salary_range, location_type, sponsorship_notes, next_action,
        automation_mode, application_url, ats_platform, match_score, submitted_at,
        job_snapshot_json, status_history_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
      ON CONFLICT(id) DO UPDATE SET
        job_id = excluded.job_id, company = excluded.company, role = excluded.role,
        job_url = excluded.job_url, resume_version_id = excluded.resume_version_id,
        status = excluded.status, applied_date = excluded.applied_date,
        referral_contact = excluded.referral_contact, notes = excluded.notes,
        submitted_resume_version_id = excluded.submitted_resume_version_id,
        submitted_pdf_path = excluded.submitted_pdf_path,
        submitted_pdf_hash = excluded.submitted_pdf_hash,
        follow_up_date = excluded.follow_up_date,
        recruiter = excluded.recruiter,
        hiring_manager = excluded.hiring_manager,
        referral = excluded.referral,
        source = excluded.source,
        salary_range = excluded.salary_range,
        location_type = excluded.location_type,
        sponsorship_notes = excluded.sponsorship_notes,
        next_action = excluded.next_action,
        automation_mode = excluded.automation_mode,
        application_url = excluded.application_url,
        ats_platform = excluded.ats_platform,
        match_score = excluded.match_score,
        submitted_at = excluded.submitted_at,
        job_snapshot_json = excluded.job_snapshot_json,
        status_history_json = excluded.status_history_json,
        updated_at = excluded.updated_at`,
      [
        saved.id,
        saved.jobId,
        saved.company,
        saved.role,
        saved.jobUrl,
        saved.resumeVersionId,
        saved.status,
        saved.appliedDate,
        saved.referralContact,
        saved.notes,
        saved.createdAt,
        saved.updatedAt,
        saved.submittedResumeVersionId,
        saved.submittedPdfPath,
        saved.submittedPdfHash,
        saved.followUpDate,
        saved.recruiter,
        saved.hiringManager,
        saved.referral,
        saved.source,
        saved.salaryRange,
        saved.locationType,
        saved.sponsorshipNotes,
        saved.nextAction,
        saved.automationMode,
        saved.applicationUrl,
        saved.atsPlatform,
        saved.matchScore,
        saved.submittedAt,
        saved.jobSnapshotJson ? JSON.stringify(saved.jobSnapshotJson) : null,
        JSON.stringify(saved.statusHistoryJson),
      ],
    );
    return saved;
  }

  async deleteApplication(id: string) {
    await this.db.execute("DELETE FROM application_fields WHERE application_id = $1", [id]);
    await this.db.execute("DELETE FROM applications WHERE id = $1", [id]);
  }

  async listApplicationFields(applicationId?: string) {
    return (
      await this.db.select<Row[]>(
        applicationId
          ? "SELECT * FROM application_fields WHERE application_id = $1 ORDER BY created_at"
          : "SELECT * FROM application_fields ORDER BY updated_at DESC",
        applicationId ? [applicationId] : [],
      )
    ).map(mapApplicationField);
  }

  async saveApplicationField(
    field: Partial<ApplicationFieldRecord> &
      Pick<ApplicationFieldRecord, "applicationId" | "originalQuestion" | "normalizedQuestionType">,
  ) {
    const existing = field.id
      ? await this.db.select<Row[]>("SELECT * FROM application_fields WHERE id = $1", [field.id])
      : [];
    const mapped = existing[0] ? mapApplicationField(existing[0]) : undefined;
    const now = nowIso();
    const saved: ApplicationFieldRecord = {
      id: mapped?.id ?? field.id ?? createId("application-field"),
      applicationId: field.applicationId,
      originalQuestion: field.originalQuestion,
      normalizedQuestionType: field.normalizedQuestionType,
      detectedFieldType: field.detectedFieldType ?? mapped?.detectedFieldType ?? "text",
      generatedAnswer: field.generatedAnswer ?? mapped?.generatedAnswer ?? "",
      finalAnswer: field.finalAnswer ?? mapped?.finalAnswer ?? field.generatedAnswer ?? "",
      answerSource: field.answerSource ?? mapped?.answerSource ?? "user_required",
      confidence: field.confidence ?? mapped?.confidence ?? 0,
      requiresReview: field.requiresReview ?? mapped?.requiresReview ?? true,
      userEdited: field.userEdited ?? mapped?.userEdited ?? false,
      approved: field.approved ?? mapped?.approved ?? false,
      doNotReuse: field.doNotReuse ?? mapped?.doNotReuse ?? false,
      claimIds: field.claimIds ?? mapped?.claimIds ?? [],
      storyIds: field.storyIds ?? mapped?.storyIds ?? [],
      warnings: field.warnings ?? mapped?.warnings ?? [],
      reasoningSummary: field.reasoningSummary ?? mapped?.reasoningSummary ?? "",
      createdAt: mapped?.createdAt ?? field.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.execute(
      `INSERT INTO application_fields (
        id, application_id, original_question, normalized_question_type, detected_field_type,
        generated_answer_json, final_answer_json, answer_source, confidence, requires_review,
        user_edited, approved, do_not_reuse, claim_ids_json, story_ids_json, warnings_json,
        reasoning_summary, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT(id) DO UPDATE SET
        application_id = excluded.application_id,
        original_question = excluded.original_question,
        normalized_question_type = excluded.normalized_question_type,
        detected_field_type = excluded.detected_field_type,
        generated_answer_json = excluded.generated_answer_json,
        final_answer_json = excluded.final_answer_json,
        answer_source = excluded.answer_source,
        confidence = excluded.confidence,
        requires_review = excluded.requires_review,
        user_edited = excluded.user_edited,
        approved = excluded.approved,
        do_not_reuse = excluded.do_not_reuse,
        claim_ids_json = excluded.claim_ids_json,
        story_ids_json = excluded.story_ids_json,
        warnings_json = excluded.warnings_json,
        reasoning_summary = excluded.reasoning_summary,
        updated_at = excluded.updated_at`,
      [
        saved.id,
        saved.applicationId,
        saved.originalQuestion,
        saved.normalizedQuestionType,
        saved.detectedFieldType,
        jsonText(saved.generatedAnswer),
        jsonText(saved.finalAnswer),
        saved.answerSource,
        saved.confidence,
        saved.requiresReview ? 1 : 0,
        saved.userEdited ? 1 : 0,
        saved.approved ? 1 : 0,
        saved.doNotReuse ? 1 : 0,
        JSON.stringify(saved.claimIds),
        JSON.stringify(saved.storyIds),
        JSON.stringify(saved.warnings),
        saved.reasoningSummary,
        saved.createdAt,
        saved.updatedAt,
      ],
    );
    return saved;
  }

  async deleteApplicationField(id: string) {
    await this.db.execute("DELETE FROM application_fields WHERE id = $1", [id]);
  }

  async listEvaluationSummaries() {
    return (
      await this.db.select<Row[]>("SELECT * FROM evaluation_summaries ORDER BY created_at DESC")
    ).map(mapEvaluation);
  }

  async saveEvaluationSummary(summary: EvaluationSummary) {
    await this.db.execute(
      `INSERT INTO evaluation_summaries (
        id, fixture_id, fixture_name, mode, provider, model, prompt_versions_json,
        role_profile_id, template_id, metrics_json, selected_career_item_ids_json,
        selected_fact_ids_json, validation_issues_json, preferred, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT(id) DO UPDATE SET
        metrics_json = excluded.metrics_json,
        validation_issues_json = excluded.validation_issues_json,
        preferred = excluded.preferred`,
      [
        summary.id,
        summary.fixtureId,
        summary.fixtureName,
        summary.mode,
        summary.provider,
        summary.model,
        JSON.stringify(summary.promptVersions),
        summary.roleProfileId,
        summary.templateId,
        JSON.stringify(summary.metrics),
        JSON.stringify(summary.selectedCareerItemIds),
        JSON.stringify(summary.selectedFactIds),
        JSON.stringify(summary.validationIssues),
        summary.preferred ? 1 : 0,
        summary.createdAt,
      ],
    );
    return summary;
  }

  async markEvaluationPreferred(id: string) {
    const rows = await this.db.select<Array<{ fixture_id: string }>>(
      "SELECT fixture_id FROM evaluation_summaries WHERE id = $1",
      [id],
    );
    const fixtureId = rows[0]?.fixture_id;
    if (!fixtureId) return;
    await this.db.execute("UPDATE evaluation_summaries SET preferred = 0 WHERE fixture_id = $1", [fixtureId]);
    await this.db.execute("UPDATE evaluation_summaries SET preferred = 1 WHERE id = $1", [id]);
  }

  async listCareerImportRecords() {
    return (await this.db.select<Row[]>("SELECT * FROM career_imports ORDER BY created_at DESC")).map(
      mapCareerImportRecord,
    );
  }

  async applyCareerImportProposal(proposal: CareerImportProposal) {
    const applied = applyCareerImportToState(
      {
        profile: await this.getProfile(),
        careerItems: await this.listCareerItems(),
        careerFacts: await this.listCareerFacts(),
        skills: await this.listSkills(),
      },
      proposal,
    );
    await this.db.execute("BEGIN IMMEDIATE");
    try {
      await this.persistCareerImportChanges(applied);
      await this.saveCareerImportRecord(applied.record);
      await this.db.execute("COMMIT");
      return applied.record;
    } catch (caught) {
      await this.db.execute("ROLLBACK").catch(() => undefined);
      throw new Error(
        `career_import_failed|Smart Career Intake save failed and changes were rolled back. ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    }
  }

  async undoLastCareerImport() {
    const latest = (await this.listCareerImportRecords()).find((record) => !record.undoneAt);
    if (!latest) return null;
    const undoneAt = nowIso();
    await this.db.execute("BEGIN IMMEDIATE");
    try {
      await this.undoCareerImportRecord(latest);
      await this.db.execute("UPDATE career_imports SET undone_at = $1 WHERE id = $2", [undoneAt, latest.id]);
      await this.db.execute("COMMIT");
      return { ...latest, undoneAt };
    } catch (caught) {
      await this.db.execute("ROLLBACK").catch(() => undefined);
      throw new Error(
        `career_import_undo_failed|Smart Career Intake undo failed and changes were rolled back. ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    }
  }

  async createCareerImportPackage(careerItemIds?: string[]) {
    return createCareerMemoryExportProposal(
      {
        profile: await this.getProfile(),
        careerItems: await this.listCareerItems(),
        careerFacts: await this.listCareerFacts(),
        skills: await this.listSkills(),
      },
      careerItemIds,
    );
  }

  async listMigrationEvents() {
    return (await this.db.select<Row[]>("SELECT * FROM migration_events ORDER BY id")).map(
      mapMigrationEvent,
    );
  }

  async getDatabaseStatus() {
    const versions = await this.db.select<Array<{ id: number }>>(
      "SELECT id FROM schema_migrations ORDER BY id DESC LIMIT 1",
    );
    const events = await this.listMigrationEvents();
    try {
      await this.db.execute("CREATE TEMP TABLE IF NOT EXISTS careercompiler_write_probe (id INTEGER)");
      await this.db.execute("DROP TABLE careercompiler_write_probe");
      return {
        writable: true,
        schemaVersion: Number(versions[0]?.id ?? 0),
        latestMigration: events.at(-1) ?? null,
      };
    } catch {
      return {
        writable: false,
        schemaVersion: Number(versions[0]?.id ?? 0),
        latestMigration: events.at(-1) ?? null,
      };
    }
  }

  async getSettings() {
    const rows = await this.db.select<Row[]>("SELECT * FROM app_settings WHERE id = 'default'");
    if (!rows[0]) {
      await this.saveSettings(defaultSettings);
      return defaultSettings;
    }
    return {
      aiProvider: rows[0].ai_provider as AppSettings["aiProvider"],
      modelName: asString(rows[0].model_name),
      defaultTemplateId: asString(rows[0].default_template_id),
      defaultExportDirectory: asString(rows[0].default_export_directory),
      tailoringDefaults: {
        ...defaultSettings.tailoringDefaults,
        ...(parseJson(rows[0].tailoring_defaults_json, {}) as Partial<AppSettings["tailoringDefaults"]>),
      },
      templateSettings: {
        ...defaultSettings.templateSettings,
        ...(parseJson(rows[0].template_settings_json, {}) as Partial<AppSettings["templateSettings"]>),
      },
      developerMode: asBool(rows[0].developer_mode),
      uiState: {
        ...defaultSettings.uiState,
        ...(parseJson(rows[0].ui_state_json, {}) as Partial<AppSettings["uiState"]>),
      },
      semanticSearchMode:
        (asString(rows[0].semantic_search_mode) || defaultSettings.semanticSearchMode) as AppSettings["semanticSearchMode"],
      allowRemoteEmbeddings: asBool(rows[0].allow_remote_embeddings),
      allowPrivateNotesInEmbeddings: asBool(rows[0].allow_private_notes_in_embeddings),
      allowContactFieldsInCopilotContext: asBool(rows[0].allow_contact_fields_in_copilot_context),
    };
  }

  async saveSettings(settings: AppSettings) {
    await this.db.execute(
      `INSERT INTO app_settings (
        id, ai_provider, model_name, default_template_id, default_export_directory,
        tailoring_defaults_json, template_settings_json, developer_mode, ui_state_json,
        semantic_search_mode, allow_remote_embeddings, allow_private_notes_in_embeddings,
        allow_contact_fields_in_copilot_context
      ) VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT(id) DO UPDATE SET
        ai_provider = excluded.ai_provider,
        model_name = excluded.model_name,
        default_template_id = excluded.default_template_id,
        default_export_directory = excluded.default_export_directory,
        tailoring_defaults_json = excluded.tailoring_defaults_json,
        template_settings_json = excluded.template_settings_json,
        developer_mode = excluded.developer_mode,
        ui_state_json = excluded.ui_state_json,
        semantic_search_mode = excluded.semantic_search_mode,
        allow_remote_embeddings = excluded.allow_remote_embeddings,
        allow_private_notes_in_embeddings = excluded.allow_private_notes_in_embeddings,
        allow_contact_fields_in_copilot_context = excluded.allow_contact_fields_in_copilot_context`,
      [
        settings.aiProvider,
        settings.modelName,
        settings.defaultTemplateId,
        settings.defaultExportDirectory,
        JSON.stringify(settings.tailoringDefaults),
        JSON.stringify(settings.templateSettings),
        settings.developerMode ? 1 : 0,
        JSON.stringify(settings.uiState),
        settings.semanticSearchMode,
        settings.allowRemoteEmbeddings ? 1 : 0,
        settings.allowPrivateNotesInEmbeddings ? 1 : 0,
        settings.allowContactFieldsInCopilotContext ? 1 : 0,
      ],
    );
    return settings;
  }

  async exportBackup(): Promise<BackupPayload> {
    const careerCopilotMessages = (
      await this.db.select<Row[]>("SELECT * FROM career_copilot_messages ORDER BY created_at")
    ).map(mapCareerCopilotMessage);
    return {
      profile: await this.getProfile(),
      careerItems: await this.listCareerItems(),
      careerFacts: await this.listCareerFacts(),
      skills: await this.listSkills(),
      candidateClaims: await this.listCandidateClaims(),
      sensitiveAnswers: await this.listSensitiveAnswers(),
      candidatePreferences: await this.getCandidatePreferences(),
      careerStories: await this.listCareerStories(true),
      approvedApplicationAnswers: await this.listApprovedApplicationAnswers(),
      jobs: await this.listJobs(),
      resumes: await this.listResumeVersions(),
      approvedVariants: await this.listApprovedBulletVariants(),
      applications: await this.listApplications(),
      applicationFields: await this.listApplicationFields(),
      savedApplicationAnswers: await this.listSavedApplicationAnswers(),
      evaluationSummaries: await this.listEvaluationSummaries(),
      careerImports: await this.listCareerImportRecords(),
      careerCopilotThreads: await this.listCareerCopilotThreads(true),
      careerCopilotMessages,
      resumeFavorites: await this.listResumeFavorites(),
      resumeArchives: await this.listResumeArchives(),
      resumeRecommendations: await this.listResumeRecommendations(),
      settings: await this.getSettings(),
      exportedAt: nowIso(),
      schemaVersion: 5,
    };
  }

  async importBackup(payload: BackupPayload, mode: "replace" | "merge" = "replace") {
    await this.db.execute("BEGIN IMMEDIATE");
    try {
      if (mode === "replace") {
        await this.db.execute("DELETE FROM career_copilot_messages");
        await this.db.execute("DELETE FROM career_copilot_threads");
        await this.db.execute("DELETE FROM search_embeddings");
        await this.db.execute("DELETE FROM search_documents");
        await this.db.execute("DELETE FROM resume_recommendations");
        await this.db.execute("DELETE FROM resume_favorites");
        await this.db.execute("DELETE FROM resume_archives");
        await this.db.execute("DELETE FROM saved_application_answers");
        await this.db.execute("DELETE FROM application_fields");
        await this.db.execute("DELETE FROM approved_application_answers");
        await this.db.execute("DELETE FROM career_stories");
        await this.db.execute("DELETE FROM candidate_preferences");
        await this.db.execute("DELETE FROM sensitive_answers");
        await this.db.execute("DELETE FROM candidate_claims");
        await this.db.execute("DELETE FROM career_imports");
        await this.db.execute("DELETE FROM applications");
        await this.db.execute("DELETE FROM evaluation_summaries");
        await this.db.execute("DELETE FROM approved_bullet_variants");
        await this.db.execute("DELETE FROM resume_versions");
        await this.db.execute("DELETE FROM jobs");
        await this.db.execute("DELETE FROM career_facts");
        await this.db.execute("DELETE FROM career_items");
        await this.db.execute("DELETE FROM skills");
        await this.db.execute("DELETE FROM profile");
      }
      if (payload.profile) await this.saveProfile(payload.profile);
      for (const item of payload.careerItems) await this.saveCareerItem(item);
      for (const fact of payload.careerFacts) await this.saveCareerFact(fact);
      for (const skill of payload.skills) await this.saveSkill(skill);
      for (const claim of payload.candidateClaims ?? []) await this.saveCandidateClaim(claim);
      for (const answer of payload.sensitiveAnswers ?? []) await this.saveSensitiveAnswer(answer);
      if (payload.candidatePreferences) await this.saveCandidatePreferences(payload.candidatePreferences);
      for (const story of payload.careerStories ?? []) await this.saveCareerStory(story);
      for (const answer of payload.approvedApplicationAnswers ?? []) await this.saveApprovedApplicationAnswer(answer);
      for (const job of payload.jobs) await this.saveJob(job);
      for (const resume of payload.resumes) await this.saveResumeVersion(resume);
      for (const variant of payload.approvedVariants ?? []) await this.saveApprovedBulletVariant(variant);
      for (const application of payload.applications ?? []) await this.saveApplication(application);
      for (const field of payload.applicationFields ?? []) await this.saveApplicationField(field);
      for (const answer of payload.savedApplicationAnswers ?? []) await this.saveApplicationAnswer(answer);
      for (const summary of payload.evaluationSummaries ?? []) await this.saveEvaluationSummary(summary);
      for (const record of payload.careerImports ?? []) await this.saveCareerImportRecord(record);
      for (const thread of payload.careerCopilotThreads ?? []) await this.saveCareerCopilotThread(thread);
      for (const message of payload.careerCopilotMessages ?? []) await this.saveCareerCopilotMessage(message);
      for (const favorite of payload.resumeFavorites ?? []) await this.setResumeFavorite(favorite.resumeVersionId, true);
      for (const archive of payload.resumeArchives ?? []) await this.setResumeArchived(archive.resumeVersionId, true);
      for (const recommendation of payload.resumeRecommendations ?? []) await this.saveResumeRecommendation(recommendation);
      await this.saveSettings(payload.settings);
      await this.rebuildSearchIndex();
      await this.db.execute("COMMIT");
    } catch (caught) {
      await this.db.execute("ROLLBACK").catch(() => undefined);
      throw new Error(
        `backup_restore_failed|Backup restore failed and changes were rolled back. ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    }
  }

  async listSearchDocuments() {
    await this.rebuildSearchIndex();
    return (await this.db.select<Row[]>("SELECT * FROM search_documents ORDER BY updated_at DESC")).map(
      mapSearchDocument,
    );
  }

  async rebuildSearchIndex(): Promise<SearchDiagnostics> {
    const started = performance.now();
    const documents = buildSearchDocuments({
      profile: await this.getProfile(),
      careerItems: await this.listCareerItems(),
      careerFacts: await this.listCareerFacts(),
      skills: await this.listSkills(),
      candidateClaims: await this.listCandidateClaims(),
      sensitiveAnswers: await this.listSensitiveAnswers(),
      careerStories: await this.listCareerStories(true),
      approvedApplicationAnswers: await this.listApprovedApplicationAnswers(),
      jobs: await this.listJobs(),
      resumes: await this.listResumeVersions(),
      approvedVariants: await this.listApprovedBulletVariants(),
      applications: await this.listApplications(),
      applicationFields: await this.listApplicationFields(),
      evaluations: await this.listEvaluationSummaries(),
      careerImports: await this.listCareerImportRecords(),
      copilotThreads: await this.listCareerCopilotThreads(true),
      resumeFavorites: await this.listResumeFavorites(),
      resumeArchives: await this.listResumeArchives(),
    });
    await this.db.execute("DELETE FROM search_embeddings WHERE search_document_id NOT IN (SELECT id FROM search_documents)");
    await this.db.execute("DELETE FROM search_documents");
    for (const document of documents) {
      await this.db.execute(
        `INSERT INTO search_documents (
          id, entity_type, entity_id, parent_entity_type, parent_entity_id, title,
          normalized_text, metadata_json, content_hash, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          document.id,
          document.entityType,
          document.entityId,
          document.parentEntityType,
          document.parentEntityId,
          document.title,
          document.normalizedText,
          JSON.stringify(document.metadataJson),
          document.contentHash,
          document.updatedAt,
        ],
      );
    }
    const fts5Available = await this.rebuildFtsIndex(documents);
    const durationMs = Math.round(performance.now() - started);
    await this.db.execute(
      `INSERT INTO search_index_events (event_type, safe_message, duration_ms, created_at)
       VALUES ('reindex', $1, $2, $3)`,
      [
        fts5Available
          ? "Rebuilt search documents and FTS5 index."
          : "Rebuilt search documents. FTS5 unavailable; deterministic fallback search remains enabled.",
        durationMs,
        nowIso(),
      ],
    );
    return this.getSearchDiagnostics();
  }

  async searchCareerDocuments(query: string, filters: SearchFilters = {}): Promise<SearchResult[]> {
    await this.rebuildSearchIndex();
    const documents = (await this.db.select<Row[]>("SELECT * FROM search_documents")).map(mapSearchDocument);
    const { results, durationMs } = deterministicSearch(documents, query, filters);
    await this.db.execute(
      `INSERT INTO search_index_events (event_type, safe_message, duration_ms, created_at)
       VALUES ('search', 'Search completed with deterministic hybrid fallback ranking.', $1, $2)`,
      [durationMs, nowIso()],
    );
    return results;
  }

  async getSearchDiagnostics(): Promise<SearchDiagnostics> {
    const counts = await this.db.select<Array<{ count: number }>>(
      "SELECT COUNT(*) AS count FROM search_documents",
    );
    const embeddingCounts = await this.db.select<Array<{ count: number }>>(
      "SELECT COUNT(*) AS count FROM search_embeddings",
    );
    const staleEmbeddings = await this.db.select<Array<{ count: number }>>(
      `SELECT COUNT(*) AS count
       FROM search_embeddings e
       JOIN search_documents d ON d.id = e.search_document_id
       WHERE e.content_hash != d.content_hash`,
    );
    const latest = await this.db.select<Row[]>(
      "SELECT * FROM search_index_events ORDER BY id DESC LIMIT 1",
    );
    const fts5Available = await this.detectFts5();
    const settings = await this.getSettings();
    return {
      documentCount: Number(counts[0]?.count ?? 0),
      fts5Available,
      ftsIndexHealthy: fts5Available,
      embeddingProvider: settings.semanticSearchMode,
      embeddingCount: Number(embeddingCounts[0]?.count ?? 0),
      staleDocumentCount: 0,
      staleEmbeddingCount: Number(staleEmbeddings[0]?.count ?? 0),
      lastCompleteReindex:
        latest[0] && asString(latest[0].event_type) === "reindex" ? asString(latest[0].created_at) : "",
      lastSearchDurationMs: Number(latest[0]?.duration_ms ?? 0),
      safeMessage: asString(latest[0]?.safe_message) || "Search index has not run yet.",
    };
  }

  async listCareerCopilotThreads(includeArchived = false) {
    const sql = includeArchived
      ? "SELECT * FROM career_copilot_threads ORDER BY updated_at DESC"
      : "SELECT * FROM career_copilot_threads WHERE archived_at = '' ORDER BY updated_at DESC";
    return (await this.db.select<Row[]>(sql)).map(mapCareerCopilotThread);
  }

  async getCareerCopilotThread(id: string) {
    const rows = await this.db.select<Row[]>("SELECT * FROM career_copilot_threads WHERE id = $1", [id]);
    return rows[0] ? mapCareerCopilotThread(rows[0]) : null;
  }

  async saveCareerCopilotThread(
    thread: Partial<CareerCopilotThread> & Pick<CareerCopilotThread, "title">,
  ) {
    const existing = thread.id ? await this.getCareerCopilotThread(thread.id) : null;
    const now = nowIso();
    const saved: CareerCopilotThread = {
      id: existing?.id ?? thread.id ?? createId("copilot-thread"),
      title: thread.title,
      activeContextType: thread.activeContextType ?? existing?.activeContextType ?? "all",
      activeContextId: thread.activeContextId ?? existing?.activeContextId ?? "",
      summary: thread.summary ?? existing?.summary ?? "",
      createdAt: existing?.createdAt ?? thread.createdAt ?? now,
      updatedAt: now,
      archivedAt: thread.archivedAt ?? existing?.archivedAt ?? "",
    };
    await this.db.execute(
      `INSERT INTO career_copilot_threads (
        id, title, active_context_type, active_context_id, summary, created_at, updated_at, archived_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        active_context_type = excluded.active_context_type,
        active_context_id = excluded.active_context_id,
        summary = excluded.summary,
        updated_at = excluded.updated_at,
        archived_at = excluded.archived_at`,
      [
        saved.id,
        saved.title,
        saved.activeContextType,
        saved.activeContextId,
        saved.summary,
        saved.createdAt,
        saved.updatedAt,
        saved.archivedAt,
      ],
    );
    return saved;
  }

  async archiveCareerCopilotThread(id: string) {
    await this.db.execute(
      "UPDATE career_copilot_threads SET archived_at = $1, updated_at = $1 WHERE id = $2",
      [nowIso(), id],
    );
  }

  async deleteCareerCopilotThread(id: string) {
    await this.db.execute("DELETE FROM career_copilot_threads WHERE id = $1", [id]);
  }

  async listCareerCopilotMessages(threadId: string) {
    return (
      await this.db.select<Row[]>(
        "SELECT * FROM career_copilot_messages WHERE thread_id = $1 ORDER BY created_at",
        [threadId],
      )
    ).map(mapCareerCopilotMessage);
  }

  async saveCareerCopilotMessage(message: CareerCopilotMessage) {
    await this.db.execute(
      `INSERT INTO career_copilot_messages (
        id, thread_id, role, content, structured_content_json, tool_calls_json,
        internal_citations_json, pending_actions_json, provider, model, prompt_version,
        token_usage_json, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        structured_content_json = excluded.structured_content_json,
        tool_calls_json = excluded.tool_calls_json,
        internal_citations_json = excluded.internal_citations_json,
        pending_actions_json = excluded.pending_actions_json,
        token_usage_json = excluded.token_usage_json`,
      [
        message.id,
        message.threadId,
        message.role,
        message.content,
        JSON.stringify(message.structuredContentJson),
        JSON.stringify(message.toolCallsJson),
        JSON.stringify(message.internalCitationsJson),
        JSON.stringify(message.pendingActionsJson),
        message.provider,
        message.model,
        message.promptVersion,
        JSON.stringify(message.tokenUsageJson),
        message.createdAt,
      ],
    );
    await this.db.execute("UPDATE career_copilot_threads SET updated_at = $1 WHERE id = $2", [
      message.createdAt,
      message.threadId,
    ]);
    return message;
  }

  async confirmCareerCopilotAction(action: CareerCopilotPendingAction) {
    const confirmed = { ...action, status: "confirmed" as const, resolvedAt: nowIso() };
    await this.db.execute("BEGIN IMMEDIATE");
    try {
      await this.applyConfirmedAction(confirmed);
      await this.replacePendingAction(confirmed);
      await this.db.execute("COMMIT");
      return confirmed;
    } catch (caught) {
      await this.db.execute("ROLLBACK").catch(() => undefined);
      throw caught;
    }
  }

  async cancelCareerCopilotAction(action: CareerCopilotPendingAction) {
    const cancelled = { ...action, status: "cancelled" as const, resolvedAt: nowIso() };
    await this.replacePendingAction(cancelled);
    return cancelled;
  }

  async listResumeRecommendations(targetJobId?: string) {
    const rows = targetJobId
      ? await this.db.select<Row[]>(
          "SELECT * FROM resume_recommendations WHERE target_job_id = $1 ORDER BY overall_score DESC, created_at DESC",
          [targetJobId],
        )
      : await this.db.select<Row[]>(
          "SELECT * FROM resume_recommendations ORDER BY overall_score DESC, created_at DESC",
        );
    return rows.map(mapResumeRecommendation);
  }

  async saveResumeRecommendation(recommendation: ResumeRecommendation) {
    await this.db.execute(
      `INSERT INTO resume_recommendations (
        id, target_job_id, candidate_resume_version_id, overall_score, role_score,
        skill_score, responsibility_score, evidence_score, career_item_score,
        recency_score, validation_score, explanation_json, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT(target_job_id, candidate_resume_version_id) DO UPDATE SET
        overall_score = excluded.overall_score,
        role_score = excluded.role_score,
        skill_score = excluded.skill_score,
        responsibility_score = excluded.responsibility_score,
        evidence_score = excluded.evidence_score,
        career_item_score = excluded.career_item_score,
        recency_score = excluded.recency_score,
        validation_score = excluded.validation_score,
        explanation_json = excluded.explanation_json,
        created_at = excluded.created_at`,
      [
        recommendation.id,
        recommendation.targetJobId,
        recommendation.candidateResumeVersionId,
        recommendation.overallScore,
        recommendation.roleScore,
        recommendation.skillScore,
        recommendation.responsibilityScore,
        recommendation.evidenceScore,
        recommendation.careerItemScore,
        recommendation.recencyScore,
        recommendation.validationScore,
        JSON.stringify(recommendation.explanationJson),
        recommendation.createdAt,
      ],
    );
    return recommendation;
  }

  async dismissResumeRecommendation(id: string) {
    const recommendation = (await this.listResumeRecommendations()).find((item) => item.id === id);
    if (!recommendation) return;
    await this.saveResumeRecommendation({
      ...recommendation,
      explanationJson: { ...recommendation.explanationJson, dismissed: true },
    });
  }

  async listResumeFavorites(): Promise<ResumeFavorite[]> {
    return (await this.db.select<Row[]>("SELECT * FROM resume_favorites ORDER BY created_at DESC")).map((row) => ({
      resumeVersionId: asString(row.resume_version_id),
      createdAt: asString(row.created_at),
    }));
  }

  async setResumeFavorite(resumeVersionId: string, favorite: boolean) {
    if (favorite) {
      await this.db.execute(
        "INSERT OR REPLACE INTO resume_favorites (resume_version_id, created_at) VALUES ($1,$2)",
        [resumeVersionId, nowIso()],
      );
    } else {
      await this.db.execute("DELETE FROM resume_favorites WHERE resume_version_id = $1", [resumeVersionId]);
    }
  }

  async listResumeArchives(): Promise<ResumeArchive[]> {
    return (await this.db.select<Row[]>("SELECT * FROM resume_archives ORDER BY archived_at DESC")).map((row) => ({
      resumeVersionId: asString(row.resume_version_id),
      archivedAt: asString(row.archived_at),
    }));
  }

  async setResumeArchived(resumeVersionId: string, archived: boolean) {
    if (archived) {
      await this.db.execute(
        "INSERT OR REPLACE INTO resume_archives (resume_version_id, archived_at) VALUES ($1,$2)",
        [resumeVersionId, nowIso()],
      );
    } else {
      await this.db.execute("DELETE FROM resume_archives WHERE resume_version_id = $1", [resumeVersionId]);
    }
  }

  async listSavedApplicationAnswers(jobId?: string) {
    const rows = jobId
      ? await this.db.select<Row[]>(
          "SELECT * FROM saved_application_answers WHERE job_id = $1 ORDER BY created_at DESC",
          [jobId],
        )
      : await this.db.select<Row[]>(
          "SELECT * FROM saved_application_answers ORDER BY created_at DESC",
        );
    return rows.map(mapSavedApplicationAnswer);
  }

  async saveApplicationAnswer(answer: SavedApplicationAnswer) {
    await this.db.execute(
      `INSERT INTO saved_application_answers (
        id, job_id, application_id, question, answer, source_fact_ids_json,
        source_citation_ids_json, approval_status, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT(id) DO UPDATE SET
        job_id = excluded.job_id,
        application_id = excluded.application_id,
        question = excluded.question,
        answer = excluded.answer,
        source_fact_ids_json = excluded.source_fact_ids_json,
        source_citation_ids_json = excluded.source_citation_ids_json,
        approval_status = excluded.approval_status,
        updated_at = excluded.updated_at`,
      [
        answer.id,
        answer.jobId,
        answer.applicationId,
        answer.question,
        answer.answer,
        JSON.stringify(answer.sourceFactIds),
        JSON.stringify(answer.sourceCitationIds),
        answer.approvalStatus,
        answer.createdAt,
        answer.updatedAt,
      ],
    );
    return answer;
  }

  private async saveCareerImportRecord(record: CareerImportRecord) {
    await this.db.execute(
      `INSERT INTO career_imports (
        id, source_type, source_title, source_reference, created_at, approved_count,
        rejected_count, merged_count, records_created_json, records_updated_json,
        safe_source_hash, provider, model, prompt_version, undo_snapshot_json, undone_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT(id) DO UPDATE SET
        source_type = excluded.source_type,
        source_title = excluded.source_title,
        source_reference = excluded.source_reference,
        approved_count = excluded.approved_count,
        rejected_count = excluded.rejected_count,
        merged_count = excluded.merged_count,
        records_created_json = excluded.records_created_json,
        records_updated_json = excluded.records_updated_json,
        safe_source_hash = excluded.safe_source_hash,
        provider = excluded.provider,
        model = excluded.model,
        prompt_version = excluded.prompt_version,
        undo_snapshot_json = excluded.undo_snapshot_json,
        undone_at = excluded.undone_at`,
      [
        record.id,
        record.sourceType,
        record.sourceTitle,
        record.sourceReference,
        record.createdAt,
        record.approvedCount,
        record.rejectedCount,
        record.mergedCount,
        JSON.stringify(record.recordsCreated),
        JSON.stringify(record.recordsUpdated),
        record.safeSourceHash,
        record.provider,
        record.model,
        record.promptVersion,
        JSON.stringify(record.undoSnapshotJson),
        record.undoneAt,
      ],
    );
  }

  private async persistCareerImportChanges(state: {
    profile: Profile | null;
    careerItems: CareerItem[];
    careerFacts: CareerFact[];
    skills: Skill[];
    record: CareerImportRecord;
  }) {
    const changed = new Set([...state.record.recordsCreated, ...state.record.recordsUpdated]);
    if ([...changed].some((entry) => entry.startsWith("profile:")) && state.profile) {
      await this.saveProfile(state.profile);
    }
    for (const entry of changed) {
      const [table, id] = entry.split(":");
      if (table !== "career_items") continue;
      const item = state.careerItems.find((candidate) => candidate.id === id);
      if (item) await this.saveCareerItem(item);
    }
    for (const entry of changed) {
      const [table, id] = entry.split(":");
      if (table !== "skills") continue;
      const skill = state.skills.find((candidate) => candidate.id === id);
      if (skill) await this.saveSkill(skill);
    }
    for (const entry of changed) {
      const [table, id] = entry.split(":");
      if (table !== "career_facts") continue;
      const fact = state.careerFacts.find((candidate) => candidate.id === id);
      if (fact) await this.saveCareerFact(fact);
    }
  }

  private async undoCareerImportRecord(record: CareerImportRecord) {
    for (const entry of record.recordsCreated) {
      const [table, id] = entry.split(":");
      if (table === "career_facts") await this.deleteCareerFact(id);
    }
    for (const entry of record.recordsCreated) {
      const [table, id] = entry.split(":");
      if (table === "career_items") await this.deleteCareerItem(id);
    }
    for (const entry of record.recordsCreated) {
      const [table, id] = entry.split(":");
      if (table === "skills") await this.deleteSkill(id);
    }

    const snapshot = record.undoSnapshotJson;
    for (const entry of record.recordsUpdated) {
      const [table, id] = entry.split(":");
      if (table === "profile") {
        if (snapshot.profile) {
          await this.saveProfile(snapshot.profile);
        } else {
          await this.db.execute("DELETE FROM profile WHERE id = $1", [id]);
        }
      }
      if (table === "career_items") {
        const item = snapshot.careerItems.find((candidate) => candidate.id === id);
        if (item) await this.saveCareerItem(item);
      }
      if (table === "skills") {
        const skill = snapshot.skills.find((candidate) => candidate.id === id);
        if (skill) await this.saveSkill(skill);
      }
    }
    for (const entry of record.recordsUpdated) {
      const [table, id] = entry.split(":");
      if (table !== "career_facts") continue;
      const fact = snapshot.careerFacts.find((candidate) => candidate.id === id);
      if (fact) await this.saveCareerFact(fact);
    }
  }

  private async detectFts5() {
    try {
      await this.db.execute("CREATE VIRTUAL TABLE temp.careercompiler_fts_probe USING fts5(value)");
      await this.db.execute("DROP TABLE temp.careercompiler_fts_probe");
      return true;
    } catch {
      return false;
    }
  }

  private async rebuildFtsIndex(documents: SearchDocument[]) {
    try {
      await this.db.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS search_documents_fts USING fts5(id UNINDEXED, title, normalized_text)",
      );
      await this.db.execute("DELETE FROM search_documents_fts");
      for (const document of documents) {
        await this.db.execute(
          "INSERT INTO search_documents_fts (id, title, normalized_text) VALUES ($1,$2,$3)",
          [document.id, document.title, document.normalizedText],
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  private async applyConfirmedAction(action: CareerCopilotPendingAction) {
    if (action.type === "update_application_status") {
      const applicationId = String(action.afterJson.applicationId ?? action.recordsAffected[0]?.entityId ?? "");
      const application = await this.getApplication(applicationId);
      if (!application) throw new Error("copilot_action_missing_application|The target application no longer exists.");
      await this.saveApplication({
        ...application,
        status: String(action.afterJson.status ?? application.status) as ApplicationRecord["status"],
        appliedDate: String(action.afterJson.appliedDate ?? application.appliedDate),
        nextAction: String(action.afterJson.nextAction ?? application.nextAction),
      });
      return;
    }
    if (action.type === "add_application_note") {
      const applicationId = String(action.afterJson.applicationId ?? action.recordsAffected[0]?.entityId ?? "");
      const note = String(action.afterJson.note ?? "");
      const application = await this.getApplication(applicationId);
      if (!application) throw new Error("copilot_action_missing_application|The target application no longer exists.");
      await this.saveApplication({
        ...application,
        notes: [application.notes, note].filter(Boolean).join(application.notes ? "\n" : ""),
      });
      return;
    }
    if (action.type === "link_resume_to_application") {
      const applicationId = String(action.afterJson.applicationId ?? action.recordsAffected[0]?.entityId ?? "");
      const application = await this.getApplication(applicationId);
      if (!application) throw new Error("copilot_action_missing_application|The target application no longer exists.");
      await this.saveApplication({
        ...application,
        resumeVersionId: String(action.afterJson.resumeVersionId ?? application.resumeVersionId),
        submittedResumeVersionId: String(action.afterJson.submittedResumeVersionId ?? application.submittedResumeVersionId),
        submittedPdfPath: String(action.afterJson.submittedPdfPath ?? application.submittedPdfPath),
        submittedPdfHash: String(action.afterJson.submittedPdfHash ?? application.submittedPdfHash),
      });
      return;
    }
    if (action.type === "favorite_resume") {
      await this.setResumeFavorite(String(action.afterJson.resumeVersionId ?? action.recordsAffected[0]?.entityId ?? ""), true);
      return;
    }
    if (action.type === "archive_resume") {
      await this.setResumeArchived(String(action.afterJson.resumeVersionId ?? action.recordsAffected[0]?.entityId ?? ""), true);
      return;
    }
    if (action.type === "save_approved_answer") {
      await this.saveApplicationAnswer({
        id: String(action.afterJson.id ?? createId("answer")),
        jobId: String(action.afterJson.jobId ?? ""),
        applicationId: String(action.afterJson.applicationId ?? ""),
        question: String(action.afterJson.question ?? ""),
        answer: String(action.afterJson.answer ?? ""),
        sourceFactIds: Array.isArray(action.afterJson.sourceFactIds) ? action.afterJson.sourceFactIds.map(String) : [],
        sourceCitationIds: Array.isArray(action.afterJson.sourceCitationIds) ? action.afterJson.sourceCitationIds.map(String) : [],
        approvalStatus: "approved",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      return;
    }
    if (action.type === "create_job_from_chat") {
      await this.saveJob({
        company: String(action.afterJson.company ?? ""),
        roleTitle: String(action.afterJson.roleTitle ?? ""),
        sourceUrl: String(action.afterJson.sourceUrl ?? ""),
        rawDescription: String(action.afterJson.rawDescription ?? ""),
      });
      return;
    }
    if (action.type === "create_resume_from_base") {
      const base = await this.getResumeVersion(String(action.afterJson.baseResumeVersionId ?? ""));
      if (!base) throw new Error("copilot_action_missing_resume|The base resume no longer exists.");
      await this.saveResumeVersion({
        ...base,
        id: undefined,
        jobId: String(action.afterJson.targetJobId ?? base.jobId),
        name: String(action.afterJson.name ?? `${base.name} - child draft`),
        status: "draft",
        lastExportPath: "",
        parentResumeVersionId: base.id,
        createdAt: undefined,
        updatedAt: undefined,
      });
      return;
    }
    throw new Error("copilot_action_not_supported|This proposed write action is not implemented.");
  }

  private async replacePendingAction(action: CareerCopilotPendingAction) {
    const messages = await this.listCareerCopilotMessages(action.threadId);
    for (const message of messages) {
      if (!message.pendingActionsJson.some((pending) => pending.id === action.id)) continue;
      await this.saveCareerCopilotMessage({
        ...message,
        pendingActionsJson: message.pendingActionsJson.map((pending) =>
          pending.id === action.id ? action : pending,
        ),
      });
    }
  }

  private async countSeedRows() {
    const rows = await this.db.select<Array<{ count: number }>>(
      "SELECT (SELECT COUNT(*) FROM profile) + (SELECT COUNT(*) FROM career_items) + (SELECT COUNT(*) FROM career_facts) + (SELECT COUNT(*) FROM skills) AS count",
    );
    return Number(rows[0]?.count ?? 0);
  }

  private async nextCareerOrder() {
    const rows = await this.db.select<Array<{ next_order: number }>>(
      "SELECT COALESCE(MAX(display_order), 0) + 10 AS next_order FROM career_items",
    );
    return Number(rows[0]?.next_order ?? 10);
  }
}
