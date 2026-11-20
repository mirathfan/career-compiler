import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import { profileSkillFixture } from "../../test/profileSkillFixture";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import type { AppRepository } from "../../lib/database/repository";
import { ProfilePage } from "../profile/ProfilePage";
import { CareerMemoryPage } from "../career-memory/CareerMemoryPage";
import { CareerAIWorkspaceProvider } from "../../components/CareerAIWorkspace";
import { CareerAIPanel } from "../../components/CareerAIPanel";
import { useCareerAI } from "../../components/careerAIContext";
import { MockAIProvider } from "../../lib/ai/mockProvider";
import { CareerCopilotPage } from "./CareerCopilotPage";
import { PROFILE_SKILL_AUDIT } from "../../lib/copilot/profileSkillActions";

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
function OpenAIButton() { const ai = useCareerAI()!; return <button data-career-ai-trigger onClick={() => ai.openPanel()}>Open Career AI</button>; }
function mountProfile(repo: AppRepository) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><RepositoryContext.Provider value={{ repository: repo, ready: true, error: null }}><MemoryRouter initialEntries={["/profile"]}><CareerAIWorkspaceProvider><OpenAIButton/><Link to="/profile">Back to profile</Link><Routes><Route path="/profile" element={<div data-testid="profile-workspace"><ProfilePage/></div>}/><Route path="/career-memory" element={<CareerMemoryPage/>}/></Routes><CareerAIPanel/></CareerAIWorkspaceProvider></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>);
  return { ...view, client };
}
async function say(user: ReturnType<typeof userEvent.setup>, content: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Message Career Copilot" }), { target: { value: content } });
  await user.click(screen.getByRole("button", { name: "Send" }));
}

it("runs Profile → AI → evidence → reject → accept → SQLite reopen → reviewed undo with exact preservation", async () => {
  const f = await profileSkillFixture(true); let repo: AppRepository = f.repo;
  const calls = vi.spyOn(MockAIProvider.prototype, "converseWorkspace"); const user = userEvent.setup(); let view = mountProfile(repo);
  try {
    const before = await Promise.all([repo.getProfile(), repo.listCareerFacts(), repo.listApplications(), repo.listResumeVersions()]); const beforeSkills = await repo.listSkills();
    await screen.findByRole("heading", { name: "Synthetic’s profile" });
    await user.click(screen.getByRole("button", { name: "Open Career AI" })); await screen.findByRole("textbox", { name: "Message Career Copilot" });
    await say(user, "I used LangGraph in AURA. Check whether it's already listed in my profile.");
    await screen.findByText(/LangGraph is not listed/);
    await user.click(within(screen.getByRole("log", { name: "Conversation messages" })).getByRole("link", { name: "AURA · verified evidence" })); await screen.findByDisplayValue(f.fact.statement);
    await user.click(screen.getByRole("link", { name: "Back to profile" }));
    await say(user, "Add it."); await screen.findByText("Skill not listed"); expect(screen.getByText("Add: LangGraph")).toBeVisible();
    expect(screen.getByText("Career Profile → Skills · profile-fixture")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reject proposal" })); await screen.findByText("Proposal rejected. No domain record was changed."); expect(await repo.listSkills()).toEqual(beforeSkills);
    await say(user, "Add LangGraph to my profile using the AURA evidence.");
    const accept = await screen.findByRole("button", { name: "Accept change" }); accept.focus(); await user.keyboard("{Enter}");
    await screen.findByText("Skill added to your profile. Review undo is available under Accepted changes.");
    await waitFor(() => expect(within(screen.getByTestId("profile-workspace")).getAllByText("LangGraph").length).toBeGreaterThan(0));
    expect(await repo.listSafetyRecords(PROFILE_SKILL_AUDIT)).toHaveLength(1); expect(await Promise.all([repo.getProfile(), repo.listCareerFacts(), repo.listApplications(), repo.listResumeVersions()])).toEqual(before);
    await user.click(screen.getByRole("button", { name: "Close Career AI" })); expect(screen.getByRole("button", { name: "Open Career AI" })).toHaveFocus();
    view.unmount(); view.client.clear(); repo = await f.reopen(); view = mountProfile(repo);
    await user.click(screen.getByRole("button", { name: "Open Career AI" })); await screen.findByText("Accepted changes (1)");
    await user.click(screen.getByText("Accepted changes (1)")); await user.click(screen.getByRole("button", { name: "Review undo" }));
    expect(await repo.listSkills()).toHaveLength(beforeSkills.length + 1);
    await user.click(await screen.findByRole("button", { name: "Accept change" })); await screen.findByText("Skill addition undone. Supporting evidence is preserved.");
    expect(await repo.listSkills()).toEqual(beforeSkills); expect(await Promise.all([repo.getProfile(), repo.listCareerFacts(), repo.listApplications(), repo.listResumeVersions()])).toEqual(before);
    expect(calls).not.toHaveBeenCalled();
    if (process.env.CC_INTELLIGENCE_EVIDENCE) await writeFile(`${process.env.CC_INTELLIGENCE_EVIDENCE}/profile-skill-ui-acceptance.json`, JSON.stringify({ status: "PASS", harness: "React/jsdom with synthetic SqliteRepository; SQLite export/reopen, not native restart", profileId: "profile-fixture", evidenceId: f.fact.id, beforeSkills, finalSkills: await repo.listSkills(), audit: await repo.listSafetyRecords(PROFILE_SKILL_AUDIT), conversations: await repo.listCareerCopilotThreads(), domainSnapshotsEqual: true, providerCalls: calls.mock.calls.length }, null, 2));
  } finally { view.unmount(); view.client.clear(); calls.mockRestore(); f.close(); }
}, 20000);

it("keeps model proposals opt-in, reviews two mocked requests and shows a separately accepted skill card", async () => {
  const f = await profileSkillFixture(); const user = userEvent.setup(); const calls = vi.spyOn(MockAIProvider.prototype, "converseWorkspace");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><RepositoryContext.Provider value={{ repository: f.repo, ready: true, error: null }}><MemoryRouter><CareerCopilotPage embedded contextType="job" recordId={f.job.id}/></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>);
  try {
    await user.click(await screen.findByRole("button", { name: "Read across selected records" }));
    const optIn = screen.getByRole("checkbox", { name: "Allow one evidence-backed profile-skill proposal" }); expect(optIn).not.toBeChecked();
    await user.click(optIn); await user.click(screen.getByRole("checkbox", { name: "Verified career evidence" })); await user.click(await screen.findByRole("checkbox", { name: f.fact.statement }));
    fireEvent.change(screen.getByLabelText("Connected workspace question"), { target: { value: "Add LangGraph to my profile using AURA evidence." } });
    expect(calls).not.toHaveBeenCalled(); await user.click(screen.getByRole("button", { name: "Review tool-selection request" }));
    await screen.findByLabelText("Exact connected outbound context"); await user.click(screen.getByRole("button", { name: "Run reviewed workspace mock" }));
    await waitFor(() => expect(screen.getByLabelText("Exact connected outbound context").textContent).toContain('"phase": "answer"'));
    expect(screen.getByLabelText("Exact connected outbound context").textContent).not.toMatch(/PRIVATE_|profile-fixture|proficiencyNote/);
    await user.click(screen.getByRole("button", { name: "Run reviewed workspace mock" }));
    await screen.findByText("Add: LangGraph"); expect(await f.repo.listSkills()).toHaveLength(1); expect(calls).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Accept change" })); await screen.findByText("Skill added to your profile. Review undo is available under Accepted changes.");
    expect((await f.repo.listSkills()).some(s => s.name === "LangGraph")).toBe(true);
  } finally { view.unmount(); client.clear(); calls.mockRestore(); f.close(); }
});
