import { canonicalDigest } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
import type { AppRepository } from "../database/repository";
import type { CareerCopilotMessage, CareerCopilotPendingAction, CareerCopilotThread, InternalCitation } from "../../types/domain";
import { containsTerm } from "../resume/coverage";
import { containsPromptInjectionText } from "../import/evidenceImport";
import { containsProbableSecret, normalizeImportKey } from "../import/careerIntake";
import { comparePermittedResumes, loadIntelligenceInputs, rankPermittedJobs, type Selection } from "./workspaceIntelligence";
import { prepareProfileSkillAction, profileSkillBinding } from "./profileSkillActions";
import { PROFILE_SKILL_ACTION } from "./profileSkillContract";
import { editableResumeBullets, prepareResumeBulletAction, resumeBulletBinding } from "./resumeBulletActions";
import { RESUME_BULLET_ACTION } from "./resumeBulletContract";
import { prepareApplicationNextAction } from "./applicationNextAction";
import { APPLICATION_NEXT_ACTION } from "./applicationActionContract";
import { PreparationPlan, PreparationReview, PreparationSkip, PreparationStep } from "./preparationContract";
import { createId } from "../utils";
// Local comparison options only: these never grant outbound provider permission.
const localComparisonOptions = { jobFit: true, resumeEvidence: true, careerContext: true, resumeResponsibilities: true };
const keys = PreparationStep.options;
const operations = { profile: PROFILE_SKILL_ACTION, resume: RESUME_BULLET_ACTION, application: APPLICATION_NEXT_ACTION };
const term = (text: string, value: string) => containsTerm(text.replace(/[.,;:!?](?=\s|$)/g, " "), value);
const explanation = (e: unknown) => e instanceof Error ? e.message.slice(0, 1200) : "Insufficient verified evidence; use the individual review workflow.";
export function preparationActions(messages: CareerCopilotMessage[], planId: string, step: PreparationStep) {
    return messages.filter(m => { const r = PreparationReview.safeParse(m.structuredContentJson.preparationReview); return r.success && r.data.planId === planId && r.data.step === step; }).flatMap(m => m.pendingActionsJson).filter(a => a.type === operations[step] && !a.afterJson.undoOf);
}
function skipped(messages: CareerCopilotMessage[], planId: string, step: PreparationStep) {
    return messages.some(m => { const s = PreparationSkip.safeParse(m.structuredContentJson.preparationSkip); return s.success && s.data.planId === planId && s.data.steps.includes(step); });
}
export function findPreparationPlan(messages: CareerCopilotMessage[], id?: string) {
    for (const m of [...messages].reverse()) {
        const parsed = PreparationPlan.safeParse(m.structuredContentJson.preparationPlan);
        if (parsed.success && (!id || parsed.data.id === id))
            return parsed.data;
    }
    return null;
}
function boundedPlan(plan: PreparationPlan) {
    if (JSON.stringify(plan).length > 24000) throw new Error("Preparation context exceeds its 24,000-character limit. Use smaller individual record reviews.");
    return PreparationPlan.parse(plan);
}
async function reports(repo: AppRepository, selection: Selection, jobId: string) {
    const input = await loadIntelligenceInputs(repo, selection, localComparisonOptions);
    const fit = rankPermittedJobs(input, [jobId]), comparison = comparePermittedResumes(input, jobId);
    return { input, fit, comparison, assessmentRevision: await canonicalDigest({ fit, comparison }), evidenceRevision: await canonicalDigest({ facts: input.candidate.facts, items: input.candidate.items }) };
}
export async function composePreparationPlan(repo: AppRepository, thread: CareerCopilotThread): Promise<PreparationPlan> {
    if (thread.activeContextType !== "job")
        throw new Error("Open one saved job before preparing a plan.");
    const job = await repo.getJob(thread.activeContextId);
    if (!job)
        throw new Error("The selected saved job is missing.");
    const [facts, items, versions, archives, apps, skills] = await Promise.all([repo.listCareerFacts(), repo.listCareerItems(), repo.listResumeVersions(), repo.listResumeArchives(), repo.listApplications(), repo.listSkills()]);
    // A deterministic local shortlist, never a provider payload or a claim to search every record.
    const selectedVersions = versions.filter(v => !archives.some(a => a.resumeVersionId === v.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)).slice(0, 3);
    const score = (f: typeof facts[number]) => f.skillTags.filter(t => term(job.rawDescription, t)).length * 2 + (selectedVersions.some(v => editableResumeBullets(v).some(b => b.bullet.sourceFactIds.includes(f.id))) ? 1 : 0);
    const selectedFacts = facts.filter(f => f.enabled && f.evidenceStatus === "verified" && items.some(i => i.id === f.careerItemId && i.enabled) && !containsPromptInjectionText(f.statement) && !containsProbableSecret(f.statement)).sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id)).slice(0, 5);
    const linked = apps.filter(a => a.jobId === job.id);
    const app = linked.length === 1 ? linked[0] : null;
    const selection: Selection = [{ tool: "get_job", id: job.id }, ...selectedFacts.map(f => ({ tool: "get_career_fact" as const, id: f.id })), ...selectedVersions.map(v => ({ tool: "get_resume" as const, id: v.id })), ...(app ? [{ tool: "get_application" as const, id: app.id }] : [])];
    const current = await reports(repo, selection, job.id);
    const plan: PreparationPlan = { version: 1, id: createId("preparation"), jobId: job.id, jobLabel: `${job.roleTitle} · ${job.company}`.slice(0, 400), jobRevision: await canonicalDigest(job), selection, evidenceRevision: current.evidenceRevision, assessmentRevision: current.assessmentRevision, fit: current.fit, comparison: current.comparison, profile: null, resume: null, application: app ? { id: app.id, label: `${app.company} · ${app.role}`.slice(0, 400), revision: await canonicalDigest(app), instruction: !app.nextAction && !app.submittedAt && !app.submittedResumeVersionId && !app.statusHistoryJson.some(h => h.status === "applied") && ["preparing", "ready"].includes(app.status) ? "Set my next action to prepare application." : null } : null, notes: { profile: "No supported missing skill found in the selected verified evidence.", resume: "Insufficient validated evidence to recommend a source version.", application: linked.length > 1 ? "Several applications link to this job. Open the exact application and use its individual review; this plan will not guess." : !app ? "No application links by exact saved-job ID. No application will be created or inferred." : app.nextAction || app.submittedAt || app.submittedResumeVersionId || app.statusHistoryJson.some(h => h.status === "applied") || !["preparing", "ready"].includes(app.status) ? "A next action or later application state is already recorded. Supply an explicit next-action instruction to propose a change." : "The linked tracker is preparing/ready with no recorded next action. Review ‘prepare application’; no new date is inferred." } };
    if (current.fit.kind === "jobs" && current.fit.jobs[0]?.eligibility === "DISQUALIFIED") {
        for (const key of keys)
            plan.notes[key] = "Confirmed eligibility or requirement conflict: resolve the evidence before preparing changes for this job.";
        if (plan.application)
            plan.application.instruction = null;
        return boundedPlan(plan);
    }
    let profileAttempts = 0;
    for (const fact of selectedFacts) {
        for (const skillName of [...fact.skillTags].sort().slice(0, 10)) {
            if (profileAttempts >= 5)
                break;
            if (!term(job.rawDescription, skillName) || skills.some(s => normalizeImportKey(s.name) === normalizeImportKey(skillName)))
                continue;
            try {
                profileAttempts += 1;
                const binding = await profileSkillBinding(repo), suggestion = { operation: PROFILE_SKILL_ACTION, skillName, evidenceIds: [fact.id] };
                const prepared = await prepareProfileSkillAction(repo, thread.id, suggestion, binding, [fact.id]);
                if (prepared.action) {
                    plan.profile = { suggestion, binding };
                    plan.notes.profile = `Verified ${items.find(i => i.id === fact.careerItemId)?.title ?? "project"} evidence names ${skillName}; it is not currently listed in this profile.`;
                    break;
                }
            }
            catch (e) {
                plan.notes.profile = explanation(e);
            }
        }
        if (plan.profile)
            break;
    }
    if (current.comparison.kind === "resumes" && current.comparison.recommendedId) {
        const recommendedId = current.comparison.recommendedId;
        const source = selectedVersions.find(v => v.id === recommendedId)!;
        plan.notes.resume = "No unique, unlocked evidence-backed bullet improvement is justified. Choose a specific bullet in the individual résumé workflow.";
        const bullets = editableResumeBullets(source);
        if (bullets.length > 100)
            plan.notes.resume = "The recommended version exceeds the 100-bullet preparation limit. Use an individual bullet review.";
        const candidates = (bullets.length <= 100 ? bullets : []).filter(b => b.bullet.included && !b.bullet.locked && !b.section.locked && !b.bullet.rejected).flatMap(b => selectedFacts.filter(f => f.careerItemId === b.section.careerItemId && f.statement.trim() !== b.bullet.text && f.skillTags.some(t => term(job.rawDescription, t) && term(f.statement, t))).map(f => ({ b, f })));
        // Never choose a loose text match when multiple bullets or wordings are plausible.
        if (candidates.length === 1) {
            const { b, f } = candidates[0];
            const target = { sourceId: source.id, bulletId: b.bullet.id };
            try {
                const binding = await resumeBulletBinding(repo, job.id, target), suggestion = { operation: RESUME_BULLET_ACTION, evidenceId: f.id, replacementText: f.statement.trim() };
                const prepared = await prepareResumeBulletAction(repo, thread.id, binding, suggestion, [f.id]);
                plan.resume = { target, sourceRevision: binding.sourceRevision, suggestion, label: source.name.slice(0, 400), section: b.section.title.slice(0, 400) };
                plan.notes.resume = `${prepared.action.afterJson.reason} Review replacement trade-offs: this does not guarantee improved coverage or preserve every term from the old bullet.`;
            }
            catch (e) {
                plan.notes.resume = explanation(e);
            }
        }
    }
    return boundedPlan(plan);
}
export async function validatePreparationStep(repo: AppRepository, threadId: string, plan: PreparationPlan, step: PreparationStep) {
    const thread = await repo.getCareerCopilotThread(threadId), job = await repo.getJob(plan.jobId);
    if (!thread || thread.archivedAt || thread.activeContextType !== "job" || thread.activeContextId !== plan.jobId || !job || await canonicalDigest(job) !== plan.jobRevision)
        throw new Error("The preparation job or conversation changed. Request a fresh plan.");
    if (await canonicalDigest({ fit: plan.fit, comparison: plan.comparison }) !== plan.assessmentRevision || plan.jobLabel !== `${job.roleTitle} · ${job.company}`.slice(0, 400))
        throw new Error("The saved plan snapshot is inconsistent. Request a fresh plan.");
    const current = await reports(repo, plan.selection, plan.jobId);
    if (current.evidenceRevision !== plan.evidenceRevision || current.assessmentRevision !== plan.assessmentRevision)
        throw new Error("Preparation evidence or dependent recommendations changed. Request a fresh plan and review again.");
    if (step === "resume" && (!plan.resume || await canonicalDigest(await repo.getResumeVersion(plan.resume.target.sourceId)) !== plan.resume.sourceRevision))
        throw new Error("The source résumé changed or no unique bullet was selected. Request a fresh plan.");
    if (step === "application" && (!plan.application || await canonicalDigest(await repo.getApplication(plan.application.id)) !== plan.application.revision))
        throw new Error("The exact linked application changed or is ambiguous. Request a fresh plan.");
    if (step === "profile" && (!plan.profile || await canonicalDigest(await profileSkillBinding(repo)) !== await canonicalDigest(plan.profile.binding)))
        throw new Error("The profile or skill list changed. Request a fresh plan.");
}
// Called from the existing stored-action validator, in the same transaction as acceptance.
export async function validatePreparationDependency(repo: AppRepository, action: CareerCopilotPendingAction) {
    if (action.afterJson.undoOf)
        return; // Each reversal retains its original domain-specific checks.
    const messages = await repo.listCareerCopilotMessages(action.threadId), message = messages.find(m => m.id === action.messageId);
    if (!message?.structuredContentJson.preparationReview)
        return;
    const review = PreparationReview.parse(message.structuredContentJson.preparationReview), plan = findPreparationPlan(messages, review.planId);
    if (!plan || action.type !== operations[review.step])
        throw new Error("Invalid preparation association.");
    if (review.step === "profile" && (!plan.profile || action.afterJson.profileId !== plan.profile.binding.profileId || normalizeImportKey(String((action.afterJson.skill as {
        name?: unknown;
    })?.name)) !== normalizeImportKey(plan.profile.suggestion.skillName) || await canonicalDigest(action.afterJson.evidenceIds) !== await canonicalDigest(plan.profile.suggestion.evidenceIds)))
        throw new Error("The profile proposal differs from this plan.");
    if (review.step === "resume" && (!plan.resume || action.afterJson.sourceId !== plan.resume.target.sourceId || action.afterJson.bulletId !== plan.resume.target.bulletId || action.afterJson.replacementText !== plan.resume.suggestion.replacementText || action.afterJson.evidenceId !== plan.resume.suggestion.evidenceId))
        throw new Error("The résumé proposal differs from this plan.");
    if (review.step === "application" && action.afterJson.applicationId !== plan.application?.id)
        throw new Error("The application proposal differs from this plan.");
    await validatePreparationStep(repo, action.threadId, plan, review.step);
}
export async function preparationView(repo: AppRepository, threadId: string, planId: string) {
    const messages = await repo.listCareerCopilotMessages(threadId), plan = findPreparationPlan(messages, planId);
    if (!plan)
        throw new Error("Preparation plan unavailable.");
    const all = messages.flatMap(m => m.pendingActionsJson);
    const rows = await Promise.all(keys.map(async (key) => {
        const action = preparationActions(messages, plan.id, key).at(-1);
        if (action?.status === "confirmed")
            return { key, status: all.some(a => a.status === "confirmed" && a.afterJson.undoOf === action.id) ? key === "resume" ? "Archived" : "Reversed" : "Accepted", actionId: action.id, detail: "Recorded by the existing domain action." };
        if (action?.status === "cancelled")
            return { key, status: "Rejected", actionId: action.id, detail: "No change from this proposal." };
        if (skipped(messages, plan.id, key))
            return { key, status: "Skipped", detail: "No new action prepared." };
        const available = key === "application" ? Boolean(plan.application?.instruction) : Boolean(plan[key]);
        if (!available && !action)
            return { key, status: "Needs information", detail: plan.notes[key] };
        try {
            await validatePreparationStep(repo, threadId, plan, key);
            return { key, status: action ? "Pending approval" : "Suggested", ...(action ? { actionId: action.id } : {}), detail: plan.notes[key] };
        }
        catch (e) {
            return { key, status: "Stale / conflicted", ...(action ? { actionId: action.id } : {}), detail: explanation(e) };
        }
    }));
    return { plan, rows };
}
function citations(plan: PreparationPlan): InternalCitation[] {
    const sources = [...(plan.fit.kind === "jobs" ? plan.fit.jobs.flatMap(j => j.sources) : []), ...(plan.comparison.kind === "resumes" ? plan.comparison.versions.flatMap(v => v.sources) : [])];
    if (plan.profile)
        sources.push({ type: "career_fact", id: plan.profile.suggestion.evidenceIds[0], label: `Verified ${plan.profile.suggestion.skillName} evidence` });
    if (plan.resume)
        sources.push({ type: "career_fact", id: plan.resume.suggestion.evidenceId, label: "Bullet revision evidence" });
    if (plan.application)
        sources.push({ type: "application", id: plan.application.id, label: plan.application.label });
    return [...new Map(sources.map(s => [`${s.type}:${s.id}`, { id: `${s.type}:${s.id}:`, entityType: s.type, entityId: s.id, label: s.label, detail: "Local preparation snapshot; acceptance revalidates current records.", parentEntityType: "" as const, parentEntityId: "" }])).values()];
}
export async function answerPreparationQuery(repo: AppRepository, thread: CareerCopilotThread, query: string) {
    const create = /^(?:help me prepare (?:for )?(?:this|the selected|an? .+?) (?:saved )?.*job|prepare (?:an? |the )?(?:application |career )?plan)[.!]?/i.test(query);
    const profile = /^(?:let['’]s update my profile first|review (?:the )?profile (?:skill|suggestion)|update my profile first)[.!]?$/i.test(query);
    const resume = /^(?:review (?:the )?r[ée]sum[ée] suggestion|(?:now )?improve (?:the |my )?.*bullet)[.!]?$/i.test(query);
    const app = /^set (?:my |the )?next action\b/i.test(query);
    const cancel = /^cancel (?:the |this )?(?:preparation |application )?plan[.!]?$/i.test(query);
    const skip = query.match(/^skip (profile|resume|résumé|application)(?: suggestion)?[.!]?$/i);
    if (!create && !profile && !resume && !app && !cancel && !skip)
        return null;
    const messages = await repo.listCareerCopilotMessages(thread.id);
    let plan = findPreparationPlan(messages);
    if (!create && !plan)
        return null;
    const reply = (content: string, extra: {
        preparationPlan?: PreparationPlan;
        preparationReview?: {
            planId: string;
            step: PreparationStep;
        };
        preparationSkip?: {
            planId: string;
            steps: PreparationStep[];
        };
    } = {}, action?: CareerCopilotPendingAction) => ({ content, citations: plan ? citations(plan) : [], pendingActions: action ? [action] : [], toolCalls: [], contextPreview: [], ...extra, ...(plan?.application ? { applicationActionContext: { orderedIds: [plan.application.id], focusedId: plan.application.id } } : {}) });
    try {
        if (create) {
            if (plan) {
                const current = await preparationView(repo, thread.id, plan.id);
                if (current.rows.some(r => ["Suggested", "Pending approval", "Stale / conflicted"].includes(r.status)))
                    return reply("This conversation already has an unfinished preparation plan. Review, skip or cancel its remaining items before requesting another.");
            }
            plan = await composePreparationPlan(repo, thread);
            return reply("Local preparation plan · no model call. Suggestions are not changes. Review each operation separately; accepting one never approves another. Comparisons cover at most three versions and five verified facts, not the complete library.", { preparationPlan: plan });
        }
        if (!plan)
            return null;
        if (cancel || skip) {
            const steps: PreparationStep[] = cancel ? [...keys] : [skip![1].toLowerCase() === "résumé" ? "resume" : PreparationStep.parse(skip![1].toLowerCase())];
            for (const step of steps)
                for (const action of preparationActions(messages, plan.id, step))
                    if (action.status === "pending")
                        await repo.cancelCareerCopilotAction(action);
            return reply("Remaining selected suggestions skipped and pending proposals cancelled. Previously accepted changes remain intact; each has its own reviewed reversal.", { preparationSkip: { planId: plan.id, steps } });
        }
        const step: PreparationStep = profile ? "profile" : resume ? "resume" : "application";
        if (skipped(messages, plan.id, step))
            return reply("That suggestion was skipped. Request a fresh preparation plan to revisit it.");
        const attempts = preparationActions(messages, plan.id, step), latest = attempts.at(-1);
        if (latest && latest.status !== "cancelled")
            return reply(latest.status === "confirmed" ? "That operation was already accepted. Its saved result and individual reversal remain under Accepted changes." : "The exact proposal is already pending. Use its separate Accept change or Reject proposal control.");
        if (attempts.length >= 2)
            return reply("This plan reached its two-review limit for that operation. Cancel remaining suggestions and request a fresh plan.");
        await validatePreparationStep(repo, thread.id, plan, step);
        let action: CareerCopilotPendingAction | undefined;
        if (step === "profile") {
            const p = plan.profile!;
            action = (await prepareProfileSkillAction(repo, thread.id, p.suggestion, p.binding, p.suggestion.evidenceIds)).action ?? undefined;
        }
        if (step === "resume") {
            const p = plan.resume!;
            const named = query.match(/(?:now )?improve (?:the |my )?(.+?) bullet/i)?.[1];
            if (named && !/^(?:one|r[ée]sum[ée])$/i.test(named) && normalizeImportKey(named) !== normalizeImportKey(p.section))
                throw new Error("That project reference differs from the plan. Select the exact bullet in the individual résumé workflow.");
            action = (await prepareResumeBulletAction(repo, thread.id, await resumeBulletBinding(repo, plan.jobId, p.target), p.suggestion, [p.suggestion.evidenceId])).action;
        }
        if (step === "application")
            action = (await prepareApplicationNextAction(repo, thread, plan.application!.id, query, undefined, new Date(), { jobId: plan.jobId, applicationId: plan.application!.id })).action ?? undefined;
        return reply(action ? "One proposal is ready for separate review. Nothing has changed. Other plan items remain independent." : "No change is needed for this suggestion.", { preparationReview: { planId: plan.id, step } }, action);
    }
    catch (e) {
        return reply(explanation(e));
    }
}
