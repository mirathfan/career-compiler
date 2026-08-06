import type {
  CareerFact,
  CareerItem,
  Job,
  JobSearchPreferences,
  JobSource,
  JobSourceType,
  Skill,
} from "../../types/domain";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface FetchContext {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxAttempts?: number;
  fetchJson?: (url: string, timeoutMs: number, signal?: AbortSignal) => Promise<unknown>;
}

export interface RawJobPosting {
  externalId: string;
  payload: unknown;
}

export type NormalizedJob = Omit<Job, "id" | "analysisJson" | "createdAt" | "updatedAt">;

export interface JobSourceAdapter {
  readonly type: JobSourceType;
  validateSource(source: JobSource): Promise<ValidationResult>;
  fetchJobs(source: JobSource, context?: FetchContext): Promise<RawJobPosting[]>;
  normalizeJob(raw: RawJobPosting, source: JobSource): NormalizedJob;
}

export interface JobFilterDecision {
  eligible: boolean;
  hardRejectReasons: string[];
  warnings: string[];
  matchedRules: string[];
}

export interface CareerMatchContext {
  careerItems: CareerItem[];
  careerFacts: CareerFact[];
  skills: Skill[];
}

export interface AutomationDependencies {
  preferences: JobSearchPreferences;
  career: CareerMatchContext;
}

export class JobSourceError extends Error {
  readonly code: string;
  readonly sourceId: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, sourceId: string, retryable = false) {
    super(message);
    this.name = "JobSourceError";
    this.code = code;
    this.sourceId = sourceId;
    this.retryable = retryable;
  }
}
