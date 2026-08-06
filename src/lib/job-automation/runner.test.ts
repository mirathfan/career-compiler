import { describe, expect, it } from "vitest";
import { MemoryRepository } from "../database/memoryRepository";
import { runJobAutomation } from "./runner";

const greenhousePayload = { jobs: [{ id: 101, title: "Software Engineer", updated_at: "2026-08-05T00:00:00Z", location: { name: "Remote" }, absolute_url: "https://boards.greenhouse.io/example/jobs/101", content: "Build React and TypeScript products. 2 years experience." }] };

describe("job automation run integration", () => {
  it("persists fetched matches, updates duplicates, and isolates a failed source", async () => {
    const repository = new MemoryRepository();
    await repository.initialize();
    await repository.saveSkill({ id: "skill-react", name: "React", category: "Framework" });
    await repository.saveJobSearchPreferences({ targetRoleTitles: ["Software Engineer"], preferredSkills: ["React", "TypeScript"], minimumMatchScore: 40, maximumJobsAnalyzedPerRun: 10 });
    await repository.saveJobSource({ name: "Good", companyName: "Example", sourceType: "greenhouse", sourceIdentifier: "good" });
    await repository.saveJobSource({ name: "Bad", companyName: "Broken", sourceType: "lever", sourceIdentifier: "bad" });
    const run = await runJobAutomation(repository, { now: () => new Date("2026-08-06T00:00:00Z"), fetchContext: { maxAttempts: 1, fetchJson: async (url) => { if (url.includes("greenhouse")) return greenhousePayload; throw new Error("fixture failure"); } } });
    expect(run.status).toBe("partial");
    expect(run.jobsAdded).toBe(1);
    expect(run.jobsAnalyzed).toBe(1);
    expect(run.summary.sourceFailureCount).toBe(1);
    expect((await repository.listJobs())[0]?.status).toBe("matched");
    expect(await repository.listJobMatches()).toHaveLength(1);

    const second = await runJobAutomation(repository, { now: () => new Date("2026-08-06T01:00:00Z"), fetchContext: { maxAttempts: 1, fetchJson: async (url) => { if (url.includes("greenhouse")) return greenhousePayload; throw new Error("fixture failure"); } } });
    expect(second.jobsAdded).toBe(0);
    expect(second.jobsDeduplicated).toBe(1);
    expect(await repository.listJobs()).toHaveLength(1);
  });
});
