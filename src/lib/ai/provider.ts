import type {
  AIProviderMode,
  AIProviderResult,
  JobAnalysis,
  ResumeGenerationRequest,
  ResumePlan,
  ResumeBullet,
  TailoredResume,
  ValidationIssue,
} from "../../types/domain";

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

export interface AIProvider {
  readonly mode: AIProviderMode;
  analyzeJob(input: AnalyzeJobInput): Promise<AIProviderResult<JobAnalysis>>;
  planResume(input: PlanResumeInput): Promise<AIProviderResult<ResumePlan>>;
  generateResume(input: GenerateResumeInput): Promise<AIProviderResult<TailoredResume>>;
  repairResume(input: RepairResumeInput): Promise<AIProviderResult<TailoredResume>>;
  shortenBullet(input: ShortenBulletInput): Promise<AIProviderResult<ResumeBullet>>;
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
