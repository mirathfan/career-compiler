import { APPLICATION_ANSWER_POLICY_VERSION } from "../applications/answerEngine";
import { canonicalDigest, HASH_VERSION } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
import type { AppRepository } from "../database/repository";
import type { PreparedApplication } from "./protocol";
import { requireApprovedPackage } from "../job-automation/applicationPackages";
import { jobFingerprint, resumeFingerprint } from "../job-automation/safety";
import { createId } from "../utils";

async function candidateFingerprint(repository: AppRepository) {
  const [profile, items, facts, skills, claims, sensitive, stories, approved, preferences] = await Promise.all([
    repository.getProfile(), repository.listCareerItems(), repository.listCareerFacts(), repository.listSkills(), repository.listCandidateClaims(), repository.listSensitiveAnswers(), repository.listCareerStories(), repository.listApprovedApplicationAnswers(), repository.getCandidatePreferences(),
  ]);
  const sorted = <T extends { id: string }>(records: T[]) => [...records].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return canonicalDigest([profile, sorted(items), sorted(facts), sorted(skills), sorted(claims), sorted(sensitive), sorted(stories), sorted(approved), preferences]);
}
async function binding(repository: AppRepository, applicationId: string) {
  const application = await repository.getApplication(applicationId);
  if (!application) throw new Error("fill_application_missing");
  const job = await repository.getJob(application.jobId);
  const resume = await repository.getResumeVersion(application.resumeVersionId);
  if (!job || !resume) throw new Error("fill_resume_missing|An explicitly selected resume is required.");
  const item = await requireApprovedPackage(repository, job.id, resume.id);
  if (!item) throw new Error("package_approval_required|Create and approve a package before browser autofill.");
  const revision = item ? (await repository.listSafetyRecords("package_revision")).find((record) => record.id === item.id)?.value : null;
  const pdf = revision?.pdfProvenance as { digest?: string } | undefined;
  return { applicationId, pdfDigest: pdf?.digest ?? "", answerPolicyVersion: APPLICATION_ANSWER_POLICY_VERSION, candidateFingerprint: await candidateFingerprint(repository), jobFingerprint: jobFingerprint(job), resumeFingerprint: await resumeFingerprint(resume),
    packageId: item.id, packageRevision: revision?.revision ?? "", approvalRevision: revision?.approvalRevision ?? "", pageUrl: application.applicationUrl };
}
const payloadContent = (prepared: PreparedApplication) => ({ ...prepared, authorization: undefined });
export async function issueFillAuthorization(repository: AppRepository, prepared: PreparedApplication, extensionId: string, now = Date.now()) {
  return repository.transaction(async (transaction) => {
    const id = createId("fill-token"); const expiresAtMs = now + 60_000;
    const current = await binding(transaction, prepared.applicationId);
    if (prepared.contentFingerprint?.pdf !== current.pdfDigest || prepared.contentFingerprint?.job !== current.jobFingerprint || prepared.contentFingerprint?.resume !== current.resumeFingerprint) throw new Error("fill_preparation_stale");
    const value = { ...current, extensionId, hashVersion: HASH_VERSION, payloadHash: await canonicalDigest(payloadContent(prepared)), expiresAtMs, state: "prepared" };
    await transaction.saveSafetyRecord({ id, kind: "fill_token", value, createdAt: new Date(now).toISOString() });
    return { id, expiresAtMs, hashVersion: HASH_VERSION, payloadHash: value.payloadHash };
  });
}
export async function consumeFillAuthorization(repository: AppRepository, prepared: PreparedApplication, extensionId: string, pageUrl: string, now = Date.now()) {
  const outcome = await repository.transaction(async (transaction) => {
    const record = (await transaction.listSafetyRecords("fill_token")).find((record) => record.id === prepared.authorization?.id);
    if (!record || record.value.state !== "prepared" || prepared.authorization?.expiresAtMs !== record.value.expiresAtMs || Number(record.value.expiresAtMs) <= now || record.value.extensionId !== extensionId
      || prepared.authorization?.payloadHash !== record.value.payloadHash || record.value.hashVersion !== HASH_VERSION || prepared.authorization?.hashVersion !== HASH_VERSION || record.value.payloadHash !== await canonicalDigest(payloadContent(prepared)) || record.value.pageUrl !== pageUrl) throw new Error("fill_authorization_invalid|Stale, tampered, expired or replayed payload.");
    let current;
    try { current = await binding(transaction, prepared.applicationId); }
    catch (error) {
      if (!(error instanceof Error) || !/^package_(pdf|evidence|approval)_/.test(error.message)) throw error;
      await transaction.saveSafetyRecord({ ...record, value: { ...record.value, state: "rejected", rejectedAt: now } });
      return { error: error.message };
    }
    for (const [key,value] of Object.entries(current)) if (record.value[key] !== value) throw new Error("fill_authorization_stale|Current approval or content changed.");
    await transaction.saveSafetyRecord({ ...record, value: { ...record.value, state: "consumed", consumedAt: now } });
    return { accepted: true };
  });
  if (outcome.error) throw new Error(outcome.error);
  return outcome.accepted === true;
}
export async function requireConsumedFill(repository: AppRepository, applicationId: string, id: string | undefined, extensionId: string, now = Date.now()) {
  const record = (await repository.listSafetyRecords("fill_token")).find((record) => record.id === id);
  if (!record || record.value.applicationId !== applicationId || record.value.extensionId !== extensionId || record.value.hashVersion !== HASH_VERSION || record.value.state !== "consumed" || Number(record.value.expiresAtMs) <= now) throw new Error("fill_authorization_invalid");
  const current = await binding(repository, applicationId);
  for (const [key,value] of Object.entries(current)) if (record.value[key] !== value) throw new Error("fill_authorization_stale");
}
