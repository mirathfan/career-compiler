import { describe, expect, it } from "vitest";
import { TailoredResumeSchema } from "../../schemas/resume";
import { createGenerationFixture } from "../../test/generationFixture";
import { scoreCareerFacts } from "../tailoring/evidence";
import { buildResumeGenerationRequest } from "./generationRequest";
import {
  deterministicFallback,
  generateEvidenceGroundedResume,
} from "./generationPipeline";
import { MockAIProvider } from "./mockProvider";

describe("evidence-grounded generation", () => {
  it("does not infer AI from a substring inside maintain", async () => {
    const result = await new MockAIProvider().analyzeJob({
      company: "Loop",
      roleTitle: "Full-Stack Engineer",
      sourceUrl: "",
      rawDescription: "Maintain APIs and build full-stack products.",
      modelName: "mock-model",
    });
    expect(result.data.roleCategories).toContain("full-stack engineer");
    expect(result.data.roleCategories).not.toContain("AI engineer");
  });

  it("constructs an allow-list request without private repository-only fields", async () => {
    const { request } = await createGenerationFixture();
    const serialized = JSON.stringify(request);
    expect(request.targetJob.company).toBe("Loop");
    expect(request.targetJob.analysis.roleCategories).not.toContain("AI engineer");
    expect(request.selectedFacts.length).toBeGreaterThan(0);
    expect(serialized).not.toContain("sourceNote");
    expect(serialized).not.toContain("proficiencyNote");
    expect(request.selectedFacts.every((fact) => fact.relevanceReason.length > 0)).toBe(true);
  });

  it("excludes unselected facts from the generation request", async () => {
    const fixture = await createGenerationFixture();
    const excludedId = fixture.evidence.find((score) => score.selected)!.fact.id;
    const evidence = fixture.evidence.map((score) =>
      score.fact.id === excludedId ? { ...score, selected: false } : score,
    );
    const request = buildResumeGenerationRequest({ ...fixture, evidence });
    expect(request.selectedFacts.some((fact) => fact.factId === excludedId)).toBe(false);
  });

  it("excludes prohibited facts even when their score is manually selected", async () => {
    const fixture = await createGenerationFixture();
    const prohibited = await fixture.repository.saveCareerFact({
      ...fixture.facts[0],
      id: "prohibited-generation-test",
      statement: "Invented 500% impact.",
      evidenceStatus: "prohibited",
    });
    const evidence = scoreCareerFacts(
      fixture.analysis,
      [...fixture.facts, prohibited],
      fixture.items,
    ).map((score) =>
      score.fact.id === prohibited.id ? { ...score, selected: true } : score,
    );
    const request = buildResumeGenerationRequest({ ...fixture, evidence });
    expect(request.selectedFacts.some((fact) => fact.factId === prohibited.id)).toBe(false);
  });

  it("parses a structured TailoredResume fixture", async () => {
    const { request } = await createGenerationFixture();
    const provider = new MockAIProvider();
    const plan = await provider.planResume({ request, modelName: "mock-model" });
    const generated = await provider.generateResume({ request, plan: plan.data, modelName: "mock-model" });
    expect(() => TailoredResumeSchema.parse(generated.data)).not.toThrow();
  });

  it("accepts a valid AI generation", async () => {
    const { request } = await createGenerationFixture();
    const result = await generateEvidenceGroundedResume({
      provider: new MockAIProvider("valid"),
      request,
      modelName: "mock-model",
    });
    expect(result.validationIssues.filter((issue) => issue.severity === "error")).toHaveLength(0);
    expect(result.resume.projects[0].bullets[0].generationSource).toBe("ai");
    expect(result.resume.projects.slice(0, 3).map((project) => project.careerItemId)).toEqual([
      "project-forge",
      "project-aura",
      "project-client-bookstore",
    ]);
  });

  it("repairs one invalid response automatically and then stops", async () => {
    const { request } = await createGenerationFixture();
    const result = await generateEvidenceGroundedResume({
      provider: new MockAIProvider("repairable_invalid"),
      request,
      modelName: "mock-model",
    });
    expect(result.metadata.repairAttempted).toBe(true);
    expect(result.metadata.repairSucceeded).toBe(true);
    expect(result.metadata.calls.filter((call) => call.requestType === "validation_repair")).toHaveLength(1);
    expect(result.validationIssues.some((issue) => issue.severity === "error")).toBe(false);
  });

  it("blocks a non-repairable invalid response after one repair", async () => {
    const { request } = await createGenerationFixture();
    const result = await generateEvidenceGroundedResume({
      provider: new MockAIProvider("non_repairable_invalid"),
      request,
      modelName: "mock-model",
    });
    expect(result.metadata.repairAttempted).toBe(true);
    expect(result.metadata.repairSucceeded).toBe(false);
    expect(result.validationIssues.some((issue) => issue.code === "unsupported_percentage")).toBe(true);
  });

  it("provides a deterministic fallback with source-linked bullets", async () => {
    const { request } = await createGenerationFixture();
    const fallback = deterministicFallback(request);
    expect(fallback.projects.flatMap((section) => section.bullets).length).toBeGreaterThan(0);
    expect(
      fallback.projects.flatMap((section) => section.bullets).every((bullet) => bullet.sourceFactIds.length > 0),
    ).toBe(true);
  });
});
