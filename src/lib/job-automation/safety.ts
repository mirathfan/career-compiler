import { EVIDENCE_FINGERPRINT_VERSION, matchEvidenceFingerprint } from "./evidenceFreshness";
import { readJobMatchAnalysisAudit } from "./analysisState";
import { readPdfProvenance } from "../resume/pdfProvenance";
import type { AppRepository } from "../database/repository";
import type { ApplicationPackage, ApplicationRecord, Job, ResumeVersion } from "../../types/domain";
import { createId } from "../utils";
import { htmlToText, stableContentHash } from "./normalize";

const normalized = (value: string) => htmlToText(value).replace(/\s+/g, " ").trim().toLowerCase();
export function jobFingerprint(job: Partial<Job>) {
  return stableContentHash(JSON.stringify([
    normalized(job.company ?? ""), normalized(job.roleTitle ?? ""), normalized(job.descriptionText || job.rawDescription || ""),
    normalized(job.location ?? ""), job.workplaceType ?? "unspecified", normalized(job.employmentType ?? ""), normalized(job.department ?? ""),
    job.salaryMin ?? null, job.salaryMax ?? null, job.salaryCurrency?.toUpperCase() ?? "", job.salaryInterval?.toLowerCase() ?? "",
  ]));
}
// Legacy resume-record fingerprint contract retained for existing approvals.
// Browser payloads use versioned canonicalDigest from authorizationContract.js.
export async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}
export const resumeFingerprint = (resume: ResumeVersion) => digest([resume.contentJson, resume.resumeDocumentJson, resume.templateSettingsJson, resume.validationJson, resume.lastExportPath]);

export async function recordPackageRevision(repository: AppRepository, saved: ApplicationPackage, previous?: ApplicationPackage) {
  if (previous && JSON.stringify([previous.resumeVersionId, previous.approvedAt, previous.coverLetterText, previous.suggestedAnswers, previous.validationStatus]) === JSON.stringify([saved.resumeVersionId, saved.approvedAt, saved.coverLetterText, saved.suggestedAnswers, saved.validationStatus])) return;
  const job = await repository.getJob(saved.jobId);
  const resume = await repository.getResumeVersion(saved.resumeVersionId);
  const value = { revision: createId("package-revision"), approvalRevision: saved.approvedAt ? createId("approval-revision") : "",
    jobFingerprint: job ? jobFingerprint(job) : "", resumeFingerprint: resume ? await resumeFingerprint(resume) : "", approvedAt: saved.approvedAt, evidenceFingerprintVersion: EVIDENCE_FINGERPRINT_VERSION, evidenceFingerprint: await matchEvidenceFingerprint(repository, saved.jobId), pdfProvenance: saved.approvedAt && resume ? await readPdfProvenance(resume.lastExportPath) : null };
  await repository.saveSafetyRecord({ id: saved.id, kind: "package_revision", value, createdAt: saved.updatedAt });
  await repository.saveSafetyRecord({ id: createId("package-audit"), kind: "package_audit", value: { packageId: saved.id, before: previous ?? null, after: saved, revision: value }, createdAt: saved.updatedAt });
}

export async function invalidateJobDependents(repository: AppRepository, previous: Job | undefined, saved: Job) {
  if (!previous || jobFingerprint(previous) === jobFingerprint(saved)) return;
  const match = await repository.getJobMatch(saved.id);
  if (match) {
    await repository.saveJobMatchHistory({ id: createId("stale-history"), jobId: saved.id, contentHash: previous.contentHash,
      deterministicScore: match.deterministicScore, aiScore: match.aiScore, combinedScore: match.combinedScore, analysisJson: match.analysisJson, createdAt: saved.updatedAt });
    await repository.saveJobMatch({ ...match, aiScore: null, combinedScore: match.deterministicScore,
      analysisJson: { ...(typeof match.analysisJson === "object" ? match.analysisJson : {}), schemaVersion: "careercompiler-job-match-audit-v1", state: "stale", contentHash: saved.contentHash, createdAt: saved.updatedAt } });
  }
  const item = (await repository.listApplicationPackages()).find((item) => item.jobId === saved.id);
  if (item) await repository.saveApplicationPackage({ ...item, approvedAt: "", validationStatus: "not_validated", unresolvedQuestions: ["Job requirements changed; review and approve a current resume package."] });
  for (const tracker of (await repository.listApplications()).filter((item) => item.jobId === saved.id && !item.submittedAt && !item.submittedResumeVersionId)) {
    await repository.saveApplication({ ...tracker, status: "preparing", jobSnapshotJson: saved, nextAction: "Review changed job requirements and reapprove the package.", statusHistoryJson: [...tracker.statusHistoryJson,
      { status: "preparing", changedAt: saved.updatedAt, note: JSON.stringify({ event: "job_content_changed", beforeFingerprint: jobFingerprint(previous), afterFingerprint: jobFingerprint(saved) }) }] });
  }
}

export async function invalidateResumeDependents(repository: AppRepository, previous: ResumeVersion | undefined, saved: ResumeVersion) {
  if (!previous || await resumeFingerprint(previous) === await resumeFingerprint(saved)) return;
  for (const item of (await repository.listApplicationPackages()).filter((item) => item.resumeVersionId === saved.id)) {
    await repository.saveApplicationPackage({ ...item, approvedAt: "", validationStatus: "not_validated", unresolvedQuestions: ["Resume content changed; review and reapprove."] });
    for (const tracker of (await repository.listApplications()).filter((tracker) => tracker.jobId === item.jobId && !tracker.submittedAt && !tracker.submittedResumeVersionId)) {
      await repository.saveApplication({ ...tracker, status: "preparing", statusHistoryJson: [...tracker.statusHistoryJson, { status: "preparing", changedAt: saved.updatedAt, note: "Approved resume content changed; fresh approval required." }] });
    }
  }
}

export async function synchronizePackageSelection(repository: AppRepository, previous: ApplicationPackage | undefined, saved: ApplicationPackage) {
  const selectedChanged = previous && previous.resumeVersionId !== saved.resumeVersionId;
  const revoked = previous?.approvedAt && !saved.approvedAt;
  if (selectedChanged || revoked) {
    for (const tracker of (await repository.listApplications()).filter((item) => item.jobId === saved.jobId)) {
      if (tracker.submittedAt || tracker.submittedResumeVersionId) {
        if (selectedChanged) throw new Error("package_already_submitted|Submitted package selection cannot change.");
        continue;
      }
      await repository.saveApplication({ ...tracker, resumeVersionId: saved.resumeVersionId, status: "preparing",
        statusHistoryJson: [...tracker.statusHistoryJson, { status: "preparing", changedAt: saved.updatedAt, note: JSON.stringify({ event: "package_selection_or_approval_changed", packageId: saved.id, beforeResume: previous?.resumeVersionId, afterResume: saved.resumeVersionId, previousApproval: previous?.approvedAt }) }] });
    }
  }
  if (saved.approvedAt) {
    const match = await repository.getJobMatch(saved.jobId);
    if (readJobMatchAnalysisAudit(match?.analysisJson)?.state === "stale") throw new Error("analysis_evidence_stale|Current evidence review is required.");
    const resume = await repository.getResumeVersion(saved.resumeVersionId);
    const tracker = (await repository.listApplications()).find((item) => item.jobId === saved.jobId);
    if (!resume || resume.jobId !== saved.jobId || !resume.lastExportPath || resume.validationJson.some((issue) => issue.severity === "error")
        || saved.validationStatus !== "valid" || !tracker || tracker.resumeVersionId !== saved.resumeVersionId || tracker.status !== "ready") {
      throw new Error("package_approval_invalid|Approval requires a validated resume and synchronized ready tracker.");
    }
  }
}

// Alternate tracker screens must not bypass the package selection authority.
export async function validateTrackerSelection(repository: AppRepository, saved: ApplicationRecord) {
  const item = (await repository.listApplicationPackages()).find((item) => item.jobId === saved.jobId);
  if (item && saved.resumeVersionId !== item.resumeVersionId) {
    throw new Error("package_tracker_mismatch|Change the selected resume through Application Queue and approve it again.");
  }
}
