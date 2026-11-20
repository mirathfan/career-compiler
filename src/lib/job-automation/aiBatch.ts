import { EVIDENCE_FINGERPRINT_VERSION, matchEvidenceFingerprint } from "./evidenceFreshness";
import { canonicalDigest } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
import { jobReviewContext, type ReviewedJob } from "./batchReview";
import { isIsolatedRuntime } from "../acceptance/runtime";
import { budgetUsage, reserveBudget, markMockAttempt, finishBudget } from "./budget";
import { jobFingerprint } from "./safety";
import type { AIProvider } from "../ai/provider";
import { createAIProvider } from "../ai/providerFactory";
import { PROMPT_VERSIONS } from "../ai/prompts";
import type { AppRepository } from "../database/repository";
import { createId } from "../utils";
import type { Job } from "../../types/domain";
import { analyzeJobMatchWithRepair } from "./aiService";
import type { JobMatchAnalysisAudit, JobMatchAnalysisTrigger, JobMatchModelRequest } from "./aiTypes";
import { readJobMatchAnalysisAudit } from "./analysisState";
import { filterJob } from "./filtering";
import { combineScores } from "./scoring";

export interface JobMatchBatchPreview {
  requested: number;
  eligible: number;
  skippedFiltered: number;
  skippedBelowThreshold: number;
  skippedUnchanged: number;
  skippedDailyCap: number;
  selectedModel: string;
  providerMode: "mock" | "openai";
  perRunCap: number;
  dailyCap: number;
  dailyUsed: number;
  jobIds: string[];
}

export function batchApprovalText(preview: JobMatchBatchPreview) {
  return `Approve ${preview.jobIds.length} ${preview.providerMode === "mock" ? "mock" : "paid"} AI analyses?\n\n` +
    `Provider: ${preview.providerMode}${preview.providerMode === "mock" ? " (no network requests)" : ""}\nModel: ${preview.selectedModel || "app default"}\n` +
    `Run cap: ${preview.perRunCap} analyses\nDaily reservations: ${preview.dailyUsed}/${preview.dailyCap}\n` +
    `Each analysis reserves one daily slot and may attempt up to two provider calls, including repair. Reservations are not refunded. Cost is not inferred from these counters.\n\n` +
    `Only displayed job fields and allowlisted evidence are included. No application will be submitted.`;
}

export interface JobMatchBatchResult extends JobMatchBatchPreview {
  started: number;
  valid: number;
  repaired: number;
  failed: number;
  cancelled: boolean;
  errors: Array<{ jobId: string; code: string; message: string }>;
}

let activeBatch: { cancelled: boolean } | null = null;

function pendingAudit(input: { state: "queued" | "running" | "deterministic_only"; trigger: JobMatchAnalysisTrigger; job: Job; model: string; now: string }): JobMatchAnalysisAudit {
  return {
    schemaVersion: "careercompiler-job-match-audit-v1", state: input.state, trigger: input.trigger,
    contentHash: input.job.contentHash, model: input.model, promptVersion: PROMPT_VERSIONS.jobMatchAnalysis,
    originalOutput: null, initialValidationIssues: [], repairAttempted: false, repairedOutput: null,
    finalValidationIssues: [], finalAcceptedOutput: null, calls: [], durationMs: 0,
    evidenceIdsSupplied: [], errorCode: "", errorMessage: "", createdAt: input.now,
  };
}

async function batchContext(repository: AppRepository) {
  const [preferences, settings, jobs, matches, history] = await Promise.all([
    repository.getJobSearchPreferences(), repository.getSettings(), repository.listJobs(),
    repository.listJobMatches(), repository.listJobMatchHistory(),
  ]);
  const providerMode: "mock" | "openai" = isIsolatedRuntime() || preferences.aiMatchMockMode || settings.aiProvider === "mock" ? "mock" : "openai";
  return {
    preferences, settings, jobs, matches, history, providerMode,
    model: preferences.aiMatchModel || settings.modelName,
  };
}

export async function previewJobMatchBatch(repository: AppRepository, input: {
  jobIds: string[];
  forceReanalysis?: boolean;
  now?: Date;
}): Promise<JobMatchBatchPreview> {
  const context = await batchContext(repository);
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const dailyUsed = (await budgetUsage(repository, today)).reserved;
  const matchByJob = new Map(context.matches.map((match) => [match.jobId, match]));
  const requestedJobs = [...new Set(input.jobIds)].map((id) => context.jobs.find((job) => job.id === id)).filter((job): job is Job => Boolean(job));
  let skippedFiltered = 0;
  let skippedBelowThreshold = 0;
  let skippedUnchanged = 0;
  const candidates: string[] = [];
  for (const job of requestedJobs) {
    const match = matchByJob.get(job.id);
    if (!match || match.hardReject || ["filtered_out", "applied", "rejected", "archived", "closed"].includes(job.status)) { skippedFiltered += 1; continue; }
    if (match.deterministicScore < context.preferences.aiMatchMinimumDeterministicScore) { skippedBelowThreshold += 1; continue; }
    const audit = readJobMatchAnalysisAudit(match.analysisJson);
    const unchangedValid = audit && ["valid", "valid_after_repair"].includes(audit.state) && audit.contentHash === job.contentHash;
    if (unchangedValid && !input.forceReanalysis) { skippedUnchanged += 1; continue; }
    candidates.push(job.id);
  }
  const remainingDaily = Math.max(0, context.preferences.maximumAiAnalysesPerDay - dailyUsed);
  const allowed = Math.min(context.preferences.maximumAiAnalysesPerRun, remainingDaily);
  const jobIds = candidates.slice(0, allowed);
  return {
    requested: requestedJobs.length,
    eligible: candidates.length,
    skippedFiltered,
    skippedBelowThreshold,
    skippedUnchanged,
    skippedDailyCap: Math.max(0, candidates.length - jobIds.length),
    selectedModel: context.model,
    providerMode: context.providerMode,
    perRunCap: context.preferences.maximumAiAnalysesPerRun,
    dailyCap: context.preferences.maximumAiAnalysesPerDay,
    dailyUsed,
    jobIds,
  };
}

export function cancelPendingJobMatchBatch() {
  if (activeBatch) activeBatch.cancelled = true;
}

async function updateLatestRunMetrics(repository: AppRepository, result: JobMatchBatchResult) {
  await repository.transaction(async (repository) => {
  const runs = await repository.listJobAutomationRuns();
  const latest = runs[0];
  if (!latest) return;
  const metrics = latest.summary.aiMetrics;
  await repository.saveJobAutomationRun({
    ...latest,
    summary: { ...latest.summary, aiMetrics: {
      ...metrics,
      eligible: metrics.eligible + result.eligible,
      approvalsRequested: metrics.approvalsRequested + result.jobIds.length,
      started: metrics.started + result.started,
      valid: metrics.valid + result.valid,
      repaired: metrics.repaired + result.repaired,
      failed: metrics.failed + result.failed,
      skippedCap: metrics.skippedCap + result.skippedDailyCap,
      skippedUnchanged: metrics.skippedUnchanged + result.skippedUnchanged,
      packagesAwaitingApproval: (await repository.listApplicationPackages()).filter((item) => !item.approvedAt).length,
    } },
  });
  });
}

export async function runApprovedJobMatchBatch(repository: AppRepository, input: {
  jobIds: string[];
  approved: boolean;
  reviewedJobs?: ReviewedJob[];
  trigger: JobMatchAnalysisTrigger;
  forceReanalysis?: boolean;
  provider?: AIProvider;
  now?: () => Date;
}): Promise<JobMatchBatchResult> {
  if (activeBatch) throw new Error("ai_batch_active|An AI match-analysis batch is already running.");
  // Acquire synchronously, before the first await; release only after all persistence.
  const ownedAttempts = new Set<string>();
  const batch = { cancelled: false };
  activeBatch = batch;
  try {
    const context = await batchContext(repository);
    if (!context.preferences.aiMatchEnabled) throw new Error("ai_match_disabled|Enable AI match analysis in Job Radar first.");
    if (context.preferences.aiMatchRequireApproval && !input.approved) throw new Error("ai_approval_required|Explicit approval is required before this AI batch can run.");
    const clock = input.now ?? (() => new Date());
    // No active batch exists while this lock is held during setup. Running states
    // left by a previous crash/failure are interrupted, never resumed implicitly.
    for (const match of context.matches) {
      const audit = readJobMatchAnalysisAudit(match.analysisJson);
      if (audit?.state !== "running") continue;
      const owner = (await repository.listSafetyRecords("ai_budget")).find((record) => record.id === audit.attemptId);
      if (owner && owner.value.state !== "finished" && Number(owner.value.leaseUntil) > clock().getTime()) continue;
      await repository.saveJobMatch({ ...match, aiScore: null, combinedScore: match.deterministicScore,
        analysisJson: { ...audit, state: "failed", errorCode: "analysis_interrupted",
          errorMessage: "A prior batch was interrupted. Explicit reanalysis is required." } });
    }
    const preview = await previewJobMatchBatch(repository, { jobIds: input.jobIds, forceReanalysis: input.forceReanalysis, now: clock() });
    const result: JobMatchBatchResult = { ...preview, started: 0, valid: 0, repaired: 0, failed: 0, cancelled: false, errors: [] };
    const provider = input.provider ?? createAIProvider(preview.providerMode);
    for (const jobId of preview.jobIds) {
      if (batch.cancelled) { result.cancelled = true; break; }
      const reviewed = input.reviewedJobs?.find(item => item.job.id === jobId);
      const currentReview = await repository.transaction(transaction => jobReviewContext(transaction, jobId));
      const { job, match } = currentReview;
      const evidenceFingerprint = currentReview.evidenceFingerprint;
      if (input.reviewedJobs && (!reviewed || reviewed.fingerprint !== currentReview.fingerprint)) throw new Error("analysis_review_stale|Job, evidence or analysis settings changed. Review again before analysis.");
      if (preview.selectedModel !== currentReview.selectedModel || preview.providerMode !== currentReview.providerMode) throw new Error("analysis_review_stale|Provider selection changed. Review again.");
      if (await canonicalDigest(context.preferences) !== await canonicalDigest(currentReview.preferences)) throw new Error("analysis_review_stale|Analysis preferences changed. Review again.");
      const now = clock().toISOString();
      const attemptId = createId("job-match-attempt");
      if (!await reserveBudget(repository, attemptId, jobId, jobFingerprint(job), now, preview.providerMode)) { result.skippedDailyCap += 1; continue; }
      ownedAttempts.add(attemptId);
      const reservation = { ...pendingAudit({ state: "running", trigger: input.trigger, job, model: preview.selectedModel, now }), attemptId };
      // Immutable reservation survives crashes and consumes daily capacity even if
      // the provider or later persistence fails. Terminal audit shares its ID.
      await repository.saveJobMatchHistory({ id: attemptId, jobId, contentHash: job.contentHash,
        deterministicScore: match.deterministicScore, aiScore: null, combinedScore: match.deterministicScore,
        analysisJson: reservation, createdAt: now });
      await repository.saveJobMatch({ ...match, jobId, deterministicScore: match.deterministicScore,
        combinedScore: match.deterministicScore, aiScore: null, analysisJson: reservation });
      if (batch.cancelled) { result.cancelled = true; break; }
      result.started += 1;
      const evidencePacket = currentReview.evidencePacket;
      const filter = filterJob(job, context.preferences, clock());
      const request: JobMatchModelRequest = {
        budgetAttemptId: attemptId,
        promptVersion: PROMPT_VERSIONS.jobMatchAnalysis,
        job: {
          id: job.id, company: job.company, roleTitle: job.roleTitle, descriptionText: job.descriptionText,
          location: job.location, workplaceType: job.workplaceType, employmentType: job.employmentType,
          department: job.department, salaryMin: job.salaryMin, salaryMax: job.salaryMax,
          salaryCurrency: job.salaryCurrency, salaryInterval: job.salaryInterval, postedAt: job.postedAt,
          applicationUrl: job.applicationUrl, contentHash: job.contentHash,
        },
        deterministic: { filter, score: match.deterministicScore, scoreBreakdown: match.scoreBreakdown, reasons: match.scoreReasons },
        preferences: {
          targetRoleTitles: context.preferences.targetRoleTitles, preferredLocations: context.preferences.preferredLocations,
          remotePreference: context.preferences.remotePreference, preferredSkills: context.preferences.preferredSkills,
          maximumExperienceYears: context.preferences.maximumExperienceYears, seniorityLevels: context.preferences.seniorityLevels,
          salaryMinimum: context.preferences.salaryMinimum, salaryCurrency: context.preferences.salaryCurrency,
          citizenshipRestrictionBehavior: context.preferences.citizenshipRestrictionBehavior,
          sponsorshipFilteringBehavior: context.preferences.sponsorshipFilteringBehavior,
        },
        evidencePacket,
      };
      const budgetedProvider = Object.create(provider) as AIProvider;
      if (preview.providerMode === "mock") {
        budgetedProvider.analyzeJobMatch = async (input) => { await markMockAttempt(repository, attemptId); return provider.analyzeJobMatch(input); };
        budgetedProvider.repairJobMatch = async (input) => { await markMockAttempt(repository, attemptId); return provider.repairJobMatch(input); };
      }
      const service = await analyzeJobMatchWithRepair({ provider: budgetedProvider, request, modelName: preview.selectedModel, trigger: input.trigger, now: clock });
      await repository.transaction(async (repository) => {
      service.audit.attemptId = attemptId;
      service.audit.evidenceFingerprintVersion = EVIDENCE_FINGERPRINT_VERSION;
      service.audit.evidenceFingerprint = evidenceFingerprint;
      const currentJob = await repository.getJob(jobId);
      const currentMatch = await repository.getJobMatch(jobId);
      const currentEvidence = await jobReviewContext(repository, jobId);
      const changed = await matchEvidenceFingerprint(repository, jobId) !== evidenceFingerprint || currentEvidence.fingerprint !== currentReview.fingerprint || !currentJob || currentJob.contentHash !== job.contentHash || readJobMatchAnalysisAudit(currentMatch?.analysisJson)?.attemptId !== attemptId;
      const accepted = changed ? null : service.accepted;
      if (changed) { service.audit.state = "stale"; service.audit.errorCode = "analysis_context_changed"; service.audit.errorMessage = "Job or analysis ownership changed during the request."; service.audit.finalAcceptedOutput = null; }
      const combinedScore = accepted
        ? combineScores(match.deterministicScore, accepted.score, context.preferences.deterministicScoreWeight)
        : match.deterministicScore;
      await repository.saveJobMatchHistory({
        id: createId("job-match-history"), jobId, contentHash: job.contentHash,
        deterministicScore: match.deterministicScore, aiScore: accepted?.score ?? null,
        combinedScore, analysisJson: service.audit, createdAt: service.audit.createdAt,
      });
      if (accepted) {
        const hardReject = match.hardReject || accepted.hardReject;
        await repository.saveJobMatch({
          ...match, jobId, deterministicScore: match.deterministicScore, aiScore: accepted.score, combinedScore,
          hardReject, hardRejectReasons: [...new Set([...match.hardRejectReasons, ...accepted.hardRejectReasons])],
          matchedFactIds: accepted.matchedEvidenceIds, matchedSkillIds: accepted.matchedSkillIds,
          matchedProjectIds: accepted.matchedProjectIds, missingRequirements: accepted.missingRequirements,
          strengths: accepted.strengths, concerns: accepted.concerns,
          recommendedResumeProfile: accepted.recommendedResumeProfile ?? "",
          sponsorshipStatus: accepted.sponsorshipStatus,
          experienceCompatibility: accepted.experienceCompatibility,
          locationCompatibility: accepted.locationCompatibility,
          analysisModel: preview.selectedModel, analysisPromptVersion: PROMPT_VERSIONS.jobMatchAnalysis,
          analysisJson: service.audit, analyzedAt: service.audit.createdAt,
        });
        if (hardReject) await repository.saveJob({ ...job, rawDescription: job.rawDescription, status: "filtered_out" });
        result.valid += 1;
        if (service.audit.state === "valid_after_repair") result.repaired += 1;
      } else {
        if (!changed || readJobMatchAnalysisAudit(currentMatch?.analysisJson)?.attemptId === attemptId) await repository.saveJobMatch({ ...(currentMatch ?? match), jobId, deterministicScore: currentMatch?.deterministicScore ?? match.deterministicScore,
          aiScore: null, combinedScore: currentMatch?.deterministicScore ?? match.deterministicScore, analysisModel: preview.selectedModel,
          analysisPromptVersion: PROMPT_VERSIONS.jobMatchAnalysis, analysisJson: service.audit,
          analyzedAt: service.audit.createdAt });
        result.failed += 1;
        result.errors.push({ jobId, code: service.audit.errorCode, message: service.audit.errorMessage });
      }
      await finishBudget(repository, attemptId);
      });
    }
    await updateLatestRunMetrics(repository, result);
    return result;
  } finally {
    try {
      // Cancellation and non-provider failures must not leave a false running
      // state. Reservations remain immutable and counted after cleanup.
      for (const match of await repository.listJobMatches()) {
        const audit = readJobMatchAnalysisAudit(match.analysisJson);
        if (audit?.state !== "running" || !audit.attemptId || !ownedAttempts.has(audit.attemptId)) continue;
        await repository.saveJobMatch({ ...match, aiScore: null, combinedScore: match.deterministicScore,
          analysisJson: { ...audit, state: "failed", errorCode: batch.cancelled ? "analysis_cancelled" : "analysis_interrupted",
            errorMessage: "The batch did not complete. Explicit reanalysis is required." } });
      }
    } catch {
      // A storage failure can prevent cleanup. The next explicit start performs
      // the same recovery before calculating capacity; never refund a reservation.
    } finally {
      activeBatch = null;
    }
  }
}

export async function setDeterministicScoreOnly(repository: AppRepository, jobId: string) {
  const [job, match] = await Promise.all([repository.getJob(jobId), repository.getJobMatch(jobId)]);
  if (!job || !match) throw new Error("job_match_missing|The selected job match no longer exists.");
  const existing = readJobMatchAnalysisAudit(match.analysisJson);
  const audit = existing
    ? { ...existing, state: "deterministic_only" as const, createdAt: new Date().toISOString() }
    : pendingAudit({ state: "deterministic_only", trigger: "manual", job, model: "", now: new Date().toISOString() });
  return repository.saveJobMatch({ ...match, jobId, deterministicScore: match.deterministicScore,
    aiScore: null, combinedScore: match.deterministicScore, analysisJson: audit });
}
