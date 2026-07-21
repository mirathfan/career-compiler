import { JobAnalysisSchema } from "../../schemas/jobAnalysis";
import type { JobAnalysis } from "../../types/domain";

export function normalizeStoredJobAnalysis(value: unknown): JobAnalysis | null {
  const direct = JobAnalysisSchema.safeParse(value);
  if (direct.success) return direct.data;

  if (value && typeof value === "object" && "analysis" in value) {
    const nested = JobAnalysisSchema.safeParse((value as { analysis?: unknown }).analysis);
    if (nested.success) return nested.data;
  }

  return null;
}
