import type {
  AIProviderMode,
  AIProviderResult,
  CareerImportProposal,
  CareerImportSourceType,
  JobAnalysis,
  ResumeGenerationRequest,
  ResumePlan,
  ResumeBullet,
  ResumeReviewMode,
  TailoredResume,
  ValidationIssue,
} from "../../types/domain";
import type { ResumeReviewAdvisory } from "../../schemas/resumeReview";

export interface AnalyzeJobInput {
  company: string;
  roleTitle: string;
  sourceUrl: string;
  rawDescription: string;
  modelName: string;
}

export interface PlanResumeInput {
  request: ResumeGenerationRequest;
  modelName: string;
}

export interface GenerateResumeInput extends PlanResumeInput {
  plan: ResumePlan;
}

export interface RepairResumeInput extends GenerateResumeInput {
  invalidResume: TailoredResume;
  validationIssues: ValidationIssue[];
}

export interface ShortenBulletInput extends PlanResumeInput {
  bullet: ResumeBullet;
}

export interface ExtractCareerInformationInput {
  text: string;
  sourceType: CareerImportSourceType;
  sourceTitle: string;
  sourceReference: string;
  modelName: string;
}

export interface ReviewResumeInput {
  reviewMode: ResumeReviewMode;
  reviewContext: unknown;
  pdfDataUrl: string;
  modelName: string;
}

export interface AIProvider {
  readonly mode: AIProviderMode;
  analyzeJob(input: AnalyzeJobInput): Promise<AIProviderResult<JobAnalysis>>;
  planResume(input: PlanResumeInput): Promise<AIProviderResult<ResumePlan>>;
  generateResume(input: GenerateResumeInput): Promise<AIProviderResult<TailoredResume>>;
  repairResume(input: RepairResumeInput): Promise<AIProviderResult<TailoredResume>>;
  shortenBullet(input: ShortenBulletInput): Promise<AIProviderResult<ResumeBullet>>;
  extractCareerInformation(input: ExtractCareerInformationInput): Promise<AIProviderResult<CareerImportProposal>>;
  reviewResume(input: ReviewResumeInput): Promise<AIProviderResult<ResumeReviewAdvisory>>;
}

export class AIProviderError extends Error {
  readonly metadata: AIProviderResult<never>["metadata"];

  constructor(
    message: string,
    metadata: AIProviderResult<never>["metadata"],
  ) {
    super(message);
    this.name = "AIProviderError";
    this.metadata = metadata;
  }
}
