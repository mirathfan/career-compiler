export type CareerItemType = "project" | "employment" | "education";
export type EvidenceStatus = "user_provided" | "verified" | "needs_review" | "prohibited";
export type ResumeStatus = "draft" | "approved" | "exported";
export type ResumeDocumentKind = "master" | "tailored" | "imported";
export type AIProviderMode = "mock" | "openai";
export type ResumeReviewMode = "general" | "job_specific" | "pre_submission";
export type ResumeFactualRiskLevel = "low" | "medium" | "high" | "critical";
export type ResumeReviewFindingSeverity = "info" | "low" | "medium" | "high" | "critical";
export type ResumeImprovementSafety = "safe" | "needs_review" | "blocked";
export type ResumeImprovementKind =
  | "remove_bullet"
  | "reorder_bullets"
  | "condense_layout"
  | "remove_summary"
  | "section_order"
  | "manual_review";
export type SemanticSearchMode = "disabled" | "openai" | "local";
export type ResumeGenerationSource = "ai" | "deterministic" | "user";
export type SummaryMode = "auto" | "always" | "never";
export type NumberControl<T extends number> = "auto" | T;
export type ResumeTemplateId = "mir-resume" | "mir-standard" | "ai-full-stack";
export type RoleProfileId =
  | "full-stack-software-engineer"
  | "ai-engineer"
  | "forward-deployed-engineer"
  | "mobile-engineer"
  | "backend-engineer"
  | "general-software-engineer";
export type CareerFactSourceType =
  | "user_statement"
  | "repository"
  | "readme"
  | "test_result"
  | "build_output"
  | "deployment_result"
  | "resume"
  | "manually_verified";
export type ApplicationStatus =
  | "preparing"
  | "ready"
  | "applied"
  | "interview"
  | "rejected"
  | "offer"
  | "withdrawn";
export type EvaluationMode = "ranking" | "mock" | "openai";
export type AIRequestType =
  | "job_analysis"
  | "resume_plan"
  | "resume_generation"
  | "validation_repair"
  | "bullet_regeneration"
  | "section_regeneration"
  | "bullet_shortening"
  | "career_intake"
  | "career_copilot"
  | "embedding";
export type CareerImportSourceType =
  | "paste_anything"
  | "structured_package"
  | "guided_interview"
  | "project_completion_report"
  | "resume_text";
export type CareerImportOperation = "add" | "update" | "merge" | "skip";
export type CareerImportTargetType = "profile" | "career_item" | "career_fact" | "skill" | "relationship";
export type CareerImportValidationStatus = "pending" | "valid" | "warning" | "conflict" | "invalid";
export type CareerImportUserDecision = "pending" | "approved" | "edited" | "merge" | "rejected";
export type VerificationStatus =
  | "verified"
  | "user_confirmed"
  | "inferred"
  | "unverified"
  | "conflicting";
export type SensitiveAnswerKey =
  | "current_work_authorization"
  | "future_sponsorship"
  | "visa_status_wording"
  | "security_clearance"
  | "salary_expectations"
  | "relocation"
  | "willingness_to_travel"
  | "start_date"
  | "veteran_status"
  | "disability_selection"
  | "demographic_selections"
  | "background_check_consent";
export type ApplicationQuestionType =
  | "first_name"
  | "last_name"
  | "full_name"
  | "email"
  | "phone"
  | "address"
  | "city"
  | "state"
  | "postal_code"
  | "country"
  | "linkedin"
  | "github"
  | "portfolio"
  | "education"
  | "degree"
  | "graduation_date"
  | "current_company"
  | "current_title"
  | "years_of_experience"
  | "skill_experience"
  | "work_authorization"
  | "future_sponsorship"
  | "salary_expectation"
  | "start_date"
  | "relocation"
  | "travel"
  | "remote_preference"
  | "security_clearance"
  | "why_company"
  | "why_role"
  | "candidate_fit"
  | "relevant_project"
  | "technical_challenge"
  | "behavioral_story"
  | "additional_information"
  | "demographic"
  | "legal_attestation"
  | "unknown";
export type ApplicationAnswerSource =
  | "fixed_profile"
  | "locked_sensitive"
  | "approved_answer"
  | "tailored_ai"
  | "user_required";
export type ApplicationAutomationMode = "manual" | "autofill_manual_submit";

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
  sourceType: CareerFactSourceType;
  sourceReference: string;
  verificationDate: string;
  lastReviewedDate: string;
  notes: string;
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

export interface CandidateClaim {
  id: string;
  category: string;
  value: unknown;
  verificationStatus: VerificationStatus;
  evidenceIds: string[];
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SensitiveAnswer {
  id: string;
  key: SensitiveAnswerKey;
  label: string;
  value: unknown;
  verificationStatus: VerificationStatus;
  locked: boolean;
  requiresReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CandidatePreferences {
  id: string;
  targetRoles: string[];
  avoidedRoles: string[];
  industries: string[];
  preferredCompanyStage: string;
  preferredEngineeringEnvironment: string;
  preferredLocations: string[];
  salaryFloor: string;
  preferredTechnologies: string[];
  writingTone: string;
  answerLengthPreference: "concise" | "standard" | "detailed";
  wordsToAvoid: string[];
  reuseApprovedAnswers: boolean;
  generateCoverLetters: boolean;
  automaticallyChooseResume: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CareerStory {
  id: string;
  title: string;
  tags: string[];
  competencies: string[];
  situation: string;
  problem: string;
  actions: string[];
  result: string;
  metrics: string[];
  technologies: string[];
  evidenceIds: string[];
  verificationStatus: VerificationStatus;
  approved: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovedApplicationAnswer {
  id: string;
  normalizedQuestionType: ApplicationQuestionType;
  originalQuestion: string;
  answer: string;
  applicableRoleFamilies: string[];
  applicableIndustries: string[];
  applicableSkills: string[];
  sourceStoryIds: string[];
  sourceClaimIds: string[];
  tone: string;
  approvedByUser: boolean;
  doNotReuse: boolean;
  useCount: number;
  lastUsedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DetectedApplicationField {
  id: string;
  label: string;
  nearbyText: string;
  placeholder: string;
  elementName: string;
  elementId: string;
  ariaLabel: string;
  inputType: string;
  detectedFieldType: string;
  options: string[];
  pageHeading: string;
  atsPlatform: string;
  normalizedQuestionType: ApplicationQuestionType;
  classificationConfidence: number;
}

export interface GeneratedApplicationAnswer {
  fieldId: string;
  normalizedQuestionType: ApplicationQuestionType;
  answer: string | boolean | string[];
  answerSource: ApplicationAnswerSource;
  confidence: number;
  requiresReview: boolean;
  claimIds: string[];
  storyIds: string[];
  warnings: string[];
  reasoningSummary: string;
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
  kind: ResumeDocumentKind;
  templateId: string;
  contentJson: TailoredResume;
  resumeDocumentJson: ResumeDocument;
  validationJson: ValidationIssue[];
  status: ResumeStatus;
  lastExportPath: string;
  parentResumeVersionId: string;
  baseResumeVersionId: string;
  generationProvider: AIProviderMode | "deterministic";
  generationModel: string;
  promptVersion: string;
  promptVersionsJson: PromptVersionMap;
  layoutProfileId: RoleProfileId;
  templateSettingsJson: ResumeTemplateSettings;
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
  templateSettings: ResumeTemplateSettings;
  developerMode: boolean;
  uiState: AppUiState;
  semanticSearchMode: SemanticSearchMode;
  allowRemoteEmbeddings: boolean;
  allowPrivateNotesInEmbeddings: boolean;
  allowContactFieldsInCopilotContext: boolean;
}

export interface AppUiState {
  lastVisitedRoute: string;
  lastSearch: string;
}

export type ResumeFontFamily = "Helvetica Neue" | "Arial" | "Avenir Next" | "Times New Roman";

export interface ResumeTemplateSettings {
  fontFamily: ResumeFontFamily;
  bodyFontSize: number;
  headerFontSize: number;
  sectionHeadingSize: number;
  marginInches: number;
  sectionSpacing: number;
  bulletSpacing: number;
  dateAlignment: "right" | "inline";
  urlDisplay: "visible" | "labels";
  educationOrdering: "graduate-first" | "chronological";
  projectsExperienceOrdering: "projects-first" | "experience-first";
  summaryAllowed: boolean;
  maximumProjectCount: 2 | 3 | 4;
  defaultBulletsPerProject: 1 | 2 | 3;
}

export interface RoleProfile {
  id: RoleProfileId;
  name: string;
  sectionOrder: TailoredResume["sectionOrder"];
  summaryMode: SummaryMode;
  preferredProjectCount: 2 | 3 | 4;
  bulletsPerItem: 1 | 2 | 3;
  skillCategoryOrder: string[];
  roleTags: string[];
  emphasisTags: string[];
  deEmphasisTags: string[];
  preferredCareerItemIds: string[];
  optionalCareerItemIds: string[];
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
  technologies?: string[];
  url?: string;
  repositoryUrl?: string;
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

export interface ResumeContact {
  fullName: string;
  location: string;
  email: string;
  phone: string;
  portfolioUrl: string;
  linkedInUrl: string;
  githubUrl: string;
  workAuthorizationNote: string;
}

export interface ResumeDocumentBullet {
  id: string;
  text: string;
  sourceFactIds: string[];
  included: boolean;
  locked: boolean;
  approved: boolean;
}

export interface ResumeExperienceEntry {
  id: string;
  title: string;
  organization: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  technologies?: string[];
  bullets: ResumeDocumentBullet[];
}

export interface ResumeProjectEntry extends ResumeExperienceEntry {
  url: string;
  repositoryUrl: string;
  technologies: string[];
}

export interface ResumeSkillGroup {
  id: string;
  name: string;
  skills: string[];
}

export interface ResumeSection {
  id: string;
  title: string;
  content: string[];
}

export interface ResumeSourceReference {
  id: string;
  type: "uploaded_pdf" | "generated_pdf" | "text_import";
  label: string;
  path: string;
  sha256?: string;
  capturedAt: string;
}

export interface ResumeDocument {
  id: string;
  name: string;
  kind: ResumeDocumentKind;
  parentResumeId?: string;
  sourceJobId?: string;
  templateId: string;
  contact: ResumeContact;
  headline?: string;
  summary?: string;
  experience: ResumeExperienceEntry[];
  projects: ResumeProjectEntry[];
  education: ResumeEducationEntry[];
  skills: ResumeSkillGroup[];
  additionalSections?: ResumeSection[];
  sourceReferences?: ResumeSourceReference[];
  sectionOrder: string[];
  createdAt: string;
  updatedAt: string;
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
  roleProfileId: RoleProfileId;
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

export interface PromptVersionMap {
  jobAnalysis: string;
  planning: string;
  resumeGeneration: string;
  repair: string;
  bulletRegeneration: string;
  bulletShortening: string;
  careerIntake: string;
  careerCopilot: string;
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
  | "section_changed"
  | "summary_changed"
  | "layout_changed";

export interface ResumeDiffEntry {
  category: ResumeDiffCategory;
  section: string;
  careerItemId: string;
  sourceFactIds: string[];
  before: string;
  after: string;
  explanation: string;
}

export type SearchEntityType =
  | "profile"
  | "career_item"
  | "career_fact"
  | "skill"
  | "approved_bullet_variant"
  | "candidate_claim"
  | "sensitive_answer"
  | "career_story"
  | "approved_application_answer"
  | "job"
  | "job_requirement"
  | "application"
  | "application_field"
  | "application_note"
  | "resume"
  | "resume_bullet"
  | "evaluation_summary"
  | "career_import"
  | "career_copilot_summary";

export interface SearchDocument {
  id: string;
  entityType: SearchEntityType;
  entityId: string;
  parentEntityType: SearchEntityType | "";
  parentEntityId: string;
  title: string;
  normalizedText: string;
  metadataJson: Record<string, unknown>;
  contentHash: string;
  updatedAt: string;
}

export interface SearchFilters {
  entityTypes?: SearchEntityType[];
  roleCategory?: string;
  skill?: string;
  company?: string;
  applicationStatus?: ApplicationStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface SearchResult {
  document: SearchDocument;
  snippet: string;
  matchReasons: string[];
  scores: {
    exact: number;
    fts: number;
    semantic: number;
    metadata: number;
    recency: number;
    final: number;
  };
  sourceRef: InternalCitation;
}

export interface SearchDiagnostics {
  documentCount: number;
  fts5Available: boolean;
  ftsIndexHealthy: boolean;
  embeddingProvider: SemanticSearchMode;
  embeddingCount: number;
  staleDocumentCount: number;
  staleEmbeddingCount: number;
  lastCompleteReindex: string;
  lastSearchDurationMs: number;
  safeMessage: string;
}

export interface SearchEmbedding {
  id: string;
  searchDocumentId: string;
  provider: string;
  model: string;
  dimensions: number;
  vectorJson: number[];
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface InternalCitation {
  id: string;
  entityType: SearchEntityType;
  entityId: string;
  parentEntityType: SearchEntityType | "";
  parentEntityId: string;
  label: string;
  detail: string;
}

export interface ResumeQualityCheck {
  id: string;
  label: string;
  detail: string;
  status: "pass" | "warning" | "error" | "info";
  count: number;
}

export interface ResumeCategoryScore {
  id: string;
  label: string;
  score: number;
  weight: number;
  rationale: string;
}

export interface ResumeReviewFinding {
  id: string;
  severity: ResumeReviewFindingSeverity;
  category: string;
  message: string;
  recommendation: string;
  bulletId?: string;
  section?: string;
  relatedFactIds: string[];
  blocking: boolean;
}

export interface ResumeImprovementProposal {
  id: string;
  kind: ResumeImprovementKind;
  safety: ResumeImprovementSafety;
  title: string;
  rationale: string;
  before: string;
  after: string;
  bulletId?: string;
  careerItemId?: string;
  section?: string;
  sourceFactIds: string[];
  applied: boolean;
}

export interface ResumeReview {
  id: string;
  resumeId: string;
  jobId?: string;
  reviewMode: ResumeReviewMode;
  overallScore: number;
  categoryScores: ResumeCategoryScore[];
  strengths: ResumeReviewFinding[];
  weaknesses: ResumeReviewFinding[];
  criticalIssues: ResumeReviewFinding[];
  recommendedChanges: ResumeImprovementProposal[];
  factualRiskLevel: ResumeFactualRiskLevel;
  readyToSubmit: boolean;
  generatedAt: string;
  provider: string;
  model: string;
}

export interface ResumeImprovementRun {
  id: string;
  sourceResumeId: string;
  improvedResumeId: string;
  jobId?: string;
  reviewMode: ResumeReviewMode;
  originalReviewId: string;
  improvedReviewId: string;
  appliedProposalIds: string[];
  skippedProposalIds: string[];
  diff: ResumeDiffEntry[];
  pdfStatus: "not_rendered" | "rendered" | "failed";
  pdfPageCount: number | null;
  pdfError: string;
  createdAt: string;
}

export interface ApplicationRecord {
  id: string;
  jobId: string;
  company: string;
  role: string;
  jobUrl: string;
  resumeVersionId: string;
  submittedResumeVersionId: string;
  submittedPdfPath: string;
  submittedPdfHash: string;
  status: ApplicationStatus;
  appliedDate: string;
  followUpDate: string;
  referralContact: string;
  recruiter: string;
  hiringManager: string;
  referral: string;
  source: string;
  salaryRange: string;
  locationType: string;
  sponsorshipNotes: string;
  nextAction: string;
  notes: string;
  automationMode: ApplicationAutomationMode;
  applicationUrl: string;
  atsPlatform: string;
  matchScore: number | null;
  submittedAt: string;
  jobSnapshotJson: Job | null;
  statusHistoryJson: Array<{ status: ApplicationStatus; changedAt: string; note: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface SavedApplicationAnswer {
  id: string;
  jobId: string;
  applicationId: string;
  question: string;
  answer: string;
  sourceFactIds: string[];
  sourceCitationIds: string[];
  approvalStatus: "draft" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationFieldRecord {
  id: string;
  applicationId: string;
  originalQuestion: string;
  normalizedQuestionType: ApplicationQuestionType;
  detectedFieldType: string;
  generatedAnswer: unknown;
  finalAnswer: unknown;
  answerSource: ApplicationAnswerSource;
  confidence: number;
  requiresReview: boolean;
  userEdited: boolean;
  approved: boolean;
  doNotReuse: boolean;
  claimIds: string[];
  storyIds: string[];
  warnings: string[];
  reasoningSummary: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeRecommendation {
  id: string;
  targetJobId: string;
  candidateResumeVersionId: string;
  overallScore: number;
  roleScore: number;
  skillScore: number;
  responsibilityScore: number;
  evidenceScore: number;
  careerItemScore: number;
  recencyScore: number;
  validationScore: number;
  explanationJson: {
    reasons: string[];
    matchingSkills: string[];
    matchingResponsibilities: string[];
    reusableContent: string[];
    requiredChanges: string[];
    submitted: boolean;
    dismissed?: boolean;
  };
  createdAt: string;
}

export interface ResumeFavorite {
  resumeVersionId: string;
  createdAt: string;
}

export interface ResumeArchive {
  resumeVersionId: string;
  archivedAt: string;
}

export interface ResumeFamily {
  root: ResumeVersion;
  children: ResumeVersion[];
}

export type CareerCopilotContextType =
  | "all"
  | "job"
  | "application"
  | "resume"
  | "career_memory"
  | "job_search"
  | "resume_library"
  | "selected_projects"
  | "selected_records";

export type CareerCopilotRole = "user" | "assistant" | "system" | "tool";

export type CareerCopilotToolName =
  | "search_career_memory"
  | "get_career_item"
  | "get_career_fact"
  | "search_jobs"
  | "get_job"
  | "analyze_job_requirements"
  | "search_applications"
  | "get_application"
  | "search_resumes"
  | "get_resume"
  | "get_resume_lineage"
  | "compare_resumes"
  | "recommend_base_resumes"
  | "find_approved_bullet_variants"
  | "get_validation_results"
  | "get_evaluation_results"
  | "get_application_statistics"
  | "get_recent_activity";

export type CareerCopilotWriteActionType =
  | "create_resume_from_base"
  | "create_fresh_resume_draft"
  | "add_application_note"
  | "update_application_status"
  | "link_resume_to_application"
  | "favorite_resume"
  | "archive_resume"
  | "save_approved_answer"
  | "create_job_from_chat";

export interface CareerCopilotThread {
  id: string;
  title: string;
  activeContextType: CareerCopilotContextType;
  activeContextId: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string;
}

export interface CareerCopilotToolCall {
  id: string;
  name: CareerCopilotToolName | CareerCopilotWriteActionType;
  argumentsJson: Record<string, unknown>;
  resultSummary: string;
}

export interface CareerCopilotPendingAction {
  id: string;
  threadId: string;
  messageId: string;
  type: CareerCopilotWriteActionType;
  label: string;
  recordsAffected: Array<{ entityType: SearchEntityType; entityId: string; label: string }>;
  beforeJson: Record<string, unknown>;
  afterJson: Record<string, unknown>;
  status: "pending" | "confirmed" | "cancelled";
  createdAt: string;
  resolvedAt: string;
}

export interface CareerCopilotMessage {
  id: string;
  threadId: string;
  role: CareerCopilotRole;
  content: string;
  structuredContentJson: Record<string, unknown>;
  toolCallsJson: CareerCopilotToolCall[];
  internalCitationsJson: InternalCitation[];
  pendingActionsJson: CareerCopilotPendingAction[];
  provider: AIProviderMode | "deterministic";
  model: string;
  promptVersion: string;
  tokenUsageJson: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  createdAt: string;
}

export interface EvaluationMetrics {
  expectedProjectsSelected: string[];
  unexpectedProjectsSelected: string[];
  requiredSkillsRepresented: string[];
  missingRequiredSkills: string[];
  highRelevanceFactsUsed: number;
  unsupportedClaims: number;
  unsupportedNumbers: number;
  duplicateBullets: number;
  bulletLengthViolations: number;
  onePageSuccess: boolean;
  validationSuccess: boolean;
  lockedContentPreserved: boolean;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface EvaluationSummary {
  id: string;
  fixtureId: string;
  fixtureName: string;
  mode: EvaluationMode;
  provider: AIProviderMode | "deterministic";
  model: string;
  promptVersions: PromptVersionMap;
  roleProfileId: RoleProfileId;
  templateId: ResumeTemplateId;
  metrics: EvaluationMetrics;
  selectedCareerItemIds: string[];
  selectedFactIds: string[];
  validationIssues: ValidationIssue[];
  preferred: boolean;
  createdAt: string;
}

export interface GenerationComparisonResult {
  left: EvaluationSummary;
  right: EvaluationSummary;
  semanticDifferences: ResumeDiffEntry[];
  careerItemDifferences: string[];
  factDifferences: string[];
}

export interface MigrationEvent {
  id: number;
  fromVersion: number;
  toVersion: number;
  success: boolean;
  backupPath: string;
  errorCode: string;
  createdAt: string;
}

export interface DatabaseStatus {
  writable: boolean;
  schemaVersion: number;
  latestMigration: MigrationEvent | null;
}

export interface XeLaTeXDiagnostics {
  available: boolean;
  executablePath: string;
  version: string;
  lastSuccessfulCompilation: string;
  lastCompilationDurationMs: number | null;
  errorCode: string;
}

export interface FirstRunCheck {
  id: string;
  label: string;
  status: "ready" | "optional" | "needs_attention" | "blocking";
  detail: string;
}

export interface EvidenceImportCandidate {
  id: string;
  statement: string;
  sourceType: CareerFactSourceType;
  sourceReference: string;
  skillTags: string[];
  metricTokens: string[];
  confidence: "deterministic" | "review";
  approved: boolean;
  rejected: boolean;
}

export interface CareerImportProfileValue {
  fullName?: string;
  headline?: string;
  city?: string;
  region?: string;
  email?: string;
  phone?: string;
  portfolioUrl?: string;
  linkedInUrl?: string;
  githubUrl?: string;
  workAuthorizationNote?: string;
}

export interface CareerImportCareerItemValue {
  type: CareerItemType;
  title: string;
  organization?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  shortDescription?: string;
  url?: string;
  repositoryUrl?: string;
  enabled?: boolean;
}

export interface CareerImportCareerFactValue {
  statement: string;
  careerItemId?: string;
  careerItemTitle?: string;
  evidenceStatus: EvidenceStatus;
  sourceType: CareerFactSourceType;
  sourceReference: string;
  skillTags: string[];
  roleTags: string[];
  metricTokens: string[];
  importance: number;
  enabled: boolean;
}

export interface CareerImportSkillValue {
  name: string;
  category: string;
  proficiencyNote?: string;
  enabled?: boolean;
}

export interface CareerImportRelationshipValue {
  fromType: CareerImportTargetType;
  fromReference: string;
  toType: CareerImportTargetType;
  toReference: string;
  relationshipType: string;
}

export type CareerImportProposedValue =
  | CareerImportProfileValue
  | CareerImportCareerItemValue
  | CareerImportCareerFactValue
  | CareerImportSkillValue
  | CareerImportRelationshipValue;

export interface CareerImportChange<T = CareerImportProposedValue> {
  proposalId: string;
  operation: CareerImportOperation;
  targetType: CareerImportTargetType;
  existingRecordId: string;
  confidence: number;
  reason: string;
  sourceExcerpt: string;
  validationStatus: CareerImportValidationStatus;
  validationIssues: string[];
  duplicateCandidates: string[];
  conflictDetails: string[];
  userDecision: CareerImportUserDecision;
  proposedValue: T;
  existingValue: Partial<T> | null;
}

export interface CareerImportProposal {
  importId: string;
  sourceType: CareerImportSourceType;
  sourceTitle: string;
  sourceReference: string;
  profileChanges: Array<CareerImportChange<CareerImportProfileValue>>;
  careerItemChanges: Array<CareerImportChange<CareerImportCareerItemValue>>;
  careerFactChanges: Array<CareerImportChange<CareerImportCareerFactValue>>;
  skillChanges: Array<CareerImportChange<CareerImportSkillValue>>;
  relationshipChanges: Array<CareerImportChange<CareerImportRelationshipValue>>;
  warnings: string[];
  unresolvedQuestions: string[];
  extractionMetadata: {
    provider: AIProviderMode | "package" | "deterministic";
    model: string;
    promptVersion: string;
    classifiedAs: CareerImportSourceType;
    createdAt: string;
  };
}

export interface CareerImportRecord {
  id: string;
  sourceType: CareerImportSourceType;
  sourceTitle: string;
  sourceReference: string;
  createdAt: string;
  approvedCount: number;
  rejectedCount: number;
  mergedCount: number;
  recordsCreated: string[];
  recordsUpdated: string[];
  safeSourceHash: string;
  provider: string;
  model: string;
  promptVersion: string;
  undoSnapshotJson: {
    profile: Profile | null;
    careerItems: CareerItem[];
    careerFacts: CareerFact[];
    skills: Skill[];
  };
  undoneAt: string;
}

export interface BackupPreview {
  schemaVersion: number;
  exportedAt: string;
  counts: Record<string, number>;
  conflicts: string[];
  valid: boolean;
  errors: string[];
}

export interface BackupPayload {
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
  savedApplicationAnswers: SavedApplicationAnswer[];
  evaluationSummaries: EvaluationSummary[];
  careerImports: CareerImportRecord[];
  careerCopilotThreads: CareerCopilotThread[];
  careerCopilotMessages: CareerCopilotMessage[];
  resumeFavorites: ResumeFavorite[];
  resumeArchives: ResumeArchive[];
  resumeRecommendations: ResumeRecommendation[];
  resumeReviews: ResumeReview[];
  resumeImprovementRuns: ResumeImprovementRun[];
  settings: AppSettings;
  exportedAt: string;
  schemaVersion: number;
}
