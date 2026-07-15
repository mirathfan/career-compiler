export type CareerItemType = "project" | "employment" | "education";
export type EvidenceStatus = "user_provided" | "verified" | "needs_review" | "prohibited";
export type ResumeStatus = "draft" | "approved" | "exported";
export type AIProviderMode = "mock" | "openai";

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
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  aiProvider: AIProviderMode;
  modelName: string;
  defaultTemplateId: string;
  defaultExportDirectory: string;
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
  message: string;
  bulletId?: string;
  section?: string;
  relatedFactIds: string[];
}

export interface ResumeBullet {
  id: string;
  text: string;
  sourceFactIds: string[];
  relevanceScore: number;
  isUserEdited: boolean;
  included: boolean;
  locked?: boolean;
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
  };
  summary: string[];
  education: ResumeEducationEntry[];
  experience: ResumeCareerItemSection[];
  projects: ResumeCareerItemSection[];
  skills: string[];
  sectionOrder: Array<"summary" | "education" | "experience" | "projects" | "skills">;
  compactionActions: string[];
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
  };
}

export interface BackupPayload {
  profile: Profile | null;
  careerItems: CareerItem[];
  careerFacts: CareerFact[];
  skills: Skill[];
  jobs: Job[];
  resumes: ResumeVersion[];
  settings: AppSettings;
  exportedAt: string;
  schemaVersion: number;
}
