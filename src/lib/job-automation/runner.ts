import type { AppRepository } from "../database/repository";
import { createId, nowIso } from "../utils";
import { adapterForSource } from "./adapters";
import { classifyCitizenshipRequirement, classifySponsorship } from "./classification";
import { findDuplicate, hasMaterialJobChange } from "./deduplication";
import { filterJob } from "./filtering";
import { scoreJob } from "./scoring";
import type { FetchContext } from "./types";
import type { JobAutomationRun } from "../../types/domain";

export interface RunJobAutomationOptions {
  fetchContext?: FetchContext;
  now?: () => Date;
}

export async function rescoreJob(repository: AppRepository, jobId: string, now = new Date()) {
  const job = await repository.getJob(jobId);
  if (!job) throw new Error("job_not_found|The selected job no longer exists.");
  const preferences = await repository.getJobSearchPreferences();
  const decision = filterJob(job, preferences, now);
  if (!decision.eligible) {
    await repository.saveJobMatch({
      jobId, deterministicScore: 0, combinedScore: 0, hardReject: true,
      hardRejectReasons: decision.hardRejectReasons, warnings: decision.warnings,
      sponsorshipStatus: classifySponsorship(job.descriptionText),
      citizenshipRequirement: classifyCitizenshipRequirement(job.descriptionText),
      analyzedAt: now.toISOString(),
    });
    await repository.saveJob({ ...job, rawDescription: job.rawDescription, status: "filtered_out", changedSinceAnalysis: false });
    return null;
  }
  const scoring = scoreJob(job, preferences, {
    careerItems: await repository.listCareerItems(),
    careerFacts: await repository.listCareerFacts(),
    skills: await repository.listSkills(),
  }, now);
  const match = await repository.saveJobMatch({
    jobId, ...scoring, hardReject: false, hardRejectReasons: [], warnings: decision.warnings,
    sponsorshipStatus: classifySponsorship(job.descriptionText),
    citizenshipRequirement: classifyCitizenshipRequirement(job.descriptionText), analyzedAt: now.toISOString(),
  });
  await repository.saveJob({ ...job, rawDescription: job.rawDescription,
    status: match.combinedScore >= preferences.minimumMatchScore ? "matched" : "analysis_pending",
    changedSinceAnalysis: false });
  return match;
}

function runningRun(id: string, startedAt: string): JobAutomationRun {
  return {
    id, startedAt, completedAt: "", status: "running", sourcesChecked: 0, jobsFetched: 0,
    jobsAdded: 0, jobsUpdated: 0, jobsDeduplicated: 0, jobsFiltered: 0, jobsAnalyzed: 0,
    resumesGenerated: 0, errors: [], summary: { message: "Job search is running.", highMatchJobIds: [], sourceFailureCount: 0 },
  };
}

export async function runJobAutomation(repository: AppRepository, options: RunJobAutomationOptions = {}) {
  const active = (await repository.listJobAutomationRuns()).find((run) => run.status === "running");
  if (active) throw new Error("automation_run_active|A job search run is already in progress.");

  const clock = options.now ?? (() => new Date());
  const startedAt = clock().toISOString();
  let run = runningRun(createId("job-run"), startedAt);
  await repository.saveJobAutomationRun(run);
  const preferences = await repository.getJobSearchPreferences();
  const career = {
    careerItems: await repository.listCareerItems(),
    careerFacts: await repository.listCareerFacts(),
    skills: await repository.listSkills(),
  };
  let jobs = await repository.listJobs();
  const applicationByJob = new Map((await repository.listApplications()).map((application) => [application.jobId, application]));
  const sources = (await repository.listJobSources()).filter((source) => source.enabled);
  let analyzedBudget = preferences.maximumJobsAnalyzedPerRun;

  for (const source of sources) {
    const adapter = adapterForSource(source.sourceType);
    if (!adapter) continue;
    run.sourcesChecked += 1;
    const checkedAt = clock().toISOString();
    try {
      const rawJobs = await adapter.fetchJobs(source, options.fetchContext);
      run.jobsFetched += rawJobs.length;
      for (const raw of rawJobs) {
        try {
          const incoming = adapter.normalizeJob(raw, source);
          const duplicate = findDuplicate(incoming, jobs);
          let saved;
          let requiresEvaluation = true;
          if (duplicate.duplicate) {
            const existing = jobs.find((job) => job.id === duplicate.canonicalJobId);
            if (!existing) continue;
            const materiallyChanged = hasMaterialJobChange(existing, incoming);
            const priorMatch = await repository.getJobMatch(existing.id);
            requiresEvaluation = materiallyChanged || !priorMatch;
            if (materiallyChanged) {
              if (priorMatch) await repository.saveJobMatchHistory({
                id: createId("job-match-history"), jobId: existing.id, contentHash: existing.contentHash,
                deterministicScore: priorMatch.deterministicScore, aiScore: priorMatch.aiScore,
                combinedScore: priorMatch.combinedScore, analysisJson: priorMatch.analysisJson,
                createdAt: nowIso(),
              });
            }
            saved = await repository.saveJob({
              ...incoming,
              id: existing.id,
              rawDescription: incoming.descriptionText,
              analysisJson: materiallyChanged ? null : existing.analysisJson,
              discoveredAt: existing.discoveredAt,
              status: materiallyChanged && !["applied", "rejected", "interviewing", "offer", "closed", "archived"].includes(existing.status)
                ? "analysis_pending"
                : existing.status,
              changedSinceAnalysis: materiallyChanged,
            });
            await repository.saveJobDuplicateEvent({
              id: createId("job-duplicate"), incomingExternalId: incoming.externalId,
              canonicalJobId: existing.id, sourceId: source.id, reason: duplicate.reason ?? "unknown",
              confidence: duplicate.confidence, createdAt: nowIso(),
            });
            run.jobsDeduplicated += 1;
            run.jobsUpdated += 1;
          } else {
            saved = await repository.saveJob({ ...incoming, rawDescription: incoming.descriptionText });
            run.jobsAdded += 1;
          }
          const tracked = applicationByJob.get(saved.id);
          const trackedStatus = tracked?.status === "interview" ? "interviewing" : tracked?.status;
          if (trackedStatus && ["applied", "interviewing", "rejected", "offer"].includes(trackedStatus)) {
            saved = await repository.saveJob({ ...saved, rawDescription: saved.rawDescription, status: trackedStatus as typeof saved.status });
          }
          jobs = [...jobs.filter((job) => job.id !== saved.id), saved];
          if (!requiresEvaluation) continue;

          const decision = filterJob(saved, preferences, clock());
          if (!decision.eligible) {
            await repository.saveJob({ ...saved, rawDescription: saved.rawDescription, status: "filtered_out" });
            await repository.saveJobMatch({
              jobId: saved.id, deterministicScore: 0, combinedScore: 0, hardReject: true,
              hardRejectReasons: decision.hardRejectReasons, warnings: decision.warnings,
              sponsorshipStatus: classifySponsorship(saved.descriptionText),
              citizenshipRequirement: classifyCitizenshipRequirement(saved.descriptionText),
            });
            run.jobsFiltered += 1;
            continue;
          }
          if (analyzedBudget <= 0) continue;
          analyzedBudget -= 1;
          const scoring = scoreJob(saved, preferences, career, clock());
          const highMatch = scoring.combinedScore >= preferences.minimumMatchScore;
          await repository.saveJobMatch({
            jobId: saved.id, ...scoring, hardReject: false, hardRejectReasons: [], warnings: decision.warnings,
            sponsorshipStatus: classifySponsorship(saved.descriptionText),
            citizenshipRequirement: classifyCitizenshipRequirement(saved.descriptionText),
            analyzedAt: clock().toISOString(),
          });
          await repository.saveJob({
            ...saved, rawDescription: saved.rawDescription, status: highMatch ? "matched" : "analysis_pending",
            changedSinceAnalysis: false,
          });
          if (highMatch) run.summary.highMatchJobIds.push(saved.id);
          run.jobsAnalyzed += 1;
        } catch (caught) {
          run.errors.push({
            scope: "job", id: raw.externalId, code: "job_processing_failed",
            message: caught instanceof Error ? caught.message : String(caught),
          });
        }
      }
      await repository.saveJobSource({ ...source, name: source.name, companyName: source.companyName,
        sourceType: source.sourceType, sourceIdentifier: source.sourceIdentifier,
        lastCheckedAt: checkedAt, lastSuccessAt: checkedAt, lastError: "" });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      run.errors.push({ scope: "source", id: source.id, code: "source_failed", message });
      run.summary.sourceFailureCount += 1;
      await repository.saveJobSource({ ...source, name: source.name, companyName: source.companyName,
        sourceType: source.sourceType, sourceIdentifier: source.sourceIdentifier,
        lastCheckedAt: checkedAt, lastError: message.slice(0, 500) });
    }
  }

  run.completedAt = clock().toISOString();
  run.status = run.errors.length ? (run.sourcesChecked > run.summary.sourceFailureCount ? "partial" : "failed") : "completed";
  run.summary.message = `${run.jobsAdded} added, ${run.jobsUpdated} updated, ${run.jobsFiltered} filtered, ${run.jobsAnalyzed} scored.`;
  await repository.saveJobAutomationRun(run);
  return run;
}
