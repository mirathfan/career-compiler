import { describe, expect, it } from "vitest";
import { MemoryRepository } from "./memoryRepository";
import { migrations } from "./migrations";

describe("database repository", () => {
  it("defines the milestone schema migration", () => {
    expect(migrations[0].sql).toContain("CREATE TABLE IF NOT EXISTS career_facts");
    expect(migrations[0].sql).toContain("source_note");
    expect(migrations[0].sql).toContain("resume_versions");
  });

  it("seeds idempotently", async () => {
    const repository = new MemoryRepository();
    await repository.initialize();
    const first = await repository.seedSampleData();
    const second = await repository.seedSampleData();
    const facts = await repository.listCareerFacts();
    expect(first.inserted).toBeGreaterThan(20);
    expect(second.inserted).toBe(0);
    expect(facts.filter((fact) => fact.id === "project-aura-fact-01")).toHaveLength(1);
  });

  it("supports career fact CRUD", async () => {
    const repository = new MemoryRepository();
    await repository.seedSampleData();
    const saved = await repository.saveCareerFact({
      careerItemId: "project-aura",
      statement: "Validated a new editable fact.",
      skillTags: ["testing"],
      roleTags: ["software engineer"],
      metricTokens: [],
      importance: 3,
      evidenceStatus: "user_provided",
      enabled: true,
    });
    expect((await repository.listFactsForItem("project-aura")).some((fact) => fact.id === saved.id)).toBe(true);
    await repository.deleteCareerFact(saved.id);
    expect((await repository.listFactsForItem("project-aura")).some((fact) => fact.id === saved.id)).toBe(false);
  });

  it("persists resumes locally through the repository API", async () => {
    const repository = new MemoryRepository();
    await repository.seedSampleData();
    const job = await repository.saveJob({ rawDescription: "React TypeScript AI role with enough description." });
    const resume = await repository.saveResumeVersion({
      jobId: job.id,
      name: "Draft",
      contentJson: {
        id: "resume-test",
        header: {
          fullName: "Mir Athfan Ali",
          headline: "",
          location: "",
          email: "",
          phone: "",
          portfolioUrl: "",
          linkedInUrl: "",
          githubUrl: "",
          workAuthorizationNote: "",
        },
        summary: [],
        education: [],
        experience: [],
        projects: [],
        skills: [],
        sectionOrder: ["projects", "education", "skills"],
        compactionActions: [],
        layout: { bodyFontSize: 9.5, spacingScale: 1, condensedSkills: false },
        approvedWarningCodes: [],
      },
      validationJson: [],
      status: "draft",
    });
    expect((await repository.listResumeVersions())[0].id).toBe(resume.id);
  });
});
