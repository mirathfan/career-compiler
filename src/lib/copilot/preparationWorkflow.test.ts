import { describe, expect, it, vi } from "vitest";
import { preparationFixture } from "../../test/preparationFixture";
import { preparationView, findPreparationPlan } from "./preparationWorkflow";
import { proposeCopilotUndo } from "./actionReview";
import { MemoryRepository } from "../database/memoryRepository";
import { SqliteRepository } from "../database/sqliteRepository";
import { MockAIProvider } from "../ai/mockProvider";
import { reviewWorkspaceQuestion, sendWorkspaceReview } from "./workspaceConversation";
import { writeFile } from "node:fs/promises";
const commands = { profile: "Let's update my profile first.", resume: "Now improve the AURA bullet.", application: "Set my next action to review this application tomorrow." };
const domain = async (f: Awaited<ReturnType<typeof preparationFixture>>) => ({ profile: await f.repo.getProfile(), skills: await f.repo.listSkills(), facts: await f.repo.listCareerFacts(), items: await f.repo.listCareerItems(), resumes: await f.repo.listResumeVersions(), apps: await f.repo.listApplications(), history: await f.repo.listSafetyRecords("application_history_entry") });
describe.each([false, true])("coordinated preparation (SQLite %s)", sqlite => {
    it("composes three justified suggestions without mutations, rejects independently, accepts separately and retains each reversal", async () => {
        const f = await preparationFixture(sqlite);
        try {
            const before = await domain(f);
            const turn = await f.plan();
            expect(turn.plan, turn.assistantMessage.content).not.toBeNull();
            const p = turn.plan!;
            expect(p.profile?.suggestion.skillName).toBe("LangGraph");
            expect(p.resume?.target, JSON.stringify({ notes: p.notes, comparison: p.comparison, fit: p.fit }, null, 2)).toEqual(f.target);
            expect(p.application?.id).toBe(f.app.id);
            expect(p.application?.instruction).toBe("Set my next action to prepare application.");
            expect(turn.assistantMessage.pendingActionsJson).toEqual([]);
            expect(await domain(f)).toEqual(before);
            expect(p.fit.kind).toBe("jobs");
            if (p.fit.kind === "jobs")
                expect(p.fit.jobs[0].eligibility).toBe("NEEDS_CONFIRMATION");
            expect((await f.send("looks good", turn.thread.id)).assistantMessage.pendingActionsJson).toEqual([]);
            expect(await domain(f)).toEqual(before);
            const rejected = (await f.send(commands.resume, turn.thread.id)).assistantMessage.pendingActionsJson[0];
            expect(rejected).toBeDefined();
            await f.repo.cancelCareerCopilotAction(rejected);
            expect(await domain(f)).toEqual(before);
            const accepted = [];
            for (const key of ["profile", "resume", "application"] as const) {
                const reply = await f.send(commands[key], turn.thread.id), action = reply.assistantMessage.pendingActionsJson[0];
                expect(action, reply.assistantMessage.content).toBeDefined();
                expect((await preparationView(f.repo, turn.thread.id, p.id)).rows.find(r => r.key === key)?.status).toBe("Pending approval");
                await f.repo.confirmCareerCopilotAction(action);
                accepted.push(action);
                await expect(f.repo.confirmCareerCopilotAction(action)).rejects.toThrow("no longer pending");
            }
            expect((await preparationView(f.repo, turn.thread.id, p.id)).rows.map(r => r.status)).toEqual(["Accepted", "Accepted", "Accepted"]);
            const child = (await f.repo.getResumeVersion(String(accepted[1].afterJson.childId)))!;
            expect(child.parentResumeVersionId).toBe(f.source.id);
            expect(child.contentJson.projects[0].bullets[0].text).toBe(f.fact.statement);
            expect(await f.repo.getResumeVersion(f.source.id)).toEqual(before.resumes.find(r => r.id === f.source.id));
            expect((await f.repo.getApplication(f.app.id))!.nextAction).toBe("review this application");
            expect((await f.repo.getApplication(f.app.id))!.followUpDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(await f.repo.getApplication(f.appId)).toEqual(before.apps.find(a => a.id === f.appId));
            for (const action of accepted) {
                const undo = (await proposeCopilotUndo(f.repo, action)).pendingActionsJson[0];
                await f.repo.confirmCareerCopilotAction(undo);
            }
            expect((await preparationView(f.repo, turn.thread.id, p.id)).rows.map(r => r.status)).toEqual(["Reversed", "Archived", "Reversed"]);
            expect(await f.repo.getResumeVersion(child.id)).toEqual(child);
            expect(await f.repo.listSkills()).toEqual(before.skills);
            expect(await f.repo.listSafetyRecords("application_history_entry")).toEqual(before.history);
            expect((await f.repo.getApplication(f.app.id))!.nextAction).toBe("");
            expect((await f.repo.getApplication(f.app.id))!.followUpDate).toBe("");
        }
        finally {
            f.close();
        }
    });
    it("accepts application, résumé and profile in another order without substituting historical attachments", async () => {
        const f = await preparationFixture(sqlite);
        try {
            const before = await domain(f), t = await f.plan();
            expect(t.plan, t.assistantMessage.content).not.toBeNull();
            // Prepare all three before accepting any, then accept in reverse order.
            const actions = [];
            for (const key of ["profile", "resume", "application"] as const) {
                const r = await f.send(commands[key], t.thread.id);
                expect(r.assistantMessage.pendingActionsJson[0], r.assistantMessage.content).toBeDefined();
                actions.push(r.assistantMessage.pendingActionsJson[0]);
            }
            for (const action of [...actions].reverse())
                await f.repo.confirmCareerCopilotAction(action);
            expect((await preparationView(f.repo, t.thread.id, t.plan!.id)).rows.every(r => r.status === "Accepted")).toBe(true);
            expect(await f.repo.getApplication(f.appId)).toEqual(before.apps.find(a => a.id === f.appId));
            for (const v of before.resumes)
                expect(await f.repo.getResumeVersion(v.id)).toEqual(v);
        }
        finally {
            f.close();
        }
    });
    it("cancels a complete plan without domain changes and preserves earlier accepted work on partial cancellation", async () => {
        const f = await preparationFixture(sqlite);
        try {
            const before = await domain(f);
            const t = await f.plan();
            for (const key of ["profile", "resume", "application"] as const)
                await f.send(commands[key], t.thread.id);
            await f.send("Cancel preparation plan.", t.thread.id);
            expect(await domain(f)).toEqual(before);
            expect((await f.repo.listCareerCopilotMessages(t.thread.id)).flatMap(m => m.pendingActionsJson).every(a => a.status === "cancelled")).toBe(true);
            const next = await f.plan();
            const skill = (await f.send(commands.profile, next.thread.id)).assistantMessage.pendingActionsJson[0];
            await f.repo.confirmCareerCopilotAction(skill);
            await f.send("Cancel preparation plan.", next.thread.id);
            expect((await preparationView(f.repo, next.thread.id, next.plan!.id)).rows.map(r => r.status)).toEqual(["Accepted", "Skipped", "Skipped"]);
            expect((await f.repo.listSkills()).some(s => s.name === "LangGraph")).toBe(true);
            expect(await f.repo.listResumeVersions()).toEqual(before.resumes);
        }
        finally {
            f.close();
        }
    });
    it("revalidates evidence, source, application and dependencies rather than silently refreshing proposals", async () => {
        const f = await preparationFixture(sqlite);
        try {
            const t = await f.plan();
            const skill = (await f.send(commands.profile, t.thread.id)).assistantMessage.pendingActionsJson[0];
            await f.repo.saveCareerFact({ ...f.fact, sourceNote: "Changed verified evidence provenance" });
            await expect(f.repo.confirmCareerCopilotAction(skill)).rejects.toThrow("evidence");
            expect((await preparationView(f.repo, t.thread.id, t.plan!.id)).rows[0].status).toBe("Stale / conflicted");
            await f.send("Cancel preparation plan.", t.thread.id);
            const t2 = await f.plan();
            const resume = (await f.send(commands.resume, t2.thread.id)).assistantMessage.pendingActionsJson[0];
            await f.repo.saveResumeVersion({ ...f.source, name: "Renamed after review" });
            await expect(f.repo.confirmCareerCopilotAction(resume)).rejects.toThrow(/recommendations|résumé/);
            const t3 = await f.plan();
            const app = (await f.send(commands.application, t3.thread.id)).assistantMessage.pendingActionsJson[0];
            await f.repo.saveApplication({ ...f.app, notes: "Manual tracker edit" });
            await expect(f.repo.confirmCareerCopilotAction(app)).rejects.toThrow("application changed");
            const t4 = await f.plan();
            const a = (await f.send(commands.profile, t4.thread.id)).assistantMessage.pendingActionsJson[0];
            await f.repo.saveJob({ ...f.job, rawDescription: "Rust required instead of TypeScript." });
            await expect(f.repo.confirmCareerCopilotAction(a)).rejects.toThrow("job or conversation changed");
            expect(await f.repo.listSafetyRecords("profile_skill_action")).toEqual([]);
        }
        finally {
            f.close();
        }
    });
    it("rolls back only the failed operation while preserving an independently accepted profile change", async () => {
        const f = await preparationFixture(sqlite);
        const proto = (sqlite ? SqliteRepository.prototype : MemoryRepository.prototype) as unknown as {
            replacePendingAction: () => Promise<void>;
        };
        try {
            const t = await f.plan();
            const skill = (await f.send(commands.profile, t.thread.id)).assistantMessage.pendingActionsJson[0];
            await f.repo.confirmCareerCopilotAction(skill);
            const before = await domain(f);
            const action = (await f.send(commands.resume, t.thread.id)).assistantMessage.pendingActionsJson[0];
            const fail = vi.spyOn(proto, "replacePendingAction").mockRejectedValueOnce(new Error("Synthetic isolated operation failure"));
            try {
                await expect(f.repo.confirmCareerCopilotAction(action)).rejects.toThrow("Synthetic");
            }
            finally {
                fail.mockRestore();
            }
            expect(await domain(f)).toEqual(before);
            expect(await f.repo.listSafetyRecords("profile_skill_action")).toHaveLength(1);
            expect(await f.repo.listSafetyRecords("resume_bullet_action")).toEqual([]);
            await f.repo.confirmCareerCopilotAction(action);
        }
        finally {
            f.close();
        }
    });
});
it("persists a partially accepted plan and pending proposals through SQLite reopening, with only explicitly reviewed mocked reads", async () => {
    const f = await preparationFixture(true), provider = new MockAIProvider(), calls = vi.spyOn(provider, "converseWorkspace");
    try {
        const before = await domain(f);
        const first = await reviewWorkspaceQuestion(f.repo, f.job.id, "Compare this job and my existing résumé.", [{ tool: "get_job", id: f.job.id }, { tool: "get_career_fact", id: f.fact.id }, { tool: "get_career_fact", id: f.originalFact.id }, { tool: "get_resume", id: f.source.id }], undefined, { consent: { jobFit: true, resumeEvidence: true, careerContext: false }, responseStyle: "synthesis" });
        await expect(sendWorkspaceReview(f.repo, first, false, undefined, provider)).rejects.toThrow("Explicit");
        expect(calls).not.toHaveBeenCalled();
        const second = await sendWorkspaceReview(f.repo, first, true, undefined, provider);
        if (!("review" in second))
            throw Error();
        const ready = await sendWorkspaceReview(f.repo, second.review, true, undefined, provider);
        if (!("threadId" in ready))
            throw Error();
        const t = await f.send("Help me prepare for this job.", ready.threadId), p = findPreparationPlan([t.assistantMessage]);
        expect(p, t.assistantMessage.content).not.toBeNull();
        expect(await domain(f)).toEqual(before);
        const a = (await f.send(commands.profile, t.thread.id)).assistantMessage.pendingActionsJson[0];
        await f.repo.confirmCareerCopilotAction(a);
        const b = (await f.send(commands.resume, t.thread.id)).assistantMessage.pendingActionsJson[0];
        await f.reopen();
        expect((await preparationView(f.repo, t.thread.id, p!.id)).rows.map(r => r.status)).toEqual(["Accepted", "Pending approval", "Suggested"]);
        await f.repo.confirmCareerCopilotAction(b);
        const c = (await f.send(commands.application, t.thread.id)).assistantMessage.pendingActionsJson[0];
        await f.reopen();
        await f.repo.confirmCareerCopilotAction(c);
        await f.reopen();
        expect((await preparationView(f.repo, t.thread.id, p!.id)).rows.every(r => r.status === "Accepted")).toBe(true);
        expect(calls).toHaveBeenCalledTimes(2);
        for (const [input] of calls.mock.calls)
            expect(JSON.stringify(input)).not.toMatch(/PRIVATE_|private@example|resumeDocumentJson|preparationPlan|profileRevision|nextAction/);
        for (const action of [a, b, c])
            await f.repo.confirmCareerCopilotAction((await proposeCopilotUndo(f.repo, action)).pendingActionsJson[0]);
        await f.reopen();
        expect(await f.repo.getApplication(f.appId)).toEqual(before.apps.find(a => a.id === f.appId));
        expect(await f.repo.getResumeVersion(f.source.id)).toEqual(f.source);
        if (process.env.CC_INTELLIGENCE_EVIDENCE)
            await writeFile(`${process.env.CC_INTELLIGENCE_EVIDENCE}/coordinated-acceptance.json`, JSON.stringify({ status: "PASS", harness: "Synthetic SQL.js SQLite export/reopen, not native", plan: p, final: await preparationView(f.repo, t.thread.id, p!.id), providerCalls: calls.mock.calls.length, sourcePreserved: true, submittedIdentityPreserved: true, domainAudit: [...await f.repo.listSafetyRecords("profile_skill_action"), ...await f.repo.listSafetyRecords("resume_bullet_action"), ...await f.repo.listSafetyRecords("application_next_action")], messages: await f.repo.listCareerCopilotMessages(t.thread.id) }, null, 2));
    }
    finally {
        f.close();
    }
});
