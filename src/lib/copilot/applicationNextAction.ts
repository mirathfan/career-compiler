import { readHistoryMarker, readHistoryProofs } from "../applications/historyContract";
import { z } from "zod";
import type { AppRepository } from "../database/repository";
import type { ApplicationRecord, CareerCopilotPendingAction, CareerCopilotThread, InternalCitation } from "../../types/domain";
import { canonicalDigest } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
import { createId, nowIso } from "../utils";
import { isFollowUpDue, localDay } from "../dashboard/workspace";
import { APPLICATION_NEXT_ACTION, APPLICATION_NEXT_ACTION_AUDIT, ApplicationActionId, NextActionAfter, NextActionBefore, NextActionSuggestion, parseNextActionInstruction } from "./applicationActionContract";

const References = z.object({ orderedIds: z.array(ApplicationActionId).max(10), focusedId: ApplicationActionId.optional() }).strict();
type References = z.infer<typeof References>;
const tracking = (app: ApplicationRecord) => ({ nextAction: app.nextAction, followUpDate: app.followUpDate });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// Existing manual tracker editing remains available, but must not save a stale query snapshot.
export async function saveApplicationNextActionDraft(repo: AppRepository, applicationId: string, nextAction: string, expected: string) {
  return repo.transaction(async tx => {
    const current = await tx.getApplication(applicationId);
    if (!current || current.nextAction !== expected) throw new Error("The next action changed while you were editing. Your draft is retained; review the current value before retrying.");
    return tx.saveApplication({ ...current, nextAction });
  });
}
function cite(type: InternalCitation["entityType"], id: string, label: string, detail: string): InternalCitation { return { id: `${type}:${id}:`, entityType: type, entityId: id, label, detail, parentEntityType: "", parentEntityId: "" }; }
async function activeThread(repo: AppRepository, threadId: string, applicationId: string) {
  const thread = await repo.getCareerCopilotThread(threadId);
  if (!thread || thread.archivedAt || (thread.activeContextType === "application" && thread.activeContextId !== applicationId)) throw new Error("The conversation target changed. Start a fresh application review.");
}
async function references(repo: AppRepository, thread: CareerCopilotThread): Promise<References> {
  if (thread.activeContextType === "application") return { orderedIds: [thread.activeContextId], focusedId: thread.activeContextId };
  const previous = [...await repo.listCareerCopilotMessages(thread.id)].reverse().find(m => m.role === "assistant");
  const parsed = References.safeParse(previous?.structuredContentJson.applicationActionContext);
  return parsed.success ? parsed.data : { orderedIds: [] };
}
async function inspect(repo: AppRepository, apps: ApplicationRecord[]) {
  const citations: InternalCitation[] = []; const lines: string[] = [];
  const proofs = await readHistoryProofs(repo);
  for (const [index, app] of apps.entries()) {
    citations.push(cite("application", app.id, `${app.company} · ${app.role}`, "Recorded local application snapshot; not independent submission verification."));
    const [job, resume] = await Promise.all([app.jobId ? repo.getJob(app.jobId) : null, (app.submittedResumeVersionId || app.resumeVersionId) ? repo.getResumeVersion(app.submittedResumeVersionId || app.resumeVersionId) : null]);
    if (job) citations.push(cite("job", job.id, `${job.roleTitle} · ${job.company}`, "Linked saved job."));
    if (resume) citations.push(cite("resume", resume.id, resume.name, `Exact ${app.submittedResumeVersionId ? "submitted" : "linked"} version: ${resume.id}`));
    const marker = readHistoryMarker(app.source);
    const proof = marker ? proofs.find(p => p.id === marker.entryId && p.applicationId === app.id && p.evidenceState === marker.evidenceState && p.normalized.employer === app.company && p.normalized.role === app.role) : undefined;
    const historyEvidence = proof ? `Reviewed history classification: ${proof.evidenceState}. Inspect the preserved source in Application History.` : app.source.startsWith("history-import:") ? "Imported history needs provenance review; confirmation is not established here." : "Tracker values do not independently verify submission.";
    const recent = app.statusHistoryJson.slice(-3).map(e => `${e.status} (${e.changedAt})`).join("; ");
    lines.push(`${index + 1}. ${app.company} · ${app.role} [${app.id}]\nRecorded status: ${app.status}. Next action: ${app.nextAction || "None recorded"}. Follow-up date: ${app.followUpDate || "None recorded"}.${recent ? `\nRecent recorded status history: ${recent}.` : " No status-history events recorded."}\nRecorded submission time: ${app.submittedAt || "None recorded"}. ${historyEvidence}\nLinked job: ${job ? job.roleTitle : app.jobId ? "Missing record" : "None"}. ${app.submittedResumeVersionId ? "Submitted" : "Linked"} résumé version: ${resume ? `${resume.name} [${resume.id}]` : (app.submittedResumeVersionId || app.resumeVersionId) ? "Missing record" : "None"}.`);
  }
  return { content: lines.join("\n\n"), citations: [...new Map(citations.map(c => [c.id, c])).values()] };
}

export async function prepareApplicationNextAction(repo: AppRepository, thread: CareerCopilotThread, applicationId: string, instruction: string, candidate?: unknown, now = new Date(), linkedContext?: { jobId: string; applicationId: string }) {
  await activeThread(repo, thread.id, applicationId);
  const refs = linkedContext ? { focusedId: linkedContext.applicationId } : await references(repo, thread);
  if (refs.focusedId !== applicationId) throw new Error("Choose one exact application before preparing its next action.");
  const app = await repo.getApplication(ApplicationActionId.parse(applicationId));
  if (!app) throw new Error("The target application is missing. Refresh the application list.");
  if (linkedContext) {
    const storedThread = await repo.getCareerCopilotThread(thread.id);
    if (!storedThread || storedThread.activeContextType !== "job" || storedThread.activeContextId !== linkedContext.jobId || app.jobId !== linkedContext.jobId || app.id !== linkedContext.applicationId) throw new Error("The application does not belong to this exact saved-job conversation.");
  }
  const messages = await repo.listCareerCopilotMessages(thread.id);
  if (messages.at(-1)?.role !== "user" || messages.at(-1)?.content !== instruction) throw new Error("A stored explicit user instruction is required.");
  const parsed = parseNextActionInstruction(instruction, app.followUpDate, now);
  const suggestion = NextActionSuggestion.parse(candidate ?? parsed.suggestion);
  if (!same(suggestion, parsed.suggestion)) throw new Error("The suggestion differs from the user's exact tracker instruction.");
  const values = { nextAction: suggestion.nextAction, followUpDate: suggestion.followUpDate };
  if (same(values, tracking(app))) return { action: null, content: "This next action and follow-up date are already recorded. No change was proposed." };
  if (messages.flatMap(m => m.pendingActionsJson).some(a => a.type === APPLICATION_NEXT_ACTION && a.status === "pending" && a.afterJson.applicationId === app.id)) throw new Error("Review or reject the pending next-action proposal for this application first.");
  const action: CareerCopilotPendingAction = {
    id: createId("pending-action"), threadId: thread.id, messageId: "", type: APPLICATION_NEXT_ACTION, label: `Set next action · ${app.company} · ${app.role}`,
    recordsAffected: [{ entityType: "application", entityId: app.id, label: `${app.company} · ${app.role} [${app.id}]` }],
    beforeJson: { revision: await canonicalDigest(app), values: tracking(app) },
    afterJson: { operation: APPLICATION_NEXT_ACTION, applicationId: app.id, values, reason: "User requested this local tracker update.", instruction, time: parsed.time },
    status: "pending", createdAt: nowIso(), resolvedAt: "",
  };
  return { action, content: "Prepared a local tracker update. Review the exact values and date below. Nothing has been sent, scheduled or changed." };
}

export async function validateApplicationNextAction(repo: AppRepository, action: CareerCopilotPendingAction, checkCurrent = true) {
  const before = NextActionBefore.parse(action.beforeJson); const after = NextActionAfter.parse(action.afterJson);
  if (action.type !== APPLICATION_NEXT_ACTION || action.recordsAffected.length !== 1 || action.recordsAffected[0].entityType !== "application" || action.recordsAffected[0].entityId !== after.applicationId) throw new Error("Invalid next-action target or operation.");
  if (!checkCurrent) return { before, after };
  await activeThread(repo, action.threadId, after.applicationId);
  const app = await repo.getApplication(after.applicationId);
  if (!app) throw new Error("The target application no longer exists.");
  if (await canonicalDigest(app) !== before.revision || !same(tracking(app), before.values)) throw new Error("The application changed after review. Request a fresh proposal.");
  const audits = await repo.listSafetyRecords(APPLICATION_NEXT_ACTION_AUDIT);
  if (audits.some(a => a.id === action.id)) throw new Error("This exact operation was already accepted.");
  const messages = await repo.listCareerCopilotMessages(action.threadId);
  if (after.undoOf) {
    const original = messages.flatMap(m => m.pendingActionsJson).find(a => a.id === after.undoOf && a.status === "confirmed" && a.type === APPLICATION_NEXT_ACTION && !a.afterJson.undoOf);
    const audit = audits.find(a => a.id === after.undoOf);
    if (!original || !audit || audit.value.direction !== "set" || !same(audit.value.after, original.afterJson) || audits.some(a => a.value.undoOf === after.undoOf)) throw new Error("The original tracker operation cannot be safely reversed.");
    const originalAfter = NextActionAfter.parse(original.afterJson); const originalBefore = NextActionBefore.parse(original.beforeJson);
    if (!same({ ...after, undoOf: undefined, values: originalAfter.values }, originalAfter) || !same(before.values, originalAfter.values) || !same(after.values, originalBefore.values)) throw new Error("Undo differs from the exact accepted tracker change.");
  } else {
    NextActionSuggestion.parse({ operation: after.operation, ...after.values });
    const messageIndex = messages.findIndex(m => m.id === action.messageId);
    if (messageIndex < 1 || messages[messageIndex - 1].role !== "user" || messages[messageIndex - 1].content !== after.instruction) throw new Error("The explicit user instruction no longer matches this proposal.");
    // The resolved date is frozen at proposal time; acceptance never moves Friday to another week.
    if (after.time.resolvedDate !== after.values.followUpDate || (!after.time.expression && after.values.followUpDate !== before.values.followUpDate)) throw new Error("Invalid date provenance.");
  }
  return { before, after };
}

export async function applyApplicationNextAction(repo: AppRepository, action: CareerCopilotPendingAction) {
  const { after } = await validateApplicationNextAction(repo, action);
  const current = (await repo.getApplication(after.applicationId))!;
  const saved = await repo.saveApplication({ ...current, ...after.values });
  const protectedFields = ({ nextAction: _next, followUpDate: _date, updatedAt: _updated, ...rest }: ApplicationRecord) => rest;
  if (!same(tracking(saved), after.values) || !same(protectedFields(saved), protectedFields(current))) throw new Error("The tracker save would change unrelated application data. No change was committed.");
  await repo.saveSafetyRecord({ id: action.id, kind: APPLICATION_NEXT_ACTION_AUDIT, createdAt: action.resolvedAt, value: { direction: after.undoOf ? "undo" : "set", undoOf: after.undoOf ?? null, applicationId: after.applicationId, threadId: action.threadId, messageId: action.messageId, before: action.beforeJson, after: action.afterJson, acceptedBy: "explicit_proposal_review" } });
}

export async function buildApplicationNextActionUndo(repo: AppRepository, stored: CareerCopilotPendingAction, messageId: string) {
  const after = NextActionAfter.parse(stored.afterJson); const before = NextActionBefore.parse(stored.beforeJson);
  if (stored.type !== APPLICATION_NEXT_ACTION || stored.status !== "confirmed" || after.undoOf) throw new Error("Only an accepted original next-action update can be undone.");
  const messages = await repo.listCareerCopilotMessages(stored.threadId);
  if (messages.flatMap(m => m.pendingActionsJson).some(a => a.afterJson.undoOf === stored.id && a.status !== "cancelled")) throw new Error("An undo proposal already exists for this change.");
  const app = await repo.getApplication(after.applicationId);
  if (!app || !same(tracking(app), after.values)) throw new Error("The next action or date changed since acceptance. Undo would conflict with a later edit.");
  const undo: CareerCopilotPendingAction = { ...stored, id: createId("pending-action"), messageId, label: `Undo: ${stored.label}`, status: "pending", createdAt: nowIso(), resolvedAt: "", beforeJson: { revision: await canonicalDigest(app), values: tracking(app) }, afterJson: { ...after, values: before.values, undoOf: stored.id } };
  await validateApplicationNextAction(repo, undo); return undo;
}

export async function answerApplicationNextAction(repo: AppRepository, thread: CareerCopilotThread, query: string) {
  const q = query.trim(); const update = /^set (?:my |the )?next action\b/i.test(q);
  const attention = /^(?:what applications need my attention|what (?:do i need to follow up on|needs attention)|what should i follow up on)[?.!]?$/i.test(q);
  const ordinal = q.match(/^open the (first|second|third|fourth|fifth|\d+) application[.!]?$/i);
  const undoRequested = /^undo (?:that|the next action)[.!]?$/i.test(q);
  if (!update && !attention && !ordinal && !undoRequested) return null;
  const reply = (content: string, citations: InternalCitation[] = [], action: CareerCopilotPendingAction | null = null, refs?: References) => ({ content, citations, pendingActions: action ? [action] : [], toolCalls: [], contextPreview: [], ...(refs ? { applicationActionContext: refs } : {}) });
  try {
    if (undoRequested) {
      const latest = (await repo.listCareerCopilotMessages(thread.id)).flatMap(m => m.pendingActionsJson).filter(a => a.status === "confirmed").at(-1);
      if (!latest || latest.type !== APPLICATION_NEXT_ACTION) return null;
      return reply("Review this exact tracker reversal before accepting. No external action will be undone or performed.", [], await buildApplicationNextActionUndo(repo, latest, ""));
    }
    if (attention) {
      const all = thread.activeContextType === "application" ? [(await repo.getApplication(thread.activeContextId))!].filter(Boolean) : await repo.listApplications();
      const eligible = thread.activeContextType === "application" ? all : all.filter(a => !["rejected", "withdrawn"].includes(a.status) && (a.nextAction || a.followUpDate || ["preparing", "ready"].includes(a.status)));
      const priority = (a: ApplicationRecord) => isFollowUpDue(a) ? 0 : a.followUpDate ? 1 : 2;
      const selected = eligible.sort((a,b) => priority(a)-priority(b) || a.followUpDate.localeCompare(b.followUpDate) || a.id.localeCompare(b.id)).slice(0,10);
      const result = await inspect(repo, selected);
      return reply(`Local recorded snapshot (${localDay()}); ${selected.length} of ${eligible.length} matching applications. Dates are recorded follow-ups, not inferred deadlines.\n\n${result.content || "No recorded next actions, follow-up dates or open drafts in this scope."}`, result.citations, null, { orderedIds: selected.map(a => a.id), ...(selected.length === 1 ? { focusedId: selected[0].id } : {}) });
    }
    const refs = await references(repo, thread);
    if (ordinal) {
      const index = ["first", "second", "third", "fourth", "fifth"].indexOf(ordinal[1].toLowerCase()); const selectedIndex = index < 0 ? Number(ordinal[1])-1 : index;
      const id = refs.orderedIds[selectedIndex]; const app = id ? await repo.getApplication(id) : null;
      if (!app) return reply("That application reference is missing or ambiguous. Ask what needs attention again, or open a specific application.");
      const result = await inspect(repo, [app]);
      return reply(`Conversation focus: ${app.company} · ${app.role}. Use its application link below to open the tracker.\n\n${result.content}`, result.citations, null, { ...refs, focusedId: app.id });
    }
    if (!refs.focusedId) return reply("Select one application or say ‘Open the second application’ after a numbered attention list. I will not choose an arbitrary target.");
    const prepared = await prepareApplicationNextAction(repo, thread, refs.focusedId, q);
    const app = (await repo.getApplication(refs.focusedId))!; const result = await inspect(repo, [app]);
    return reply(prepared.content, result.citations, prepared.action, refs);
  } catch (error) { return reply(error instanceof Error ? error.message : "The tracker request could not be validated. No application was changed."); }
}
