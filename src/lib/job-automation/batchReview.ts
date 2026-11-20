import { matchEvidenceFingerprint } from "./evidenceFreshness";
import { isIsolatedRuntime } from "../acceptance/runtime";
import { canonicalDigest } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
import type { AppRepository } from "../database/repository";
import { buildJobMatchEvidencePacket } from "./evidencePacket";
import { previewJobMatchBatch, type JobMatchBatchPreview } from "./aiBatch";

export async function jobReviewContext(repository: AppRepository, jobId: string) {
  const [job, match, preferences, settings, careerItems, careerFacts, skills] = await Promise.all([
    repository.getJob(jobId), repository.getJobMatch(jobId), repository.getJobSearchPreferences(), repository.getSettings(),
    repository.listCareerItems(), repository.listCareerFacts(), repository.listSkills(),
  ]);
  if (!job || !match) throw new Error("analysis_review_missing|The reviewed job is no longer available.");
  const evidencePacket = buildJobMatchEvidencePacket({ job, preferences, careerItems, careerFacts, skills });
  // Local approval binding, never sent as candidate context to a provider.
  const evidenceFingerprint = await matchEvidenceFingerprint(repository, jobId);
  const fingerprint = await canonicalDigest({ job, evidencePacket, evidenceFingerprint, preferences,
    model: preferences.aiMatchModel || settings.modelName, provider: settings.aiProvider,
    deterministic: { score: match.deterministicScore, breakdown: match.scoreBreakdown, reasons: match.scoreReasons, hardReject: match.hardReject } });
  return { job, match, evidencePacket, fingerprint, evidenceFingerprint, preferences, selectedModel: preferences.aiMatchModel || settings.modelName, providerMode: isIsolatedRuntime() || preferences.aiMatchMockMode || settings.aiProvider === "mock" ? "mock" : "openai" };
}
export type ReviewedJob = Awaited<ReturnType<typeof jobReviewContext>>;
export interface BatchReview { preview: JobMatchBatchPreview; jobs: ReviewedJob[] }
export async function prepareBatchReview(repository: AppRepository, input: { jobIds: string[]; forceReanalysis?: boolean }): Promise<BatchReview> {
  return repository.transaction(async (transaction) => {
    const preview = await previewJobMatchBatch(transaction, input);
    if (!preview.jobIds.length) throw new Error(`No eligible analyses can start. Daily reservations: ${preview.dailyUsed}/${preview.dailyCap}; check filters and unchanged analyses.`);
    const jobs = await Promise.all(preview.jobIds.map(id => jobReviewContext(transaction, id)));
    return { preview, jobs };
  });
}
