import type { AIRequestMetadata, Job, JobScoreBreakdown, JobSearchPreferences } from "../../types/domain";
import type { JobMatchAnalysis } from "../../schemas/jobMatchAnalysis";
import type { JobFilterDecision } from "./types";

export type JobMatchEvidenceCategory = "skill" | "project" | "experience" | "education" | "fact" | "resume_profile";

export interface JobMatchEvidenceItem {
  id: string;
  category: JobMatchEvidenceCategory;
  text: string;
  tags: string[];
  normalizedSkills: string[];
  numericClaims: string[];
  locked: boolean;
  permittedForResume: boolean;
}

export interface JobMatchEvidencePacket {
  version: "careercompiler-job-match-evidence-v1";
  jobId: string;
  items: JobMatchEvidenceItem[];
  suppliedIds: {
    evidenceIds: string[];
    skillIds: string[];
    projectIds: string[];
    experienceIds: string[];
    educationIds: string[];
    resumeProfileIds: string[];
  };
}

export interface JobMatchValidationIssue {
  code: string;
  severity: "warning" | "error";
  path?: string;
  message: string;
  evidenceId?: string;
}

export type JobMatchAnalysisState =
  | "not_requested"
  | "approval_required"
  | "queued"
  | "running"
  | "valid"
  | "valid_after_repair"
  | "failed"
  | "stale"
  | "deterministic_only";

export type JobMatchAnalysisTrigger = "manual" | "automation_approved" | "reanalysis" | "mock" | "future_cloud_runner";

export interface JobMatchModelRequest {
  budgetAttemptId?: string;
  promptVersion: string;
  job: Pick<Job,
    "id" | "company" | "roleTitle" | "descriptionText" | "location" | "workplaceType" |
    "employmentType" | "department" | "salaryMin" | "salaryMax" | "salaryCurrency" |
    "salaryInterval" | "postedAt" | "applicationUrl" | "contentHash">;
  deterministic: {
    filter: JobFilterDecision;
    score: number;
    scoreBreakdown: JobScoreBreakdown;
    reasons: string[];
  };
  preferences: Pick<JobSearchPreferences,
    "targetRoleTitles" | "preferredLocations" | "remotePreference" | "preferredSkills" |
    "maximumExperienceYears" | "seniorityLevels" | "salaryMinimum" | "salaryCurrency" |
    "citizenshipRestrictionBehavior" | "sponsorshipFilteringBehavior">;
  evidencePacket: JobMatchEvidencePacket;
}

export interface AnalyzeJobMatchInput {
  request: JobMatchModelRequest;
  modelName: string;
}

export interface RepairJobMatchInput extends AnalyzeJobMatchInput {
  invalidResult: JobMatchAnalysis;
  validationIssues: JobMatchValidationIssue[];
}

export interface JobMatchAnalysisAudit {
  evidenceFingerprintVersion?: string;
  evidenceFingerprint?: string;
  attemptId?: string;
  schemaVersion: "careercompiler-job-match-audit-v1";
  state: JobMatchAnalysisState;
  trigger: JobMatchAnalysisTrigger;
  contentHash: string;
  model: string;
  promptVersion: string;
  originalOutput: JobMatchAnalysis | null;
  initialValidationIssues: JobMatchValidationIssue[];
  repairAttempted: boolean;
  repairedOutput: JobMatchAnalysis | null;
  finalValidationIssues: JobMatchValidationIssue[];
  finalAcceptedOutput: JobMatchAnalysis | null;
  calls: AIRequestMetadata[];
  durationMs: number;
  evidenceIdsSupplied: string[];
  errorCode: string;
  errorMessage: string;
  createdAt: string;
}

export interface JobMatchAnalysisServiceResult {
  audit: JobMatchAnalysisAudit;
  accepted: JobMatchAnalysis | null;
}
