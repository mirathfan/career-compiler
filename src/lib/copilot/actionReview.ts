import { validatePreparationDependency } from "./preparationWorkflow";
import { validateResumeBulletAction, buildResumeBulletUndo } from "./resumeBulletActions";
import { RESUME_BULLET_ACTION } from "./resumeBulletContract";
import { buildApplicationNextActionUndo, validateApplicationNextAction } from "./applicationNextAction";
import { APPLICATION_NEXT_ACTION } from "./applicationActionContract";
import { buildProfileSkillUndo, validateProfileSkillAction } from "./profileSkillActions";
import { PROFILE_SKILL_ACTION } from "./profileSkillContract";
import type { AppRepository } from "../database/repository";
import type { CareerCopilotPendingAction } from "../../types/domain";
import { createId, nowIso } from "../utils";

export async function validateCopilotAction(repo: AppRepository, action: CareerCopilotPendingAction, checkCurrent = true) {
  const messages = await repo.listCareerCopilotMessages(action.threadId);
  const stored = messages.find(m => m.id === action.messageId)?.pendingActionsJson.find(a => a.id === action.id);
  if (!stored || stored.status !== "pending" || JSON.stringify(stored) !== JSON.stringify(action)) {
    throw new Error("This proposal is no longer pending or has changed. Review the latest conversation.");
  }
  if (checkCurrent) await validatePreparationDependency(repo, stored);
  if (stored.type === RESUME_BULLET_ACTION) await validateResumeBulletAction(repo, stored, checkCurrent);
  if (stored.type === APPLICATION_NEXT_ACTION) await validateApplicationNextAction(repo, stored, checkCurrent);
  if (stored.type === PROFILE_SKILL_ACTION) await validateProfileSkillAction(repo, stored, checkCurrent);
  if (stored.type === "set_job_note") {
    const thread = await repo.getCareerCopilotThread(stored.threadId);
    if (!thread || thread.activeContextType !== "job" || thread.activeContextId !== stored.afterJson.jobId || stored.recordsAffected.length !== 1 || stored.recordsAffected[0].entityType !== "job" || stored.recordsAffected[0].entityId !== thread.activeContextId) throw new Error("The job-note proposal has a different context or target.");
    if (typeof stored.afterJson.notes !== "string" || stored.afterJson.notes.length > 4000 || (!stored.afterJson.undoOf && !stored.afterJson.notes.trim())) throw new Error("Invalid job note.");
    if (checkCurrent) {
      const job = await repo.getJob(thread.activeContextId);
      if (!job || JSON.stringify(job) !== JSON.stringify(stored.beforeJson.job)) throw new Error("This job changed after the proposal. Ask for a fresh proposal before accepting.");
    }
  }
  if (checkCurrent && stored.type === "update_application_status") {
    const current = await repo.getApplication(String(stored.afterJson.applicationId));
    if (!current || Object.entries(stored.beforeJson).some(([key, value]) => current[key as keyof typeof current] !== value)) {
      throw new Error("This application changed after the proposal. Ask for a fresh proposal before accepting.");
    }
    if (!["preparing", "ready", "applied", "interview", "rejected", "offer", "withdrawn"].includes(String(stored.afterJson.status))) {
      throw new Error("Unsupported application status.");
    }
  }
  return stored;
}

// Undo is another explicit proposal, never an immediate write or deletion of history.
export async function proposeCopilotUndo(repo: AppRepository, action: CareerCopilotPendingAction) {
  return repo.transaction(async tx => {
    const messages = await tx.listCareerCopilotMessages(action.threadId);
    const message = messages.find(m => m.id === action.messageId);
    const stored = message?.pendingActionsJson.find(a => a.id === action.id);
    if (!message || !stored || stored.status !== "confirmed" || !["update_application_status", "set_job_note", PROFILE_SKILL_ACTION, APPLICATION_NEXT_ACTION, RESUME_BULLET_ACTION].includes(stored.type) || stored.afterJson.undoOf) throw new Error("Only accepted original changes can be undone here.");
    const duplicate = messages.flatMap(m => m.pendingActionsJson).find(a => a.afterJson.undoOf === stored.id && a.status !== "cancelled");
    if (duplicate) throw new Error("An undo proposal already exists for this change.");
    if (stored.type === RESUME_BULLET_ACTION) {
      const id = createId("copilot-message");
      const undo = await buildResumeBulletUndo(tx, stored, id);
      return tx.saveCareerCopilotMessage({ ...message, id, content: "Review archiving this unchanged, unused child. The version, files and provenance remain preserved; nothing is deleted.", createdAt: nowIso(), pendingActionsJson: [undo], toolCallsJson: [], structuredContentJson: {} });
    }
    if (stored.type === APPLICATION_NEXT_ACTION) {
      const id = createId("copilot-message");
      const undo = await buildApplicationNextActionUndo(tx, stored, id);
      return tx.saveCareerCopilotMessage({ ...message, id, content: "Review this exact local tracker reversal. Application history and résumé associations are preserved.", createdAt: nowIso(), pendingActionsJson: [undo], toolCallsJson: [], structuredContentJson: {} });
    }
    if (stored.type === PROFILE_SKILL_ACTION) {
      const id = createId("copilot-message");
      const undo = await buildProfileSkillUndo(tx, stored, id);
      return tx.saveCareerCopilotMessage({ ...message, id, content: "Review this exact skill reversal before accepting. Evidence and the original accepted operation are retained.", createdAt: nowIso(), pendingActionsJson: [undo], toolCallsJson: [], structuredContentJson: {} });
    }
    if (stored.type === "set_job_note") {
      const job = await tx.getJob(String(stored.afterJson.jobId));
      const thread = await tx.getCareerCopilotThread(stored.threadId);
      if (!thread || thread.activeContextType !== "job" || thread.activeContextId !== job?.id || !job || JSON.stringify(job) !== JSON.stringify(stored.afterJson.acceptedJob)) throw new Error("The job has changed since acceptance. Review it before proposing another change.");
      const id = createId("copilot-message");
      const undo: CareerCopilotPendingAction = {
        ...stored, id: createId("pending-action"), messageId: id, label: `Undo: ${stored.label}`,
        status: "pending", createdAt: nowIso(), resolvedAt: "",
        beforeJson: { notes: job.notes ?? "", job },
        afterJson: { jobId: job.id, notes: stored.beforeJson.notes, undoOf: stored.id },
      };
      return tx.saveCareerCopilotMessage({ ...message, id, content: "Review this undo before accepting. The original note proposal and conversation are retained.", createdAt: nowIso(), pendingActionsJson: [undo], toolCallsJson: [], structuredContentJson: {} });
    }
    const current = await tx.getApplication(String(stored.afterJson.applicationId));
    if (!current || !stored.afterJson.acceptedUpdatedAt || current.updatedAt !== stored.afterJson.acceptedUpdatedAt || current.nextAction !== (stored.afterJson.nextAction ?? stored.beforeJson.nextAction) || current.status !== stored.afterJson.status || current.appliedDate !== stored.afterJson.appliedDate) throw new Error("The application has changed since acceptance. Review it before proposing another change.");
    const id = createId("copilot-message");
    const undo: CareerCopilotPendingAction = {
      ...stored, id: createId("pending-action"), messageId: id,
      label: `Undo: ${stored.label}`, status: "pending", createdAt: nowIso(), resolvedAt: "",
      beforeJson: { status: current.status, appliedDate: current.appliedDate, nextAction: current.nextAction, updatedAt: current.updatedAt },
      afterJson: { applicationId: current.id, status: stored.beforeJson.status, appliedDate: stored.beforeJson.appliedDate, nextAction: stored.beforeJson.nextAction, undoOf: stored.id },
    };
    return tx.saveCareerCopilotMessage({ ...message, id, content: "Review this undo before accepting. The original conversation and application history are retained.", createdAt: nowIso(), pendingActionsJson: [undo], toolCallsJson: [], structuredContentJson: {} });
  });
}
