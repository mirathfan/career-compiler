import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { invoke } from "@tauri-apps/api/core";
import { readPdfProvenance } from "./pdfProvenance";
import { MemoryRepository } from "../database/memoryRepository";
import { updatePackageResume, requireApprovedPackage } from "../job-automation/applicationPackages";
import { issueFillAuthorization, consumeFillAuthorization } from "../extension/fillAuthorization";
import { jobFingerprint, resumeFingerprint } from "../job-automation/safety";
import type { PreparedApplication } from "../extension/protocol";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const original = { version: "cc-pdf-sha256-v1", digest: "a".repeat(64), sizeBytes: 100 };
beforeEach(() => { vi.mocked(readPdfProvenance).mockResolvedValue(original); });
async function fixture() {
  const repository = new MemoryRepository(); await repository.initialize();
  const item = await repository.saveCareerItem({ type: "project", title: "Synthetic React project" });
  const fact = await repository.saveCareerFact({ careerItemId: item.id, statement: "Built React products.", skillTags: ["React"], evidenceStatus: "verified" });
  const job = await repository.saveJob({ company: "Synthetic", roleTitle: "Engineer", rawDescription: "React", applicationUrl: "https://example.invalid/synthetic" });
  const template = (await repository.listResumeVersions())[0];
  // Reuse bounded existing synthetic resume fixture shape; no candidate data is read.
  const resume = await repository.saveResumeVersion({ ...template, jobId: job.id, contentJson: { id: "synthetic", header: { fullName: "Synthetic", headline: "", location: "", email: "", phone: "", portfolioUrl: "", linkedInUrl: "", githubUrl: "", workAuthorizationNote: "" }, summary: [], education: [], experience: [], projects: [], skills: [], sectionOrder: [], compactionActions: [], layout: { bodyFontSize: 9.5, spacingScale: 1, condensedSkills: false }, approvedWarningCodes: [] }, validationJson: [], lastExportPath: "/tmp/synthetic-only.pdf" });
  await repository.saveApplicationPackage({ jobId: job.id }); await updatePackageResume(repository, job.id, resume.id, true);
  const application = (await repository.listApplications())[0];
  const prepared = { applicationId: application.id, contentFingerprint: { job: jobFingerprint(job), resume: await resumeFingerprint(resume), pdf: original.digest } } as PreparedApplication;
  prepared.authorization = await issueFillAuthorization(repository, prepared, "synthetic", 1000);
  return { repository, job, resume, prepared, fact };
}
describe("approved PDF byte provenance", () => {
  it("persists digest and permits an unchanged PDF", async () => {
    const { repository, job, prepared } = await fixture();
    expect((await repository.listSafetyRecords("package_revision"))[0].value.pdfProvenance).toEqual(original);
    expect((await requireApprovedPackage(repository, job.id))?.approvedAt).toBeTruthy();
    expect(await consumeFillAuthorization(repository, prepared, "synthetic", job.applicationUrl, 2000)).toBe(true);
  });
  it.each(["same-path", "same-filename"])("rejects changed bytes (%s) and old token even after reapproval", async () => {
    const { repository, job, resume, prepared } = await fixture();
    vi.mocked(readPdfProvenance).mockResolvedValue({ ...original, digest: "b".repeat(64) });
    await expect(requireApprovedPackage(repository, job.id)).rejects.toThrow("package_pdf_changed");
    await expect(consumeFillAuthorization(repository, prepared, "synthetic", job.applicationUrl, 2000)).rejects.toThrow("package_approval_required");
    await updatePackageResume(repository, job.id, resume.id, true);
    await expect(consumeFillAuthorization(repository, prepared, "synthetic", job.applicationUrl, 2000)).rejects.toThrow("fill_authorization_invalid");
    expect((await repository.listSafetyRecords("package_audit")).length).toBeGreaterThan(1);
  });
  it.each(["missing", "permission-denied", "corrupt"])("fails closed for %s without a completion record", async (failure) => {
    const { repository, job, prepared } = await fixture();
    vi.mocked(readPdfProvenance).mockRejectedValue(new Error(failure));
    await expect(requireApprovedPackage(repository, job.id)).rejects.toThrow("package_pdf_invalid");
    await expect(consumeFillAuthorization(repository, prepared, "synthetic", job.applicationUrl, 2000)).rejects.toThrow("package_approval_required");
    expect((await repository.listSafetyRecords("fill_token"))[0].value.state).toBe("rejected");
  });
  it("evidence changes revoke package/tracker and reject previously prepared handoff", async () => {
    const { repository, job, fact, prepared } = await fixture();
    await repository.saveCareerFact({ ...fact, enabled: false });
    expect((await repository.listApplicationPackages())[0].approvedAt).toBe("");
    expect((await repository.listApplications())[0].status).toBe("preparing");
    await expect(consumeFillAuthorization(repository, prepared, "synthetic", job.applicationUrl, 2000)).rejects.toThrow("package_approval_required");
    expect((await repository.listSafetyRecords("fill_token"))[0].value.state).toBe("rejected");
  });
  it("does not reinterpret a legacy path-only approval", async () => {
    const { repository, job } = await fixture(); const record = (await repository.listSafetyRecords("package_revision"))[0];
    await repository.saveSafetyRecord({ ...record, value: { ...record.value, pdfProvenance: null } });
    await expect(requireApprovedPackage(repository, job.id)).rejects.toThrow("package_pdf_approval_required");
  });
});
describe("production PDF snapshot validation", () => {
  it("checks exact native bytes and parses the one-page PDF", async () => {
    const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = await pdf.save();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))), v => v.toString(16).padStart(2,"0")).join("");
    vi.mocked(invoke).mockResolvedValue({ contentDigest: digest, sizeBytes: bytes.length, fileBase64: btoa(String.fromCharCode(...bytes)) });
    const actual = await vi.importActual<typeof import("./pdfProvenance")>("./pdfProvenance");
    expect((await actual.readPdfProvenance("/tmp/synthetic-only.pdf")).digest).toBe(digest);
    vi.mocked(invoke).mockResolvedValue({ contentDigest: "f".repeat(64), sizeBytes: bytes.length, fileBase64: btoa(String.fromCharCode(...bytes)) });
    await expect(actual.readPdfProvenance("/tmp/synthetic-only.pdf")).rejects.toThrow("integrity");
  });
  it("rejects corrupt bytes even when their digest matches", async () => {
    const bytes = new TextEncoder().encode("%PDF-invalid %%EOF"); const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))), v => v.toString(16).padStart(2,"0")).join("");
    vi.mocked(invoke).mockResolvedValue({ contentDigest: digest, sizeBytes: bytes.length, fileBase64: btoa(String.fromCharCode(...bytes)) });
    const actual = await vi.importActual<typeof import("./pdfProvenance")>("./pdfProvenance");
    await expect(actual.readPdfProvenance("/tmp/synthetic-only.pdf")).rejects.toThrow("one-page PDF");
  });
});
