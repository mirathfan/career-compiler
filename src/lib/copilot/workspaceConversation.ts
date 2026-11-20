import { resumeBulletBinding, prepareResumeBulletAction, type ResumeBulletBinding } from "./resumeBulletActions";
import { ResumeBulletSuggestion, type ResumeBulletTarget } from "./resumeBulletContract";
import { profileSkillBinding, prepareProfileSkillAction, type ProfileSkillBinding } from "./profileSkillActions";
import { ProfileSkillSuggestion, requestedProfileSkillName } from "./profileSkillContract";
import { normalizeImportKey } from "../import/careerIntake";
import { buildSynthesisEvidence, validateSynthesis, synthesisContent, synthesisCitations } from "./workspaceSynthesis";
import { IntelligenceConsent, ConversationReferences, loadIntelligenceInputs, noIntelligence, resolveReferences, type ConversationReferences as References } from "./workspaceIntelligence";
import type { AppRepository } from "../database/repository";
import type { AIProvider } from "../ai/provider";
import type { CareerCopilotMessage } from "../../types/domain";
import { createAIProvider } from "../ai/providerFactory";
import { modelJobContext } from "./modelConversation";
import { budgetUsage, reserveBudget, markMockAttempt, finishBudget } from "../job-automation/budget";
import { createId, nowIso } from "../utils";
import { executeWorkspaceReads, grantPlan, Grants, ReadPlan as ReadPlanSchema, recordCitation, type ReadGrant, type ReadPlan, type ReadRecord, type ReadOptions } from "./workspaceReads";
import { validateWorkspaceAnswer, type WorkspaceRequest } from "./workspaceContract";

export interface WorkspaceReview { request: WorkspaceRequest; provider: "mock" | "openai"; model: string; dailyUsed: number; dailyLimit: number }
interface Receipt { repo: AppRepository; serialized: string; binding: string; grants: ReadGrant[]; snapshot: string; threadId?: string; calls?: ReadPlan; options: ReadOptions; skillBinding?: ProfileSkillBinding; skillName?: string; resumeBinding?: ResumeBulletBinding; }
const receipts = new WeakMap<WorkspaceReview, Receipt>();
export function discardWorkspaceReview(review: WorkspaceReview) { receipts.delete(review); }
async function checkThread(repo: AppRepository, threadId: string | undefined, jobId: string) {
  if (!threadId) return;
  const t = await repo.getCareerCopilotThread(threadId);
  if (!t || t.archivedAt || t.activeContextType !== "job" || t.activeContextId !== jobId) throw new Error("Conversation context changed. Choose the original saved-job conversation.");
}
async function readSnapshot(repo: AppRepository, grants: ReadGrant[], options: ReadOptions) {
  const records = await executeWorkspaceReads(repo, grantPlan(grants), grants, options);
  const revision = options.consent?.jobFit ? (await loadIntelligenceInputs(repo, grants, options.consent)).revision : null;
  return { ...records, revision };
}
export async function reviewWorkspaceQuestion(repo: AppRepository, jobId: string, question: string, selection: unknown, threadId?: string, settings: { consent?: IntelligenceConsent; focusJobId?: string; responseStyle?: "evidence" | "synthesis"; allowProfileSkillProposal?: boolean; resumeBulletTarget?: ResumeBulletTarget } = {}): Promise<WorkspaceReview> {
  if (!question.trim() || question.length > 2000) throw new Error("Enter a question of 1–2,000 characters.");
  const grants = Grants.parse(selection); const current = await modelJobContext(repo, jobId);
  await checkThread(repo, threadId, jobId);
  const consent = IntelligenceConsent.parse(settings.consent ?? noIntelligence);
  const previousMessage = threadId ? [...await repo.listCareerCopilotMessages(threadId)].reverse().find(m => m.structuredContentJson.workspaceRead) : undefined;
  const saved = previousMessage?.structuredContentJson.workspaceRead as { references?: unknown } | undefined;
  const previous = ConversationReferences.safeParse(saved?.references);
  const references = consent.jobFit ? resolveReferences(question, grants.filter(g => g.tool === "get_job").map(g => g.id), previous.success ? previous.data : undefined, settings.focusJobId) : undefined;
  if (consent.jobFit && !references?.orderedJobIds.length) throw new Error("Select saved jobs for comparison.");
  const skillName = settings.allowProfileSkillProposal ? requestedProfileSkillName(question) : null;
  if (settings.allowProfileSkillProposal && (!skillName || !grants.some(g => g.tool === "get_career_fact"))) throw new Error("Name one skill with ‘Add <skill> to my profile’ and select its verified evidence before requesting a proposal.");
  const skillBinding = settings.allowProfileSkillProposal ? await profileSkillBinding(repo) : undefined;
  if (settings.resumeBulletTarget && (skillBinding || !grants.some(g => g.tool === "get_career_fact") || !/\b(improve|revise|rewrite)\b.*\bbullet\b/i.test(question))) throw new Error("Request one bullet revision and select verified evidence; do not combine action types.");
  const resumeBinding = settings.resumeBulletTarget ? await resumeBulletBinding(repo, jobId, settings.resumeBulletTarget) : undefined;
  const options: ReadOptions = { consent, references };
  const snapshot = await readSnapshot(repo, grants, options);
  const usage = await budgetUsage(repo, new Date().toISOString().slice(0, 10));
  if (usage.reserved >= current.dailyLimit) throw new Error("The shared daily AI limit has been reached.");
  const review: WorkspaceReview = { request: { job: { id: current.selected.id, contentHash: current.selected.contentHash }, question, phase: "plan", ...(resumeBinding ? { allowResumeBulletProposal: true } : {}), ...(skillBinding ? { allowProfileSkillProposal: true } : {}), ...(settings.responseStyle === "synthesis" ? { responseStyle: "synthesis" as const } : {}), ...(consent.jobFit ? { intelligenceConsent: consent, references } : {}), catalog: grants.map(g => { const r = snapshot.records.find(r => r.tool === g.tool && r.id === g.id)!; return { ...g, label: r.label }; }), records: [] }, provider: current.provider, model: current.model, dailyUsed: usage.reserved, dailyLimit: current.dailyLimit };
  receipts.set(review, { repo, serialized: JSON.stringify(review), binding: current.binding, grants, snapshot: JSON.stringify(snapshot), threadId, options, skillBinding, resumeBinding, skillName: skillName ?? undefined });
  return review;
}
async function fresh(repo: AppRepository, review: WorkspaceReview, receipt: Receipt) {
  await checkThread(repo, receipt.threadId, review.request.job.id);
  if (receipt.resumeBinding && JSON.stringify(await resumeBulletBinding(repo, review.request.job.id, receipt.resumeBinding.target)) !== JSON.stringify(receipt.resumeBinding)) throw new Error("The source résumé changed after review.");
  if (receipt.skillBinding && JSON.stringify(await profileSkillBinding(repo)) !== JSON.stringify(receipt.skillBinding)) throw new Error("The profile or skill list changed after review. Review fresh data.");
  if ((await modelJobContext(repo, review.request.job.id)).binding !== receipt.binding || JSON.stringify(await readSnapshot(repo, receipt.grants, receipt.options)) !== receipt.snapshot) throw new Error("A selected record or AI setting changed. Review fresh data before continuing.");
}
async function boundedCall<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Provider timeout. Review again to retry; no automatic retry.")), 60000);
    abort = () => reject(new Error("Cancelled. A sent request cannot be recalled."));
    signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
  })]); } finally { clearTimeout(timer); if (abort) signal?.removeEventListener("abort", abort); }
}
export async function sendWorkspaceReview(repo: AppRepository, review: WorkspaceReview, approved: boolean, signal?: AbortSignal, injected?: AIProvider): Promise<{ review: WorkspaceReview } | { threadId: string }> {
  const receipt = receipts.get(review);
  if (!approved || !receipt || receipt.repo !== repo || receipt.serialized !== JSON.stringify(review)) throw new Error("Explicit approval of the unchanged request is required.");
  receipts.delete(review);
  const snapshot = JSON.parse(receipt.serialized) as WorkspaceReview;
  const stopped = () => { if (signal?.aborted) throw new Error("Cancelled before completing this request."); };
  stopped(); await fresh(repo, snapshot, receipt); stopped();
  const provider = injected ?? createAIProvider(snapshot.provider);
  if (provider.mode !== snapshot.provider || !provider.converseWorkspace) throw new Error("Workspace provider unavailable.");
  const attempt = createId("copilot-workspace");
  if (!await reserveBudget(repo, attempt, snapshot.request.job.id, snapshot.request.job.contentHash, nowIso(), snapshot.provider)) throw new Error("Shared AI budget exhausted or another request is active.");
  try {
    stopped(); await fresh(repo, snapshot, receipt); stopped();
    if (snapshot.provider === "mock") await markMockAttempt(repo, attempt);
    const output = await boundedCall(provider.converseWorkspace({ request: { ...snapshot.request, budgetAttemptId: attempt }, modelName: snapshot.model }), signal);
    stopped(); await fresh(repo, snapshot, receipt); stopped();
    if (snapshot.request.phase === "plan") {
      if (output.data.phase !== "plan") throw new Error("Invalid tool-selection output.");
      const results = await executeWorkspaceReads(repo, output.data.plan, receipt.grants, receipt.options);
      if (!results.records.length) throw new Error("No supported records selected. Clarify your question and record selection.");
      const usage = await budgetUsage(repo, nowIso().slice(0, 10));
      const evidence = snapshot.request.responseStyle === "synthesis" ? buildSynthesisEvidence(results.records, snapshot.request.question, receipt.options.references?.focusedJobId) : undefined;
      const next: WorkspaceReview = { ...snapshot, dailyUsed: usage.reserved, request: { ...snapshot.request, phase: "answer", records: results.records, ...(evidence ? { synthesisEvidence: evidence } : {}) } };
      receipts.set(next, { ...receipt, serialized: JSON.stringify(next), calls: ReadPlanSchema.parse(output.data.plan) });
      return { review: next };
    }
    if (output.data.phase !== "answer") throw new Error("Invalid evidence response.");
    const resumeSuggestion = output.data.resumeBulletProposal ? ResumeBulletSuggestion.parse(output.data.resumeBulletProposal) : null;
    if (resumeSuggestion && (!snapshot.request.allowResumeBulletProposal || !receipt.resumeBinding)) throw new Error("A résumé bullet proposal was not authorized.");
    const suggestion = output.data.profileSkillProposal ? ProfileSkillSuggestion.parse(output.data.profileSkillProposal) : null;
    if (suggestion && (!snapshot.request.allowProfileSkillProposal || !receipt.skillBinding || normalizeImportKey(suggestion.skillName) !== normalizeImportKey(receipt.skillName ?? ""))) throw new Error("A profile-skill proposal was not authorized for this exact requested skill.");
    const synthesis = snapshot.request.responseStyle === "synthesis" ? validateSynthesis(output.data.answer, snapshot.request.synthesisEvidence ?? []) : null;
    const answer = synthesis ? { insufficient: true, quotes: [] } : validateWorkspaceAnswer(output.data.answer, snapshot.request.records);
    const threadId = await repo.transaction(async tx => {
      stopped(); await fresh(tx, snapshot, receipt); stopped();
      const thread = receipt.threadId ? (await tx.getCareerCopilotThread(receipt.threadId))! : await tx.saveCareerCopilotThread({ title: snapshot.request.question.slice(0, 100), activeContextType: "job", activeContextId: snapshot.request.job.id });
      const sources: ReadRecord[] = answer.quotes.map(q => snapshot.request.records.find(r => r.tool === q.tool && r.id === q.id)!);
      const reports = snapshot.request.records.flatMap(r => r.intelligence ? [r.intelligence] : []);
      const ranked = reports.find(r => r.kind === "jobs" && r.jobs.length > 1);
      const references: References | undefined = receipt.options.references ? { ...receipt.options.references, orderedJobIds: ranked?.kind === "jobs" ? ranked.jobs.map(j => j.id) : receipt.options.references.orderedJobIds } : undefined;
      const comparisonSources = reports.flatMap(r => r.kind === "jobs" ? r.jobs.flatMap(j => j.sources) : r.versions.flatMap(v => v.sources));
      const base = { threadId: thread.id, pendingActionsJson: [], toolCallsJson: [], provider: snapshot.provider, model: snapshot.model, promptVersion: "workspace-read-v1", tokenUsageJson: { inputTokens: output.metadata.inputTokens, outputTokens: output.metadata.outputTokens, totalTokens: output.metadata.totalTokens }, createdAt: nowIso() };
      const user: CareerCopilotMessage = { ...base, id: createId("copilot-message"), role: "user", content: snapshot.request.question, tokenUsageJson: { inputTokens: null, outputTokens: null, totalTokens: null }, structuredContentJson: {}, internalCitationsJson: [] };
      const assistant: CareerCopilotMessage = { ...base, id: createId("copilot-message"), role: "assistant", content: `${snapshot.provider === "mock" ? "Offline mock · fixed field selection, not model reasoning." : "AI-selected evidence · model interpretation, not independent verification."}\nReviewed snapshot; later record changes are not reflected here.\n${answer.insufficient ? reports.length ? "See the deterministic comparison below; no additional model-selected quote was returned." : "The approved records do not support an answer. Clarify the question or select other records." : answer.quotes.map(q => { const r = sources.find(r => r.tool === q.tool && r.id === q.id)!; return `${r.label} — ${q.field}: “${q.quote}”`; }).join("\n")}`,
        structuredContentJson: { workspaceRead: { version: 1, ...(synthesis ? { synthesis, synthesisEvidence: snapshot.request.synthesisEvidence } : {}), grants: receipt.grants, answer, records: snapshot.request.records, references: references ?? null } },
        internalCitationsJson: [...new Map([...(synthesis ? synthesisCitations(synthesis, snapshot.request.synthesisEvidence ?? []) : []), ...sources.map(recordCitation), ...comparisonSources.map(s => ({ id: `${s.type}:${s.id}:`, entityType: s.type, entityId: s.id, parentEntityType: "" as const, parentEntityId: "", label: s.label, detail: "Reviewed comparison snapshot" }))].map(c => [c.id, c])).values()],
        toolCallsJson: (receipt.calls?.calls ?? []).map(call => ({ id: createId("copilot-tool"), name: call.tool, argumentsJson: { ids: call.ids }, resultSummary: `${call.ids.length} authorized records; read-only` })) };
      if (synthesis) assistant.content = `${snapshot.provider === "mock" ? "Offline mock composition" : "AI-composed explanation"} · locally checked statements, not independent verification.\nReviewed snapshot; later changes are not reflected here.\n\n${synthesisContent(synthesis, snapshot.request.synthesisEvidence ?? [])}`;
      if (resumeSuggestion) {
        const prepared = await prepareResumeBulletAction(tx, thread.id, receipt.resumeBinding!, resumeSuggestion, snapshot.request.records.filter(r => r.tool === "get_career_fact").map(r => r.id));
        assistant.content += `\n\n${prepared.content}`;
        assistant.structuredContentJson.resumeBulletContext = receipt.resumeBinding!.target;
        assistant.pendingActionsJson = [{ ...prepared.action, messageId: assistant.id }];
        assistant.internalCitationsJson = [...new Map([...assistant.internalCitationsJson, ...prepared.citations].map(c => [c.id,c])).values()];
      }
      if (suggestion) {
        const project = snapshot.request.question.match(/ using (?:the )?(.+?) evidence[.!]?$/i)?.[1];
        if (project && suggestion.evidenceIds.some(id => !snapshot.request.records.some(r => r.tool === "get_career_fact" && r.id === id && r.fields.some(f => f.name === "project" && normalizeImportKey(f.value) === normalizeImportKey(project))))) throw new Error("The suggested evidence does not match the requested project.");
        const prepared = await prepareProfileSkillAction(tx, thread.id, suggestion, receipt.skillBinding!, snapshot.request.records.filter(r => r.tool === "get_career_fact").map(r => r.id));
        assistant.content += `\n\n${prepared.content}`;
        assistant.structuredContentJson.profileSkillContext = prepared.context;
        assistant.structuredContentJson.profileSkillNotice = prepared.content;
        assistant.pendingActionsJson = prepared.action ? [{ ...prepared.action, messageId: assistant.id }] : [];
        assistant.internalCitationsJson = [...new Map([...assistant.internalCitationsJson, ...prepared.citations].map(c => [c.id, c])).values()];
      }
      await tx.saveCareerCopilotMessage(user); stopped(); await tx.saveCareerCopilotMessage(assistant); stopped();
      return thread.id;
    });
    return { threadId };
  } finally { await finishBudget(repo, attempt); }
}
