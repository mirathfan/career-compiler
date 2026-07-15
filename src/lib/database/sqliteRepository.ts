import type Database from "@tauri-apps/plugin-sql";
import type {
  AppSettings,
  ApprovedBulletVariant,
  BackupPayload,
  CareerFact,
  CareerItem,
  DashboardMetrics,
  FactUsage,
  Job,
  Profile,
  ResumeVersion,
  Skill,
} from "../../types/domain";
import { createId, nowIso } from "../utils";
import {
  emptyGenerationMetadata,
  normalizeGenerationMetadata,
  normalizeTailoredResume,
  normalizeValidationIssues,
} from "../resume/normalize";
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
    for (const migration of migrations) {
      const existing = await this.db.select<Row[]>("SELECT id FROM schema_migrations WHERE id = $1", [
        migration.id,
      ]);
      if (existing.length > 0) {
        continue;
      }
      for (const statement of splitStatements(migration.sql)) {
        await this.db.execute(statement);
      }
      await this.db.execute(
        "INSERT OR IGNORE INTO schema_migrations (id, name, applied_at) VALUES ($1, $2, $3)",
        [migration.id, migration.name, nowIso()],
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
      skillTags: fact.skillTags ?? mapped?.skillTags ?? [],
      roleTags: fact.roleTags ?? mapped?.roleTags ?? [],
      metricTokens: fact.metricTokens ?? mapped?.metricTokens ?? [],
      importance: fact.importance ?? mapped?.importance ?? 3,
      enabled: fact.enabled ?? mapped?.enabled ?? true,
      createdAt: mapped?.createdAt ?? fact.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.execute(
      `INSERT INTO career_facts VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(id) DO UPDATE SET
        career_item_id = excluded.career_item_id, statement = excluded.statement,
        evidence_status = excluded.evidence_status, source_note = excluded.source_note,
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
        prompt_version, generation_metadata_json, deterministic_baseline_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT(id) DO UPDATE SET
        job_id = excluded.job_id, name = excluded.name, template_id = excluded.template_id,
        content_json = excluded.content_json, validation_json = excluded.validation_json,
        status = excluded.status, last_export_path = excluded.last_export_path,
        parent_resume_version_id = excluded.parent_resume_version_id,
        generation_provider = excluded.generation_provider,
        generation_model = excluded.generation_model,
        prompt_version = excluded.prompt_version,
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
    };
  }

  async saveSettings(settings: AppSettings) {
    await this.db.execute(
      `INSERT INTO app_settings (
        id, ai_provider, model_name, default_template_id, default_export_directory, tailoring_defaults_json
      ) VALUES ('default', $1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET
        ai_provider = excluded.ai_provider,
        model_name = excluded.model_name,
        default_template_id = excluded.default_template_id,
        default_export_directory = excluded.default_export_directory,
        tailoring_defaults_json = excluded.tailoring_defaults_json`,
      [
        settings.aiProvider,
        settings.modelName,
        settings.defaultTemplateId,
        settings.defaultExportDirectory,
        JSON.stringify(settings.tailoringDefaults),
      ],
    );
    return settings;
  }

  async exportBackup(): Promise<BackupPayload> {
    return {
      profile: await this.getProfile(),
      careerItems: await this.listCareerItems(),
      careerFacts: await this.listCareerFacts(),
      skills: await this.listSkills(),
      jobs: await this.listJobs(),
      resumes: await this.listResumeVersions(),
      approvedVariants: await this.listApprovedBulletVariants(),
      settings: await this.getSettings(),
      exportedAt: nowIso(),
      schemaVersion: 2,
    };
  }

  async importBackup(payload: BackupPayload) {
    await this.resetSampleData();
    await this.db.execute("DELETE FROM resume_versions");
    await this.db.execute("DELETE FROM jobs");
    await this.db.execute("DELETE FROM career_facts");
    await this.db.execute("DELETE FROM career_items");
    await this.db.execute("DELETE FROM skills");
    await this.db.execute("DELETE FROM profile");
    if (payload.profile) {
      await this.saveProfile(payload.profile);
    }
    for (const item of payload.careerItems) await this.saveCareerItem(item);
    for (const fact of payload.careerFacts) await this.saveCareerFact(fact);
    for (const skill of payload.skills) await this.saveSkill(skill);
    for (const job of payload.jobs) await this.saveJob(job);
    for (const resume of payload.resumes) await this.saveResumeVersion(resume);
    for (const variant of payload.approvedVariants ?? []) await this.saveApprovedBulletVariant(variant);
    await this.saveSettings(payload.settings);
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
