import type {
  AppSettings,
  ApplicationRecord,
  ApprovedBulletVariant,
  BackupPayload,
  CareerFact,
  CareerItem,
  DashboardMetrics,
  EvaluationSummary,
  FactUsage,
  Job,
  MigrationEvent,
  Profile,
  ResumeVersion,
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
import { defaultSettings, seedCareerFacts, seedCareerItems, seedProfile, seedSkills } from "./seed";
import type { AppRepository, ApprovedVariantFilters, CareerFactFilters } from "./repository";

interface MemoryState {
  profile: Profile | null;
  careerItems: CareerItem[];
  careerFacts: CareerFact[];
  skills: Skill[];
  jobs: Job[];
  resumes: ResumeVersion[];
  approvedVariants: ApprovedBulletVariant[];
  applications: ApplicationRecord[];
  evaluationSummaries: EvaluationSummary[];
  migrationEvents: MigrationEvent[];
  settings: AppSettings;
}

function emptyState(): MemoryState {
  return {
    profile: null,
    careerItems: [],
    careerFacts: [],
    skills: [],
    jobs: [],
    resumes: [],
    approvedVariants: [],
    applications: [],
    evaluationSummaries: [],
    migrationEvents: [],
    settings: clone(defaultSettings),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function includesSearch(value: string, search: string) {
  return value.toLowerCase().includes(search.toLowerCase());
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, item);
  return [...merged.values()];
}

export class MemoryRepository implements AppRepository {
  private state: MemoryState;
  private readonly persistKey?: string;

  constructor(initial?: Partial<MemoryState>, persistKey?: string) {
    this.persistKey = persistKey;
    this.state = { ...emptyState(), ...clone(initial ?? {}) };
  }

  async initialize() {
    if (!this.persistKey || typeof localStorage === "undefined") {
      return;
    }
    const existing = localStorage.getItem(this.persistKey);
    if (existing) {
      const stored = JSON.parse(existing) as Partial<MemoryState>;
      this.state = {
        ...emptyState(),
        ...stored,
        approvedVariants: stored.approvedVariants ?? [],
        applications: stored.applications ?? [],
        evaluationSummaries: stored.evaluationSummaries ?? [],
        migrationEvents: stored.migrationEvents ?? [],
        careerFacts: (stored.careerFacts ?? []).map((fact) => ({
          ...fact,
          sourceType: fact.sourceType ?? "user_statement",
          sourceReference: fact.sourceReference ?? fact.sourceNote ?? "",
          verificationDate: fact.verificationDate ?? "",
          lastReviewedDate: fact.lastReviewedDate ?? "",
          notes: fact.notes ?? "",
        })),
        settings: {
          ...defaultSettings,
          ...(stored.settings ?? {}),
          tailoringDefaults: {
            ...defaultSettings.tailoringDefaults,
            ...(stored.settings?.tailoringDefaults ?? {}),
          },
          templateSettings: {
            ...defaultSettings.templateSettings,
            ...(stored.settings?.templateSettings ?? {}),
          },
          uiState: {
            ...defaultSettings.uiState,
            ...(stored.settings?.uiState ?? {}),
          },
        },
        resumes: (stored.resumes ?? []).map((resume) => ({
          ...resume,
          contentJson: normalizeTailoredResume(resume.contentJson),
          validationJson: normalizeValidationIssues(resume.validationJson),
          parentResumeVersionId: resume.parentResumeVersionId ?? "",
          generationProvider: resume.generationProvider ?? "deterministic",
          generationModel: resume.generationModel ?? "",
          promptVersion: resume.promptVersion ?? "",
          promptVersionsJson: resume.promptVersionsJson ?? PROMPT_VERSIONS,
          layoutProfileId: resume.layoutProfileId ?? "general-software-engineer",
          templateSettingsJson: resume.templateSettingsJson ?? defaultSettings.templateSettings,
          generationMetadataJson: normalizeGenerationMetadata(resume.generationMetadataJson),
          deterministicBaselineJson: resume.deterministicBaselineJson
            ? normalizeTailoredResume(resume.deterministicBaselineJson)
            : null,
        })),
      };
      return;
    }
    this.persist();
  }

  async seedSampleData() {
    let inserted = 0;
    let updated = 0;
    const upsert = <T extends { id: string }>(items: T[], item: T) => {
      const index = items.findIndex((existing) => existing.id === item.id);
      if (index === -1) {
        items.push(clone(item));
        inserted += 1;
      } else {
        items[index] = { ...items[index], ...clone(item) };
        updated += 1;
      }
    };

    if (this.state.profile?.id === seedProfile.id) {
      this.state.profile = { ...this.state.profile, ...clone(seedProfile), updatedAt: nowIso() };
      updated += 1;
    } else {
      this.state.profile = { ...clone(seedProfile), updatedAt: nowIso() };
      inserted += 1;
    }
    seedCareerItems.forEach((item) => upsert(this.state.careerItems, item));
    seedCareerFacts.forEach((fact) => upsert(this.state.careerFacts, fact));
    seedSkills.forEach((skill) => upsert(this.state.skills, skill));
    this.persist();
    return { inserted, updated };
  }

  async resetSampleData() {
    this.state = emptyState();
    await this.seedSampleData();
  }

  async getProfile() {
    return clone(this.state.profile);
  }

  async saveProfile(profile: Profile) {
    const saved = { ...profile, updatedAt: nowIso() };
    this.state.profile = clone(saved);
    this.persist();
    return clone(saved);
  }

  async listCareerItems() {
    return clone(
      this.state.careerItems.sort(
        (a, b) => a.displayOrder - b.displayOrder || a.title.localeCompare(b.title),
      ),
    );
  }

  async saveCareerItem(item: Partial<CareerItem> & Pick<CareerItem, "type" | "title">) {
    const now = nowIso();
    const existing = item.id
      ? this.state.careerItems.find((careerItem) => careerItem.id === item.id)
      : undefined;
    const saved: CareerItem = {
      id: existing?.id ?? item.id ?? createId("career-item"),
      type: item.type,
      title: item.title,
      organization: item.organization ?? existing?.organization ?? "",
      location: item.location ?? existing?.location ?? "",
      startDate: item.startDate ?? existing?.startDate ?? "",
      endDate: item.endDate ?? existing?.endDate ?? "",
      isCurrent: item.isCurrent ?? existing?.isCurrent ?? false,
      shortDescription: item.shortDescription ?? existing?.shortDescription ?? "",
      url: item.url ?? existing?.url ?? "",
      repositoryUrl: item.repositoryUrl ?? existing?.repositoryUrl ?? "",
      displayOrder:
        item.displayOrder ?? existing?.displayOrder ?? this.state.careerItems.length * 10 + 10,
      enabled: item.enabled ?? existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.state.careerItems = [
      ...this.state.careerItems.filter((careerItem) => careerItem.id !== saved.id),
      saved,
    ];
    this.persist();
    return clone(saved);
  }

  async deleteCareerItem(id: string) {
    this.state.careerItems = this.state.careerItems.filter((item) => item.id !== id);
    this.state.careerFacts = this.state.careerFacts.filter((fact) => fact.careerItemId !== id);
    this.persist();
  }

  async updateCareerItemOrder(ids: string[]) {
    this.state.careerItems = this.state.careerItems.map((item) => {
      const index = ids.indexOf(item.id);
      return index === -1 ? item : { ...item, displayOrder: (index + 1) * 10, updatedAt: nowIso() };
    });
    this.persist();
  }

  async listCareerFacts(filters: CareerFactFilters = {}) {
    let facts = [...this.state.careerFacts];
    if (filters.evidenceStatus) {
      facts = facts.filter((fact) => fact.evidenceStatus === filters.evidenceStatus);
    }
    if (filters.search) {
      facts = facts.filter(
        (fact) =>
          includesSearch(fact.statement, filters.search ?? "") ||
          fact.skillTags.some((tag) => includesSearch(tag, filters.search ?? "")) ||
          fact.roleTags.some((tag) => includesSearch(tag, filters.search ?? "")),
      );
    }
    return clone(facts.sort((a, b) => b.importance - a.importance || a.statement.localeCompare(b.statement)));
  }

  async listFactsForItem(careerItemId: string) {
    return clone(
      this.state.careerFacts
        .filter((fact) => fact.careerItemId === careerItemId)
        .sort((a, b) => b.importance - a.importance || a.statement.localeCompare(b.statement)),
    );
  }

  async saveCareerFact(fact: Partial<CareerFact> & Pick<CareerFact, "careerItemId" | "statement">) {
    const now = nowIso();
    const existing = fact.id
      ? this.state.careerFacts.find((careerFact) => careerFact.id === fact.id)
      : undefined;
    const saved: CareerFact = {
      id: existing?.id ?? fact.id ?? createId("career-fact"),
      careerItemId: fact.careerItemId,
      statement: fact.statement,
      evidenceStatus: fact.evidenceStatus ?? existing?.evidenceStatus ?? "user_provided",
      sourceNote: fact.sourceNote ?? existing?.sourceNote ?? "",
      sourceType: fact.sourceType ?? existing?.sourceType ?? "user_statement",
      sourceReference: fact.sourceReference ?? existing?.sourceReference ?? "",
      verificationDate: fact.verificationDate ?? existing?.verificationDate ?? "",
      lastReviewedDate: fact.lastReviewedDate ?? existing?.lastReviewedDate ?? "",
      notes: fact.notes ?? existing?.notes ?? "",
      skillTags: fact.skillTags ?? existing?.skillTags ?? [],
      roleTags: fact.roleTags ?? existing?.roleTags ?? [],
      metricTokens: fact.metricTokens ?? existing?.metricTokens ?? [],
      importance: fact.importance ?? existing?.importance ?? 3,
      enabled: fact.enabled ?? existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.state.careerFacts = [
      ...this.state.careerFacts.filter((careerFact) => careerFact.id !== saved.id),
      saved,
    ];
    this.persist();
    return clone(saved);
  }

  async deleteCareerFact(id: string) {
    this.state.careerFacts = this.state.careerFacts.filter((fact) => fact.id !== id);
    this.persist();
  }

  async bulkUpdateCareerFacts(
    ids: string[],
    changes: Partial<Pick<CareerFact, "enabled" | "evidenceStatus">>,
  ) {
    const selected = new Set(ids);
    this.state.careerFacts = this.state.careerFacts.map((fact) =>
      selected.has(fact.id) ? { ...fact, ...changes, updatedAt: nowIso() } : fact,
    );
    this.persist();
  }

  async listSkills() {
    return clone(this.state.skills.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
  }

  async saveSkill(skill: Partial<Skill> & Pick<Skill, "name" | "category">) {
    const existing = skill.id
      ? this.state.skills.find((item) => item.id === skill.id)
      : this.state.skills.find((item) => item.name.toLowerCase() === skill.name.toLowerCase());
    const saved: Skill = {
      id: existing?.id ?? skill.id ?? createId("skill"),
      name: skill.name,
      category: skill.category,
      proficiencyNote: skill.proficiencyNote ?? existing?.proficiencyNote ?? "",
      enabled: skill.enabled ?? existing?.enabled ?? true,
    };
    this.state.skills = [...this.state.skills.filter((item) => item.id !== saved.id), saved];
    this.persist();
    return clone(saved);
  }

  async deleteSkill(id: string) {
    this.state.skills = this.state.skills.filter((skill) => skill.id !== id);
    this.persist();
  }

  async listJobs() {
    return clone(this.state.jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async getJob(id: string) {
    return clone(this.state.jobs.find((job) => job.id === id) ?? null);
  }

  async saveJob(job: Partial<Job> & Pick<Job, "rawDescription">) {
    const now = nowIso();
    const existing = job.id ? this.state.jobs.find((item) => item.id === job.id) : undefined;
    const saved: Job = {
      id: existing?.id ?? job.id ?? createId("job"),
      company: job.company ?? existing?.company ?? "",
      roleTitle: job.roleTitle ?? existing?.roleTitle ?? "",
      sourceUrl: job.sourceUrl ?? existing?.sourceUrl ?? "",
      rawDescription: job.rawDescription,
      analysisJson: job.analysisJson ?? existing?.analysisJson ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.state.jobs = [...this.state.jobs.filter((item) => item.id !== saved.id), saved];
    this.persist();
    return clone(saved);
  }

  async listResumeVersions() {
    return clone(this.state.resumes.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async getResumeVersion(id: string) {
    return clone(this.state.resumes.find((resume) => resume.id === id) ?? null);
  }

  async saveResumeVersion(resume: Partial<ResumeVersion> & Pick<ResumeVersion, "jobId" | "contentJson">) {
    const now = nowIso();
    const existing = resume.id
      ? this.state.resumes.find((item) => item.id === resume.id)
      : undefined;
    const saved: ResumeVersion = {
      id: existing?.id ?? resume.id ?? createId("resume"),
      jobId: resume.jobId,
      name: resume.name ?? existing?.name ?? "Tailored resume",
      templateId: resume.templateId ?? existing?.templateId ?? defaultSettings.defaultTemplateId,
      contentJson: resume.contentJson,
      validationJson: resume.validationJson ?? existing?.validationJson ?? [],
      status: resume.status ?? existing?.status ?? "draft",
      lastExportPath: resume.lastExportPath ?? existing?.lastExportPath ?? "",
      parentResumeVersionId: resume.parentResumeVersionId ?? existing?.parentResumeVersionId ?? "",
      generationProvider: resume.generationProvider ?? existing?.generationProvider ?? "deterministic",
      generationModel: resume.generationModel ?? existing?.generationModel ?? "",
      promptVersion: resume.promptVersion ?? existing?.promptVersion ?? "",
      promptVersionsJson: resume.promptVersionsJson ?? existing?.promptVersionsJson ?? PROMPT_VERSIONS,
      layoutProfileId:
        resume.layoutProfileId ?? existing?.layoutProfileId ?? "general-software-engineer",
      templateSettingsJson:
        resume.templateSettingsJson ?? existing?.templateSettingsJson ?? defaultSettings.templateSettings,
      generationMetadataJson:
        resume.generationMetadataJson ?? existing?.generationMetadataJson ?? emptyGenerationMetadata,
      deterministicBaselineJson:
        resume.deterministicBaselineJson ?? existing?.deterministicBaselineJson ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.state.resumes = [...this.state.resumes.filter((item) => item.id !== saved.id), saved];
    this.persist();
    return clone(saved);
  }

  async deleteResumeVersion(id: string) {
    this.state.resumes = this.state.resumes.filter((resume) => resume.id !== id);
    this.persist();
  }

  async listApprovedBulletVariants(filters: ApprovedVariantFilters = {}) {
    const factIds = filters.factIds ? new Set(filters.factIds) : null;
    const roles = filters.roleCategories
      ? new Set(filters.roleCategories.map((role) => role.toLowerCase()))
      : null;
    return clone(
      this.state.approvedVariants
        .filter((variant) => !filters.careerItemId || variant.careerItemId === filters.careerItemId)
        .filter((variant) => !factIds || variant.sourceFactIds.every((factId) => factIds.has(factId)))
        .filter(
          (variant) =>
            !roles ||
            variant.roleCategories.length === 0 ||
            variant.roleCategories.some((role) => roles.has(role.toLowerCase())),
        )
        .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt)),
    );
  }

  async saveApprovedBulletVariant(
    variant: Partial<ApprovedBulletVariant> &
      Pick<ApprovedBulletVariant, "careerItemId" | "sourceFactIds" | "text">,
  ) {
    const now = nowIso();
    const existing = variant.id
      ? this.state.approvedVariants.find((item) => item.id === variant.id)
      : undefined;
    const saved: ApprovedBulletVariant = {
      id: existing?.id ?? variant.id ?? createId("approved-variant"),
      careerItemId: variant.careerItemId,
      sourceFactIds: variant.sourceFactIds,
      text: variant.text,
      roleCategories: variant.roleCategories ?? existing?.roleCategories ?? [],
      skillTags: variant.skillTags ?? existing?.skillTags ?? [],
      targetJobId: variant.targetJobId ?? existing?.targetJobId ?? "",
      creationSource: variant.creationSource ?? existing?.creationSource ?? "user",
      approvedAt: variant.approvedAt ?? existing?.approvedAt ?? now,
      createdAt: existing?.createdAt ?? variant.createdAt ?? now,
    };
    this.state.approvedVariants = [
      ...this.state.approvedVariants.filter((item) => item.id !== saved.id),
      saved,
    ];
    this.persist();
    return clone(saved);
  }

  async deleteApprovedBulletVariant(id: string) {
    this.state.approvedVariants = this.state.approvedVariants.filter((variant) => variant.id !== id);
    this.persist();
  }

  async listFactUsage(factId: string): Promise<FactUsage[]> {
    return this.state.resumes.flatMap((resume) =>
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
    return {
      careerFacts: this.state.careerFacts.length,
      factsNeedingReview: this.state.careerFacts.filter(
        (fact) => fact.evidenceStatus === "needs_review",
      ).length,
      savedJobs: this.state.jobs.length,
      resumeVersions: this.state.resumes.length,
      recentResumes: await this.listResumeVersions().then((resumes) => resumes.slice(0, 5)),
    };
  }

  async listApplications() {
    return clone(this.state.applications.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  async getApplication(id: string) {
    return clone(this.state.applications.find((application) => application.id === id) ?? null);
  }

  async saveApplication(
    application: Partial<ApplicationRecord> & Pick<ApplicationRecord, "company" | "role">,
  ) {
    const existing = application.id
      ? this.state.applications.find((item) => item.id === application.id)
      : undefined;
    const now = nowIso();
    const status = application.status ?? existing?.status ?? "preparing";
    const saved: ApplicationRecord = {
      id: existing?.id ?? application.id ?? createId("application"),
      jobId: application.jobId ?? existing?.jobId ?? "",
      company: application.company,
      role: application.role,
      jobUrl: application.jobUrl ?? existing?.jobUrl ?? "",
      resumeVersionId: application.resumeVersionId ?? existing?.resumeVersionId ?? "",
      status,
      appliedDate:
        application.appliedDate?.trim() ||
        existing?.appliedDate ||
        (status === "applied" ? now.slice(0, 10) : ""),
      referralContact: application.referralContact ?? existing?.referralContact ?? "",
      notes: application.notes ?? existing?.notes ?? "",
      createdAt: existing?.createdAt ?? application.createdAt ?? now,
      updatedAt: now,
    };
    this.state.applications = [
      ...this.state.applications.filter((item) => item.id !== saved.id),
      saved,
    ];
    this.persist();
    return clone(saved);
  }

  async deleteApplication(id: string) {
    this.state.applications = this.state.applications.filter((application) => application.id !== id);
    this.persist();
  }

  async listEvaluationSummaries() {
    return clone(
      this.state.evaluationSummaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async saveEvaluationSummary(summary: EvaluationSummary) {
    this.state.evaluationSummaries = [
      ...this.state.evaluationSummaries.filter((item) => item.id !== summary.id),
      clone(summary),
    ];
    this.persist();
    return clone(summary);
  }

  async markEvaluationPreferred(id: string) {
    const selected = this.state.evaluationSummaries.find((summary) => summary.id === id);
    if (!selected) return;
    this.state.evaluationSummaries = this.state.evaluationSummaries.map((summary) => ({
      ...summary,
      preferred: summary.fixtureId === selected.fixtureId ? summary.id === id : summary.preferred,
    }));
    this.persist();
  }

  async listMigrationEvents() {
    return clone(this.state.migrationEvents);
  }

  async getDatabaseStatus() {
    return {
      writable: true,
      schemaVersion: 3,
      latestMigration: clone(this.state.migrationEvents.at(-1) ?? null),
    };
  }

  async getSettings() {
    return clone({
      ...defaultSettings,
      ...this.state.settings,
      tailoringDefaults: {
        ...defaultSettings.tailoringDefaults,
        ...this.state.settings.tailoringDefaults,
      },
      templateSettings: {
        ...defaultSettings.templateSettings,
        ...this.state.settings.templateSettings,
      },
      uiState: { ...defaultSettings.uiState, ...this.state.settings.uiState },
    });
  }

  async saveSettings(settings: AppSettings) {
    this.state.settings = clone(settings);
    this.persist();
    return clone(settings);
  }

  async exportBackup(): Promise<BackupPayload> {
    return {
      profile: clone(this.state.profile),
      careerItems: clone(this.state.careerItems),
      careerFacts: clone(this.state.careerFacts),
      skills: clone(this.state.skills),
      jobs: clone(this.state.jobs),
      resumes: clone(this.state.resumes),
      approvedVariants: clone(this.state.approvedVariants),
      applications: clone(this.state.applications),
      evaluationSummaries: clone(this.state.evaluationSummaries),
      settings: clone(this.state.settings),
      exportedAt: nowIso(),
      schemaVersion: 3,
    };
  }

  async importBackup(payload: BackupPayload, mode: "replace" | "merge" = "replace") {
    const previous = clone(this.state);
    try {
      this.state = mode === "merge"
        ? {
            ...this.state,
            profile: payload.profile ?? this.state.profile,
            careerItems: mergeById(this.state.careerItems, payload.careerItems),
            careerFacts: mergeById(this.state.careerFacts, payload.careerFacts),
            skills: mergeById(this.state.skills, payload.skills),
            jobs: mergeById(this.state.jobs, payload.jobs),
            resumes: mergeById(this.state.resumes, payload.resumes),
            approvedVariants: mergeById(this.state.approvedVariants, payload.approvedVariants ?? []),
            applications: mergeById(this.state.applications, payload.applications ?? []),
            evaluationSummaries: mergeById(
              this.state.evaluationSummaries,
              payload.evaluationSummaries ?? [],
            ),
            settings: payload.settings,
          }
        : {
            profile: payload.profile,
            careerItems: payload.careerItems,
            careerFacts: payload.careerFacts,
            skills: payload.skills,
            jobs: payload.jobs,
            resumes: payload.resumes,
            approvedVariants: payload.approvedVariants ?? [],
            applications: payload.applications ?? [],
            evaluationSummaries: payload.evaluationSummaries ?? [],
            migrationEvents: this.state.migrationEvents,
            settings: payload.settings,
          };
      this.persist();
    } catch (error) {
      this.state = previous;
      this.persist();
      throw error;
    }
  }

  private persist() {
    if (!this.persistKey || typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem(this.persistKey, JSON.stringify(this.state));
  }
}
