import { MemoryRepository } from "../lib/database/memoryRepository";
import { defaultSettings } from "../lib/database/seed";

/** Synthetic-only fixture for the real-user functional audit. */
export async function resumeAuditFixture() {
  const repo = new MemoryRepository();
  await repo.initialize();
  const profile = await repo.saveProfile({ id: "audit-profile", fullName: "Taylor Synthetic", headline: "Software Engineer", city: "Austin", region: "TX", email: "taylor@example.invalid", phone: "555-0100", portfolioUrl: "", linkedInUrl: "", githubUrl: "", workAuthorizationNote: "", updatedAt: "" });
  const backend = await repo.saveCareerItem({ id: "audit-backend", type: "project", title: "Synthetic Service Monitor", organization: "Independent", shortDescription: "Backend monitoring project", enabled: true, startDate: "2024-01", endDate: "2024-06", displayOrder: 1 });
  const ai = await repo.saveCareerItem({ id: "audit-ai", type: "project", title: "Synthetic Retrieval Assistant", organization: "Independent", shortDescription: "AI retrieval project", enabled: true, startDate: "2024-07", endDate: "2024-12", displayOrder: 2 });
  const work = await repo.saveCareerItem({ id: "audit-work", type: "employment", title: "Software Engineer", organization: "Synthetic Labs", location: "Austin, TX", enabled: true, startDate: "2023-01", endDate: "2024-12" });
  await repo.saveCareerItem({ id: "audit-education", type: "education", title: "Bachelor of Science in Computer Science", organization: "Synthetic University", location: "Austin, TX", startDate: "2019-08", endDate: "2023-05", enabled: true });
  for (const input of [
    { id: "audit-backend-fact", careerItemId: backend.id, statement: "Built Python and FastAPI services with PostgreSQL and Docker.", skillTags: ["Python", "FastAPI", "PostgreSQL", "Docker"], roleTags: ["backend engineer"] },
    { id: "audit-ai-fact", careerItemId: ai.id, statement: "Built retrieval workflows with Python, LangChain and OpenAI.", skillTags: ["Python", "LangChain", "OpenAI"], roleTags: ["AI engineer"] },
    { id: "audit-work-fact", careerItemId: work.id, statement: "Implemented TypeScript interfaces and automated tests.", skillTags: ["TypeScript"], roleTags: ["software engineer"] },
  ]) await repo.saveCareerFact({ ...input, evidenceStatus: "verified", enabled: true, importance: 3, sourceType: "manually_verified", sourceReference: "Synthetic audit fixture" });
  for (const name of ["Python", "FastAPI", "PostgreSQL", "Docker", "LangChain", "OpenAI", "TypeScript"]) await repo.saveSkill({ name, category: "Technology", enabled: true });
  const jobs = [];
  for (const [id, roleTitle, rawDescription] of [
    ["audit-backend-job", "Backend Engineer", "Required: Python, FastAPI, PostgreSQL and Docker. Build backend services and APIs."],
    ["audit-ai-job", "AI Engineer", "Required: Python, LangChain and OpenAI. Build retrieval and AI agent workflows."],
  ]) jobs.push(await repo.saveJob({ id, company: "Synthetic Employer", roleTitle, rawDescription, descriptionText: rawDescription, sourceUrl: "https://example.com/synthetic-job", status: "saved" }));
  await repo.saveSettings({ ...defaultSettings, aiProvider: "mock" });
  return { repo, profile, jobs, items: await repo.listCareerItems(), facts: await repo.listCareerFacts(), skills: await repo.listSkills(), settings: defaultSettings };
}
