import { z } from "zod";
import type { InternalCitation } from "../../types/domain";
import type { AppRepository } from "../database/repository";
const Target = z.object({ kind: z.enum(["job", "application", "resume", "career_fact", "career_item"]), id: z.string().min(1).max(160).regex(/^[\w:-]+$/) }).strict();
export type CitationTarget = z.infer<typeof Target>;
export function citationTarget(source: InternalCitation): CitationTarget | null {
  const direct = Target.safeParse({ kind: source.entityType, id: source.entityId });
  if (direct.success) return direct.data;
  const parent = Target.safeParse({ kind: source.parentEntityType, id: source.parentEntityId });
  return parent.success ? parent.data : null;
}
export function citationHref(target: CitationTarget) {
  const parsed = Target.parse(target); const id = encodeURIComponent(parsed.id);
  switch (parsed.kind) {
    case "job": return `/jobs?jobId=${id}`;
    case "application": return `/applications?applicationId=${id}`;
    case "resume": return `/library?resumeId=${id}`;
    case "career_fact": return `/career-memory?factId=${id}`;
    case "career_item": return `/career-memory?itemId=${id}`;
  }
}
export async function verifiedCitationHref(repo: AppRepository, source: InternalCitation) {
  const target = citationTarget(source);
  if (!target) throw new Error("This citation has no supported record destination.");
  const exists = target.kind === "job" ? await repo.getJob(target.id) : target.kind === "application" ? await repo.getApplication(target.id) : target.kind === "resume" ? await repo.getResumeVersion(target.id) : target.kind === "career_fact" ? (await repo.listCareerFacts()).find(f => f.id === target.id && f.enabled && f.evidenceStatus !== "prohibited" && f.evidenceStatus !== "needs_review") : (await repo.listCareerItems()).find(i => i.id === target.id && i.enabled);
  if (!exists) throw new Error("Cited record unavailable or no longer permitted. No other record was opened.");
  if (target.kind === "career_fact") {
    const fact = (await repo.listCareerFacts()).find(f => f.id === target.id)!;
    if (!(await repo.listCareerItems()).some(i => i.id === fact.careerItemId && i.enabled)) throw new Error("Cited evidence parent is unavailable.");
  }
  return citationHref(target);
}
