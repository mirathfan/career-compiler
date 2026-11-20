import { MemoryRepository } from "../lib/database/memoryRepository";
import type { AppRepository } from "../lib/database/repository";
import { populateFitFixtures, FIT_FIXTURE_DATE } from "../lib/jobs/fitFixtures";
import { createGenerationFixture } from "./generationFixture";
import { deterministicFallback } from "../lib/ai/generationPipeline";
import { loadIntelligenceInputs, type Selection } from "../lib/copilot/workspaceIntelligence";
export const intelligenceConsent = { jobFit: true, careerContext: true, resumeEvidence: true };
export async function createIntelligenceFixture(repo: AppRepository = new MemoryRepository()) {
  await repo.initialize(); await populateFitFixtures(repo);
  await repo.saveJobSearchPreferences({ aiMatchEnabled: true, aiMatchMockMode: true, maximumAiAnalysesPerDay: 20 });
  const job = await repo.saveJob({ id: "python-job", company: "Fixture AI", roleTitle: "AI Engineer", descriptionText: "Python required. Project experience is accepted. Sponsorship is available. Entry-level engineers are welcome.", rawDescription: "Python required. Project experience is accepted. Sponsorship is available. Entry-level engineers are welcome.", postedAt: "2026-10-15", status: "saved" });
  const template = deterministicFallback((await createGenerationFixture()).request);
  const item = (await repo.listCareerItems()).find(i => i.id === "synthetic-ai-project")!;
  const content = { ...template, summary: [], skills: ["Python"], experience: [], education: [], projects: [{ ...item, careerItemId: item.id, locked: true, technologies: [], bullets: [{ ...template.projects[0].bullets[0], id: "grounded-bullet", text: "Built a Python documentation retrieval evaluator and reviewed grounded model answers.", sourceFactIds: ["synthetic-ai-fact"], included: true, rejected: false, locked: true, keywordsAddressed: ["Python"] }] }], header: { ...template.header, fullName: "PRIVATE_NAME", email: "private@example.invalid" } };
  const master = await repo.saveResumeVersion({ id: "locked-master", jobId: job.id, name: "Same title", kind: "master", contentJson: { ...content, projects: content.projects.map(s => ({ ...s, bullets: [] })), skills: [] } });
  const child = await repo.saveResumeVersion({ id: "exact-child", jobId: job.id, name: "Same title", kind: "tailored", parentResumeVersionId: master.id, baseResumeVersionId: master.id, contentJson: content });
  const app = await repo.saveApplication({ id: "exact-application", company: job.company, role: job.roleTitle, jobId: job.id, status: "applied", appliedDate: "2026-10-14", submittedResumeVersionId: child.id, notes: "PRIVATE_APPLICATION", submittedPdfPath: "/Users/private/original.pdf" });
  const selection: Selection = [{ tool: "get_job", id: job.id }, { tool: "get_job", id: "fit-job-7" }, { tool: "get_job", id: "fit-job-6" }, { tool: "get_career_fact", id: "synthetic-ai-fact" }, { tool: "get_career_fact", id: "synthetic-fact" }, { tool: "get_career_fact", id: "synthetic-intern-fact" }, { tool: "get_resume", id: master.id }, { tool: "get_resume", id: child.id }, { tool: "get_application", id: app.id }];
  const inputs = () => loadIntelligenceInputs(repo, selection, intelligenceConsent, FIT_FIXTURE_DATE);
  return { repo, job, master, child, app, selection, inputs };
}
