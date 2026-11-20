import { EVIDENCE_FINGERPRINT_VERSION, matchEvidenceFingerprint } from "./evidenceFreshness";
import { readPdfProvenance, PDF_PROVENANCE_VERSION } from "../resume/pdfProvenance";
import { readJobMatchAnalysisAudit } from "./analysisState";
import { jobFingerprint, resumeFingerprint } from "./safety";
import type { AppRepository } from "../database/repository";
import type { ApplicationRecord } from "../../types/domain";

// The package is the approval authority. Selection, tracker, approval and audit
// changes share one transaction; failure leaves the prior committed state intact.
let changingPackage = false;
export async function updatePackageResume(repository: AppRepository, jobId: string, resumeVersionId: string, approve = false) {
  if (changingPackage) throw new Error("package_update_active|A package update is already running.");
  changingPackage = true;
  try {
    return await repository.transaction(async (repository) => {
    const [packages, resumes, applications, job] = await Promise.all([
      repository.listApplicationPackages(), repository.listResumeVersions(), repository.listApplications(), repository.getJob(jobId),
    ]);
    const evidenceMatch = await repository.getJobMatch(jobId);
    if (approve && readJobMatchAnalysisAudit(evidenceMatch?.analysisJson)?.state === "stale") throw new Error("analysis_evidence_stale|Review current evidence and explicitly reanalyse or choose deterministic-only before package approval.");
    const current = packages.find((item) => item.jobId === jobId);
    if (!current || !job) throw new Error("package_missing|The package or job no longer exists.");
    const resume = resumes.find((item) => item.id === resumeVersionId && item.jobId === jobId);
    if (resumeVersionId && !resume) throw new Error("package_resume_invalid|Select a resume for this job.");
    const valid = Boolean(resume?.lastExportPath) && !resume?.validationJson.some((issue) => issue.severity === "error");
    if (approve && !valid) throw new Error("package_resume_invalid|Export and validate the resume before approval.");
    const tracker = applications.find((item) => item.jobId === jobId);
    if (tracker && (tracker.submittedAt || tracker.submittedResumeVersionId || ["applied", "interview", "offer", "rejected", "withdrawn"].includes(tracker.status))) {
      throw new Error("package_already_submitted|Preserve the submitted application and its resume history.");
    }
    const now = new Date().toISOString();
    const saved = await repository.saveApplicationPackage({ ...current, resumeVersionId, approvedAt: "",
      generationStatus: resume ? "ready" : "not_started", validationStatus: valid ? "valid" : "invalid",
      validationErrors: valid ? [] : ["Select an exported, validated resume."],
      unresolvedQuestions: valid ? [] : ["Export and validate the selected resume before approval."] });
    const status = approve ? "ready" : "preparing";
    const note = JSON.stringify({ event: approve ? "package_approved" : "package_resume_changed", packageId: saved.id,
      previousResumeVersionId: current.resumeVersionId, resumeVersionId, previousApprovedAt: current.approvedAt });
    const history: ApplicationRecord["statusHistoryJson"] = [...(tracker?.statusHistoryJson ?? []), { status, changedAt: now, note }];
    await repository.saveApplication({ ...tracker, jobId, company: job.company, role: job.roleTitle,
      jobUrl: job.applicationUrl, applicationUrl: job.applicationUrl, resumeVersionId, status,
      automationMode: "autofill_manual_submit", jobSnapshotJson: job, statusHistoryJson: history,
      nextAction: approve ? "Review browser fields and submit manually." : "Approve the replacement resume package before autofill." });
    await repository.saveJob({ ...job, rawDescription: job.rawDescription, status: approve ? "ready_to_apply" : "resume_pending" });
    return approve ? await repository.saveApplicationPackage({ ...saved, approvedAt: now }) : saved;
    });
  } finally {
    changingPackage = false;
  }
}

async function validateApprovedPackage(repository: AppRepository, jobId: string, resumeVersionId?: string) {
  await repository.getJobMatch(jobId); // authoritative freshness check, including legacy analyses
  const item = (await repository.listApplicationPackages()).find((candidate) => candidate.jobId === jobId);
  if (!item) return null; // Explicit manual applications retain their existing approval flow.
  const resume = (await repository.listResumeVersions()).find((candidate) => candidate.id === item.resumeVersionId && candidate.jobId === jobId);
  if (!item.approvedAt || item.validationStatus !== "valid" || !resume?.lastExportPath
      || resume.validationJson.some((issue) => issue.severity === "error")
      || (resumeVersionId !== undefined && resumeVersionId !== item.resumeVersionId)) {
    throw new Error("package_approval_required|Approve the current resume package before application preparation.");
  }
  const revision = (await repository.listSafetyRecords("package_revision")).find((record) => record.id === item.id);
  const job = await repository.getJob(jobId);
  if (!revision?.value.approvalRevision || !job || revision.value.jobFingerprint !== jobFingerprint(job)
      || revision.value.resumeFingerprint !== await resumeFingerprint(resume)) throw new Error("package_approval_required|Package content changed; fresh approval is required.");
  if (revision.value.evidenceFingerprintVersion !== EVIDENCE_FINGERPRINT_VERSION || revision.value.evidenceFingerprint !== await matchEvidenceFingerprint(repository, jobId)) throw new Error("package_evidence_stale|Evidence provenance changed; fresh review and approval required.");
  const provenance = revision.value.pdfProvenance as { version?: string; digest?: string } | null;
  if (!provenance || provenance.version !== PDF_PROVENANCE_VERSION || !provenance.digest) throw new Error("package_pdf_approval_required|Legacy PDF approval requires explicit reapproval.");
  let actual;
  try { actual = await readPdfProvenance(resume.lastExportPath); }
  catch { throw new Error("package_pdf_invalid|The approved PDF is missing, unreadable or invalid. Fresh approval required."); }
  if (actual.digest !== provenance.digest) throw new Error("package_pdf_changed|PDF content changed. Fresh approval required.");
  return item;
}

export async function requireApprovedPackage(repository: AppRepository, jobId: string, resumeVersionId?: string) {
  const outcome = await repository.transaction(async transaction => {
    try { return { item: await validateApprovedPackage(transaction, jobId, resumeVersionId) }; }
    catch (error) {
      const message = error instanceof Error ? error.message : "package_approval_required";
      if (/^package_(pdf|evidence)_/.test(message)) {
        const item = (await transaction.listApplicationPackages()).find(item => item.jobId === jobId);
        if (item?.approvedAt) await transaction.saveApplicationPackage({ ...item, approvedAt: "", validationStatus: "not_validated", unresolvedQuestions: ["Evidence or PDF provenance changed; fresh approval required."] });
      }
      return { error: message };
    }
  });
  if (outcome.error) throw new Error(outcome.error);
  return outcome.item ?? null;
}
