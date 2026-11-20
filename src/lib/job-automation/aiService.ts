import type { AIProvider } from "../ai/provider";
import { AIProviderError } from "../ai/provider";
import type { JobMatchAnalysisServiceResult, JobMatchAnalysisTrigger, JobMatchModelRequest } from "./aiTypes";
import { hasJobMatchValidationErrors, validateJobMatchAnalysis } from "./aiValidation";

function errorDetails(caught: unknown) {
  if (caught instanceof AIProviderError) return { code: caught.metadata.errorCode || "provider_error", message: caught.message, metadata: caught.metadata };
  return { code: "analysis_failed", message: caught instanceof Error ? caught.message : String(caught), metadata: null };
}

export async function analyzeJobMatchWithRepair(input: {
  provider: AIProvider;
  request: JobMatchModelRequest;
  modelName: string;
  trigger: JobMatchAnalysisTrigger;
  now?: () => Date;
}): Promise<JobMatchAnalysisServiceResult> {
  const clock = input.now ?? (() => new Date());
  const started = performance.now();
  const createdAt = clock().toISOString();
  const calls: JobMatchAnalysisServiceResult["audit"]["calls"] = [];
  const baseAudit = {
    schemaVersion: "careercompiler-job-match-audit-v1" as const,
    trigger: input.trigger,
    contentHash: input.request.job.contentHash,
    model: input.modelName,
    promptVersion: input.request.promptVersion,
    calls,
    evidenceIdsSupplied: input.request.evidencePacket.items.map((item) => item.id),
    createdAt,
  };
  try {
    const initial = await input.provider.analyzeJobMatch({ request: input.request, modelName: input.modelName });
    calls.push(initial.metadata);
    const initialIssues = validateJobMatchAnalysis({ analysis: initial.data, request: input.request, evidencePacket: input.request.evidencePacket });
    if (!hasJobMatchValidationErrors(initialIssues)) {
      return {
        accepted: initial.data,
        audit: { ...baseAudit, state: "valid", originalOutput: initial.data, initialValidationIssues: initialIssues,
          repairAttempted: false, repairedOutput: null, finalValidationIssues: initialIssues,
          finalAcceptedOutput: initial.data, durationMs: Math.round(performance.now() - started), errorCode: "", errorMessage: "" },
      };
    }
    try {
      const repaired = await input.provider.repairJobMatch({
        request: input.request,
        modelName: input.modelName,
        invalidResult: initial.data,
        validationIssues: initialIssues,
      });
      calls.push(repaired.metadata);
      const repairedIssues = validateJobMatchAnalysis({ analysis: repaired.data, request: input.request, evidencePacket: input.request.evidencePacket });
      const repairedValid = !hasJobMatchValidationErrors(repairedIssues);
      return {
        accepted: repairedValid ? repaired.data : null,
        audit: { ...baseAudit, state: repairedValid ? "valid_after_repair" : "failed",
          originalOutput: initial.data, initialValidationIssues: initialIssues, repairAttempted: true,
          repairedOutput: repaired.data, finalValidationIssues: repairedIssues,
          finalAcceptedOutput: repairedValid ? repaired.data : null, durationMs: Math.round(performance.now() - started),
          errorCode: repairedValid ? "" : "repair_validation_failed",
          errorMessage: repairedValid ? "" : "The single repair attempt did not pass local validation." },
      };
    } catch (caught) {
      const details = errorDetails(caught);
      if (details.metadata) calls.push(details.metadata);
      return { accepted: null, audit: { ...baseAudit, state: "failed", originalOutput: initial.data,
        initialValidationIssues: initialIssues, repairAttempted: true, repairedOutput: null,
        finalValidationIssues: initialIssues, finalAcceptedOutput: null,
        durationMs: Math.round(performance.now() - started), errorCode: details.code, errorMessage: details.message } };
    }
  } catch (caught) {
    const details = errorDetails(caught);
    if (details.metadata) calls.push(details.metadata);
    return { accepted: null, audit: { ...baseAudit, state: "failed", originalOutput: null,
      initialValidationIssues: [], repairAttempted: false, repairedOutput: null, finalValidationIssues: [],
      finalAcceptedOutput: null, durationMs: Math.round(performance.now() - started),
      errorCode: details.code, errorMessage: details.message } };
  }
}
