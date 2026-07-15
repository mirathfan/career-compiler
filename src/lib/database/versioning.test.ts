import { describe, expect, it } from "vitest";
import { createGenerationFixture } from "../../test/generationFixture";
import { deterministicFallback } from "../ai/generationPipeline";
import { regenerateResumeVersion } from "../tailoring/regenerate";
import { migrations } from "./migrations";

describe("resume versioning and approved variants", () => {
  it("uses an additive Milestone 2 migration", () => {
    const migration = migrations.find((item) => item.id === 2);
    expect(migration?.sql).toContain("ALTER TABLE resume_versions ADD COLUMN parent_resume_version_id");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS approved_bullet_variants");
  });

  it("creates and retrieves relevant approved bullet variants", async () => {
    const { repository } = await createGenerationFixture();
    const variant = await repository.saveApprovedBulletVariant({
      careerItemId: "project-forge",
      sourceFactIds: ["project-forge-fact-01"],
      text: "Built the Forge product end to end.",
      roleCategories: ["full-stack engineer"],
      skillTags: ["TypeScript"],
      creationSource: "user",
    });
    const relevant = await repository.listApprovedBulletVariants({
      factIds: ["project-forge-fact-01"],
      roleCategories: ["full-stack engineer"],
    });
    expect(relevant.map((item) => item.id)).toContain(variant.id);
  });

  it("persists only safe generation metadata", async () => {
    const fixture = await createGenerationFixture();
    const content = deterministicFallback(fixture.request);
    const saved = await fixture.repository.saveResumeVersion({
      jobId: fixture.job.id,
      contentJson: content,
      generationProvider: "mock",
      generationModel: "mock-model",
      promptVersion: "test-version",
      generationMetadataJson: {
        calls: [{
          provider: "mock",
          model: "mock-model",
          requestType: "resume_generation",
          success: true,
          durationMs: 1,
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          errorCode: "",
        }],
        repairAttempted: false,
        repairSucceeded: false,
        deterministicFallbackUsed: false,
        compactionLog: [],
      },
    });
    const serialized = JSON.stringify(saved.generationMetadataJson);
    expect(serialized).not.toContain("sk-");
    expect(serialized).not.toContain(fixture.profile.portfolioUrl);
  });

  it("regeneration creates a child and preserves the old version", async () => {
    const fixture = await createGenerationFixture();
    const content = deterministicFallback(fixture.request);
    content.projects[0].locked = true;
    content.projects[0].bullets[0].locked = true;
    const parent = await fixture.repository.saveResumeVersion({
      jobId: fixture.job.id,
      name: "Loop root",
      contentJson: content,
      deterministicBaselineJson: content,
    });
    const result = await regenerateResumeVersion({
      repository: fixture.repository,
      resumeVersionId: parent.id,
      refreshAnalysis: false,
    });
    const versions = await fixture.repository.listResumeVersions();
    expect(result.child.parentResumeVersionId).toBe(parent.id);
    expect(versions.some((version) => version.id === parent.id)).toBe(true);
    expect(versions.some((version) => version.id === result.child.id)).toBe(true);
    expect((await fixture.repository.getResumeVersion(parent.id))?.contentJson).toEqual(content);
  });

  it("tracks which resumes used a fact", async () => {
    const fixture = await createGenerationFixture();
    const content = deterministicFallback(fixture.request);
    const factId = content.projects[0].bullets[0].sourceFactIds[0];
    await fixture.repository.saveResumeVersion({ jobId: fixture.job.id, name: "Usage test", contentJson: content });
    const usage = await fixture.repository.listFactUsage(factId);
    expect(usage[0].resumeName).toBe("Usage test");
  });
});
