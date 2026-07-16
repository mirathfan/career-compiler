import type {
  AppSettings,
  ApplicationRecord,
  ApplicationFieldRecord,
  ApprovedApplicationAnswer,
  ApprovedBulletVariant,
  BackupPayload,
  CandidateClaim,
  CandidatePreferences,
  CareerImportProposal,
  CareerImportRecord,
  CareerFact,
  CareerCopilotMessage,
  CareerCopilotPendingAction,
  CareerCopilotThread,
  CareerStory,
  CareerItem,
  DashboardMetrics,
  Job,
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
  FactUsage,
  EvaluationSummary,
  MigrationEvent,
  DatabaseStatus,
} from "../../types/domain";

export interface CareerFactFilters {
  search?: string;
  evidenceStatus?: string;
}

export interface ApprovedVariantFilters {
  factIds?: string[];
  roleCategories?: string[];
  careerItemId?: string;
}

export interface AppRepository {
  initialize(): Promise<void>;
  seedSampleData(): Promise<{ inserted: number; updated: number }>;
  resetSampleData(): Promise<void>;
  getProfile(): Promise<Profile | null>;
  saveProfile(profile: Profile): Promise<Profile>;
  listCareerItems(): Promise<CareerItem[]>;
  saveCareerItem(item: Partial<CareerItem> & Pick<CareerItem, "type" | "title">): Promise<CareerItem>;
  deleteCareerItem(id: string): Promise<void>;
  updateCareerItemOrder(ids: string[]): Promise<void>;
  listCareerFacts(filters?: CareerFactFilters): Promise<CareerFact[]>;
  listFactsForItem(careerItemId: string): Promise<CareerFact[]>;
  saveCareerFact(fact: Partial<CareerFact> & Pick<CareerFact, "careerItemId" | "statement">): Promise<CareerFact>;
  deleteCareerFact(id: string): Promise<void>;
  bulkUpdateCareerFacts(
    ids: string[],
    changes: Partial<Pick<CareerFact, "enabled" | "evidenceStatus">>,
  ): Promise<void>;
  listSkills(): Promise<Skill[]>;
  saveSkill(skill: Partial<Skill> & Pick<Skill, "name" | "category">): Promise<Skill>;
  deleteSkill(id: string): Promise<void>;
  listCandidateClaims(): Promise<CandidateClaim[]>;
  saveCandidateClaim(claim: Partial<CandidateClaim> & Pick<CandidateClaim, "category" | "value">): Promise<CandidateClaim>;
  deleteCandidateClaim(id: string): Promise<void>;
  listSensitiveAnswers(): Promise<SensitiveAnswer[]>;
  saveSensitiveAnswer(
    answer: Partial<SensitiveAnswer> & Pick<SensitiveAnswer, "key" | "label" | "value">,
  ): Promise<SensitiveAnswer>;
  deleteSensitiveAnswer(id: string): Promise<void>;
  getCandidatePreferences(): Promise<CandidatePreferences | null>;
  saveCandidatePreferences(preferences: Partial<CandidatePreferences>): Promise<CandidatePreferences>;
  listCareerStories(includeArchived?: boolean): Promise<CareerStory[]>;
  saveCareerStory(story: Partial<CareerStory> & Pick<CareerStory, "title">): Promise<CareerStory>;
  deleteCareerStory(id: string): Promise<void>;
  listApprovedApplicationAnswers(questionType?: string): Promise<ApprovedApplicationAnswer[]>;
  saveApprovedApplicationAnswer(
    answer: Partial<ApprovedApplicationAnswer> &
      Pick<ApprovedApplicationAnswer, "normalizedQuestionType" | "originalQuestion" | "answer">,
  ): Promise<ApprovedApplicationAnswer>;
  deleteApprovedApplicationAnswer(id: string): Promise<void>;
  listJobs(): Promise<Job[]>;
  saveJob(job: Partial<Job> & Pick<Job, "rawDescription">): Promise<Job>;
  getJob(id: string): Promise<Job | null>;
  listResumeVersions(): Promise<ResumeVersion[]>;
  getResumeVersion(id: string): Promise<ResumeVersion | null>;
  saveResumeVersion(resume: Partial<ResumeVersion> & Pick<ResumeVersion, "jobId" | "contentJson">): Promise<ResumeVersion>;
  deleteResumeVersion(id: string): Promise<void>;
  listApprovedBulletVariants(filters?: ApprovedVariantFilters): Promise<ApprovedBulletVariant[]>;
  saveApprovedBulletVariant(
    variant: Partial<ApprovedBulletVariant> &
      Pick<ApprovedBulletVariant, "careerItemId" | "sourceFactIds" | "text">,
  ): Promise<ApprovedBulletVariant>;
  deleteApprovedBulletVariant(id: string): Promise<void>;
  listFactUsage(factId: string): Promise<FactUsage[]>;
  getDashboardMetrics(): Promise<DashboardMetrics>;
  listApplications(): Promise<ApplicationRecord[]>;
  getApplication(id: string): Promise<ApplicationRecord | null>;
  saveApplication(
    application: Partial<ApplicationRecord> & Pick<ApplicationRecord, "company" | "role">,
  ): Promise<ApplicationRecord>;
  deleteApplication(id: string): Promise<void>;
  listApplicationFields(applicationId?: string): Promise<ApplicationFieldRecord[]>;
  saveApplicationField(
    field: Partial<ApplicationFieldRecord> &
      Pick<ApplicationFieldRecord, "applicationId" | "originalQuestion" | "normalizedQuestionType">,
  ): Promise<ApplicationFieldRecord>;
  deleteApplicationField(id: string): Promise<void>;
  listEvaluationSummaries(): Promise<EvaluationSummary[]>;
  saveEvaluationSummary(summary: EvaluationSummary): Promise<EvaluationSummary>;
  markEvaluationPreferred(id: string): Promise<void>;
  listCareerImportRecords(): Promise<CareerImportRecord[]>;
  applyCareerImportProposal(proposal: CareerImportProposal): Promise<CareerImportRecord>;
  undoLastCareerImport(): Promise<CareerImportRecord | null>;
  createCareerImportPackage(careerItemIds?: string[]): Promise<CareerImportProposal>;
  listMigrationEvents(): Promise<MigrationEvent[]>;
  getDatabaseStatus(): Promise<DatabaseStatus>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  exportBackup(): Promise<BackupPayload>;
  importBackup(payload: BackupPayload, mode?: "replace" | "merge"): Promise<void>;
  listSearchDocuments(): Promise<SearchDocument[]>;
  rebuildSearchIndex(): Promise<SearchDiagnostics>;
  searchCareerDocuments(query: string, filters?: SearchFilters): Promise<SearchResult[]>;
  getSearchDiagnostics(): Promise<SearchDiagnostics>;
  listCareerCopilotThreads(includeArchived?: boolean): Promise<CareerCopilotThread[]>;
  getCareerCopilotThread(id: string): Promise<CareerCopilotThread | null>;
  saveCareerCopilotThread(thread: Partial<CareerCopilotThread> & Pick<CareerCopilotThread, "title">): Promise<CareerCopilotThread>;
  archiveCareerCopilotThread(id: string): Promise<void>;
  deleteCareerCopilotThread(id: string): Promise<void>;
  listCareerCopilotMessages(threadId: string): Promise<CareerCopilotMessage[]>;
  saveCareerCopilotMessage(message: CareerCopilotMessage): Promise<CareerCopilotMessage>;
  confirmCareerCopilotAction(action: CareerCopilotPendingAction): Promise<CareerCopilotPendingAction>;
  cancelCareerCopilotAction(action: CareerCopilotPendingAction): Promise<CareerCopilotPendingAction>;
  listResumeRecommendations(targetJobId?: string): Promise<ResumeRecommendation[]>;
  saveResumeRecommendation(recommendation: ResumeRecommendation): Promise<ResumeRecommendation>;
  dismissResumeRecommendation(id: string): Promise<void>;
  listResumeFavorites(): Promise<ResumeFavorite[]>;
  setResumeFavorite(resumeVersionId: string, favorite: boolean): Promise<void>;
  listResumeArchives(): Promise<ResumeArchive[]>;
  setResumeArchived(resumeVersionId: string, archived: boolean): Promise<void>;
  listSavedApplicationAnswers(jobId?: string): Promise<SavedApplicationAnswer[]>;
  saveApplicationAnswer(answer: SavedApplicationAnswer): Promise<SavedApplicationAnswer>;
}
