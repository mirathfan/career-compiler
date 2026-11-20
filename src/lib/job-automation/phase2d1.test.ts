import initSqlJs from "sql.js/dist/sql-asm.js";
import type TauriDatabase from "@tauri-apps/plugin-sql";
import { SqliteRepository } from "../database/sqliteRepository";
import type { AppRepository } from "../database/repository";
import { updatePackageResume } from "./applicationPackages";
import { describe, it, expect, vi } from "vitest";
import { MemoryRepository } from "../database/memoryRepository";
import { runApprovedJobMatchBatch } from "./aiBatch";
import { readJobMatchAnalysisAudit } from "./analysisState";

async function fixture(repository: AppRepository = new MemoryRepository()) {
  await repository.initialize();
  const item = await repository.saveCareerItem({ id: "synthetic-parent", type: "employment", title: "React engineer", shortDescription: "React products" });
  const fact = await repository.saveCareerFact({ id: "synthetic-fact", careerItemId: item.id, statement: "Built React products.", skillTags: ["React"], evidenceStatus: "verified", sourceReference: "synthetic-note" });
  await repository.saveJobSearchPreferences({ aiMatchEnabled: true, aiMatchMockMode: true, aiMatchMinimumDeterministicScore: 0, maximumAiAnalysesPerDay: 20 });
  const job = await repository.saveJob({ company: "Synthetic", roleTitle: "React engineer", rawDescription: "Build React products.", descriptionText: "Build React products.", status: "matched" });
  await repository.saveJobMatch({ jobId: job.id, deterministicScore: 80, combinedScore: 80 });
  await runApprovedJobMatchBatch(repository, { jobIds: [job.id], approved: true, trigger: "mock" });
  expect(readJobMatchAnalysisAudit((await repository.getJobMatch(job.id))?.analysisJson)?.state).toBe("valid");
  return { repository, item, fact, job };
}
describe("authoritative completed evidence freshness", () => {
  it.each(["statement", "parent", "eligibility", "sensitivity", "source", "review", "delete", "disabled", "employment", "education"])("invalidates after %s without spending budget", async (change) => {
    const { repository, item, fact, job } = await fixture();
    const before = (await repository.listSafetyRecords("ai_budget")).length;
    if (change === "parent") await repository.saveCareerItem({ ...item, enabled: false });
    else if (change === "employment") await repository.saveCareerItem({ ...item, endDate: "2026-09" });
    else if (change === "education") await repository.saveCareerItem({ ...item, type: "education", title: "Reviewed React curriculum" });
    else if (change === "disabled") await repository.saveCareerFact({ ...fact, enabled: false });
    else if (change === "delete") await repository.deleteCareerFact(fact.id);
    else await repository.saveCareerFact({ ...fact, ...(change === "statement" ? { statement: "Built Vue products." } : change === "eligibility" ? { evidenceStatus: "prohibited" as const } : change === "sensitivity" ? { statement: "Contact private@example.invalid for React." } : change === "source" ? { sourceReference: "" } : { lastReviewedDate: "2026-10-14" }) });
    const match = await repository.getJobMatch(job.id);
    expect(readJobMatchAnalysisAudit(match?.analysisJson)?.state).toBe("stale");
    expect(match?.aiScore).toBeNull(); expect(match?.combinedScore).toBe(match?.deterministicScore);
    expect((await repository.listJobMatchHistory()).some(row => readJobMatchAnalysisAudit(row.analysisJson)?.state === "valid")).toBe(true);
    expect((await repository.listSafetyRecords("ai_budget")).length).toBe(before);
  });
  it("removes AI-only rejection and recomputes current deterministic evidence", async () => {
    const { repository, job, fact } = await fixture(); const match = (await repository.getJobMatch(job.id))!;
    await repository.saveJobMatch({ ...match, hardReject: true, hardRejectReasons: ["Synthetic AI-only rejection"], matchedFactIds: [fact.id] });
    await repository.saveJob({ ...job, rawDescription: job.rawDescription, status: "filtered_out" });
    await repository.saveCareerFact({ ...fact, enabled: false });
    const stale = (await repository.getJobMatch(job.id))!;
    expect(stale.hardReject).toBe(false); expect(stale.hardRejectReasons).not.toContain("Synthetic AI-only rejection");
    expect(stale.matchedFactIds).not.toContain(fact.id); expect(["matched", "analysis_pending"]).toContain((await repository.getJob(job.id))?.status);
  });
  it("preserves current deterministic rejection after evidence invalidation", async () => {
    const { repository, job, fact } = await fixture();
    await repository.saveJobSearchPreferences({ excludedCompanies: [job.company] });
    await repository.saveCareerFact({ ...fact, enabled: false });
    const stale = (await repository.getJobMatch(job.id))!;
    expect(stale.hardReject).toBe(true); expect(stale.hardRejectReasons).toContain("Company is excluded.");
  });
  it("preserves validity for cosmetic ordering and UI settings", async () => {
    const { repository, item, job } = await fixture();
    await repository.saveCareerItem({ ...item, displayOrder: 999 });
    await repository.saveSettings({ ...(await repository.getSettings()), modelName: "different-future-model" });
    expect(readJobMatchAnalysisAudit((await repository.getJobMatch(job.id))?.analysisJson)?.state).toBe("valid");
  });
  it("drops legacy AI scores even when audit schema is unrecognized", async () => {
    const { repository, job } = await fixture(); const match = (await repository.getJobMatch(job.id))!;
    await repository.saveJobMatch({ ...match, analysisJson: { legacy: "unknown" } });
    const stale = await repository.getJobMatch(job.id);
    expect(stale?.aiScore).toBeNull(); expect(readJobMatchAnalysisAudit(stale?.analysisJson)?.state).toBe("stale");
  });
  it("rejects legacy valid audit without a fingerprint", async () => {
    const { repository, job } = await fixture(); const match = (await repository.getJobMatch(job.id))!;
    const audit = { ...readJobMatchAnalysisAudit(match.analysisJson)! } as Record<string, unknown>;
    delete audit.evidenceFingerprint; delete audit.evidenceFingerprintVersion;
    await repository.saveJobMatch({ ...match, analysisJson: audit });
    expect(readJobMatchAnalysisAudit((await repository.getJobMatch(job.id))?.analysisJson)?.state).toBe("stale");
  });
});

async function sqliteFixture() {
  const SQL = await initSqlJs(); const database = new SQL.Database();
  const adapter = {
    execute: async (sql: string, values: unknown[] = []) => { database.run(sql, values as (string | number | null)[]); return { rowsAffected: database.getRowsModified(), lastInsertId: 0 }; },
    select: async (sql: string, values: unknown[] = []) => { const statement = database.prepare(sql); statement.bind(values as (string | number | null)[]); const rows = []; while(statement.step()) rows.push(statement.getAsObject()); statement.free(); return rows; },
  } as unknown as TauriDatabase;
  return { database, adapter, repository: new SqliteRepository(adapter) };
}
describe("SQLite authoritative freshness and restart", () => {
  it("persists invalidation/history and rejects approval based on stale analysis", async () => {
    const { repository, adapter } = await sqliteFixture(); const { job, fact } = await fixture(repository);
    await repository.saveApplicationPackage({ jobId: job.id });
    await repository.saveCareerFact({ ...fact, sourceReference: "removed" });
    const restarted = new SqliteRepository(adapter);
    expect(readJobMatchAnalysisAudit((await restarted.getJobMatch(job.id))?.analysisJson)?.state).toBe("stale");
    await expect(updatePackageResume(restarted, job.id, "", true)).rejects.toThrow("analysis_evidence_stale");
    expect((await restarted.listJobMatchHistory()).some(row => readJobMatchAnalysisAudit(row.analysisJson)?.state === "valid")).toBe(true);
  });
  it("detects direct/import-style storage writes on authoritative read", async () => {
    const { repository, database, adapter } = await sqliteFixture(); const { job, fact } = await fixture(repository);
    database.run("UPDATE career_facts SET enabled=0 WHERE id=?", [fact.id]);
    const restarted = new SqliteRepository(adapter);
    const match = await restarted.getJobMatch(job.id);
    expect(readJobMatchAnalysisAudit(match?.analysisJson)?.state).toBe("stale"); expect(match?.aiScore).toBeNull();
  });
  it("rolls back evidence mutation if invalidation history cannot persist", async () => {
    const { repository } = await sqliteFixture(); const { job, fact } = await fixture(repository);
    repository.saveJobMatchHistory = vi.fn(async () => { throw new Error("synthetic-audit-failure"); });
    await expect(repository.saveCareerFact({ ...fact, enabled: false })).rejects.toThrow("synthetic-audit-failure");
    expect((await repository.listCareerFacts()).find(row => row.id === fact.id)?.enabled).toBe(true);
    expect(readJobMatchAnalysisAudit((await repository.getJobMatch(job.id))?.analysisJson)?.state).toBe("valid");
  });
  it("serializes a concurrent edit before a subsequent authoritative read", async () => {
    const { repository, fact, job } = await fixture();
    const edit = repository.saveCareerFact({ ...fact, enabled: false });
    const read = repository.getJobMatch(job.id); await edit;
    expect(readJobMatchAnalysisAudit((await read)?.analysisJson)?.state).toBe("stale");
  });
});
