import { workspaceResumeAnswerSchema } from "../copilot/workspaceContract";
import { RESUME_BULLET_INSTRUCTIONS } from "../copilot/resumeBulletContract";
import { z } from "zod";
import { PROFILE_SKILL_INSTRUCTIONS } from "../copilot/profileSkillContract";
import { SynthesisAnswer, synthesisJsonSchema, SYNTHESIS_INSTRUCTIONS } from "../copilot/workspaceSynthesis";
import { ReadPlan } from "../copilot/workspaceReads";
import { workspaceSkillAnswerSchema, WorkspaceRequestSchema, WorkspaceAnswer, WORKSPACE_INSTRUCTIONS, workspacePlanJsonSchema, workspaceAnswerJsonSchema, type WorkspaceRequest, type WorkspaceResponse } from "../copilot/workspaceContract";
import { JobAnswerSchema, jobAnswerJsonSchema, JOB_CONVERSATION_INSTRUCTIONS, type JobConversationRequest } from "../copilot/modelContract";
import { invoke } from "@tauri-apps/api/core";
import {
  CareerImportProposal as CareerImportProposalSchema,
  careerImportProposalJsonSchema,
} from "../../schemas/careerImport";
import { JobAnalysisSchema, jobAnalysisJsonSchema } from "../../schemas/jobAnalysis";
import { JobMatchAnalysisSchema, jobMatchAnalysisJsonSchema } from "../../schemas/jobMatchAnalysis";
import { ResumeReviewAdvisorySchema, resumeReviewAdvisoryJsonSchema } from "../../schemas/resumeReview";
import {
  ResumePlanSchema,
  ResumeBulletSchema,
  TailoredResumeSchema,
  resumePlanJsonSchema,
  resumeBulletJsonSchema,
  tailoredResumeJsonSchema,
} from "../../schemas/resume";
import type {
  AIProviderResult,
  AIRequestMetadata,
  AIRequestType,
} from "../../types/domain";
import {
  JOB_ANALYSIS_PROMPT,
  JOB_MATCH_ANALYSIS_PROMPT,
  JOB_MATCH_REPAIR_PROMPT,
  BULLET_SHORTEN_PROMPT,
  CAREER_INTAKE_PROMPT,
  PROMPT_VERSIONS,
  RESUME_GENERATION_PROMPT,
  RESUME_PLAN_PROMPT,
  RESUME_REPAIR_PROMPT,
  RESUME_REVIEW_PROMPT,
} from "./prompts";
import {
  AIProviderError,
  type AIProvider,
  type AnalyzeJobInput,
  type AnalyzeJobMatchInput,
  type ExtractCareerInformationInput,
  type GenerateResumeInput,
  type PlanResumeInput,
  type RepairResumeInput,
  type RepairJobMatchInput,
  type ReviewResumeInput,
  type ShortenBulletInput,
} from "./provider";

interface OpenAICommandResponse {
  outputText: string;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

interface StructuredCall<T> {
  model: string;
  requestType: AIRequestType;
  instructions: string;
  input: unknown;
  schemaName: string;
  schema: unknown;
  parse: (value: unknown) => T;
  pdfDataUrl?: string;
}

function failedMetadata(model: string, requestType: AIRequestType, durationMs: number, errorCode: string): AIRequestMetadata {
  return {
    provider: "openai",
    model,
    requestType,
    success: false,
    durationMs,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    errorCode,
  };
}

function errorDetails(caught: unknown) {
  const raw = caught instanceof Error ? caught.message : String(caught);
  const separator = raw.indexOf("|");
  if (separator === -1) return { code: "provider_error", message: raw };
  return { code: raw.slice(0, separator), message: raw.slice(separator + 1) };
}

export class OpenAIProvider implements AIProvider {
  readonly mode = "openai" as const;

  private async callStructured<T>(call: StructuredCall<T>): Promise<AIProviderResult<T>> {
    const started = performance.now();
    let response: OpenAICommandResponse;
    try {
      response = await invoke<OpenAICommandResponse>("run_openai_structured", {
        request: {
          model: call.model,
          requestType: call.requestType,
          instructions: call.instructions,
          input: call.input,
          schemaName: call.schemaName,
          schema: call.schema,
          pdfDataUrl: call.pdfDataUrl,
        },
      });
    } catch (caught) {
      const details = errorDetails(caught);
      throw new AIProviderError(
        details.message,
        failedMetadata(call.model, call.requestType, Math.round(performance.now() - started), details.code),
      );
    }

    const metadata: AIRequestMetadata = {
      provider: "openai",
      model: call.model,
      requestType: call.requestType,
      success: true,
      durationMs: response.durationMs,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      totalTokens: response.totalTokens,
      errorCode: "",
    };
    try {
      return { data: call.parse(JSON.parse(response.outputText) as unknown), metadata };
    } catch {
      throw new AIProviderError(
        "OpenAI returned content that failed the local structured schema.",
        { ...metadata, success: false, errorCode: "structured_response_rejected" },
      );
    }
  }

  async converseWorkspace(input: { request: WorkspaceRequest; modelName: string }): Promise<AIProviderResult<WorkspaceResponse>> {
    const request = WorkspaceRequestSchema.parse(input.request);
    const planning = request.phase === "plan";
    if (request.allowResumeBulletProposal && request.allowProfileSkillProposal) throw new Error("Choose only one proposed action per request.");
    const skillSchema = request.allowResumeBulletProposal ? workspaceResumeAnswerSchema(request.responseStyle === "synthesis") : request.allowProfileSkillProposal ? workspaceSkillAnswerSchema(request.responseStyle === "synthesis") : null;
    const result = await this.callStructured({ model: input.modelName, requestType: "career_copilot", instructions: WORKSPACE_INSTRUCTIONS + (request.responseStyle === "synthesis" ? "\n" + SYNTHESIS_INSTRUCTIONS : "") + (request.allowResumeBulletProposal ? "\n" + RESUME_BULLET_INSTRUCTIONS : skillSchema ? "\n" + PROFILE_SKILL_INSTRUCTIONS : ""),
      input: request, schemaName: planning ? "career_workspace_plan_v1" : "career_workspace_quotes_v1",
      schema: planning ? workspacePlanJsonSchema : skillSchema ? z.toJSONSchema(skillSchema) : request.responseStyle === "synthesis" ? synthesisJsonSchema : workspaceAnswerJsonSchema,
      parse: (value): WorkspaceResponse => planning ? { phase: "plan", plan: ReadPlan.parse(value) } : skillSchema ? { phase: "answer", ...skillSchema.parse(value) } : { phase: "answer", answer: request.responseStyle === "synthesis" ? SynthesisAnswer.parse(value) : WorkspaceAnswer.parse(value) } });
    return result;
  }

  converseJob(input: { request: JobConversationRequest; modelName: string }) {
    return this.callStructured({ model: input.modelName, requestType: "career_copilot", instructions: JOB_CONVERSATION_INSTRUCTIONS,
      input: input.request, schemaName: "career_copilot_job_quotes_v1", schema: jobAnswerJsonSchema, parse: value => JobAnswerSchema.parse(value) });
  }

  analyzeJob(input: AnalyzeJobInput) {
    return this.callStructured({
      model: input.modelName,
      requestType: "job_analysis",
      instructions: JOB_ANALYSIS_PROMPT,
      input: {
        company: input.company,
        roleTitle: input.roleTitle,
        sourceUrl: input.sourceUrl,
        jobDescription: input.rawDescription,
      },
      schemaName: "job_analysis",
      schema: jobAnalysisJsonSchema,
      parse: (value) => JobAnalysisSchema.parse(value),
    });
  }

  analyzeJobMatch(input: AnalyzeJobMatchInput) {
    return this.callStructured({
      model: input.modelName,
      requestType: "job_match_analysis",
      instructions: JOB_MATCH_ANALYSIS_PROMPT,
      input: input.request,
      schemaName: "job_match_analysis_v2",
      schema: jobMatchAnalysisJsonSchema,
      parse: (value) => JobMatchAnalysisSchema.parse(value),
    });
  }

  repairJobMatch(input: RepairJobMatchInput) {
    return this.callStructured({
      model: input.modelName,
      requestType: "job_match_repair",
      instructions: JOB_MATCH_REPAIR_PROMPT,
      input: {
        ...input.request,
        promptVersion: PROMPT_VERSIONS.jobMatchRepair,
        invalidResult: input.invalidResult,
        validationIssues: input.validationIssues,
      },
      schemaName: "job_match_analysis_repair_v2",
      schema: jobMatchAnalysisJsonSchema,
      parse: (value) => JobMatchAnalysisSchema.parse(value),
    });
  }

  planResume(input: PlanResumeInput) {
    return this.callStructured({
      model: input.modelName,
      requestType: "resume_plan",
      instructions: RESUME_PLAN_PROMPT,
      input: { promptVersion: PROMPT_VERSIONS.planning, generationRequest: input.request },
      schemaName: "resume_plan",
      schema: resumePlanJsonSchema,
      parse: (value) => ResumePlanSchema.parse(value),
    });
  }

  generateResume(input: GenerateResumeInput) {
    return this.callStructured({
      model: input.modelName,
      requestType: "resume_generation",
      instructions: RESUME_GENERATION_PROMPT,
      input: { promptVersion: PROMPT_VERSIONS.resumeGeneration, generationRequest: input.request, resumePlan: input.plan },
      schemaName: "tailored_resume",
      schema: tailoredResumeJsonSchema,
      parse: (value) => TailoredResumeSchema.parse(value),
    });
  }

  repairResume(input: RepairResumeInput) {
    return this.callStructured({
      model: input.modelName,
      requestType: "validation_repair",
      instructions: RESUME_REPAIR_PROMPT,
      input: {
        promptVersion: PROMPT_VERSIONS.repair,
        generationRequest: input.request,
        resumePlan: input.plan,
        invalidResume: input.invalidResume,
        validationIssues: input.validationIssues,
      },
      schemaName: "tailored_resume_repair",
      schema: tailoredResumeJsonSchema,
      parse: (value) => TailoredResumeSchema.parse(value),
    });
  }

  shortenBullet(input: ShortenBulletInput) {
    return this.callStructured({
      model: input.modelName,
      requestType: "bullet_shortening",
      instructions: BULLET_SHORTEN_PROMPT,
      input: {
        promptVersion: PROMPT_VERSIONS.bulletShortening,
        generationRequest: input.request,
        bullet: input.bullet,
      },
      schemaName: "shortened_resume_bullet",
      schema: resumeBulletJsonSchema,
      parse: (value) => ResumeBulletSchema.parse(value),
    });
  }

  extractCareerInformation(input: ExtractCareerInformationInput) {
    return this.callStructured({
      model: input.modelName,
      requestType: "career_intake",
      instructions: CAREER_INTAKE_PROMPT,
      input: {
        promptVersion: PROMPT_VERSIONS.careerIntake,
        sourceType: input.sourceType,
        sourceTitle: input.sourceTitle,
        sourceReference: input.sourceReference,
        pastedText: input.text,
      },
      schemaName: "career_import_proposal",
      schema: careerImportProposalJsonSchema,
      parse: (value) => CareerImportProposalSchema.parse(value),
    });
  }

  reviewResume(input: ReviewResumeInput) {
    return this.callStructured({
      model: input.modelName,
      requestType: "resume_review",
      instructions: RESUME_REVIEW_PROMPT,
      input: {
        promptVersion: PROMPT_VERSIONS.resumeReview,
        reviewMode: input.reviewMode,
        reviewContext: input.reviewContext,
      },
      pdfDataUrl: input.pdfDataUrl,
      schemaName: "resume_review_advisory",
      schema: resumeReviewAdvisoryJsonSchema,
      parse: (value) => ResumeReviewAdvisorySchema.parse(value),
    });
  }
}
