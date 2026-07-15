import type { JobAnalysis } from "../../types/domain";

export interface AnalyzeJobInput {
  company: string;
  roleTitle: string;
  sourceUrl: string;
  rawDescription: string;
  modelName: string;
}

export interface AIProvider {
  analyzeJob(input: AnalyzeJobInput): Promise<JobAnalysis>;
}
