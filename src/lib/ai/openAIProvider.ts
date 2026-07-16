import { invoke } from "@tauri-apps/api/core";
import { JobAnalysisSchema, jobAnalysisJsonSchema } from "../../schemas/jobAnalysis";
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
  BULLET_SHORTEN_PROMPT,
  PROMPT_VERSIONS,
  RESUME_GENERATION_PROMPT,
  RESUME_PLAN_PROMPT,
  RESUME_REPAIR_PROMPT,
} from "./prompts";
import {
  AIProviderError,
  type AIProvider,
  type AnalyzeJobInput,
  type GenerateResumeInput,
  type PlanResumeInput,
  type RepairResumeInput,
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
}
