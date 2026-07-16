import type {
  AppSettings,
  ApplicationFieldRecord,
  ApplicationRecord,
  ApprovedApplicationAnswer,
  ApprovedBulletVariant,
  BackupPayload,
  CandidateClaim,
  CandidatePreferences,
  CareerCopilotMessage,
  CareerCopilotPendingAction,
  CareerCopilotThread,
  CareerImportProposal,
  CareerImportRecord,
  CareerFact,
  CareerItem,
  CareerStory,
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
import { buildSearchDocuments } from "../search/documentModel";
import { deterministicSearch } from "../search/text";
import { createId, nowIso } from "../utils";
import {
  emptyGenerationMetadata,
  normalizeGenerationMetadata,
  normalizeTailoredResume,
  normalizeValidationIssues,
} from "../resume/normalize";
import {
  applyCareerImportToState,
} from "./careerImportPersistence";
import { createCareerMemoryExportProposal } from "../import/careerIntake";
import { defaultSettings, seedCareerFacts, seedCareerItems, seedProfile, seedSkills } from "./seed";
import type { AppRepository, ApprovedVariantFilters, CareerFactFilters } from "./repository";

interface MemoryState {
  profile: Profile | null;
  careerItems: CareerItem[];
  careerFacts: CareerFact[];
  skills: Skill[];
  candidateClaims: CandidateClaim[];
  sensitiveAnswers: SensitiveAnswer[];
  candidatePreferences: CandidatePreferences | null;
  careerStories: CareerStory[];
  approvedApplicationAnswers: ApprovedApplicationAnswer[];
  jobs: Job[];
  resumes: ResumeVersion[];
  approvedVariants: ApprovedBulletVariant[];
  applications: ApplicationRecord[];
  applicationFields: ApplicationFieldRecord[];
  evaluationSummaries: EvaluationSummary[];
  careerImports: CareerImportRecord[];
  searchDocuments: SearchDocument[];
  searchDiagnostics: SearchDiagnostics;
  careerCopilotThreads: CareerCopilotThread[];
  careerCopilotMessages: CareerCopilotMessage[];
  resumeRecommendations: ResumeRecommendation[];
  resumeFavorites: ResumeFavorite[];
  resumeArchives: ResumeArchive[];
  savedApplicationAnswers: SavedApplicationAnswer[];
  migrationEvents: MigrationEvent[];
  settings: AppSettings;
}

function emptyState(): MemoryState {
  return {
    profile: null,
    careerItems: [],
    careerFacts: [],
    skills: [],
    candidateClaims: [],
    sensitiveAnswers: [],
    candidatePreferences: null,
    careerStories: [],
    approvedApplicationAnswers: [],
    jobs: [],
    resumes: [],
    approvedVariants: [],
    applications: [],
    applicationFields: [],
    evaluationSummaries: [],
    careerImports: [],
    searchDocuments: [],
    searchDiagnostics: {
      documentCount: 0,
      fts5Available: false,
      ftsIndexHealthy: false,
      embeddingProvider: "disabled",
      embeddingCount: 0,
      staleDocumentCount: 0,
      staleEmbeddingCount: 0,
      lastCompleteReindex: "",
      lastSearchDurationMs: 0,
      safeMessage: "Using deterministic fallback search.",
    },
    careerCopilotThreads: [],
    careerCopilotMessages: [],
    resumeRecommendations: [],
    resumeFavorites: [],
    resumeArchives: [],
    savedApplicationAnswers: [],
    migrationEvents: [],
    settings: clone(defaultSettings),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function valueJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function includesSearch(value: string, search: string) {
  return value.toLowerCase().includes(search.toLowerCase());
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, item);
  return [...merged.values()];
}

function mergeResumeFlags<T extends { resumeVersionId: string }>(current: T[], incoming: T[]) {
  const merged = new Map(current.map((item) => [item.resumeVersionId, item]));
  for (const item of incoming) merged.set(item.resumeVersionId, item);
  return [...merged.values()];
}

function defaultCandidatePreferences(existing?: CandidatePreferences | null): CandidatePreferences {
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
        candidateClaims: stored.candidateClaims ?? [],
        sensitiveAnswers: stored.sensitiveAnswers ?? [],
        candidatePreferences: stored.candidatePreferences ?? null,
        careerStories: stored.careerStories ?? [],
        approvedApplicationAnswers: stored.approvedApplicationAnswers ?? [],
        applications: (stored.applications ?? []).map((application) => ({
          ...application,
          submittedResumeVersionId: application.submittedResumeVersionId ?? "",
          submittedPdfPath: application.submittedPdfPath ?? "",
          submittedPdfHash: application.submittedPdfHash ?? "",
          followUpDate: application.followUpDate ?? "",
          recruiter: application.recruiter ?? "",
          hiringManager: application.hiringManager ?? "",
          referral: application.referral ?? "",
          source: application.source ?? "",
          salaryRange: application.salaryRange ?? "",
          locationType: application.locationType ?? "",
          sponsorshipNotes: application.sponsorshipNotes ?? "",
          nextAction: application.nextAction ?? "",
          automationMode: application.automationMode ?? "manual",
          applicationUrl: application.applicationUrl ?? application.jobUrl ?? "",
          atsPlatform: application.atsPlatform ?? "",
          matchScore: application.matchScore ?? null,
          submittedAt: application.submittedAt ?? "",
          jobSnapshotJson: application.jobSnapshotJson ?? null,
          statusHistoryJson: application.statusHistoryJson ?? [],
        })),
        applicationFields: stored.applicationFields ?? [],
        evaluationSummaries: stored.evaluationSummaries ?? [],
        careerImports: stored.careerImports ?? [],
        searchDocuments: stored.searchDocuments ?? [],
        searchDiagnostics: stored.searchDiagnostics ?? emptyState().searchDiagnostics,
        careerCopilotThreads: stored.careerCopilotThreads ?? [],
        careerCopilotMessages: stored.careerCopilotMessages ?? [],
        resumeRecommendations: stored.resumeRecommendations ?? [],
        resumeFavorites: stored.resumeFavorites ?? [],
        resumeArchives: stored.resumeArchives ?? [],
        savedApplicationAnswers: stored.savedApplicationAnswers ?? [],
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
          semanticSearchMode: stored.settings?.semanticSearchMode ?? defaultSettings.semanticSearchMode,
          allowRemoteEmbeddings:
            stored.settings?.allowRemoteEmbeddings ?? defaultSettings.allowRemoteEmbeddings,
          allowPrivateNotesInEmbeddings:
            stored.settings?.allowPrivateNotesInEmbeddings ?? defaultSettings.allowPrivateNotesInEmbeddings,
          allowContactFieldsInCopilotContext:
            stored.settings?.allowContactFieldsInCopilotContext ??
            defaultSettings.allowContactFieldsInCopilotContext,
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

  async listCandidateClaims() {
    return clone(this.state.candidateClaims.sort((a, b) => a.category.localeCompare(b.category) || b.updatedAt.localeCompare(a.updatedAt)));
  }

  async saveCandidateClaim(claim: Partial<CandidateClaim> & Pick<CandidateClaim, "category" | "value">) {
    const now = nowIso();
    const existing = claim.id
      ? this.state.candidateClaims.find((item) => item.id === claim.id)
      : undefined;
    if (existing?.locked && (existing.category !== claim.category || valueJson(existing.value) !== valueJson(claim.value))) {
      throw new Error("Locked candidate claims must be unlocked before their category or value can be changed.");
    }
    const saved: CandidateClaim = {
      id: existing?.id ?? claim.id ?? createId("candidate-claim"),
      category: claim.category,
      value: claim.value,
      verificationStatus: claim.verificationStatus ?? existing?.verificationStatus ?? "user_confirmed",
      evidenceIds: claim.evidenceIds ?? existing?.evidenceIds ?? [],
      locked: claim.locked ?? existing?.locked ?? false,
      createdAt: existing?.createdAt ?? claim.createdAt ?? now,
      updatedAt: now,
    };
    this.state.candidateClaims = [
      ...this.state.candidateClaims.filter((item) => item.id !== saved.id),
      saved,
    ];
    this.persist();
    return clone(saved);
  }

  async deleteCandidateClaim(id: string) {
    const existing = this.state.candidateClaims.find((claim) => claim.id === id);
    if (existing?.locked) throw new Error("Locked candidate claims must be unlocked before they can be deleted.");
    this.state.candidateClaims = this.state.candidateClaims.filter((claim) => claim.id !== id);
    this.persist();
  }

  async listSensitiveAnswers() {
    return clone(this.state.sensitiveAnswers.sort((a, b) => a.label.localeCompare(b.label)));
  }

  async saveSensitiveAnswer(
    answer: Partial<SensitiveAnswer> & Pick<SensitiveAnswer, "key" | "label" | "value">,
  ) {
    const now = nowIso();
    const existing = answer.id
      ? this.state.sensitiveAnswers.find((item) => item.id === answer.id)
      : this.state.sensitiveAnswers.find((item) => item.key === answer.key);
    if (existing?.locked && valueJson(existing.value) !== valueJson(answer.value)) {
      throw new Error("Locked sensitive answers must be unlocked before their value can be changed.");
    }
    const saved: SensitiveAnswer = {
      id: existing?.id ?? answer.id ?? createId("sensitive-answer"),
      key: answer.key,
      label: answer.label,
      value: answer.value,
      verificationStatus: answer.verificationStatus ?? existing?.verificationStatus ?? "user_confirmed",
      locked: answer.locked ?? existing?.locked ?? false,
      requiresReview: answer.requiresReview ?? existing?.requiresReview ?? false,
      createdAt: existing?.createdAt ?? answer.createdAt ?? now,
      updatedAt: now,
    };
    this.state.sensitiveAnswers = [
      ...this.state.sensitiveAnswers.filter((item) => item.id !== saved.id),
      saved,
    ];
    this.persist();
    return clone(saved);
  }

  async deleteSensitiveAnswer(id: string) {
    const existing = this.state.sensitiveAnswers.find((answer) => answer.id === id);
    if (existing?.locked) throw new Error("Locked sensitive answers must be unlocked before they can be deleted.");
    this.state.sensitiveAnswers = this.state.sensitiveAnswers.filter((answer) => answer.id !== id);
    this.persist();
  }

  async getCandidatePreferences() {
    return clone(this.state.candidatePreferences);
  }

  async saveCandidatePreferences(preferences: Partial<CandidatePreferences>) {
    const now = nowIso();
    const current = defaultCandidatePreferences(this.state.candidatePreferences);
    const saved: CandidatePreferences = {
      ...current,
      ...preferences,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: now,
    };
    this.state.candidatePreferences = clone(saved);
    this.persist();
    return clone(saved);
  }

  async listCareerStories(includeArchived = false) {
    return clone(
      this.state.careerStories
        .filter((story) => includeArchived || !story.archived)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }

  async saveCareerStory(story: Partial<CareerStory> & Pick<CareerStory, "title">) {
    const now = nowIso();
    const existing = story.id
      ? this.state.careerStories.find((item) => item.id === story.id)
      : undefined;
    const saved: CareerStory = {
      id: existing?.id ?? story.id ?? createId("career-story"),
      title: story.title,
      tags: story.tags ?? existing?.tags ?? [],
      competencies: story.competencies ?? existing?.competencies ?? [],
      situation: story.situation ?? existing?.situation ?? "",
      problem: story.problem ?? existing?.problem ?? "",
      actions: story.actions ?? existing?.actions ?? [],
      result: story.result ?? existing?.result ?? "",
      metrics: story.metrics ?? existing?.metrics ?? [],
      technologies: story.technologies ?? existing?.technologies ?? [],
      evidenceIds: story.evidenceIds ?? existing?.evidenceIds ?? [],
      verificationStatus: story.verificationStatus ?? existing?.verificationStatus ?? "user_confirmed",
      approved: story.approved ?? existing?.approved ?? false,
      archived: story.archived ?? existing?.archived ?? false,
      createdAt: existing?.createdAt ?? story.createdAt ?? now,
      updatedAt: now,
    };
    this.state.careerStories = [
      ...this.state.careerStories.filter((item) => item.id !== saved.id),
      saved,
    ];
    this.persist();
    return clone(saved);
  }

  async deleteCareerStory(id: string) {
    this.state.careerStories = this.state.careerStories.filter((story) => story.id !== id);
    this.persist();
  }

  async listApprovedApplicationAnswers(questionType?: string) {
    return clone(
      this.state.approvedApplicationAnswers
        .filter((answer) => !questionType || answer.normalizedQuestionType === questionType)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }

  async saveApprovedApplicationAnswer(
    answer: Partial<ApprovedApplicationAnswer> &
      Pick<ApprovedApplicationAnswer, "normalizedQuestionType" | "originalQuestion" | "answer">,
  ) {
    const now = nowIso();
    const existing = answer.id
      ? this.state.approvedApplicationAnswers.find((item) => item.id === answer.id)
      : undefined;
    const saved: ApprovedApplicationAnswer = {
      id: existing?.id ?? answer.id ?? createId("approved-answer"),
      normalizedQuestionType: answer.normalizedQuestionType,
      originalQuestion: answer.originalQuestion,
      answer: answer.answer,
      applicableRoleFamilies: answer.applicableRoleFamilies ?? existing?.applicableRoleFamilies ?? [],
      applicableIndustries: answer.applicableIndustries ?? existing?.applicableIndustries ?? [],
      applicableSkills: answer.applicableSkills ?? existing?.applicableSkills ?? [],
      sourceStoryIds: answer.sourceStoryIds ?? existing?.sourceStoryIds ?? [],
      sourceClaimIds: answer.sourceClaimIds ?? existing?.sourceClaimIds ?? [],
      tone: answer.tone ?? existing?.tone ?? "",
      approvedByUser: answer.approvedByUser ?? existing?.approvedByUser ?? true,
      doNotReuse: answer.doNotReuse ?? existing?.doNotReuse ?? false,
      useCount: answer.useCount ?? existing?.useCount ?? 0,
      lastUsedAt: answer.lastUsedAt ?? existing?.lastUsedAt ?? "",
      createdAt: existing?.createdAt ?? answer.createdAt ?? now,
      updatedAt: now,
    };
    this.state.approvedApplicationAnswers = [
      ...this.state.approvedApplicationAnswers.filter((item) => item.id !== saved.id),
      saved,
    ];
    this.persist();
    return clone(saved);
  }

  async deleteApprovedApplicationAnswer(id: string) {
    this.state.approvedApplicationAnswers = this.state.approvedApplicationAnswers.filter((answer) => answer.id !== id);
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
    this.state.applications = [
      ...this.state.applications.filter((item) => item.id !== saved.id),
      saved,
    ];
    this.persist();
    return clone(saved);
  }

  async deleteApplication(id: string) {
    this.state.applications = this.state.applications.filter((application) => application.id !== id);
    this.state.applicationFields = this.state.applicationFields.filter((field) => field.applicationId !== id);
    this.persist();
  }

  async listApplicationFields(applicationId?: string) {
    return clone(
      this.state.applicationFields
        .filter((field) => !applicationId || field.applicationId === applicationId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  }

  async saveApplicationField(
    field: Partial<ApplicationFieldRecord> &
      Pick<ApplicationFieldRecord, "applicationId" | "originalQuestion" | "normalizedQuestionType">,
  ) {
    const now = nowIso();
    const existing = field.id
      ? this.state.applicationFields.find((item) => item.id === field.id)
      : undefined;
    const saved: ApplicationFieldRecord = {
      id: existing?.id ?? field.id ?? createId("application-field"),
      applicationId: field.applicationId,
      originalQuestion: field.originalQuestion,
      normalizedQuestionType: field.normalizedQuestionType,
      detectedFieldType: field.detectedFieldType ?? existing?.detectedFieldType ?? "text",
      generatedAnswer: field.generatedAnswer ?? existing?.generatedAnswer ?? "",
      finalAnswer: field.finalAnswer ?? existing?.finalAnswer ?? field.generatedAnswer ?? "",
      answerSource: field.answerSource ?? existing?.answerSource ?? "user_required",
      confidence: field.confidence ?? existing?.confidence ?? 0,
      requiresReview: field.requiresReview ?? existing?.requiresReview ?? true,
      userEdited: field.userEdited ?? existing?.userEdited ?? false,
      approved: field.approved ?? existing?.approved ?? false,
      doNotReuse: field.doNotReuse ?? existing?.doNotReuse ?? false,
      claimIds: field.claimIds ?? existing?.claimIds ?? [],
      storyIds: field.storyIds ?? existing?.storyIds ?? [],
      warnings: field.warnings ?? existing?.warnings ?? [],
      reasoningSummary: field.reasoningSummary ?? existing?.reasoningSummary ?? "",
      createdAt: existing?.createdAt ?? field.createdAt ?? now,
      updatedAt: now,
    };
    this.state.applicationFields = [
      ...this.state.applicationFields.filter((item) => item.id !== saved.id),
      saved,
    ];
    this.persist();
    return clone(saved);
  }

  async deleteApplicationField(id: string) {
    this.state.applicationFields = this.state.applicationFields.filter((field) => field.id !== id);
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

  async listCareerImportRecords() {
    return clone(this.state.careerImports.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async applyCareerImportProposal(proposal: CareerImportProposal) {
    const previous = clone(this.state);
    try {
      const applied = applyCareerImportToState(
        {
          profile: this.state.profile,
          careerItems: this.state.careerItems,
          careerFacts: this.state.careerFacts,
          skills: this.state.skills,
        },
        proposal,
      );
      this.state.profile = applied.profile;
      this.state.careerItems = applied.careerItems;
      this.state.careerFacts = applied.careerFacts;
      this.state.skills = applied.skills;
      this.state.careerImports = [
        ...this.state.careerImports.filter((record) => record.id !== applied.record.id),
        applied.record,
      ];
      this.persist();
      return clone(applied.record);
    } catch (caught) {
      this.state = previous;
      this.persist();
      throw caught;
    }
  }

  async undoLastCareerImport() {
    const latest = this.state.careerImports
      .filter((record) => !record.undoneAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!latest) return null;
    const undoneAt = nowIso();
    this.state.profile = clone(latest.undoSnapshotJson.profile);
    this.state.careerItems = clone(latest.undoSnapshotJson.careerItems);
    this.state.careerFacts = clone(latest.undoSnapshotJson.careerFacts);
    this.state.skills = clone(latest.undoSnapshotJson.skills);
    this.state.careerImports = this.state.careerImports.map((record) =>
      record.id === latest.id ? { ...record, undoneAt } : record,
    );
    this.persist();
    return clone({ ...latest, undoneAt });
  }

  async createCareerImportPackage(careerItemIds?: string[]) {
    return createCareerMemoryExportProposal(
      {
        profile: this.state.profile,
        careerItems: this.state.careerItems,
        careerFacts: this.state.careerFacts,
        skills: this.state.skills,
      },
      careerItemIds,
    );
  }

  async listMigrationEvents() {
    return clone(this.state.migrationEvents);
  }

  async getDatabaseStatus() {
    return {
      writable: true,
      schemaVersion: 5,
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
      semanticSearchMode: this.state.settings.semanticSearchMode ?? defaultSettings.semanticSearchMode,
      allowRemoteEmbeddings:
        this.state.settings.allowRemoteEmbeddings ?? defaultSettings.allowRemoteEmbeddings,
      allowPrivateNotesInEmbeddings:
        this.state.settings.allowPrivateNotesInEmbeddings ??
        defaultSettings.allowPrivateNotesInEmbeddings,
      allowContactFieldsInCopilotContext:
        this.state.settings.allowContactFieldsInCopilotContext ??
        defaultSettings.allowContactFieldsInCopilotContext,
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
      candidateClaims: clone(this.state.candidateClaims),
      sensitiveAnswers: clone(this.state.sensitiveAnswers),
      candidatePreferences: clone(this.state.candidatePreferences),
      careerStories: clone(this.state.careerStories),
      approvedApplicationAnswers: clone(this.state.approvedApplicationAnswers),
      jobs: clone(this.state.jobs),
      resumes: clone(this.state.resumes),
      approvedVariants: clone(this.state.approvedVariants),
      applications: clone(this.state.applications),
      applicationFields: clone(this.state.applicationFields),
      savedApplicationAnswers: clone(this.state.savedApplicationAnswers),
      evaluationSummaries: clone(this.state.evaluationSummaries),
      careerImports: clone(this.state.careerImports),
      careerCopilotThreads: clone(this.state.careerCopilotThreads),
      careerCopilotMessages: clone(this.state.careerCopilotMessages),
      resumeFavorites: clone(this.state.resumeFavorites),
      resumeArchives: clone(this.state.resumeArchives),
      resumeRecommendations: clone(this.state.resumeRecommendations),
      settings: clone(this.state.settings),
      exportedAt: nowIso(),
      schemaVersion: 5,
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
            candidateClaims: mergeById(this.state.candidateClaims, payload.candidateClaims ?? []),
            sensitiveAnswers: mergeById(this.state.sensitiveAnswers, payload.sensitiveAnswers ?? []),
            candidatePreferences: payload.candidatePreferences ?? this.state.candidatePreferences,
            careerStories: mergeById(this.state.careerStories, payload.careerStories ?? []),
            approvedApplicationAnswers: mergeById(
              this.state.approvedApplicationAnswers,
              payload.approvedApplicationAnswers ?? [],
            ),
            jobs: mergeById(this.state.jobs, payload.jobs),
            resumes: mergeById(this.state.resumes, payload.resumes),
            approvedVariants: mergeById(this.state.approvedVariants, payload.approvedVariants ?? []),
            applications: mergeById(this.state.applications, payload.applications ?? []),
            applicationFields: mergeById(this.state.applicationFields, payload.applicationFields ?? []),
            savedApplicationAnswers: mergeById(
              this.state.savedApplicationAnswers,
              payload.savedApplicationAnswers ?? [],
            ),
            evaluationSummaries: mergeById(
              this.state.evaluationSummaries,
              payload.evaluationSummaries ?? [],
            ),
            careerImports: mergeById(this.state.careerImports, payload.careerImports ?? []),
            careerCopilotThreads: mergeById(
              this.state.careerCopilotThreads,
              payload.careerCopilotThreads ?? [],
            ),
            careerCopilotMessages: mergeById(
              this.state.careerCopilotMessages,
              payload.careerCopilotMessages ?? [],
            ),
            resumeRecommendations: mergeById(
              this.state.resumeRecommendations,
              payload.resumeRecommendations ?? [],
            ),
            resumeFavorites: mergeResumeFlags(this.state.resumeFavorites, payload.resumeFavorites ?? []),
            resumeArchives: mergeResumeFlags(this.state.resumeArchives, payload.resumeArchives ?? []),
            settings: payload.settings,
          }
        : {
            profile: payload.profile,
            careerItems: payload.careerItems,
            careerFacts: payload.careerFacts,
            skills: payload.skills,
            candidateClaims: payload.candidateClaims ?? [],
            sensitiveAnswers: payload.sensitiveAnswers ?? [],
            candidatePreferences: payload.candidatePreferences ?? null,
            careerStories: payload.careerStories ?? [],
            approvedApplicationAnswers: payload.approvedApplicationAnswers ?? [],
            jobs: payload.jobs,
            resumes: payload.resumes,
            approvedVariants: payload.approvedVariants ?? [],
            applications: payload.applications ?? [],
            applicationFields: payload.applicationFields ?? [],
            savedApplicationAnswers: payload.savedApplicationAnswers ?? [],
            evaluationSummaries: payload.evaluationSummaries ?? [],
            careerImports: payload.careerImports ?? [],
            searchDocuments: this.state.searchDocuments,
            searchDiagnostics: this.state.searchDiagnostics,
            careerCopilotThreads: payload.careerCopilotThreads ?? [],
            careerCopilotMessages: payload.careerCopilotMessages ?? [],
            resumeRecommendations: payload.resumeRecommendations ?? [],
            resumeFavorites: payload.resumeFavorites ?? [],
            resumeArchives: payload.resumeArchives ?? [],
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

  async listSearchDocuments() {
    this.refreshSearchDocuments();
    return clone(this.state.searchDocuments);
  }

  async rebuildSearchIndex() {
    const started = performance.now();
    this.refreshSearchDocuments();
    this.state.searchDiagnostics = {
      ...this.state.searchDiagnostics,
      documentCount: this.state.searchDocuments.length,
      fts5Available: false,
      ftsIndexHealthy: false,
      embeddingProvider: this.state.settings.semanticSearchMode,
      lastCompleteReindex: nowIso(),
      lastSearchDurationMs: Math.round(performance.now() - started),
      safeMessage: "Rebuilt deterministic text index. FTS5 is unavailable in memory mode.",
    };
    this.persist();
    return clone(this.state.searchDiagnostics);
  }

  async searchCareerDocuments(query: string, filters: SearchFilters = {}): Promise<SearchResult[]> {
    this.refreshSearchDocuments();
    const { results, durationMs } = deterministicSearch(this.state.searchDocuments, query, filters);
    this.state.searchDiagnostics = {
      ...this.state.searchDiagnostics,
      documentCount: this.state.searchDocuments.length,
      embeddingProvider: this.state.settings.semanticSearchMode,
      lastSearchDurationMs: durationMs,
      safeMessage: "Search used deterministic fallback ranking.",
    };
    this.persist();
    return clone(results);
  }

  async getSearchDiagnostics() {
    this.refreshSearchDocuments();
    return clone({
      ...this.state.searchDiagnostics,
      documentCount: this.state.searchDocuments.length,
      embeddingProvider: this.state.settings.semanticSearchMode,
    });
  }

  async listCareerCopilotThreads(includeArchived = false) {
    return clone(
      this.state.careerCopilotThreads
        .filter((thread) => includeArchived || !thread.archivedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }

  async getCareerCopilotThread(id: string) {
    return clone(this.state.careerCopilotThreads.find((thread) => thread.id === id) ?? null);
  }

  async saveCareerCopilotThread(
    thread: Partial<CareerCopilotThread> & Pick<CareerCopilotThread, "title">,
  ) {
    const existing = thread.id
      ? this.state.careerCopilotThreads.find((item) => item.id === thread.id)
      : undefined;
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
    this.state.careerCopilotThreads = [
      ...this.state.careerCopilotThreads.filter((item) => item.id !== saved.id),
      saved,
    ];
    this.persist();
    return clone(saved);
  }

  async archiveCareerCopilotThread(id: string) {
    this.state.careerCopilotThreads = this.state.careerCopilotThreads.map((thread) =>
      thread.id === id ? { ...thread, archivedAt: nowIso(), updatedAt: nowIso() } : thread,
    );
    this.persist();
  }

  async deleteCareerCopilotThread(id: string) {
    this.state.careerCopilotThreads = this.state.careerCopilotThreads.filter((thread) => thread.id !== id);
    this.state.careerCopilotMessages = this.state.careerCopilotMessages.filter((message) => message.threadId !== id);
    this.persist();
  }

  async listCareerCopilotMessages(threadId: string) {
    return clone(
      this.state.careerCopilotMessages
        .filter((message) => message.threadId === threadId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  }

  async saveCareerCopilotMessage(message: CareerCopilotMessage) {
    this.state.careerCopilotMessages = [
      ...this.state.careerCopilotMessages.filter((item) => item.id !== message.id),
      clone(message),
    ];
    this.state.careerCopilotThreads = this.state.careerCopilotThreads.map((thread) =>
      thread.id === message.threadId ? { ...thread, updatedAt: message.createdAt } : thread,
    );
    this.persist();
    return clone(message);
  }

  async confirmCareerCopilotAction(action: CareerCopilotPendingAction) {
    const confirmed = { ...action, status: "confirmed" as const, resolvedAt: nowIso() };
    await this.applyConfirmedAction(confirmed);
    this.replacePendingAction(confirmed);
    this.persist();
    return clone(confirmed);
  }

  async cancelCareerCopilotAction(action: CareerCopilotPendingAction) {
    const cancelled = { ...action, status: "cancelled" as const, resolvedAt: nowIso() };
    this.replacePendingAction(cancelled);
    this.persist();
    return clone(cancelled);
  }

  async listResumeRecommendations(targetJobId?: string) {
    return clone(
      this.state.resumeRecommendations
        .filter((recommendation) => !targetJobId || recommendation.targetJobId === targetJobId)
        .sort((a, b) => b.overallScore - a.overallScore || b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async saveResumeRecommendation(recommendation: ResumeRecommendation) {
    this.state.resumeRecommendations = [
      ...this.state.resumeRecommendations.filter((item) => item.id !== recommendation.id),
      clone(recommendation),
    ];
    this.persist();
    return clone(recommendation);
  }

  async dismissResumeRecommendation(id: string) {
    this.state.resumeRecommendations = this.state.resumeRecommendations.map((recommendation) =>
      recommendation.id === id
        ? {
            ...recommendation,
            explanationJson: { ...recommendation.explanationJson, dismissed: true },
          }
        : recommendation,
    );
    this.persist();
  }

  async listResumeFavorites() {
    return clone(this.state.resumeFavorites);
  }

  async setResumeFavorite(resumeVersionId: string, favorite: boolean) {
    this.state.resumeFavorites = favorite
      ? mergeResumeFlags(this.state.resumeFavorites, [{ resumeVersionId, createdAt: nowIso() }])
      : this.state.resumeFavorites.filter((item) => item.resumeVersionId !== resumeVersionId);
    this.persist();
  }

  async listResumeArchives() {
    return clone(this.state.resumeArchives);
  }

  async setResumeArchived(resumeVersionId: string, archived: boolean) {
    this.state.resumeArchives = archived
      ? mergeResumeFlags(this.state.resumeArchives, [{ resumeVersionId, archivedAt: nowIso() }])
      : this.state.resumeArchives.filter((item) => item.resumeVersionId !== resumeVersionId);
    this.persist();
  }

  async listSavedApplicationAnswers(jobId?: string) {
    return clone(
      this.state.savedApplicationAnswers
        .filter((answer) => !jobId || answer.jobId === jobId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async saveApplicationAnswer(answer: SavedApplicationAnswer) {
    this.state.savedApplicationAnswers = [
      ...this.state.savedApplicationAnswers.filter((item) => item.id !== answer.id),
      clone(answer),
    ];
    this.persist();
    return clone(answer);
  }

  private async applyConfirmedAction(action: CareerCopilotPendingAction) {
    if (action.type === "update_application_status") {
      const applicationId = String(action.afterJson.applicationId ?? action.recordsAffected[0]?.entityId ?? "");
      const application = this.state.applications.find((item) => item.id === applicationId);
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
      const application = this.state.applications.find((item) => item.id === applicationId);
      if (!application) throw new Error("copilot_action_missing_application|The target application no longer exists.");
      const joined = [application.notes, note].filter(Boolean).join(application.notes ? "\n" : "");
      await this.saveApplication({ ...application, notes: joined });
      return;
    }
    if (action.type === "link_resume_to_application") {
      const applicationId = String(action.afterJson.applicationId ?? action.recordsAffected[0]?.entityId ?? "");
      const resumeVersionId = String(action.afterJson.resumeVersionId ?? "");
      const application = this.state.applications.find((item) => item.id === applicationId);
      if (!application) throw new Error("copilot_action_missing_application|The target application no longer exists.");
      await this.saveApplication({
        ...application,
        resumeVersionId,
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
      const baseId = String(action.afterJson.baseResumeVersionId ?? "");
      const base = this.state.resumes.find((resume) => resume.id === baseId);
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

  private replacePendingAction(action: CareerCopilotPendingAction) {
    this.state.careerCopilotMessages = this.state.careerCopilotMessages.map((message) => ({
      ...message,
      pendingActionsJson: message.pendingActionsJson.map((pending) =>
        pending.id === action.id ? action : pending,
      ),
    }));
  }

  private refreshSearchDocuments() {
    this.state.searchDocuments = buildSearchDocuments({
      profile: this.state.profile,
      careerItems: this.state.careerItems,
      careerFacts: this.state.careerFacts,
      skills: this.state.skills,
      candidateClaims: this.state.candidateClaims,
      sensitiveAnswers: this.state.sensitiveAnswers,
      careerStories: this.state.careerStories,
      approvedApplicationAnswers: this.state.approvedApplicationAnswers,
      jobs: this.state.jobs,
      resumes: this.state.resumes,
      approvedVariants: this.state.approvedVariants,
      applications: this.state.applications,
      applicationFields: this.state.applicationFields,
      evaluations: this.state.evaluationSummaries,
      careerImports: this.state.careerImports,
      copilotThreads: this.state.careerCopilotThreads,
      resumeFavorites: this.state.resumeFavorites,
      resumeArchives: this.state.resumeArchives,
    });
    this.state.searchDiagnostics = {
      ...this.state.searchDiagnostics,
      documentCount: this.state.searchDocuments.length,
      embeddingProvider: this.state.settings.semanticSearchMode,
    };
  }

  private persist() {
    this.refreshSearchDocuments();
    if (!this.persistKey || typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem(this.persistKey, JSON.stringify(this.state));
  }
}
