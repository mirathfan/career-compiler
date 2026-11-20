import { describe, expect, it, vi } from "vitest";
import { MemoryRepository } from "../database/memoryRepository";
import { applicationLink, buildWorkspaceActivity, displayRecordedDate, jobLink, loadWorkspaceSummary, localDay, resumeLink } from "./workspace";
import type { TailoredResume } from "../../types/domain";

const content: TailoredResume = { id: "synthetic", header: { fullName: "Synthetic", headline: "", location: "", email: "", phone: "", portfolioUrl: "", linkedInUrl: "", githubUrl: "", workAuthorizationNote: "" }, summary: [], education: [], experience: [], projects: [], skills: [], sectionOrder: [], compactionActions: [], layout: { bodyFontSize: 9.5, spacingScale: 1, condensedSkills: false }, approvedWarningCodes: [] };

describe("read-only workspace summary", () => {
  it("represents an empty repository without fabricated activity or deadlines", async () => {
    const result = await loadWorkspaceSummary(new MemoryRepository(), "2026-11-11");
    expect(result).toMatchObject({ draftApplications: 0, dueFollowUps: 0, upcomingFollowUps: 0, draftResumes: 0, savedJobs: [], actions: [], activity: [] });
  });

  it("counts only explicit valid follow-up dates on open applications, never age", async () => {
    const repo = new MemoryRepository();
    for (const [id, followUpDate, status] of [
      ["old", "", "applied"], ["overdue", "2026-11-10", "applied"], ["today", "2026-11-11", "interview"], ["upcoming", "2026-11-12", "ready"],
      ["closed", "2026-11-01", "withdrawn"], ["rejected", "2026-11-01", "rejected"], ["invalid", "2026-02-30", "applied"], ["ambiguous", "11/02/26", "applied"],
    ] as const) await repo.saveApplication({ id, company: "Synthetic", role: id, status, followUpDate, createdAt: "2020-01-01T00:00:00Z" });
    const result = await loadWorkspaceSummary(repo, "2026-11-11");
    expect(result.dueFollowUps).toBe(2); expect(result.upcomingFollowUps).toBe(1);
    expect(result.actions.map(action => action.id)).toEqual(["follow-up:overdue", "follow-up:today"]);
  });

  it("shows a draft's saved next action and valid future date without inventing urgency or changing records", async () => {
    const repo = new MemoryRepository();
    const app = await repo.saveApplication({ id: "prepare", company: "Synthetic", role: "AI Engineer", status: "preparing", nextAction: "Review this application", followUpDate: "2026-11-20" });
    const result = await loadWorkspaceSummary(repo, "2026-11-13");
    expect(result.actions.find(action => action.id === "draft:prepare")).toMatchObject({ detail: `AI Engineer · Review this application · Follow-up: ${displayRecordedDate("2026-11-20")}`, priority: 1, to: applicationLink(app.id) });
    expect(result.dueFollowUps).toBe(0); expect(result.upcomingFollowUps).toBe(1);
    expect(await repo.getApplication(app.id)).toEqual(app);
    await repo.saveApplication({ ...app, nextAction: "", followUpDate: "not a date" });
    const incomplete = await loadWorkspaceSummary(repo, "2026-11-13");
    expect(incomplete.actions.find(action => action.id === "draft:prepare")?.detail).toBe("AI Engineer");
    expect(incomplete.upcomingFollowUps).toBe(0);
  });

  it("orders actions deterministically and excludes archived and approved resume drafts", async () => {
    const repo = new MemoryRepository();
    for (const id of ["b", "a"]) await repo.saveApplication({ id, company: "Synthetic", role: id, createdAt: "2026-11-01T00:00:00Z" });
    await repo.saveApplication({ id: "due", company: "Synthetic", role: "due", status: "applied", followUpDate: "2026-11-10" });
    for (const id of ["review", "archived", "approved"]) await repo.saveResumeVersion({ id, jobId: "", contentJson: content, status: id === "approved" ? "approved" : "draft" });
    await repo.setResumeArchived("archived", true);
    const item = await repo.saveCareerItem({ type: "project", title: "Synthetic" });
    await repo.saveCareerFact({ careerItemId: item.id, statement: "Pending evidence", evidenceStatus: "needs_review" });
    const result = await loadWorkspaceSummary(repo, "2026-11-11");
    expect(result.actions.map(action => action.id)).toEqual(["follow-up:due", "draft:a", "draft:b", "resume:review", "evidence"]);
    expect(result.draftApplications).toBe(2); expect(result.draftResumes).toBe(1);
  });

  it("uses saved job states and safe exact entity links without eligibility inference", async () => {
    const repo = new MemoryRepository();
    await repo.saveJob({ id: "saved&one", rawDescription: "", status: "saved" });
    await repo.saveJob({ id: "matched", rawDescription: "", status: "matched" });
    const result = await loadWorkspaceSummary(repo);
    expect(result.savedJobs.map(job => job.id)).toEqual(["saved&one"]);
    expect(jobLink("saved&one")).toBe("/jobs?view=all&jobId=saved%26one");
    expect(applicationLink("a/b")).toBe("/applications?applicationId=a%2Fb");
    expect(resumeLink("v#1")).toBe("/library?resumeId=v%231");
    expect(result).not.toHaveProperty("eligibleJobs");
  });

  it("leaves submitted identities, provenance, settings and migrations untouched", async () => {
    const repo = new MemoryRepository();
    await repo.saveApplication({ id: "submitted", company: "Synthetic", role: "Engineer", status: "applied", submittedResumeVersionId: "historical-version", resumeVersionId: "different-draft", source: "original provenance" });
    await repo.saveSafetyRecord({ id: "audit", kind: "application_history_audit", value: { source: "synthetic" }, createdAt: "2026-11-01T00:00:00Z" });
    const before = await repo.exportBackup();
    const mutations = [vi.spyOn(repo, "saveApplication"), vi.spyOn(repo, "saveResumeVersion"), vi.spyOn(repo, "saveSafetyRecord"), vi.spyOn(repo, "saveSettings")];
    await loadWorkspaceSummary(repo); await loadWorkspaceSummary(repo);
    expect(await repo.exportBackup()).toEqual({ ...before, exportedAt: expect.any(String) });
    mutations.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect((await repo.getApplication("submitted"))?.submittedResumeVersionId).toBe("historical-version");
    expect(await repo.listSafetyRecords("application_history_audit")).toHaveLength(1);
  });

  it("uses recorded events and omits unparseable dates without inventing updates", async () => {
    const repo = new MemoryRepository();
    const application = await repo.saveApplication({ company: "Synthetic", role: "Engineer", statusHistoryJson: [
      { status: "applied", changedAt: "2026-11-01T12:00:00Z", note: "Private note excluded from feed" },
      { status: "interview", changedAt: "unknown", note: "" },
    ] });
    const result = buildWorkspaceActivity([application], [], []);
    expect(result).toHaveLength(1); expect(result[0]).toMatchObject({ at: "2026-11-01T12:00:00Z", detail: "Application status: applied", to: applicationLink(application.id) });
    expect(JSON.stringify(result)).not.toContain("Private note");
    expect(displayRecordedDate("")).toBe("Date not recorded");
    expect(localDay(new Date(2026, 10, 11, 23, 59))).toBe("2026-11-11");
  });

  it("surfaces repository failures instead of displaying a false zero", async () => {
    const repo = new MemoryRepository();
    vi.spyOn(repo, "listApplications").mockRejectedValue(new Error("Database unavailable"));
    await expect(loadWorkspaceSummary(repo)).rejects.toThrow("Database unavailable");
  });
});
