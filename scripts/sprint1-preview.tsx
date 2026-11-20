// Development-only entry. In-memory synthetic records; no SQLite, keys, live providers, or boards.
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "../src/App";
import { RepositoryContext } from "../src/lib/database/repositoryContext";
import { MemoryRepository } from "../src/lib/database/memoryRepository";
import { populateFitFixtures } from "../src/lib/jobs/fitFixtures";
import { configureIsolatedRuntime } from "../src/lib/acceptance/runtime";
import { localDay } from "../src/lib/dashboard/workspace";
import "../src/index.css";
configureIsolatedRuntime();
const repository = new MemoryRepository();
await populateFitFixtures(repository);
for (const id of ["fit-job-0", "fit-job-1", "fit-job-2"]) {
  const job = await repository.getJob(id);
  if (job) await repository.saveJob({ ...job, status: "saved" });
}
await repository.saveApplication({ id: "sprint1-draft", company: "Example Systems", role: "AI Engineer", status: "preparing" });
await repository.saveApplication({ id: "sprint1-followup", company: "Example Studio", role: "Software Engineer", status: "interview", followUpDate: localDay() });
const item = (await repository.listCareerItems())[0];
await repository.saveCareerFact({ id: "sprint1-review", careerItemId: item.id, statement: "Synthetic evidence awaiting review.", evidenceStatus: "needs_review" });
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient()}><RepositoryContext.Provider value={{ repository, ready: true, error: null }}><App /></RepositoryContext.Provider></QueryClientProvider>);
