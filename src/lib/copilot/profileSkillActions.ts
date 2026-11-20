import { z } from "zod";
import type { AppRepository } from "../database/repository";
import type { CareerCopilotPendingAction, CareerCopilotThread, CareerFact, CareerItem, InternalCitation } from "../../types/domain";
import { normalizeImportKey, containsProbableSecret } from "../import/careerIntake";
import { containsPromptInjectionText } from "../import/evidenceImport";
import { canonicalDigest } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
import { createId, nowIso } from "../utils";
import { PROFILE_SKILL_ACTION, ProfileSkillSuggestion, SkillName, SkillEvidenceIds } from "./profileSkillContract";

export const PROFILE_SKILL_AUDIT = "profile_skill_action";
const Id = z.string().min(1).max(160).regex(/^[\w:-]+$/);
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Skill = z.object({ id: Id, name: SkillName, category: z.literal("Evidence-backed"), proficiencyNote: z.literal(""), enabled: z.literal(true) }).strict();
const Before = z.object({ profileRevision: Hash, skillsRevision: Hash, evidenceRevision: Hash, skill: Skill.nullable() }).strict();
export const ProfileSkillAfter = z.object({ operation: z.literal(PROFILE_SKILL_ACTION), profileId: Id, normalizedName: z.string().min(1).max(80), skill: Skill, evidenceIds: SkillEvidenceIds, reason: z.string().min(1).max(800), undoOf: Id.optional() }).strict();
const Context = z.object({ profileId: Id, skillName: SkillName, evidenceIds: SkillEvidenceIds }).strict();
export type ProfileSkillBinding = { profileId: string; profileRevision: string; skillsRevision: string };

export async function profileSkillBinding(repo: AppRepository): Promise<ProfileSkillBinding> {
  const [profile, skills] = await Promise.all([repo.getProfile(), repo.listSkills()]);
  if (!profile) throw new Error("The target profile is missing. Save a profile before preparing a skill addition.");
  return { profileId: profile.id, profileRevision: await canonicalDigest(profile), skillsRevision: await canonicalDigest([...skills].sort((a,b) => a.id.localeCompare(b.id))) };
}

function mentions(text: string, name: string) {
  const pattern = [...normalizeImportKey(name)].map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s-]*");
  return new RegExp(`(^|[^a-z0-9+#])${pattern}(?=$|[^a-z0-9+#])`, "i").test(text);
}
function supporting(fact: CareerFact, item: CareerItem | undefined, name: string) {
  return Boolean(item?.enabled && fact.enabled && fact.evidenceStatus === "verified" && fact.skillTags.some(t => normalizeImportKey(t) === normalizeImportKey(name)) &&
    mentions(fact.statement, name) && /\b(used|built|implemented|developed|integrated|created|deployed|tested|worked|designed|maintained)\b/i.test(fact.statement) &&
    !/\b(not|never|without|plan|planned|planning|intend|wish)\b/i.test(fact.statement) && !containsPromptInjectionText(fact.statement) && !containsProbableSecret(fact.statement));
}
async function evidenceFor(repo: AppRepository, name: string, ids: string[]) {
  const [facts, items] = await Promise.all([repo.listCareerFacts(), repo.listCareerItems()]);
  const evidence = ids.map(id => {
    const fact = facts.find(f => f.id === id); const item = items.find(i => i.id === fact?.careerItemId);
    if (!fact || !item || !supporting(fact, item, name)) throw new Error("Supporting evidence is missing, unverified or insufficient. Review the exact skill and verified evidence first.");
    return { fact, item };
  });
  return { evidence, revision: await canonicalDigest(evidence) };
}
function sources(evidence: Array<{ fact: CareerFact; item: CareerItem }>): InternalCitation[] {
  return evidence.map(({ fact, item }) => ({ id: `career_fact:${fact.id}:`, entityType: "career_fact", entityId: fact.id, label: `${item.title} · verified evidence`, detail: fact.statement.slice(0,400), parentEntityType: "career_item", parentEntityId: item.id }));
}
async function activeThread(repo: AppRepository, threadId: string) {
  const thread = await repo.getCareerCopilotThread(threadId);
  if (!thread || thread.archivedAt) throw new Error("This conversation is unavailable. Start a new proposal in an active conversation.");
}

// Creates only a draft for the existing message store; never writes a skill.
export async function prepareProfileSkillAction(repo: AppRepository, threadId: string, input: unknown, binding: ProfileSkillBinding, allowedEvidenceIds?: string[]) {
  const suggestion = ProfileSkillSuggestion.parse(input);
  if (allowedEvidenceIds && suggestion.evidenceIds.some(id => !allowedEvidenceIds.includes(id))) throw new Error("The suggested evidence was not retrieved within the approved scope.");
  await activeThread(repo, threadId);
  const current = await profileSkillBinding(repo);
  if (JSON.stringify(current) !== JSON.stringify(binding)) throw new Error("The profile changed after review. Read it again and request a fresh proposal.");
  const { evidence, revision } = await evidenceFor(repo, suggestion.skillName, suggestion.evidenceIds);
  const canonical = evidence[0].fact.skillTags.find(t => normalizeImportKey(t) === normalizeImportKey(suggestion.skillName))!;
  const name = SkillName.parse(canonical.trim()); const key = normalizeImportKey(name);
  const existing = (await repo.listSkills()).find(s => normalizeImportKey(s.name) === key);
  const context = { profileId: binding.profileId, skillName: name, evidenceIds: suggestion.evidenceIds };
  if (existing) return { content: `${existing.name} is already listed in this profile${existing.enabled ? "" : " (disabled)"}. No duplicate or activation has been proposed.`, citations: sources(evidence), context, action: null };
  const pending = (await repo.listCareerCopilotMessages(threadId)).flatMap(m => m.pendingActionsJson).some(a => a.type === PROFILE_SKILL_ACTION && a.status === "pending" && a.afterJson.normalizedName === key);
  if (pending) return { content: "Review or cancel the existing skill proposal before preparing another.", citations: sources(evidence), context, action: null };
  const id = createId("pending-action");
  const action: CareerCopilotPendingAction = {
    id, threadId, messageId: "", type: PROFILE_SKILL_ACTION, label: `Add ${name} to Career Profile → Skills`,
    recordsAffected: [{ entityType: "profile", entityId: binding.profileId, label: `Career Profile → Skills (${binding.profileId})` }],
    beforeJson: { profileRevision: binding.profileRevision, skillsRevision: binding.skillsRevision, evidenceRevision: revision, skill: null },
    afterJson: { operation: PROFILE_SKILL_ACTION, profileId: binding.profileId, normalizedName: key, skill: { id: createId("skill"), name, category: "Evidence-backed", proficiencyNote: "", enabled: true }, evidenceIds: suggestion.evidenceIds, reason: `Verified ${evidence.map(e => e.item.title).join(", ")} evidence explicitly names ${name} and has a matching reviewed skill tag.` },
    status: "pending", createdAt: nowIso(), resolvedAt: "",
  };
  return { content: `Prepared one addition: ${name}. Review its exact target and evidence below; your profile is unchanged until you accept.`, citations: sources(evidence), context, action };
}

export async function validateProfileSkillAction(repo: AppRepository, action: CareerCopilotPendingAction, checkCurrent = true) {
  const before = Before.parse(action.beforeJson); const after = ProfileSkillAfter.parse(action.afterJson);
  if (action.type !== PROFILE_SKILL_ACTION || action.recordsAffected.length !== 1 || action.recordsAffected[0].entityType !== "profile" || action.recordsAffected[0].entityId !== after.profileId || normalizeImportKey(after.skill.name) !== after.normalizedName) throw new Error("Invalid profile-skill operation or target.");
  if (!checkCurrent) return { before, after };
  await activeThread(repo, action.threadId);
  const current = await profileSkillBinding(repo);
  if (current.profileId !== after.profileId || current.profileRevision !== before.profileRevision) throw new Error("The profile changed after the proposal. Request a fresh proposal.");
  const audits = await repo.listSafetyRecords(PROFILE_SKILL_AUDIT);
  if (audits.some(a => a.id === action.id)) throw new Error("This exact operation was already accepted.");
  const skills = await repo.listSkills();
  if (after.undoOf) {
    const original = (await repo.listCareerCopilotMessages(action.threadId)).flatMap(m => m.pendingActionsJson).find(a => a.id === after.undoOf && a.status === "confirmed" && a.type === PROFILE_SKILL_ACTION && !a.afterJson.undoOf);
    const audit = audits.find(a => a.id === after.undoOf);
    if (!original || !audit || audit.value.direction !== "add" || JSON.stringify(audit.value.after) !== JSON.stringify(original.afterJson) || JSON.stringify(ProfileSkillAfter.parse(original.afterJson)) !== JSON.stringify({ ...after, undoOf: undefined }) || audits.some(a => a.value.undoOf === after.undoOf)) throw new Error("The accepted addition cannot be safely undone or was already reversed.");
    const skill = skills.find(s => s.id === after.skill.id);
    if (!skill || JSON.stringify(skill) !== JSON.stringify(before.skill) || JSON.stringify(skill) !== JSON.stringify(after.skill) || skills.some(s => s.id !== skill.id && normalizeImportKey(s.name) === after.normalizedName)) throw new Error("The added skill changed since acceptance. Undo would conflict with a later edit.");
  } else {
    if (before.skill !== null || current.skillsRevision !== before.skillsRevision || skills.some(s => s.id === after.skill.id || normalizeImportKey(s.name) === after.normalizedName)) throw new Error("The skill list changed after the proposal. Request a fresh proposal; no duplicate will be added.");
    const checked = await evidenceFor(repo, after.skill.name, after.evidenceIds);
    if (checked.revision !== before.evidenceRevision) throw new Error("Supporting evidence changed after the proposal. Request a fresh proposal.");
  }
  return { before, after };
}

// Called only inside the repository's existing confirmed-action transaction.
export async function applyProfileSkillAction(repo: AppRepository, action: CareerCopilotPendingAction) {
  const { after } = await validateProfileSkillAction(repo, action);
  if (after.undoOf) await repo.deleteSkill(after.skill.id); else await repo.saveSkill(after.skill);
  await repo.saveSafetyRecord({ id: action.id, kind: PROFILE_SKILL_AUDIT, createdAt: action.resolvedAt, value: { direction: after.undoOf ? "undo" : "add", undoOf: after.undoOf ?? null, threadId: action.threadId, messageId: action.messageId, profileId: after.profileId, before: action.beforeJson, after: action.afterJson, evidenceIds: after.evidenceIds, acceptedBy: "explicit_proposal_review" } });
}

export async function buildProfileSkillUndo(repo: AppRepository, stored: CareerCopilotPendingAction, messageId: string) {
  const after = ProfileSkillAfter.parse(stored.afterJson);
  if (stored.status !== "confirmed" || after.undoOf) throw new Error("Only an accepted original skill addition can be undone.");
  const messages = await repo.listCareerCopilotMessages(stored.threadId);
  if (messages.flatMap(m => m.pendingActionsJson).some(a => a.afterJson.undoOf === stored.id && a.status !== "cancelled")) throw new Error("An undo proposal already exists for this change.");
  const before = Before.parse(stored.beforeJson);
  const action: CareerCopilotPendingAction = { ...stored, id: createId("pending-action"), messageId, label: `Undo: ${stored.label}`, status: "pending", createdAt: nowIso(), resolvedAt: "", beforeJson: { ...before, skill: after.skill }, afterJson: { ...after, undoOf: stored.id } };
  await validateProfileSkillAction(repo, action);
  return action;
}

// Bounded local intent handling in the existing conversation. No provider call.
export async function answerProfileSkillQuery(repo: AppRepository, thread: CareerCopilotThread, query: string) {
  const reply = (content: string, citations: InternalCitation[] = [], action: CareerCopilotPendingAction | null = null, context?: z.infer<typeof Context>) => ({ content, citations, pendingActions: action ? [action] : [], toolCalls: [], contextPreview: [], ...(context ? { profileSkillContext: context } : {}) });
  const trimmed = query.trim();
  const messages = await repo.listCareerCopilotMessages(thread.id);
  if (/^undo (?:that|the skill addition)[.!]?$/i.test(trimmed)) {
    const latest = messages.flatMap(m => m.pendingActionsJson).filter(a => a.status === "confirmed").at(-1);
    if (!latest || latest.type !== PROFILE_SKILL_ACTION) return null;
    const undo = await buildProfileSkillUndo(repo, latest, "");
    return reply("Review this reversal and accept it explicitly. No skill has been removed yet.", [], undo);
  }
  const followup = /^(?:add it|prepare (?:the |that )?(?:skill )?(?:addition|update))[.!]?$/i.test(trimmed);
  const add = trimmed.match(/^add (.+?) to my profile(?: using (.+?) evidence)?[.!]?$/i);
  const check = trimmed.match(/^does my profile (?:include|have) (.+?)[?.!]?$/i) ?? trimmed.match(/^i used (.+?) in (.+?)\.\s*check whether it'?s already listed in my profile[.!]?$/i);
  if (!followup && !add && !check) return null;
  try {
    const prior = Context.safeParse([...messages].reverse().find(m => m.role === "assistant")?.structuredContentJson.profileSkillContext);
    if (followup && !prior.success) return reply("Name one skill and its evidence first. ‘Add it’ has no unambiguous reviewed profile reference.");
    const name = SkillName.parse(followup && prior.success ? prior.data.skillName : (add ?? check)![1]);
    const binding = await profileSkillBinding(repo);
    if (followup && prior.success && binding.profileId !== prior.data.profileId) return reply("The profile target changed. Check the skill again before preparing an addition.");
    const [skills, facts, items] = await Promise.all([repo.listSkills(), repo.listCareerFacts(), repo.listCareerItems()]);
    const existing = skills.find(s => normalizeImportKey(s.name) === normalizeImportKey(name));
    if (existing) return reply(`${existing.name} is already listed in this profile${existing.enabled ? "" : " (disabled)"}. No duplicate or activation has been proposed.`);
    const project = (add ?? check)?.[2]?.replace(/^the\s+/i, "");
    const ids = followup && prior.success ? prior.data.evidenceIds : facts.filter(f => supporting(f, items.find(i => i.id === f.careerItemId), name) && (!project || items.some(i => i.id === f.careerItemId && normalizeImportKey(i.title) === normalizeImportKey(project)))).slice(0,3).map(f => f.id);
    if (!ids.length) return reply(`I could not establish verified evidence for ${name}. No actionable proposal was prepared. Review a positive statement and matching skill tag in Career evidence first.`);
    const { evidence } = await evidenceFor(repo, name, ids);
    const context = { profileId: binding.profileId, skillName: name, evidenceIds: ids };
    if (!add && !followup) return reply(`${name} is not listed in this profile. Verified ${evidence.map(e => e.item.title).join(", ")} evidence names it. Say “Add it” to prepare a review; nothing has been changed.`, sources(evidence), null, context);
    const result = await prepareProfileSkillAction(repo, thread.id, { operation: PROFILE_SKILL_ACTION, skillName: name, evidenceIds: ids }, binding);
    return reply(result.content, result.citations, result.action, result.context);
  } catch (error) { return reply(error instanceof Error ? error.message : "The skill could not be validated. No profile change was made."); }
}
