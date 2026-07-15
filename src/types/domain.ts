export type CareerItemType = "project" | "employment" | "education";
export type EvidenceStatus = "user_provided" | "verified" | "needs_review" | "prohibited";
export type ResumeStatus = "draft" | "approved" | "exported";
export type AIProviderMode = "mock" | "openai";
export type ResumeGenerationSource = "ai" | "deterministic" | "user";
export type SummaryMode = "auto" | "always" | "never";
export type NumberControl<T extends number> = "auto" | T;
export type ResumeTemplateId = "mir-standard" | "ai-full-stack";
export type AIRequestType =
  | "job_analysis"
  | "resume_plan"
  | "resume_generation"
  | "validation_repair"
  | "bullet_regeneration"
  | "section_regeneration"
  | "bullet_shortening";

export interface Profile {
  id: string;
  fullName: string;
  headline: string;
  city: string;
  region: string;
  email: string;
  phone: string;
  portfolioUrl: string;
  linkedInUrl: string;
  githubUrl: string;
  workAuthorizationNote: string;
  updatedAt: string;
}

export interface CareerItem {
  id: string;
  type: CareerItemType;
  title: string;
  organization: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  shortDescription: string;
  url: string;
  repositoryUrl: string;
  displayOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CareerFact {
  id: string;
  careerItemId: string;
  statement: string;
  evidenceStatus: EvidenceStatus;
  sourceNote: string;
  skillTags: string[];
  roleTags: string[];
  metricTokens: string[];
  importance: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  proficiencyNote: string;
  enabled: boolean;
}

export interface Job {
  id: string;
  company: string;
  roleTitle: string;
  sourceUrl: string;
  rawDescription: string;
  analysisJson: JobAnalysis | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeVersion {
  id: string;
  jobId: string;
  name: string;
  templateId: string;
  contentJson: TailoredResume;
  validationJson: ValidationIssue[];
  status: ResumeStatus;
  lastExportPath: string;
  parentResumeVersionId: string;
  generationProvider: AIProviderMode | "deterministic";
  generationModel: string;
  promptVersion: string;
  generationMetadataJson: GenerationMetadata;
  deterministicBaselineJson: TailoredResume | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  aiProvider: AIProviderMode;
  modelName: string;
  defaultTemplateId: string;
  defaultExportDirectory: string;
  tailoringDefaults: TailoringControls;
}

export interface DashboardMetrics {
  careerFacts: number;
  factsNeedingReview: number;
  savedJobs: number;
  resumeVersions: number;
  recentResumes: ResumeVersion[];
}

export interface EvidenceScore {
  fact: CareerFact;
  item: CareerItem;
  score: number;
  selected: boolean;
  excludedReason: string;
  reasons: string[];
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  bulletId?: string;
  section?: string;
  relatedFactIds: string[];
  canApprove: boolean;
}

export interface ResumeBullet {
  id: string;
  text: string;
  sourceFactIds: string[];
  relevanceScore: number;
  isUserEdited: boolean;
  included: boolean;
  locked: boolean;
  approved: boolean;
  rejected: boolean;
  generationSource: ResumeGenerationSource;
  generationReason: string;
  keywordsAddressed: string[];
  selectionReason: string;
}

export interface ResumeCareerItemSection {
  careerItemId: string;
  title: string;
  organization: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  locked: boolean;
  bullets: ResumeBullet[];
}

export interface ResumeEducationEntry {
  careerItemId: string;
  title: string;
  organization: string;
  location: string;
  dateLabel: string;
}

export interface TailoredResume {
  id: string;
  header: {
    fullName: string;
    headline: string;
    location: string;
    email: string;
    phone: string;
    portfolioUrl: string;
    linkedInUrl: string;
    githubUrl: string;
    workAuthorizationNote: string;
  };
  summary: string[];
  education: ResumeEducationEntry[];
  experience: ResumeCareerItemSection[];
  projects: ResumeCareerItemSection[];
  skills: string[];
  sectionOrder: Array<"summary" | "education" | "experience" | "projects" | "skills">;
  compactionActions: string[];
  layout: {
    bodyFontSize: number;
    spacingScale: number;
    condensedSkills: boolean;
  };
  approvedWarningCodes: string[];
}

export interface JobAnalysis {
  inferredCompany: string;
  inferredRoleTitle: string;
  seniority: string;
  roleCategories: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  domainKeywords: string[];
  candidateSignals: string[];
  locationRequirements: string[];
  workAuthorizationLanguage: string;
  summary: string;
}

export interface ResumePlan {
  targetPositioning: string;
  selectedCareerItemIds: string[];
  selectedFactIds: string[];
  sectionOrder: TailoredResume["sectionOrder"];
  emphasisAreas: string[];
  deEmphasisAreas: string[];
  omittedItems: Array<{ careerItemId: string; reason: string }>;
  skillSelection: string[];
  contentBudget: {
    maxBullets: number;
    maxProjects: number;
    includeSummary: boolean;
    maxBulletsPerItem: number;
  };
}

export interface TailoringControls {
  summaryMode: SummaryMode;
  projectCount: NumberControl<2 | 3 | 4>;
  bulletsPerProject: NumberControl<1 | 2 | 3>;
  sectionOrderPreset: ResumeTemplateId | "experience-first";
  targetRoleCategory: string;
  emphasisTags: string[];
  excludedTags: string[];
  lockedCareerItemIds: string[];
  requiredFactIds: string[];
  excludedFactIds: string[];
  strictOnePage: boolean;
}

export interface ResumeConstraints {
  sectionOrder: TailoredResume["sectionOrder"];
  maximumSelectedProjects: number;
  maximumBulletsPerItem: number;
  summaryMode: SummaryMode;
  summaryPermitted: boolean;
  onePageRequired: boolean;
  lockedCareerItemIds: string[];
  lockedFactIds: string[];
  targetEmphasisAreas: string[];
  deEmphasisAreas: string[];
  contentBudget: {
    maximumTotalBullets: number;
    recommendedBulletWords: number;
  };
}

export interface GenerationCareerItem {
  careerItemId: string;
  type: CareerItemType;
  title: string;
  organization: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  url: string;
  repositoryUrl: string;
}

export interface GenerationFact {
  factId: string;
  careerItemId: string;
  statement: string;
  evidenceStatus: Exclude<EvidenceStatus, "prohibited">;
  skillTags: string[];
  roleTags: string[];
  metricTokens: string[];
  importance: number;
  relevanceScore: number;
  relevanceReason: string;
}

export interface GenerationSkill {
  skillId: string;
  name: string;
  category: string;
}

export interface ResumeGenerationRequest {
  targetJob: {
    company: string;
    roleTitle: string;
    jobDescription: string;
    analysis: JobAnalysis;
  };
  candidateProfile: {
    name: string;
    headline: string;
    location: string;
    email: string;
    phone: string;
    portfolioUrl: string;
    linkedInUrl: string;
    githubUrl: string;
    workAuthorizationNote: string | null;
  };
  selectedCareerItems: GenerationCareerItem[];
  selectedFacts: GenerationFact[];
  approvedSkills: GenerationSkill[];
  approvedVariants: ApprovedBulletVariant[];
  constraints: ResumeConstraints;
}

export interface AIRequestMetadata {
  provider: AIProviderMode;
  model: string;
  requestType: AIRequestType;
  success: boolean;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  errorCode: string;
}

export interface GenerationMetadata {
  calls: AIRequestMetadata[];
  repairAttempted: boolean;
  repairSucceeded: boolean;
  deterministicFallbackUsed: boolean;
  compactionLog: string[];
}

export interface AIProviderResult<T> {
  data: T;
  metadata: AIRequestMetadata;
}

export interface ApprovedBulletVariant {
  id: string;
  careerItemId: string;
  sourceFactIds: string[];
  text: string;
  roleCategories: string[];
  skillTags: string[];
  targetJobId: string;
  creationSource: ResumeGenerationSource;
  approvedAt: string;
  createdAt: string;
}

export interface FactUsage {
  factId: string;
  resumeVersionId: string;
  resumeName: string;
  bulletId: string;
  bulletText: string;
}

export type ResumeDiffCategory =
  | "added"
  | "removed"
  | "reworded"
  | "reordered"
  | "skills_changed"
  | "section_changed";

export interface ResumeDiffEntry {
  category: ResumeDiffCategory;
  section: string;
  careerItemId: string;
  sourceFactIds: string[];
  before: string;
  after: string;
  explanation: string;
}

export interface ResumeQualityCheck {
  id: string;
  label: string;
  detail: string;
  status: "pass" | "warning" | "error" | "info";
  count: number;
}

export interface BackupPayload {
  profile: Profile | null;
  careerItems: CareerItem[];
  careerFacts: CareerFact[];
  skills: Skill[];
  jobs: Job[];
  resumes: ResumeVersion[];
  approvedVariants: ApprovedBulletVariant[];
  settings: AppSettings;
  exportedAt: string;
  schemaVersion: number;
}
