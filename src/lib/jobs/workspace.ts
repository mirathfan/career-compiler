import type { ApplicationPackage, ApplicationRecord, Job, JobMatch, ResumeVersion } from "../../types/domain";
import { readJobMatchAnalysisAudit } from "../job-automation/analysisState";

export type JobsView = "recommended" | "saved" | "all" | "skipped";
export type WorkspaceTab = "overview" | "resume" | "application" | "activity";

export function jobFit(match: JobMatch | undefined, job?: Job) {
  const audit = readJobMatchAnalysisAudit(match?.analysisJson);
  const validated = (audit?.state === "valid" || audit?.state === "valid_after_repair") && !job?.changedSinceAnalysis && (!job?.contentHash || !audit?.contentHash || job.contentHash === audit.contentHash);
  return {
    score: match ? Math.round(audit && !validated || job?.changedSinceAnalysis ? match.deterministicScore : match.combinedScore) : null,
    strengths: validated ? audit?.finalAcceptedOutput?.strengths ?? match?.strengths ?? [] : audit ? [] : match?.strengths ?? [],
    gaps: validated ? audit?.finalAcceptedOutput?.missingRequirements ?? match?.missingRequirements ?? [] : audit ? [] : match?.missingRequirements ?? [],
    reasons: (match?.scoreReasons ?? []).map((reason) => reason.replaceAll("Career Memory", "profile").replace("verified or user-provided evidence facts", "reviewed experience facts").replace("Role seniority classified as", "Role level:")),
    warnings: [...(match?.warnings ?? []), ...(match?.hardRejectReasons ?? [])],
    aiValidated: validated,
  };
}

export function filterWorkspaceJobs(jobs: Job[], matches: JobMatch[], input: { view: JobsView; search: string; workplace: string; sort: string }) {
  const byJob = new Map(matches.map((match) => [match.jobId, match]));
  const terms = input.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return jobs.filter((job) => {
    if (input.view === "skipped") return job.status === "rejected";
    if (["rejected", "archived", "closed", "filtered_out"].includes(job.status)) return false;
    if (input.view === "saved" && !["saved", "resume_pending", "resume_ready", "ready_to_apply"].includes(job.status)) return false;
    if (input.view === "recommended" && byJob.get(job.id)?.hardReject) return false;
    return true;
  }).filter((job) => terms.every((term) => `${job.company} ${job.roleTitle} ${job.location}`.toLowerCase().includes(term)))
    .filter((job) => !input.workplace || job.workplaceType === input.workplace)
    .sort((a, b) => input.sort === "newest" ? (b.postedAt || b.discoveredAt || b.createdAt).localeCompare(a.postedAt || a.discoveredAt || a.createdAt)
      : (jobFit(byJob.get(b.id), b).score ?? -1) - (jobFit(byJob.get(a.id), a).score ?? -1) || b.createdAt.localeCompare(a.createdAt));
}

export function jobNextAction(job: Job, resumes: ResumeVersion[], packages: ApplicationPackage[], applications: ApplicationRecord[]): { label: string; tab: WorkspaceTab } {
  const application = applications.find((item) => item.jobId === job.id);
  if (application && ["applied", "interview", "offer", "rejected", "withdrawn"].includes(application.status)) return { label: "View application", tab: "application" };
  const item = packages.find((candidate) => candidate.jobId === job.id);
  if (item?.approvedAt && item.validationStatus === "valid") return { label: "Review application", tab: "application" };
  if (resumes.some((resume) => resume.jobId === job.id && resume.kind !== "master" && resume.lastExportPath && !resume.validationJson.some((issue) => issue.severity === "error"))) return { label: "Prepare application", tab: "application" };
  if (resumes.some((resume) => resume.jobId === job.id && resume.kind !== "master")) return { label: "Review resume", tab: "resume" };
  return { label: "Prepare resume", tab: "resume" };
}

export function jobSalary(job: Job) {
  if (job.salaryMin === null && job.salaryMax === null) return "";
  const formatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const currency = job.salaryCurrency || "Currency not provided";
  const amount = job.salaryMin !== null && job.salaryMax !== null ? `${formatter.format(job.salaryMin)}–${formatter.format(job.salaryMax)}` : job.salaryMin !== null ? `${formatter.format(job.salaryMin)}+` : `Up to ${formatter.format(job.salaryMax!)}`;
  return `${currency} ${amount}${job.salaryInterval ? ` / ${job.salaryInterval}` : ""}`;
}

export function safeJobUrl(job: Job) {
  const value = job.applicationUrl || job.sourceUrl;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : ""; } catch { return ""; }
}
