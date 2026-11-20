import type { AppRepository } from "../database/repository";
import { readJobMatchAnalysisAudit } from "./analysisState";

export async function budgetUsage(repository: AppRepository, day: string) {
  const [records, history] = await Promise.all([repository.listSafetyRecords("ai_budget"), repository.listJobMatchHistory()]);
  const recordIds = new Set(records.map(record => record.id));
  const ids = new Set(records.filter(record => record.value.day === day).map(record => record.id));
  for (const item of history) {
    const audit = readJobMatchAnalysisAudit(item.analysisJson);
    if (!audit || (audit.attemptId && recordIds.has(audit.attemptId))) continue;
    if (!audit.attemptId && ["not_requested", "approval_required", "queued", "deterministic_only"].includes(audit.state)) continue;
    // A durable reservation owns its original UTC day. Archiving an old result
    // today is not a new reservation. Legacy attempts retain conservative fallback
    // accounting on their original audit date, or row date if it is unavailable.
    const originalDate = typeof audit.createdAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(audit.createdAt) ? audit.createdAt : item.createdAt;
    if (originalDate.slice(0, 10) === day) ids.add(audit.attemptId ?? item.id);
  }
  return { reserved: ids.size, attemptedCalls: records.filter((item) => item.value.day === day).reduce((total, item) => total + Number(item.value.attemptedCalls ?? 0), 0), actualCostUsd: null };
}
export async function reserveBudget(repository: AppRepository, id: string, jobId: string, fingerprint: string, now: string, provider: string) {
  return repository.transaction(async (transaction) => {
    const preferences = await transaction.getJobSearchPreferences();
    const usage = await budgetUsage(transaction, now.slice(0, 10));
    if (usage.reserved >= preferences.maximumAiAnalysesPerDay) return false;
    const records = await transaction.listSafetyRecords("ai_budget");
    if (records.some((record) => record.id === id)) return false;
    if (records.some((record) => record.value.jobId === jobId && record.value.state !== "finished" && Number(record.value.leaseUntil) > Date.parse(now))) return false;
    await transaction.saveSafetyRecord({ id, kind: "ai_budget", createdAt: now, value: { day: now.slice(0, 10), jobId, fingerprint, provider,
      attemptedCalls: 0, actualCostUsd: null, state: "reserved", leaseUntil: Date.parse(now) + 3_600_000 } });
    return true;
  });
}
export async function markMockAttempt(repository: AppRepository, id: string) {
  return repository.transaction(async (transaction) => {
    const record = (await transaction.listSafetyRecords("ai_budget")).find((item) => item.id === id);
    if (!record || record.value.state === "finished" || Number(record.value.attemptedCalls) >= 2) throw new Error("ai_reservation_invalid|Missing or exhausted reservation.");
    await transaction.saveSafetyRecord({ ...record, value: { ...record.value, attemptedCalls: Number(record.value.attemptedCalls) + 1, state: "attempted" } });
  });
}
export async function finishBudget(repository: AppRepository, id: string) {
  await repository.transaction(async (transaction) => {
    const record = (await transaction.listSafetyRecords("ai_budget")).find((item) => item.id === id);
    if (record) await transaction.saveSafetyRecord({ ...record, value: { ...record.value, state: "finished" } });
  });
}
