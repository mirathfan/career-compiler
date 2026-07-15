import { describe, expect, it } from "vitest";
import { MockAIProvider } from "../ai/mockProvider";
import { MemoryRepository } from "../database/memoryRepository";
import { scoreCareerFacts } from "./evidence";
import { createResumePlan } from "./plan";
import { generateTailoredResume } from "./generateResume";

describe("tailoring pipeline", () => {
  it("mock analysis is deterministic and schema-shaped", async () => {
    const provider = new MockAIProvider();
    const { data: analysis } = await provider.analyzeJob({
      company: "Acme",
      roleTitle: "AI Engineer",
      sourceUrl: "",
      rawDescription: "React TypeScript Python OpenAI embeddings LangGraph evaluation",
      modelName: "mock",
    });
    expect(analysis.inferredCompany).toBe("Acme");
    expect(analysis.requiredSkills).toContain("TypeScript");
    expect(analysis.preferredSkills).toContain("LangGraph");
  });

  it("scores relevant facts above unrelated facts and excludes prohibited facts", async () => {
    const repository = new MemoryRepository();
    await repository.seedSampleData();
    const facts = await repository.listCareerFacts();
    const prohibited = await repository.saveCareerFact({
      ...facts[0],
      id: "prohibited-test",
      evidenceStatus: "prohibited",
      statement: "Invented 400% improvement.",
    });
    const items = await repository.listCareerItems();
    const { data: analysis } = await new MockAIProvider().analyzeJob({
      company: "Acme",
      roleTitle: "AI Engineer",
      sourceUrl: "",
      rawDescription: "React Native TypeScript OpenAI embeddings LangGraph evaluation",
      modelName: "mock",
    });
    const scores = scoreCareerFacts(analysis, [...facts, prohibited], items);
    const aura = scores.find((score) => score.fact.id === "project-aura-fact-04");
    const blocked = scores.find((score) => score.fact.id === "prohibited-test");
    expect(aura?.score).toBeGreaterThan(20);
    expect(blocked?.selected).toBe(false);
    expect(blocked?.excludedReason).toBe("Prohibited fact.");
  });

  it("creates a plan and generates bullets with source facts", async () => {
    const repository = new MemoryRepository();
    await repository.seedSampleData();
    const { data: analysis } = await new MockAIProvider().analyzeJob({
      company: "Acme",
      roleTitle: "Full-Stack AI Engineer",
      sourceUrl: "",
      rawDescription: "React TypeScript Python OpenAI embeddings LangGraph evaluation",
      modelName: "mock",
    });
    const profile = (await repository.getProfile())!;
    const items = await repository.listCareerItems();
    const facts = await repository.listCareerFacts();
    const skills = await repository.listSkills();
    const evidence = scoreCareerFacts(analysis, facts, items);
    const plan = createResumePlan(analysis, evidence, skills);
    const resume = generateTailoredResume({ profile, items, facts, skills, analysis, plan, evidence });
    const bullets = resume.projects.flatMap((section) => section.bullets);
    expect(plan.selectedFactIds.length).toBeGreaterThan(0);
    expect(bullets[0].sourceFactIds.length).toBeGreaterThan(0);
  });
});
