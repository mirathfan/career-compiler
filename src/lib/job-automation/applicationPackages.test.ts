import { describe, expect, it, vi } from "vitest";
import initSqlJs from "sql.js/dist/sql-asm.js";
import type TauriDatabase from "@tauri-apps/plugin-sql";
import type { TailoredResume } from "../../types/domain";
import type { AppRepository } from "../database/repository";
import { MemoryRepository } from "../database/memoryRepository";
import { SqliteRepository } from "../database/sqliteRepository";
import { requireApprovedPackage, updatePackageResume } from "./applicationPackages";
import { handleExtensionRequest } from "../extension/requestProcessor";
import { EXTENSION_PROTOCOL_VERSION } from "../extension/protocol";

const content: TailoredResume = {
  id: "fixture", header: { fullName: "Fixture Candidate", headline: "Engineer", location: "", email: "", phone: "",
    portfolioUrl: "", linkedInUrl: "", githubUrl: "", workAuthorizationNote: "" },
  summary: [], education: [], experience: [], projects: [], skills: [], sectionOrder: ["education", "experience", "projects", "skills"],
  compactionActions: [], layout: { bodyFontSize: 9.5, spacingScale: 1, condensedSkills: false }, approvedWarningCodes: [],
};
async function sqliteFixture() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const adapter = {
    execute: async (sql: string, values: unknown[] = []) => { db.run(sql, values as (string | number | null)[]); return { rowsAffected: db.getRowsModified(), lastInsertId: 0 }; },
    select: async (sql: string, values: unknown[] = []) => {
      const statement = db.prepare(sql); statement.bind(values as (string | number | null)[]);
      const rows = []; while (statement.step()) rows.push(statement.getAsObject()); statement.free(); return rows;
    },
  } as unknown as TauriDatabase;
  return new SqliteRepository(adapter);
}
async function setup(repository: AppRepository) {
  await repository.initialize();
  const job = await repository.saveJob({ id: "fixture-job", company: "Fixture Co", roleTitle: "Engineer", rawDescription: "TypeScript", applicationUrl: "https://boards.greenhouse.io/synthetic/jobs/1", sourceUrl: "https://boards.greenhouse.io/synthetic/jobs/1" });
  for (const id of ["resume-a", "resume-b"]) await repository.saveResumeVersion({ id, jobId: job.id, contentJson: content,
    lastExportPath: `/tmp/${id}.pdf`, validationJson: [], status: "exported" });
  await repository.saveApplicationPackage({ jobId: job.id, resumeVersionId: "resume-a", validationStatus: "valid" });
  return job;
}

for (const backend of ["memory", "sqlite"] as const) describe(`${backend} package consistency`, () => {
  it("revokes approval on replacement, synchronizes tracker, audits lineage and requires reapproval", async () => {
    const repository = backend === "memory" ? new MemoryRepository() : await sqliteFixture();
    const job = await setup(repository);
    await updatePackageResume(repository, job.id, "resume-a", true);
    const prior = (await repository.listApplicationPackages())[0];
    expect(prior.approvedAt).toBeTruthy();
    await updatePackageResume(repository, job.id, "resume-b");
    expect((await repository.listApplicationPackages())[0].approvedAt).toBe("");
    const application = (await repository.listApplications())[0];
    expect(application).toMatchObject({ resumeVersionId: "resume-b", status: "preparing" });
    expect(application.statusHistoryJson.map((event) => JSON.parse(event.note))).toEqual([
      expect.objectContaining({ event: "package_approved", resumeVersionId: "resume-a" }),
      expect.objectContaining({ event: "package_resume_changed", previousResumeVersionId: "resume-a", resumeVersionId: "resume-b", previousApprovedAt: prior.approvedAt }),
    ]);
    await expect(requireApprovedPackage(repository, job.id)).rejects.toThrow("package_approval_required");
    const authorize = vi.fn();
    const blocked = await handleExtensionRequest({ repository, authorizeResumeFile: authorize, request: {
      type: "prepare_application", protocolVersion: EXTENSION_PROTOCOL_VERSION, requestId: "fixture-request", extensionId: "fixture", credential: "fixture",
      pageContext: { url: job.applicationUrl, companyName: job.company, jobTitle: job.roleTitle, title: job.roleTitle, jobDescription: job.rawDescription, atsPlatform: "generic" }, fields: [],
    } });
    expect(blocked.ok).toBe(false); expect(authorize).not.toHaveBeenCalled();
    const marked = await handleExtensionRequest({ repository, request: { type: "mark_filled", protocolVersion: EXTENSION_PROTOCOL_VERSION,
      requestId: "mark-fixture", extensionId: "fixture", credential: "fixture", applicationId: application.id } });
    expect(marked.ok).toBe(false);
    await updatePackageResume(repository, job.id, "resume-b", true);
    expect((await requireApprovedPackage(repository, job.id, "resume-b"))?.approvedAt).toBeTruthy();
    expect((await repository.listApplications())[0]).toMatchObject({ resumeVersionId: "resume-b", status: "ready" });
    const authorized = vi.fn(async () => ({ authorizedFileReference: "fixture-ref", filename: "resume-b.pdf", mimeType: "application/pdf", sizeBytes: 10, expiresAtMs: Date.now() + 60_000, fileBase64: "fixture" }));
    const prepared = await handleExtensionRequest({ repository, authorizeResumeFile: authorized, request: {
      type: "prepare_application", protocolVersion: EXTENSION_PROTOCOL_VERSION, requestId: "fixture-approved", extensionId: "fixture", credential: "fixture",
      pageContext: { url: job.applicationUrl, companyName: job.company, jobTitle: job.roleTitle, title: job.roleTitle, jobDescription: job.rawDescription, atsPlatform: "generic" }, fields: [],
    } });
    expect(prepared.ok).toBe(true);
    expect(authorized).toHaveBeenCalledWith(expect.objectContaining({ resumeVersionId: "resume-b", path: "/tmp/resume-b.pdf" }));
    await expect(requireApprovedPackage(repository, job.id, "resume-a")).rejects.toThrow("package_approval_required");
  });
  it("repository invalidates stale approval even when a caller passes an old approved package", async () => {
    const repository = backend === "memory" ? new MemoryRepository() : await sqliteFixture();
    const job = await setup(repository);
    const approved = await updatePackageResume(repository, job.id, "resume-a", true);
    expect((await repository.saveApplicationPackage({ ...approved, resumeVersionId: "resume-b" })).approvedAt).toBe("");
  });
  it("rolls back tracker persistence failure and preserves submitted records", async () => {
    const repository = backend === "memory" ? new MemoryRepository() : await sqliteFixture();
    const job = await setup(repository);
    await updatePackageResume(repository, job.id, "resume-a", true);
    vi.spyOn(repository, "saveApplication").mockRejectedValueOnce(new Error("fixture disk failure"));
    await expect(updatePackageResume(repository, job.id, "resume-b")).rejects.toThrow("fixture disk failure");
    expect((await requireApprovedPackage(repository, job.id, "resume-a"))?.approvedAt).toBeTruthy();
    expect((await repository.listApplicationPackages())[0].resumeVersionId).toBe("resume-a");
    await updatePackageResume(repository, job.id, "resume-b", true);
    const tracker = (await repository.listApplications())[0];
    await repository.saveApplication({ ...tracker, status: "applied", submittedResumeVersionId: "resume-b" });
    await expect(updatePackageResume(repository, job.id, "resume-a")).rejects.toThrow("package_already_submitted");
    expect((await repository.listApplications())[0].submittedResumeVersionId).toBe("resume-b");
  });
});


it("repairs tracker mismatch when retrying the same unapproved replacement", async () => {
  const repository = await sqliteFixture();
  const job = await setup(repository);
  await updatePackageResume(repository, job.id, "resume-a", true);
  vi.spyOn(repository, "saveApplication").mockRejectedValueOnce(new Error("interrupted replacement"));
  await expect(updatePackageResume(repository, job.id, "resume-b")).rejects.toThrow("interrupted replacement");
  expect((await repository.listApplications())[0].resumeVersionId).toBe("resume-a");
  await updatePackageResume(repository, job.id, "resume-b");
  expect((await repository.listApplications())[0]).toMatchObject({ resumeVersionId: "resume-b", status: "preparing" });
  await expect(requireApprovedPackage(repository, job.id)).rejects.toThrow("package_approval_required");
});
