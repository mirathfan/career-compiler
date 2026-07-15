import { MockAIProvider } from "../lib/ai/mockProvider";
import { buildResumeGenerationRequest } from "../lib/ai/generationRequest";
import { MemoryRepository } from "../lib/database/memoryRepository";
import { defaultSettings } from "../lib/database/seed";
import { scoreCareerFacts } from "../lib/tailoring/evidence";
import { sampleJob } from "../features/tailoring/sampleJob";

export async function createGenerationFixture() {
  const repository = new MemoryRepository();
  await repository.seedSampleData();
  const profile = (await repository.getProfile())!;
  const items = await repository.listCareerItems();
  const facts = await repository.listCareerFacts();
  const skills = await repository.listSkills();
  const analyzed = await new MockAIProvider().analyzeJob({ ...sampleJob, modelName: "mock-model" });
  const analysis = analyzed.data;
  const job = await repository.saveJob({ ...sampleJob, analysisJson: analysis });
  const evidence = scoreCareerFacts(analysis, facts, items);
  const controls = {
    ...defaultSettings.tailoringDefaults,
    projectCount: 4 as const,
    bulletsPerProject: 3 as const,
  };
  const request = buildResumeGenerationRequest({
    job,
    analysis,
    profile,
    items,
    evidence,
    skills,
    controls,
  });
  return { repository, profile, items, facts, skills, analysis, job, evidence, controls, request };
}
