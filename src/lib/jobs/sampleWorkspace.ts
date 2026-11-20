import { MockAIProvider } from "../ai/mockProvider";
import { MemoryRepository } from "../database/memoryRepository";
import { populateFitFixtures } from "./fitFixtures";
import { rescoreJob } from "../job-automation/runner";
import { createMasterResumeFromProfile } from "../tailoring/masterResume";

export async function createSampleWorkspace(full = false) {
  const repository = new MemoryRepository();
  const saved = await populateFitFixtures(repository, !full);
  for (const job of saved) {
    if (!full) { const analysis = await new MockAIProvider().analyzeJob({ company: job.company, roleTitle: job.roleTitle, rawDescription: job.rawDescription, sourceUrl: "", modelName: "mock" }); await repository.saveJob({ ...job, rawDescription: job.rawDescription, analysisJson: analysis.data }); }
    await rescoreJob(repository, job.id);
  }
  const [profile, items, facts, skills, settings] = await Promise.all([repository.getProfile(), repository.listCareerItems(), repository.listCareerFacts(), repository.listSkills(), repository.getSettings()]);
  const content = createMasterResumeFromProfile({ profile: profile!, items, facts, skills, settings: settings.templateSettings });
  await repository.saveResumeVersion({ id: "sample-resume-frontend", jobId: saved[0].id, name: "Sample frontend resume", kind: "tailored", contentJson: content, status: "draft" });
  return repository;
}
