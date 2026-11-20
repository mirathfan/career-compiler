import { describe, expect, it } from "vitest";
import { MemoryRepository } from "../database/memoryRepository";
import { reserveBudget, budgetUsage, markMockAttempt, finishBudget } from "./budget";
import { jobFingerprint } from "./safety";
import { updatePackageResume, requireApprovedPackage } from "./applicationPackages";
import { consumeFillAuthorization, issueFillAuthorization } from "../extension/fillAuthorization";
import type { PreparedApplication } from "../extension/protocol";
import { resumeFingerprint } from "./safety";
import type { TailoredResume } from "../../types/domain";
const now = "2026-10-13T12:00:00Z";
const content: TailoredResume = { id: "test", header: { fullName: "Synthetic", headline: "Engineer", location: "", email: "", phone: "", portfolioUrl: "", linkedInUrl: "", githubUrl: "", workAuthorizationNote: "" }, summary: [], education: [], experience: [], projects: [], skills: ["React"], sectionOrder: ["skills"], compactionActions: [], layout: { bodyFontSize: 9.5, spacingScale: 1, condensedSkills: false }, approvedWarningCodes: [] };
async function fixture() {
  const repository = new MemoryRepository(); await repository.initialize();
  await repository.saveJobSearchPreferences({ maximumAiAnalysesPerDay: 1 });
  const job = await repository.saveJob({ id: "job", company: "Synthetic", roleTitle: "Engineer", rawDescription: "Build React. Sponsorship available.", descriptionText: "Build React. Sponsorship available.", location: "Remote", salaryMin: 100, salaryMax: 200, salaryCurrency: "USD", applicationUrl: "https://example.invalid/job" });
  const resume = await repository.saveResumeVersion({ id: "a", jobId: job.id, contentJson: content, validationJson: [], lastExportPath: "/tmp/synthetic.pdf" });
  await repository.saveApplicationPackage({ jobId: job.id });
  await updatePackageResume(repository, job.id, resume.id, true);
  const application = (await repository.listApplications())[0];
  const prepared: PreparedApplication = { applicationId: application.id, jobId: job.id, companyName: job.company, jobTitle: job.roleTitle, fields: [], warnings: [], hardConflicts: [], contentFingerprint: { job: jobFingerprint(job), resume: await resumeFingerprint(resume), pdf: "a".repeat(64) } };
  return { repository, job, resume, prepared };
}
describe("durable budget accounting", () => {
  it("retains uncertain legacy reservations even without a durable row", async () => {
    const { repository, job } = await fixture();
    await repository.saveJobMatchHistory({ id: "unknown-dispatch", jobId: job.id, contentHash: job.contentHash, deterministicScore: 80, aiScore: null, combinedScore: 80, createdAt: now, analysisJson: { schemaVersion: "careercompiler-job-match-audit-v1", state: "queued", attemptId: "legacy-reservation", createdAt: now } });
    expect((await budgetUsage(repository, "2026-10-13")).reserved).toBe(1);
  });
  it("does not charge archived prior-day attempts to a new day", async () => {
    const { repository, job } = await fixture();
    await reserveBudget(repository, "prior-attempt", job.id, job.contentHash, now, "mock");
    await markMockAttempt(repository, "prior-attempt"); await finishBudget(repository, "prior-attempt");
    await repository.saveJobMatchHistory({ id: "archive-today", jobId: job.id, contentHash: job.contentHash, deterministicScore: 80, aiScore: null, combinedScore: 80, createdAt: "2026-10-14T12:00:00Z", analysisJson: { schemaVersion: "careercompiler-job-match-audit-v1", state: "valid", attemptId: "prior-attempt", createdAt: now } });
    expect(await budgetUsage(repository, "2026-10-13")).toEqual({ reserved: 1, attemptedCalls: 1, actualCostUsd: null });
    expect(await budgetUsage(repository, "2026-10-14")).toEqual({ reserved: 0, attemptedCalls: 0, actualCostUsd: null });
    expect(await reserveBudget(repository, "next-day", job.id, job.contentHash, "2026-10-14T12:00:00Z", "mock")).toBe(true);
  });
  it("retains legacy uncertain attempts on their audit day without charging non-attempt states", async () => {
    const { repository, job } = await fixture();
    await repository.saveJobMatchHistory({ id: "legacy", jobId: job.id, contentHash: job.contentHash, deterministicScore: 80, aiScore: null, combinedScore: 80, createdAt: "2026-10-14T12:00:00Z", analysisJson: { schemaVersion: "careercompiler-job-match-audit-v1", state: "failed", createdAt: now } });
    await repository.saveJobMatchHistory({ id: "local-only", jobId: job.id, contentHash: job.contentHash, deterministicScore: 80, aiScore: null, combinedScore: 80, createdAt: now, analysisJson: { schemaVersion: "careercompiler-job-match-audit-v1", state: "deterministic_only", createdAt: now } });
    expect((await budgetUsage(repository, "2026-10-13")).reserved).toBe(1);
    expect((await budgetUsage(repository, "2026-10-14")).reserved).toBe(0);
  });

  it("serializes simultaneous reservations and never refunds uncertain dispatch", async () => {
    const { repository, job } = await fixture();
    const results = await Promise.all([reserveBudget(repository, "attempt-a", job.id, job.contentHash, now, "mock"), reserveBudget(repository, "attempt-b", "other-job", "other-hash", now, "mock")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await markMockAttempt(repository, "attempt-a"); await finishBudget(repository, "attempt-a");
    expect(await budgetUsage(repository, "2026-10-13")).toEqual({ reserved: 1, attemptedCalls: 1, actualCostUsd: null });
    expect(await reserveBudget(repository, "attempt-c", job.id, job.contentHash, now, "mock")).toBe(false);
  });
  it("counts old reserved capacity after failure and permits a distinct UTC day", async () => {
    const { repository, job } = await fixture();
    expect(await reserveBudget(repository, "old", job.id, job.contentHash, "2026-10-13T23:59:59Z", "mock")).toBe(true);
    expect(await reserveBudget(repository, "too-soon", job.id, job.contentHash, "2026-10-14T00:00:01Z", "mock")).toBe(false); // active-job lease is independent of the day
    expect(await reserveBudget(repository, "new-day", "other-job", "hash", "2026-10-14T00:00:01Z", "mock")).toBe(true);
    expect((await budgetUsage(repository, "2026-10-13")).reserved).toBe(1);
    expect((await budgetUsage(repository, "2026-10-14")).attemptedCalls).toBe(0);
  });
});
describe("semantic job invalidation", () => {
  it("rejects alternate tracker edits that contradict package resume selection", async () => {
    const { repository } = await fixture();
    const tracker = (await repository.listApplications())[0];
    await expect(repository.saveApplication({ ...tracker, resumeVersionId: "wrong-resume" })).rejects.toThrow("package_tracker_mismatch");
    expect((await repository.getApplication(tracker.id))?.resumeVersionId).toBe(tracker.resumeVersionId);
  });
  it.each([
    { descriptionText: "Build Rust services." }, { salaryMin: 150 }, { salaryMax: null }, { salaryCurrency: "EUR" },
    { location: "New York" }, { workplaceType: "on_site" as const }, { descriptionText: "No sponsorship available." },
  ])("revokes dependent approval for %j", async (changes) => {
    const { repository, job } = await fixture();
    await repository.saveJob({ ...job, ...changes, rawDescription: changes.descriptionText ?? job.rawDescription });
    await expect(requireApprovedPackage(repository, job.id)).rejects.toThrow("package_approval_required");
    expect((await repository.listApplications())[0].status).toBe("preparing");
    expect((await repository.listSafetyRecords("package_audit")).length).toBeGreaterThan(1);
  });
  it("preserves approvals for unchanged, formatting-only and irrelevant metadata updates", async () => {
    const { repository, job } = await fixture();
    const changed = await repository.saveJob({ ...job, rawDescription: job.rawDescription, descriptionText: "<p>Build   React. Sponsorship available.</p>", lastSeenAt: "2026-10-14", postedAt: "2026-10-13", sourcePayloadJson: { tracking: "changed" } });
    expect(changed.contentHash).toBe(job.contentHash);
    expect((await requireApprovedPackage(repository, job.id))?.approvedAt).toBeTruthy();
  });
});
describe("authoritative single-use fill authorization", () => {
  it("rejects tokens issued before the current answer policy without reinterpreting them", async () => {
    const { repository, prepared, job } = await fixture();
    prepared.authorization = await issueFillAuthorization(repository, prepared, "extension", 1000);
    const record = (await repository.listSafetyRecords("fill_token"))[0];
    const legacy = { ...record.value }; delete legacy.answerPolicyVersion;
    await repository.saveSafetyRecord({ ...record, value: legacy });
    await expect(consumeFillAuthorization(repository, prepared, "extension", job.applicationUrl, 2000)).rejects.toThrow("fill_authorization_stale");
    expect((await repository.listSafetyRecords("fill_token"))[0].value.state).toBe("prepared");
  });

  it("accepts production payload key reordering across transport", async () => {
    const { repository, prepared, job } = await fixture();
    prepared.authorization = await issueFillAuthorization(repository, prepared, "extension", 1000);
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(prepared).reverse())));
    expect(await consumeFillAuthorization(repository, reordered, "extension", job.applicationUrl, 2000)).toBe(true);
  });
  it("rejects prepared answers after candidate country evidence is changed", async () => {
    const { repository, prepared, job } = await fixture();
    prepared.authorization = await issueFillAuthorization(repository, prepared, "extension", 1000);
    await repository.saveCandidateClaim({ category:"country",value:"France",verificationStatus:"verified" });
    await expect(consumeFillAuthorization(repository, prepared, "extension", job.applicationUrl, 2000)).rejects.toThrow("fill_authorization_stale");
  });
  it("never reinterprets persisted unversioned legacy tokens", async () => {
    const { repository, prepared, job } = await fixture();
    prepared.authorization = await issueFillAuthorization(repository, prepared, "extension", 1000);
    const record = (await repository.listSafetyRecords("fill_token"))[0];
    const legacy = { ...record.value }; delete legacy.hashVersion;
    await repository.saveSafetyRecord({ ...record, value: legacy });
    await expect(consumeFillAuthorization(repository, prepared, "extension", job.applicationUrl, 2000)).rejects.toThrow("fill_authorization_invalid");
  });
  it("refuses browser authorization without a specifically approved package", async () => {
    const repository = new MemoryRepository(); await repository.initialize();
    const job = await repository.saveJob({ id: "manual", company: "Synthetic", roleTitle: "Engineer", rawDescription: "React" });
    const resume = await repository.saveResumeVersion({ jobId: job.id, contentJson: content, lastExportPath: "/tmp/test.pdf" });
    const application = await repository.saveApplication({ jobId: job.id, resumeVersionId: resume.id, company: "Synthetic", role: "Engineer" });
    await expect(issueFillAuthorization(repository, { applicationId: application.id } as PreparedApplication, "extension")).rejects.toThrow("package_approval_required");
  });
  it("accepts the bound payload once and rejects replay", async () => {
    const { repository, prepared, job } = await fixture();
    prepared.authorization = await issueFillAuthorization(repository, prepared, "extension", 1000);
    expect(await consumeFillAuthorization(repository, prepared, "extension", job.applicationUrl, 2000)).toBe(true);
    await expect(consumeFillAuthorization(repository, prepared, "extension", job.applicationUrl, 2001)).rejects.toThrow("replayed");
  });
  it.each(["tampered", "expired", "extension", "page", "approval", "content", "revision"])("rejects %s payload", async (kind) => {
    const { repository, prepared, job, resume } = await fixture();
    prepared.authorization = await issueFillAuthorization(repository, prepared, "extension", 1000);
    if (kind === "tampered") prepared.fields.push({ fieldId: "x", originalQuestion: "x", detectedFieldType: "input", normalizedQuestionType: "unknown", answer: "tampered", answerSource: "user_required", confidence: 0, requiresReview: true, claimIds: [], storyIds: [], warnings: [], reasoningSummary: "" });
    if (kind === "approval") await updatePackageResume(repository, job.id, resume.id, false);
    if (kind === "content") await repository.saveJob({ ...job, descriptionText: "Different requirements", rawDescription: "Different requirements" });
    if (kind === "revision") await updatePackageResume(repository, job.id, resume.id, true);
    await expect(consumeFillAuthorization(repository, prepared, kind === "extension" ? "wrong" : "extension", kind === "page" ? "https://wrong.invalid" : job.applicationUrl, kind === "expired" ? 62_000 : 2000)).rejects.toThrow();
  });
  it("rolls back package, tracker, revision and audit as a unit", async () => {
    const { repository, job } = await fixture();
    const before = JSON.stringify([await repository.listApplicationPackages(), await repository.listApplications(), await repository.listSafetyRecords("package_audit")]);
    await expect(repository.transaction(async (transaction) => { await transaction.saveApplicationPackage({ jobId: job.id, approvedAt: "" }); await transaction.saveApplication({ ...(await transaction.listApplications())[0], status: "preparing" }); throw new Error("synthetic crash"); })).rejects.toThrow("synthetic crash");
    expect(JSON.stringify([await repository.listApplicationPackages(), await repository.listApplications(), await repository.listSafetyRecords("package_audit")])).toBe(before);
  });
});
