import type {
  AppSettings,
  BackupPayload,
  CareerFact,
  CareerItem,
  DashboardMetrics,
  Job,
  Profile,
  ResumeVersion,
  Skill,
} from "../../types/domain";
import { createId, nowIso } from "../utils";
import { defaultSettings, seedCareerFacts, seedCareerItems, seedProfile, seedSkills } from "./seed";
import type { AppRepository, CareerFactFilters } from "./repository";

interface MemoryState {
  profile: Profile | null;
  careerItems: CareerItem[];
  careerFacts: CareerFact[];
  skills: Skill[];
  jobs: Job[];
  resumes: ResumeVersion[];
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
    settings: { ...defaultSettings },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function includesSearch(value: string, search: string) {
  return value.toLowerCase().includes(search.toLowerCase());
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
      this.state = JSON.parse(existing) as MemoryState;
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

  async getSettings() {
    return clone(this.state.settings);
  }

  async saveSettings(settings: AppSettings) {
    this.state.settings = clone(settings);
    this.persist();
    return clone(settings);
  }

  async exportBackup(): Promise<BackupPayload> {
    return {
      ...clone(this.state),
      exportedAt: nowIso(),
      schemaVersion: 1,
    };
  }

  async importBackup(payload: BackupPayload) {
    this.state = {
      profile: payload.profile,
      careerItems: payload.careerItems,
      careerFacts: payload.careerFacts,
      skills: payload.skills,
      jobs: payload.jobs,
      resumes: payload.resumes,
      settings: payload.settings,
    };
    this.persist();
  }

  private persist() {
    if (!this.persistKey || typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem(this.persistKey, JSON.stringify(this.state));
  }
}
