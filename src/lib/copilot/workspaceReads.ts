import { z } from "zod";
import { ComparisonTool, IntelligenceConsent, IntelligenceReport, loadIntelligenceInputs, rankPermittedJobs, comparePermittedResumes, intelligenceText, noIntelligence, type ConversationReferences } from "./workspaceIntelligence";
import type { AppRepository } from "../database/repository";
import type { InternalCitation } from "../../types/domain";

export const ReadTool = z.enum(["get_job", "get_career_fact", "get_application", "get_resume"]);
export type ReadTool = z.infer<typeof ReadTool>;
const Id = z.string().min(1).max(160).regex(/^[\w:-]+$/);
export const OperationTool = z.enum([...ReadTool.options, ...ComparisonTool.options]);
export const ReadCall = z.object({ tool: OperationTool, ids: z.array(Id).min(1).max(5) }).strict();
export type ReadCall = z.infer<typeof ReadCall>;
export const ReadPlan = z.object({ calls: z.array(ReadCall).max(4) }).strict();
export type ReadPlan = z.infer<typeof ReadPlan>;
export const ReadGrant = z.object({ tool: ReadTool, id: Id }).strict();
export type ReadGrant = z.infer<typeof ReadGrant>;
export const Grants = z.array(ReadGrant).min(1).max(10).refine(values => new Set(values.map(g => `${g.tool}:${g.id}`)).size === values.length, "Duplicate selection");
const fields = ["company", "role", "location", "description", "status", "appliedDate", "followUpDate", "submittedResumeVersionId", "jobId", "statement", "project", "evidenceStatus", "name", "kind", "parentResumeVersionId", "baseResumeVersionId", "comparison"] as const;
export const ReadRecord = z.object({ tool: OperationTool, id: Id, label: z.string().max(240), revision: z.string().max(300), fields: z.array(z.object({ name: z.enum(fields), value: z.string().max(2400) }).strict()).max(8), intelligence: IntelligenceReport.optional() }).strict();
export type ReadRecord = z.infer<typeof ReadRecord>;
export const ReadOutput = z.object({ records: z.array(ReadRecord).max(10), audit: z.array(z.object({ tool: OperationTool, ids: z.array(Id).max(5), count: z.number().int().min(0).max(5) }).strict()).max(4) }).strict();
export class WorkspaceReadError extends Error {
  readonly code: "invalid_arguments" | "scope_denied" | "missing_record" | "ineligible_record" | "context_limit";
  constructor(code: WorkspaceReadError["code"], message: string) { super(message); this.code = code; }
}
export function minimizedText(text: string, limit = 2400) {
  return text.replace(/sk-[a-zA-Z0-9_-]{8,}/g, "[credential removed]").replace(/(?:file:\/\/)?\/(?:Users|home|private|tmp)\/[^\s"<>]+/g, "[local path removed]").replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email removed]").slice(0, limit);
}
export const toolLabels: Record<ReadTool, string> = { get_job: "Saved jobs", get_career_fact: "Verified career evidence", get_application: "Application dates and status", get_resume: "Résumé metadata and lineage" };
export function recordCitation(record: ReadRecord): InternalCitation {
  const entityType = ({ get_job: "job", get_career_fact: "career_fact", get_application: "application", get_resume: "resume", analyze_job_requirements: "job", compare_resumes: "job" } as const)[record.tool];
  return { id: `${entityType}:${record.id}:`, entityType, entityId: record.id, parentEntityType: "", parentEntityId: "", label: record.label, detail: "Reviewed snapshot; not a live status guarantee" };
}

// Local picker only. Never a provider input; each category is opened explicitly.
export async function readChoices(repo: AppRepository, tool: ReadTool, offset = 0, includeUnavailable = false) {
  if (!Number.isInteger(offset) || offset < 0 || offset > 10000) throw new WorkspaceReadError("invalid_arguments", "Invalid page.");
  let rows: Array<{ id: string; label: string }>;
  if (tool === "get_job") rows = (await repo.listJobs()).filter(j => includeUnavailable || !["archived", "closed", "rejected", "filtered_out"].includes(j.status)).map(j => ({ id: j.id, label: `${j.company} · ${j.roleTitle}` }));
  else if (tool === "get_application") rows = (await repo.listApplications()).map(a => ({ id: a.id, label: `${a.company} · ${a.role}` }));
  else if (tool === "get_resume") rows = (await repo.listResumeVersions()).map(r => ({ id: r.id, label: r.name }));
  else { const items = await repo.listCareerItems(); rows = (await repo.listCareerFacts()).filter(f => f.enabled && f.evidenceStatus === "verified" && items.some(i => i.id === f.careerItemId && i.enabled)).map(f => ({ id: f.id, label: f.statement })); }
  return { records: rows.slice(offset, offset + 20).map(r => ({ id: r.id, label: minimizedText(r.label, 240) })), more: rows.length > offset + 20 };
}

export interface ReadOptions { consent?: IntelligenceConsent; references?: ConversationReferences; now?: Date }
export async function executeWorkspaceReads(repo: AppRepository, planInput: unknown, grantInput: unknown, options: ReadOptions = {}) {
  const parsed = ReadPlan.safeParse(planInput); const consent = Grants.safeParse(grantInput);
  if (!parsed.success || !consent.success) throw new WorkspaceReadError("invalid_arguments", "Invalid or oversized read request.");
  const authorization = IntelligenceConsent.parse(options.consent ?? noIntelligence);
  const seen = new Set<string>();
  for (const call of parsed.data.calls) for (const id of call.ids) {
    const key = `${call.tool}:${id}`;
    const comparison = ComparisonTool.safeParse(call.tool).success;
    if (comparison && (!authorization.jobFit || call.tool === "compare_resumes" && (!authorization.resumeEvidence || call.ids.length !== 1))) throw new WorkspaceReadError("scope_denied", "Comparison fields require explicit authorization.");
    if (call.tool === "compare_resumes" && options.references?.focusedJobId && id !== options.references.focusedJobId) throw new WorkspaceReadError("scope_denied", "The requested comparison does not match the resolved follow-up job.");
    if (!consent.data.some(g => g.tool === (comparison ? "get_job" : call.tool) && g.id === id)) throw new WorkspaceReadError("scope_denied", "The requested record was not authorized.");
    if (seen.has(key)) throw new WorkspaceReadError("invalid_arguments", "Repeated record request.");
    seen.add(key);
  }
  if (seen.size > 10) throw new WorkspaceReadError("context_limit", "At most ten records may be retrieved.");
  const selectedJobIds = consent.data.filter(g => g.tool === "get_job").map(g => g.id);
  if (parsed.data.calls.some(call => call.tool === "analyze_job_requirements" && selectedJobIds.some(id => !call.ids.includes(id)))) throw new WorkspaceReadError("scope_denied", "Compare the complete selected job set so follow-up positions remain clear. Narrow the selection to compare fewer jobs.");
  const records: ReadRecord[] = [];
  const inputs = parsed.data.calls.some(c => ComparisonTool.safeParse(c.tool).success) ? await loadIntelligenceInputs(repo, consent.data, authorization, options.now) : null;
  for (const call of parsed.data.calls) {
    if (inputs && (call.tool === "analyze_job_requirements" || call.tool === "compare_resumes")) {
      const intelligence = call.tool === "analyze_job_requirements" ? rankPermittedJobs(inputs, call.ids) : comparePermittedResumes(inputs, call.ids[0]);
      records.push(ReadRecord.parse({ tool: call.tool, id: call.ids[0], label: call.tool === "analyze_job_requirements" ? "Deterministic job comparison" : "Existing résumé comparison", revision: inputs.revision, fields: [{ name: "comparison", value: minimizedText(intelligenceText(intelligence)) }], intelligence }));
      continue;
    }
    for (const id of call.ids) {
    let label = "", revision = ""; let values: Partial<Record<typeof fields[number], string>>;
    if (call.tool === "get_job") {
      const r = await repo.getJob(id); if (!r) throw new WorkspaceReadError("missing_record", "A selected job no longer exists.");
      if (!authorization.jobFit && ["archived", "closed", "rejected", "filtered_out"].includes(r.status)) throw new WorkspaceReadError("ineligible_record", "A selected job is unavailable.");
      label = `${r.company} · ${r.roleTitle}`; revision = r.updatedAt;
      values = { company: r.company, role: r.roleTitle, location: r.location, description: r.rawDescription, status: r.status };
    } else if (call.tool === "get_application") {
      const r = await repo.getApplication(id); if (!r) throw new WorkspaceReadError("missing_record", "A selected application no longer exists.");
      label = `${r.company} · ${r.role}`; revision = r.updatedAt;
      values = { company: r.company, role: r.role, status: r.status, appliedDate: r.appliedDate, followUpDate: r.followUpDate, jobId: r.jobId, submittedResumeVersionId: r.submittedResumeVersionId };
    } else if (call.tool === "get_resume") {
      const r = await repo.getResumeVersion(id); if (!r) throw new WorkspaceReadError("missing_record", "A selected résumé no longer exists.");
      label = r.name; revision = r.updatedAt;
      values = { name: r.name, kind: r.kind, status: r.status, jobId: r.jobId, parentResumeVersionId: r.parentResumeVersionId, baseResumeVersionId: r.baseResumeVersionId };
    } else {
      const r = (await repo.listCareerFacts()).find(f => f.id === id); const parent = r && (await repo.listCareerItems()).find(i => i.id === r.careerItemId);
      if (!r || !parent) throw new WorkspaceReadError("missing_record", "Selected career evidence no longer exists.");
      if (!r.enabled || !parent.enabled || r.evidenceStatus !== "verified") throw new WorkspaceReadError("ineligible_record", "Only enabled verified evidence is authorized.");
      label = parent.title; revision = `${r.updatedAt}:${parent.updatedAt}`;
      values = { statement: r.statement, project: parent.title, evidenceStatus: r.evidenceStatus };
    }
    records.push(ReadRecord.parse({ tool: call.tool, id, label: minimizedText(label, 240), revision, fields: Object.entries(values).map(([name, value]) => ({ name, value: minimizedText(value ?? "") })) }));
  }
  }
  const output = ReadOutput.parse({ records, audit: parsed.data.calls.map(c => ({ ...c, count: c.ids.length })) });
  if (JSON.stringify(output).length > 24000) throw new WorkspaceReadError("context_limit", "Reduce the selected records; context exceeds 24,000 characters.");
  return output;
}
export function grantPlan(grants: ReadGrant[]): ReadPlan {
  return { calls: ReadTool.options.flatMap(tool => { const ids = grants.filter(g => g.tool === tool).map(g => g.id); return ids.length ? [{ tool, ids }] : []; }) };
}
