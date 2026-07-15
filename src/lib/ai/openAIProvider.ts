import { invoke } from "@tauri-apps/api/core";
import { JobAnalysisSchema, jobAnalysisJsonSchema } from "../../schemas/jobAnalysis";
import type { AIProvider, AnalyzeJobInput } from "./provider";

interface OpenAICommandRequest {
  model: string;
  jobDescription: string;
  company: string;
  roleTitle: string;
  schema: typeof jobAnalysisJsonSchema;
}

export class OpenAIProvider implements AIProvider {
  async analyzeJob(input: AnalyzeJobInput) {
    const response = await invoke<string>("analyze_job_with_openai", {
      request: {
        model: input.modelName,
        jobDescription: input.rawDescription,
        company: input.company,
        roleTitle: input.roleTitle,
        schema: jobAnalysisJsonSchema,
      } satisfies OpenAICommandRequest,
    });
    const parsed = JSON.parse(response) as unknown;
    return JobAnalysisSchema.parse(parsed);
  }
}
