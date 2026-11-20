import { containsTerm } from "../resume/coverage";
import type { AppRepository } from "../database/repository";
import type { CareerCopilotPendingAction, CareerCopilotThread, InternalCitation, ResumeVersion } from "../../types/domain";
import { canonicalDigest, canonicalJson } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
import { containsProbableSecret } from "../import/careerIntake";
import { containsPromptInjectionText } from "../import/evidenceImport";
import { validateResumeClaims, hasBlockingValidationErrors } from "../resume/validation";
import { resumeDocumentFromTailoredResume } from "../resume/document";
import { createId, nowIso } from "../utils";
import { RESUME_BULLET_ACTION, RESUME_BULLET_AUDIT, ResumeBulletTarget, ResumeBulletSuggestion, ResumeBulletBefore, ResumeBulletAfter } from "./resumeBulletContract";
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const cite = (entityType: InternalCitation["entityType"], entityId: string, label: string, detail = ""): InternalCitation => ({ id: `${entityType}:${entityId}:`, entityType, entityId, label, detail, parentEntityType: "", parentEntityId: "" });

export function editableResumeBullets(source: ResumeVersion) {
  return (["projects", "experience"] as const).flatMap(kind => source.contentJson[kind].flatMap(section => section.bullets.map(bullet => ({ kind, section, bullet }))));
}
export async function resumeBulletBinding(repo: AppRepository, jobId: string, input: unknown) {
  const target = ResumeBulletTarget.parse(input);
  const [source, job, archives] = await Promise.all([repo.getResumeVersion(target.sourceId), repo.getJob(jobId), repo.listResumeArchives()]);
  if (!source || !job) throw new Error("The exact source résumé or saved job is missing.");
  if (archives.some(a => a.resumeVersionId === source.id)) throw new Error("An archived source cannot be revised here.");
  const allBullets = editableResumeBullets(source);
  if (allBullets.some(b => !b.bullet.id) || new Set(allBullets.map(b => b.bullet.id)).size !== allBullets.length || source.resumeDocumentJson.id !== source.id) throw new Error("The source has missing or ambiguous document identities. Review it in the résumé editor.");
  const matches = allBullets.filter(b => b.bullet.id === target.bulletId);
  if (matches.length !== 1) throw new Error("The bullet is missing or ambiguous. Select one unique stable bullet ID.");
  const selected = matches[0];
  const documentMatches = [...source.resumeDocumentJson.projects, ...source.resumeDocumentJson.experience].flatMap(s => s.bullets.map(b => ({ section: s, bullet: b }))).filter(b => b.bullet.id === target.bulletId);
  if (selected.section.locked || selected.bullet.locked || !selected.bullet.included || selected.bullet.rejected || documentMatches.length !== 1 || documentMatches[0].bullet.locked) throw new Error("The bullet is locked, excluded or not uniquely editable.");
  if (documentMatches[0].section.id !== selected.section.careerItemId || documentMatches[0].bullet.text !== selected.bullet.text || !same(documentMatches[0].bullet.sourceFactIds, selected.bullet.sourceFactIds)) throw new Error("The stored document and editable bullet disagree. Review the source in the résumé editor.");
  return { target, sourceRevision: await canonicalDigest(source), jobRevision: await canonicalDigest(job), jobId };
}
export type ResumeBulletBinding = Awaited<ReturnType<typeof resumeBulletBinding>>;
async function verified(repo: AppRepository, binding: ResumeBulletBinding, candidate: unknown) {
  const suggestion = ResumeBulletSuggestion.parse(candidate);
  const [source, facts, items, skills, profile, job] = await Promise.all([repo.getResumeVersion(binding.target.sourceId), repo.listCareerFacts(), repo.listCareerItems(), repo.listSkills(), repo.getProfile(), repo.getJob(binding.jobId)]);
  if (!source || !job || !profile) throw new Error("Required local records are missing.");
  const selected = editableResumeBullets(source).find(b => b.bullet.id === binding.target.bulletId)!;
  const fact = facts.find(f => f.id === suggestion.evidenceId); const item = items.find(i => i.id === fact?.careerItemId);
  if (!fact || !item?.enabled || !fact.enabled || fact.evidenceStatus !== "verified" || fact.careerItemId !== selected.section.careerItemId || suggestion.replacementText !== fact.statement.trim() || containsProbableSecret(fact.statement) || containsPromptInjectionText(fact.statement)) throw new Error("The replacement must exactly quote one enabled, verified fact for this career item. Unsupported or untrusted wording is not actionable.");
  if (suggestion.replacementText === selected.bullet.text) throw new Error("The verified wording is already present; no revision is needed.");
  // Existing term matching treats dots as technology characters (e.g. Node.js).
  // Strip sentence-ending punctuation without collapsing technology names or matching Java inside JavaScript.
  const sentenceText = (text: string) => text.replace(/[.,;:!?](?=\s|$)/g, " ");
  const terms = fact.skillTags.filter(t => t.length > 1 && containsTerm(sentenceText(fact.statement), t) && containsTerm(sentenceText(job.rawDescription), t));
  if (!terms.length) throw new Error("No saved-job text overlaps this fact's verified technology tags. Review more evidence.");
  const content = structuredClone(source.contentJson);
  const bullet = content[selected.kind].flatMap(s => s.bullets).find(b => b.id === selected.bullet.id)!;
  Object.assign(bullet, { text: suggestion.replacementText, sourceFactIds: [fact.id], approved: false, rejected: false, isUserEdited: true, generationSource: "user", generationReason: "Explicitly reviewed Career AI evidence revision." });
  const validation = validateResumeClaims({ resume: content, facts, items, skills, profile });
  if (hasBlockingValidationErrors(validation)) throw new Error("The proposed child fails existing résumé claim validation. Resolve the document errors before requesting a revision.");
  return { source, selected, content, validation, fact, item, job, evidenceRevision: await canonicalDigest({ fact, item }), reason: `Verified evidence explicitly mentions ${terms.join(", ")}, also present in this saved job. Text overlap supports review, not a guarantee of fit.` };
}
async function threadMatches(repo: AppRepository, threadId: string, jobId: string) {
  const thread = await repo.getCareerCopilotThread(threadId);
  if (!thread || thread.archivedAt || thread.activeContextType !== "job" || thread.activeContextId !== jobId) throw new Error("The saved-job conversation target changed.");
}
export async function prepareResumeBulletAction(repo: AppRepository, threadId: string, binding: ResumeBulletBinding, candidate: unknown, allowedEvidenceIds?: string[]) {
  await threadMatches(repo, threadId, binding.jobId);
  if (!same(binding, await resumeBulletBinding(repo, binding.jobId, binding.target))) throw new Error("The source résumé or job changed after review.");
  const suggestion = ResumeBulletSuggestion.parse(candidate);
  if (allowedEvidenceIds && !allowedEvidenceIds.includes(suggestion.evidenceId)) throw new Error("The evidence was not retrieved in the approved scope.");
  const checked = await verified(repo, binding, suggestion);
  if ((await repo.listCareerCopilotMessages(threadId)).flatMap(m => m.pendingActionsJson).some(a => a.type === RESUME_BULLET_ACTION && a.status === "pending" && a.afterJson.sourceId === binding.target.sourceId)) throw new Error("Review or reject the pending source-résumé proposal first.");
  const { source, selected, job, fact, item } = checked;
  const action: CareerCopilotPendingAction = { id: createId("pending-action"), threadId, messageId: "", type: RESUME_BULLET_ACTION, label: `Revise one bullet · ${source.name}`, recordsAffected: [{ entityType: "resume", entityId: source.id, label: source.name }], beforeJson: { sourceRevision: binding.sourceRevision, jobRevision: binding.jobRevision, evidenceRevision: checked.evidenceRevision, text: selected.bullet.text }, afterJson: { operation: RESUME_BULLET_ACTION, sourceId: source.id, bulletId: selected.bullet.id, jobId: job.id, childId: createId("resume"), sourceName: source.name, jobLabel: `${job.roleTitle} · ${job.company}`, sectionLabel: `${selected.kind === "projects" ? "Projects" : "Experience"} → ${selected.section.title}`, evidenceId: fact.id, replacementText: suggestion.replacementText, reason: checked.reason }, status: "pending", createdAt: nowIso(), resolvedAt: "" };
  return { action, citations: [cite("resume", source.id, source.name), cite("job", job.id, job.roleTitle), { ...cite("career_fact", fact.id, `${item.title} · verified evidence`, fact.statement), parentEntityType: "career_item" as const, parentEntityId: item.id }], content: "Review this single-bullet text proposal. Acceptance creates a new draft child; the source, Master and submitted versions stay intact. PDF rendering has not run." };
}
export async function validateResumeBulletAction(repo: AppRepository, action: CareerCopilotPendingAction, checkCurrent = true) {
  const before = ResumeBulletBefore.parse(action.beforeJson), after = ResumeBulletAfter.parse(action.afterJson);
  if (action.type !== RESUME_BULLET_ACTION || action.recordsAffected.length !== 1 || action.recordsAffected[0].entityType !== "resume" || action.recordsAffected[0].entityId !== after.sourceId) throw new Error("Invalid résumé proposal target.");
  if (!checkCurrent) return { before, after };
  await threadMatches(repo, action.threadId, after.jobId);
  const audits = await repo.listSafetyRecords(RESUME_BULLET_AUDIT);
  if (audits.some(a => a.id === action.id)) throw new Error("This operation was already accepted.");
  if (after.undoOf) {
    const original = (await repo.listCareerCopilotMessages(action.threadId)).flatMap(m => m.pendingActionsJson).find(a => a.id === after.undoOf && a.type === RESUME_BULLET_ACTION && a.status === "confirmed" && !a.afterJson.undoOf);
    const audit = audits.find(a => a.id === after.undoOf);
    if (!original || !audit || !same(original.afterJson, audit.value.after) || !same(ResumeBulletAfter.parse(original.afterJson), { ...after, undoOf: undefined }) || !same(original.beforeJson, { ...before, childRevision: undefined }) || audits.some(a => a.value.undoOf === after.undoOf)) throw new Error("The original revision cannot be safely reversed.");
    const child = await repo.getResumeVersion(after.childId);
    const [apps, packages, versions, favorites, archives] = await Promise.all([repo.listApplications(), repo.listApplicationPackages(), repo.listResumeVersions(), repo.listResumeFavorites(), repo.listResumeArchives()]);
    if (!child || await canonicalDigest(child) !== audit.value.childRevision || before.childRevision !== audit.value.childRevision || apps.some(a => a.resumeVersionId === child.id || a.submittedResumeVersionId === child.id) || packages.some(p => p.resumeVersionId === child.id) || versions.some(v => v.parentResumeVersionId === child.id || v.baseResumeVersionId === child.id) || favorites.some(f => f.resumeVersionId === child.id) || archives.some(a => a.resumeVersionId === child.id)) throw new Error("The child changed, is already archived, or is in use. Archiving would conflict with later work.");
  } else {
    const binding = await resumeBulletBinding(repo, after.jobId, { sourceId: after.sourceId, bulletId: after.bulletId });
    if (binding.sourceRevision !== before.sourceRevision || binding.jobRevision !== before.jobRevision) throw new Error("The source résumé or job changed after review. Request a fresh proposal.");
    const checked = await verified(repo, binding, { operation: after.operation, evidenceId: after.evidenceId, replacementText: after.replacementText });
    if (after.sourceName !== checked.source.name || after.jobLabel !== `${checked.job.roleTitle} · ${checked.job.company}` || after.sectionLabel !== `${checked.selected.kind === "projects" ? "Projects" : "Experience"} → ${checked.selected.section.title}` || after.reason !== checked.reason) throw new Error("The reviewed labels or rationale do not match the exact target and evidence.");
    if (checked.evidenceRevision !== before.evidenceRevision || checked.selected.bullet.text !== before.text) throw new Error("Supporting evidence or source text changed after review.");
    if (await repo.getResumeVersion(after.childId)) throw new Error("The child destination already exists. No version will be overwritten.");
  }
  return { before, after };
}
export async function applyResumeBulletAction(repo: AppRepository, action: CareerCopilotPendingAction) {
  const { after } = await validateResumeBulletAction(repo, action);
  let childRevision: string;
  if (after.undoOf) {
    await repo.setResumeArchived(after.childId, true);
    childRevision = await canonicalDigest(await repo.getResumeVersion(after.childId));
  } else {
    const checked = await verified(repo, await resumeBulletBinding(repo, after.jobId, { sourceId: after.sourceId, bulletId: after.bulletId }), { operation: after.operation, evidenceId: after.evidenceId, replacementText: after.replacementText });
    const { source, content, validation } = checked; content.id = createId("tailored");
    const name = `${source.name} · reviewed bullet`; const now = nowIso();
    const document = structuredClone(source.resumeDocumentJson);
    const bullet = document[checked.selected.kind].flatMap(s => s.bullets).find(b => b.id === after.bulletId)!;
    Object.assign(bullet, { text: after.replacementText, sourceFactIds: [after.evidenceId], approved: false });
    const identity = resumeDocumentFromTailoredResume({ resume: content, id: after.childId, name, kind: "tailored", parentResumeId: source.id, sourceJobId: after.jobId, templateId: source.templateId, createdAt: now, updatedAt: now });
    Object.assign(document, { id: identity.id, name, kind: identity.kind, parentResumeId: identity.parentResumeId, sourceJobId: identity.sourceJobId, createdAt: now, updatedAt: now });
    const child = await repo.saveResumeVersion({ id: after.childId, jobId: after.jobId, name, kind: "tailored", contentJson: content, resumeDocumentJson: document, parentResumeVersionId: source.id, baseResumeVersionId: source.kind === "master" ? source.id : source.baseResumeVersionId || source.id, templateId: source.templateId, templateSettingsJson: source.templateSettingsJson, layoutProfileId: source.layoutProfileId, validationJson: validation, status: "draft", lastExportPath: "", generationProvider: "deterministic", generationModel: "verified-evidence-revision", promptVersion: "resume-bullet-v1", deterministicBaselineJson: source.contentJson });
    if (!same(child.contentJson, content) || !same(child.resumeDocumentJson, document) || !same(await repo.getResumeVersion(source.id), source)) throw new Error("Child persistence changed unexpected document content. No revision was committed.");
    childRevision = await canonicalDigest(child);
  }
  await repo.saveSafetyRecord({ id: action.id, kind: RESUME_BULLET_AUDIT, createdAt: action.resolvedAt, value: { direction: after.undoOf ? "archive" : "create_child", undoOf: after.undoOf ?? null, threadId: action.threadId, messageId: action.messageId, before: action.beforeJson, after: action.afterJson, childRevision, acceptedBy: "explicit_proposal_review", pdfStatus: "not_rendered_by_action" } });
}
export async function buildResumeBulletUndo(repo: AppRepository, stored: CareerCopilotPendingAction, messageId: string) {
  const after = ResumeBulletAfter.parse(stored.afterJson);
  if (stored.status !== "confirmed" || after.undoOf) throw new Error("Only an accepted child creation can be reviewed for archiving.");
  if ((await repo.listCareerCopilotMessages(stored.threadId)).flatMap(m => m.pendingActionsJson).some(a => a.afterJson.undoOf === stored.id && a.status !== "cancelled")) throw new Error("A reversal proposal already exists.");
  const audit = (await repo.listSafetyRecords(RESUME_BULLET_AUDIT)).find(a => a.id === stored.id);
  const undo: CareerCopilotPendingAction = { ...stored, id: createId("pending-action"), messageId, label: `Archive generated child · ${after.sourceName}`, beforeJson: { ...stored.beforeJson, childRevision: audit?.value.childRevision }, afterJson: { ...after, undoOf: stored.id }, status: "pending", createdAt: nowIso(), resolvedAt: "" };
  await validateResumeBulletAction(repo, undo); return undo;
}
export async function answerResumeBulletQuery(repo: AppRepository, thread: CareerCopilotThread, query: string) {
  const messages = await repo.listCareerCopilotMessages(thread.id);
  const latest = messages.flatMap(m => m.pendingActionsJson).filter(a => a.status === "confirmed").at(-1);
  const reply = (content: string, pendingActions: CareerCopilotPendingAction[] = [], citations: InternalCitation[] = []) => ({ content, pendingActions, citations, toolCalls: [], contextPreview: [] });
  if (/^undo that[.!]?$/i.test(query) && latest?.type === RESUME_BULLET_ACTION) {
    try { return reply("Review archiving this unused, unchanged child. It remains in history; no version, file or audit is deleted.", [await buildResumeBulletUndo(repo, latest, "")]); } catch (e) { return reply((e as Error).message); }
  }
  if (/^show me what changed[.!]?$/i.test(query) && latest?.type === RESUME_BULLET_ACTION) {
    const a = ResumeBulletAfter.parse(latest.afterJson), b = ResumeBulletBefore.parse(latest.beforeJson);
    return reply(`Accepted revision snapshot · ${a.sectionLabel}\nBefore: ${b.text}\nAfter: ${a.replacementText}\nOnly this bullet was revised. Open the exact child and source below; later edits are not represented by this snapshot.`, [], [cite("resume", a.sourceId, "Source version"), cite("resume", a.childId, "Generated child version")]);
  }
  if (/\b(improve|revise|rewrite)\b.*\bbullet\b/i.test(query)) return reply("Select the exact source résumé and bullet in ‘Review one résumé bullet’. Choose verified evidence for a local draft, or enable the separately reviewed model suggestion. I will not guess an ambiguous bullet or change your source.");
  return null;
}

// Local preparation uses the same stored messages and pending-action review as model suggestions.
export async function proposeLocalResumeBullet(repo: AppRepository, jobId: string, target: ResumeBulletTarget, evidenceId: string, threadId?: string) {
  return repo.transaction(async tx => {
    const binding = await resumeBulletBinding(tx, jobId, target);
    const fact = (await tx.listCareerFacts()).find(f => f.id === evidenceId);
    if (!fact) throw new Error("Select verified evidence for this bullet.");
    const thread = threadId ? await tx.getCareerCopilotThread(threadId) : await tx.saveCareerCopilotThread({ title: "Review one résumé bullet", activeContextType: "job", activeContextId: jobId });
    if (!thread) throw new Error("The conversation is missing.");
    const prepared = await prepareResumeBulletAction(tx, thread.id, binding, { operation: RESUME_BULLET_ACTION, evidenceId, replacementText: fact.statement.trim() });
    const base = { threadId: thread.id, provider: "deterministic" as const, model: "local", promptVersion: "resume-bullet-v1", tokenUsageJson: { inputTokens: null, outputTokens: null, totalTokens: null }, createdAt: nowIso(), toolCallsJson: [] };
    await tx.saveCareerCopilotMessage({ ...base, id: createId("copilot-message"), role: "user", content: "Prepare a revision to my selected bullet using this verified evidence.", structuredContentJson: {}, internalCitationsJson: [], pendingActionsJson: [] });
    const id = createId("copilot-message");
    await tx.saveCareerCopilotMessage({ ...base, id, role: "assistant", content: `Local evidence draft · no model call.\n${prepared.content}`, structuredContentJson: { resumeBulletContext: target }, internalCitationsJson: prepared.citations, pendingActionsJson: [{ ...prepared.action, messageId: id }] });
    return thread.id;
  });
}
