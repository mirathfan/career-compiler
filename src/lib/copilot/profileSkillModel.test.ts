import { expect, it, vi } from "vitest";
import { profileSkillFixture } from "../../test/profileSkillFixture";
import { MockAIProvider } from "../ai/mockProvider";
import { reviewWorkspaceQuestion, sendWorkspaceReview } from "./workspaceConversation";
import { PROFILE_SKILL_ACTION } from "./profileSkillContract";
import { PROFILE_SKILL_AUDIT } from "./profileSkillActions";

it.each(["evidence", "synthesis"] as const)("turns a reviewed %s model suggestion into a pending addition, never a mutation", async responseStyle => {
  const f = await profileSkillFixture(); const provider = new MockAIProvider(); const call = vi.spyOn(provider, "converseWorkspace");
  try {
    const before = await f.repo.listSkills();
    const review = await reviewWorkspaceQuestion(f.repo, f.job.id, "Add LangGraph to my profile using AURA evidence.", [{ tool: "get_career_fact", id: f.fact.id }], undefined, { responseStyle, allowProfileSkillProposal: true });
    expect(call).not.toHaveBeenCalled(); expect(JSON.stringify(review)).not.toMatch(/PRIVATE_|private@example|profile-fixture|skillsRevision/);
    const selected = await sendWorkspaceReview(f.repo, review, true, undefined, provider); if (!("review" in selected)) throw Error();
    await expect(sendWorkspaceReview(f.repo, selected.review, false, undefined, provider)).rejects.toThrow("Explicit approval");
    const sent = await sendWorkspaceReview(f.repo, selected.review, true, undefined, provider); if (!("threadId" in sent)) throw Error();
    const messages = await f.repo.listCareerCopilotMessages(sent.threadId); const action = messages[1].pendingActionsJson[0];
    expect(action.type).toBe(PROFILE_SKILL_ACTION); expect(action.recordsAffected[0].entityId).toBe("profile-fixture"); expect(action.afterJson.evidenceIds).toEqual([f.fact.id]);
    expect(await f.repo.listSkills()).toEqual(before); expect(await f.repo.listSafetyRecords(PROFILE_SKILL_AUDIT)).toEqual([]); expect(call).toHaveBeenCalledTimes(2);
    for (const [input] of call.mock.calls) expect(JSON.stringify(input)).not.toMatch(/PRIVATE_|private@example|profile-fixture|skillsRevision|sourceNote|proficiencyNote|credential/);
    await f.repo.confirmCareerCopilotAction(action); expect((await f.repo.listSkills()).some(s => s.name === "LangGraph")).toBe(true);
  } finally { f.close(); }
});

it("denies unrequested, wrong-skill, unselected-evidence and arbitrary-field model proposals without partial messages", async () => {
  const f = await profileSkillFixture(); const provider = new MockAIProvider(); const original = provider.converseWorkspace.bind(provider);
  try {
    const selection = [{ tool: "get_career_fact" as const, id: f.fact.id }];
    await expect(reviewWorkspaceQuestion(f.repo, f.job.id, "Compare jobs", selection, undefined, { allowProfileSkillProposal: true })).rejects.toThrow("Name one skill");
    const good = { operation: PROFILE_SKILL_ACTION, skillName: "LangGraph", evidenceIds: [f.fact.id] };
    for (const [enabled, suggestion] of [[false, good], [true, { ...good, skillName: "React" }], [true, { ...good, evidenceIds: ["unselected"] }], [true, { ...good, sql: "UPDATE profile" }]] as const) {
      const first = await reviewWorkspaceQuestion(f.repo, f.job.id, "Add LangGraph to my profile.", selection, undefined, { allowProfileSkillProposal: enabled });
      const plan = await sendWorkspaceReview(f.repo, first, true, undefined, provider); if (!("review" in plan)) throw Error();
      const spy = vi.spyOn(provider, "converseWorkspace").mockImplementation(async input => { const output = await original(input); if (output.data.phase !== "answer") throw Error(); return { ...output, data: { ...output.data, profileSkillProposal: { ...suggestion, evidenceIds: [...suggestion.evidenceIds] } } }; });
      try { await expect(sendWorkspaceReview(f.repo, plan.review, true, undefined, provider)).rejects.toThrow(); } finally { spy.mockRestore(); }
    }
    expect(await f.repo.listCareerCopilotThreads()).toHaveLength(0); expect(await f.repo.listSkills()).toHaveLength(1); expect(await f.repo.listSafetyRecords(PROFILE_SKILL_AUDIT)).toHaveLength(0);
  } finally { f.close(); }
});

it("invalidates outbound approval after a local profile change and permits local editing without remote consent", async () => {
  const f = await profileSkillFixture(); const provider = new MockAIProvider(); const call = vi.spyOn(provider, "converseWorkspace");
  try {
    const review = await reviewWorkspaceQuestion(f.repo, f.job.id, "Add LangGraph to my profile.", [{ tool: "get_career_fact", id: f.fact.id }], undefined, { allowProfileSkillProposal: true });
    await f.repo.saveProfile({ ...(await f.repo.getProfile())!, headline: "Manual profile edit" });
    await expect(sendWorkspaceReview(f.repo, review, true, undefined, provider)).rejects.toThrow("changed after review"); expect(call).not.toHaveBeenCalled();
    const local = await f.propose(); await f.repo.confirmCareerCopilotAction(local); expect(call).not.toHaveBeenCalled();
  } finally { f.close(); }
});
