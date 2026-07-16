import { describe, expect, it } from "vitest";
import type { CareerImportProposal } from "../../types/domain";
import { prepareCareerImportProposal } from "../import/careerIntake";
import { MemoryRepository } from "./memoryRepository";
import { migrations } from "./migrations";

function importProposal(decision: "pending" | "approved" = "approved"): CareerImportProposal {
  return {
    importId: "career-import-unit-test",
    sourceType: "paste_anything",
    sourceTitle: "Unit test import",
    sourceReference: "manual paste",
    profileChanges: [],
    careerItemChanges: [
      {
        proposalId: "proposal-item",
        operation: "add",
        targetType: "career_item",
        existingRecordId: "",
        confidence: 0.9,
        reason: "Project was named explicitly.",
        sourceExcerpt: "Project: Intake Test Project",
        validationStatus: "pending",
        validationIssues: [],
        duplicateCandidates: [],
        conflictDetails: [],
        userDecision: decision,
        proposedValue: {
          type: "project",
          title: "Intake Test Project",
          organization: "Independent project",
          location: "",
          startDate: "",
          endDate: "",
          isCurrent: false,
          shortDescription: "Project imported during a unit test.",
          url: "",
          repositoryUrl: "",
          enabled: true,
        },
        existingValue: null,
      },
    ],
    careerFactChanges: [
      {
        proposalId: "proposal-fact",
        operation: "add",
        targetType: "career_fact",
        existingRecordId: "",
        confidence: 0.9,
        reason: "Fact was stated explicitly.",
        sourceExcerpt: "Built intake tests with 3 deterministic checks.",
        validationStatus: "pending",
        validationIssues: [],
        duplicateCandidates: [],
        conflictDetails: [],
        userDecision: decision,
        proposedValue: {
          statement: "Built intake tests with 3 deterministic checks.",
          careerItemId: "",
          careerItemTitle: "Intake Test Project",
          evidenceStatus: "user_provided",
          sourceType: "user_statement",
          sourceReference: "manual paste",
          skillTags: ["testing"],
          roleTags: ["software engineer"],
          metricTokens: ["3"],
          importance: 3,
          enabled: true,
        },
        existingValue: null,
      },
    ],
    skillChanges: [
      {
        proposalId: "proposal-skill",
        operation: "add",
        targetType: "skill",
        existingRecordId: "",
        confidence: 0.8,
        reason: "Skill was stated explicitly.",
        sourceExcerpt: "testing",
        validationStatus: "pending",
        validationIssues: [],
        duplicateCandidates: [],
        conflictDetails: [],
        userDecision: decision,
        proposedValue: {
          name: "Unit Test Skill",
          category: "Testing",
          proficiencyNote: "",
          enabled: true,
        },
        existingValue: null,
      },
    ],
    relationshipChanges: [],
    warnings: [],
    unresolvedQuestions: [],
    extractionMetadata: {
      provider: "mock",
      model: "mock",
      promptVersion: "careercompiler-career-intake-v1.0.0",
      classifiedAs: "paste_anything",
      createdAt: "2026-07-16T00:00:00.000Z",
    },
  };
}

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

  it("backfills the CareerCompiler project and skills idempotently", async () => {
    const repository = new MemoryRepository();
    await repository.initialize();
    await repository.seedSampleData();
    await repository.seedSampleData();
    const items = await repository.listCareerItems();
    const facts = await repository.listFactsForItem("project-careercompiler");
    const skills = await repository.listSkills();
    expect(items.filter((item) => item.id === "project-careercompiler")).toHaveLength(1);
    expect(facts).toHaveLength(10);
    expect(facts.flatMap((fact) => fact.metricTokens)).toEqual(
      expect.arrayContaining(["58", "18", "965.41", "424.50"]),
    );
    expect(skills.map((skill) => skill.name)).toEqual(
      expect.arrayContaining(["Tauri", "OpenAI Responses API", "XeLaTeX", "React Testing Library"]),
    );
  });

  it("requires explicit career import decisions before saving", async () => {
    const repository = new MemoryRepository();
    await repository.seedSampleData();
    await expect(repository.applyCareerImportProposal(importProposal("pending"))).rejects.toThrow(
      /Every proposal must be approved/,
    );
  });

  it("saves and undoes approved Smart Career Intake proposals", async () => {
    const repository = new MemoryRepository();
    await repository.seedSampleData();
    const context = {
      profile: await repository.getProfile(),
      careerItems: await repository.listCareerItems(),
      careerFacts: await repository.listCareerFacts(),
      skills: await repository.listSkills(),
    };
    const prepared = prepareCareerImportProposal(importProposal("approved"), context);
    const record = await repository.applyCareerImportProposal(prepared);
    expect(record.approvedCount).toBe(3);
    const createdItem = (await repository.listCareerItems()).find((item) => item.title === "Intake Test Project");
    expect(createdItem).toBeTruthy();
    expect((await repository.listFactsForItem(createdItem?.id ?? "")).map((fact) => fact.statement)).toContain(
      "Built intake tests with 3 deterministic checks.",
    );
    await repository.undoLastCareerImport();
    expect((await repository.listCareerItems()).some((item) => item.title === "Intake Test Project")).toBe(false);
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
