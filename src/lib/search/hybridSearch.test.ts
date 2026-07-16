import { describe, expect, it } from "vitest";
import { deterministicFallback } from "../ai/generationPipeline";
import { createGenerationFixture } from "../../test/generationFixture";
import { buildSearchDocuments } from "./documentModel";
import { deterministicSearch, sanitizeFtsQuery } from "./text";
import { containsEmbeddingSecret, documentsNeedingEmbedding, embeddingInputForDocument, MockVectorProvider } from "./vectorProvider";
import { generateResumeRecommendations } from "./resumeRecommendations";

describe("hybrid career retrieval", () => {
  it("creates searchable documents for career facts, jobs, resumes, bullets, and applications", async () => {
    const fixture = await createGenerationFixture();
    const resume = await fixture.repository.saveResumeVersion({
      jobId: fixture.job.id,
      name: "Loop Full-Stack",
      contentJson: deterministicFallback(fixture.request),
    });
    await fixture.repository.saveApplication({
      company: "Loop",
      role: "New Grad SWE",
      jobId: fixture.job.id,
      resumeVersionId: resume.id,
      status: "applied",
      notes: "Submitted Forge-heavy resume.",
    });

    const diagnostics = await fixture.repository.rebuildSearchIndex();
    const documents = await fixture.repository.listSearchDocuments();
    const forge = await fixture.repository.searchCareerDocuments("Forge offline sync");

    expect(diagnostics.documentCount).toBeGreaterThan(20);
    expect(documents.map((document) => document.entityType)).toEqual(
      expect.arrayContaining(["career_fact", "job", "resume", "resume_bullet", "application"]),
    );
    expect(forge.some((result) => result.document.entityType === "career_fact")).toBe(true);
  });

  it("sanitizes malformed FTS input and ranks deterministic fallback results", async () => {
    const fixture = await createGenerationFixture();
    const documents = buildSearchDocuments({
      profile: fixture.profile,
      careerItems: fixture.items,
      careerFacts: fixture.facts,
      skills: fixture.skills,
      jobs: [fixture.job],
      resumes: [],
      approvedVariants: [],
      applications: [],
      evaluations: [],
      careerImports: [],
      copilotThreads: [],
      resumeFavorites: [],
      resumeArchives: [],
    });
    const query = sanitizeFtsQuery('"Forge offline" NEAR(foo) OR secret:*');
    const { results } = deterministicSearch(documents, "Forge offline", { entityTypes: ["career_fact"] });

    expect(query).toContain('"forge offline"');
    expect(query).not.toContain("NEAR");
    expect(results[0].document.entityType).toBe("career_fact");
    expect(results[0].sourceRef.entityId).toContain("project-forge");
  });

  it("keeps embeddings optional, redacted, and content-hash based", async () => {
    const fixture = await createGenerationFixture();
    const document = buildSearchDocuments({
      profile: { ...fixture.profile, email: "mir@example.com", phone: "312-555-1234" },
      careerItems: [],
      careerFacts: [],
      skills: [],
      jobs: [],
      resumes: [],
      approvedVariants: [],
      applications: [],
      evaluations: [],
      careerImports: [],
      copilotThreads: [],
      resumeFavorites: [],
      resumeArchives: [],
    })[0];
    const input = embeddingInputForDocument(document);
    const provider = new MockVectorProvider();

    expect(input.text).not.toContain("mir@example.com");
    expect(input.text).not.toContain("312-555-1234");
    expect(containsEmbeddingSecret("sk-testsecret123456789")).toBe(true);
    expect(documentsNeedingEmbedding([document], [], provider)).toHaveLength(1);
    const embedding = (await provider.embed([input]))[0];
    expect(embedding.vector).toHaveLength(provider.dimensions);
  });

  it("scores base-resume recommendations without changing source resumes", async () => {
    const fixture = await createGenerationFixture();
    const resume = await fixture.repository.saveResumeVersion({
      jobId: fixture.job.id,
      name: "Reusable full-stack resume",
      contentJson: deterministicFallback(fixture.request),
      status: "approved",
    });
    const target = await fixture.repository.saveJob({
      company: "Loop",
      roleTitle: "Full-Stack SWE",
      rawDescription: fixture.job.rawDescription,
      analysisJson: fixture.analysis,
    });

    const recommendations = await generateResumeRecommendations(fixture.repository, target.id);

    expect(recommendations[0].candidateResumeVersionId).toBe(resume.id);
    expect(recommendations[0].overallScore).toBeGreaterThan(0);
    expect((await fixture.repository.getResumeVersion(resume.id))?.parentResumeVersionId).toBe("");
  });
});
