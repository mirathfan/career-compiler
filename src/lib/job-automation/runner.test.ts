import { describe, expect, it } from "vitest";
import { MemoryRepository } from "../database/memoryRepository";
import { MockAIProvider } from "../ai/mockProvider";
import { runApprovedJobMatchBatch } from "./aiBatch";
import { readJobMatchAnalysisAudit } from "./analysisState";
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

    const savedJob = (await repository.listJobs())[0];
    await repository.saveJobSearchPreferences({ aiMatchEnabled: true, aiMatchMockMode: true, aiMatchMinimumDeterministicScore: 0 });
    await runApprovedJobMatchBatch(repository, { jobIds: [savedJob.id], approved: true, trigger: "manual", provider: new MockAIProvider(), now: () => new Date("2026-08-06T01:30:00Z") });
    expect((await repository.getJobMatch(savedJob.id))?.aiScore).not.toBeNull();

    const changedPayload = { jobs: [{ ...greenhousePayload.jobs[0], updated_at: "2026-08-06T02:00:00Z", content: "Lead a completely different distributed data platform using Rust. Own architecture, operations, incident response, and multi-region reliability." }] };
    await runJobAutomation(repository, { now: () => new Date("2026-08-06T02:00:00Z"), fetchContext: { maxAttempts: 1, fetchJson: async (url) => { if (url.includes("greenhouse")) return changedPayload; throw new Error("fixture failure"); } } });
    const staleMatch = await repository.getJobMatch(savedJob.id);
    expect(staleMatch?.aiScore).toBeNull();
    expect(staleMatch?.combinedScore).toBe(staleMatch?.deterministicScore);
    expect(readJobMatchAnalysisAudit(staleMatch?.analysisJson)?.state).toBe("stale");
    expect(await repository.listJobMatchHistory(savedJob.id)).toHaveLength(3);
  });
});
