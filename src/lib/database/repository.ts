import type {
  AppSettings,
  ApprovedBulletVariant,
  BackupPayload,
  CareerFact,
  CareerItem,
  DashboardMetrics,
  Job,
  Profile,
  ResumeVersion,
  Skill,
  FactUsage,
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
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  exportBackup(): Promise<BackupPayload>;
  importBackup(payload: BackupPayload): Promise<void>;
}
