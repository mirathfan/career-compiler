import type { JobMatchAnalysisAudit, JobMatchAnalysisState } from "./aiTypes";

const states = new Set<JobMatchAnalysisState>([
  "not_requested", "approval_required", "queued", "running", "valid", "valid_after_repair",
  "failed", "stale", "deterministic_only",
]);

export function readJobMatchAnalysisAudit(value: unknown): JobMatchAnalysisAudit | null {
  if (!value || typeof value !== "object") return null;
  const audit = value as Partial<JobMatchAnalysisAudit>;
  if (audit.schemaVersion !== "careercompiler-job-match-audit-v1" || !audit.state || !states.has(audit.state)) return null;
  return audit as JobMatchAnalysisAudit;
}

export function jobMatchAnalysisState(value: unknown): JobMatchAnalysisState {
  return readJobMatchAnalysisAudit(value)?.state ?? "not_requested";
}

export function staleJobMatchAudit(value: unknown, contentHash: string, createdAt: string) {
  const existing = readJobMatchAnalysisAudit(value);
  if (!existing) return {
    schemaVersion: "careercompiler-job-match-audit-v1",
    state: "stale",
    contentHash,
    createdAt,
  };
  return { ...existing, state: "stale" as const, contentHash, createdAt };
}
