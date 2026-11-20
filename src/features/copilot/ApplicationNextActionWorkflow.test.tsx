import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import { applicationActionFixture } from "../../test/applicationActionFixture";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import type { AppRepository } from "../../lib/database/repository";
import { ApplicationsPage } from "../applications/ApplicationsPage";
import { DashboardPage } from "../dashboard/DashboardPage";
import { CareerAIWorkspaceProvider } from "../../components/CareerAIWorkspace";
import { CareerAIPanel } from "../../components/CareerAIPanel";
import { MockAIProvider } from "../../lib/ai/mockProvider";
import { APPLICATION_NEXT_ACTION_AUDIT } from "../../lib/copilot/applicationActionContract";

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
function mount(repo: AppRepository, id: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><RepositoryContext.Provider value={{ repository: repo, ready: true, error: null }}><MemoryRouter initialEntries={[`/applications?applicationId=${id}`]}><CareerAIWorkspaceProvider><Link to="/">Go Home</Link><Link to={`/applications?applicationId=${id}`}>Back to application</Link><Routes><Route path="/applications" element={<ApplicationsPage/>}/><Route path="/" element={<DashboardPage/>}/></Routes><CareerAIPanel/></CareerAIWorkspaceProvider></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>);
  return { ...view, client };
}
async function say(user: ReturnType<typeof userEvent.setup>, content: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Message Career Copilot" }), { target: { value: content } });
  await user.click(screen.getByRole("button", { name: "Send" }));
}

it("runs Applications → evidence → reject → accept → Home → reopen → undo with preserved provenance", async () => {
  const f = await applicationActionFixture(true); const user = userEvent.setup(); let view = mount(f.repo, f.appId);
  const calls = vi.spyOn(MockAIProvider.prototype, "converseWorkspace").mockRejectedValue(new Error("Provider unavailable"));
  try {
    const before = (await f.repo.getApplication(f.appId))!; const untouched = await Promise.all([f.repo.listResumeVersions(), f.repo.listSafetyRecords("application_history_entry"), f.repo.listCareerFacts()]);
    await user.click(await screen.findByText("Edit tracking details")); expect(screen.getByRole("textbox", { name: "Next action" })).toHaveValue("Review saved evidence");
    await user.click(screen.getByRole("button", { name: "Ask Copilot" })); await screen.findByRole("textbox", { name: "Message Career Copilot" });
    await say(user, "What applications need my attention?"); await screen.findByText(/Local recorded snapshot/);
    const source = within(screen.getByRole("log", { name: "Conversation messages" })).getByRole("link", { name: "Synthetic Company · Engineer" });
    expect(source).toHaveAttribute("href", `/applications?applicationId=${f.appId}`); await user.click(source); expect(screen.getByText("Showing the linked application record.")).toBeVisible();
    const request = "Set my next action for this application to follow up with the recruiter on 2000-01-01.";
    await say(user, request); await screen.findByText("Current next action"); expect(screen.getByText("Proposed next action")).toBeVisible(); expect(screen.getByText("Follow-up: 2000-01-01")).toBeVisible();
    expect(await f.repo.getApplication(f.appId)).toEqual(before); await user.click(screen.getByRole("button", { name: "Reject proposal" })); await screen.findByText("Proposal rejected. No domain record was changed."); expect(await f.repo.getApplication(f.appId)).toEqual(before);
    await say(user, request); const accept = await screen.findByRole("button", { name: "Accept change" }); accept.focus(); await user.keyboard("{Enter}");
    await screen.findByText("Next action saved to the local tracker. No message or reminder was sent.");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Next action" })).toHaveValue("follow up with the recruiter"));
    expect((await f.repo.getApplication(f.appId))!).toEqual({ ...before, nextAction: "follow up with the recruiter", followUpDate: "2000-01-01", updatedAt: expect.any(String) });
    await user.click(screen.getByRole("link", { name: "Go Home" })); await screen.findByRole("heading", { name: "Your Workspace" });
    expect(await screen.findByRole("link", { name: /Follow up with Synthetic Company.*follow up with the recruiter/ })).toBeVisible();
    await user.click(screen.getByRole("link", { name: "Back to application" })); await user.click(await screen.findByText("Edit tracking details"));
    await user.click(screen.getByRole("button", { name: "Close Career AI" })); await user.click(screen.getByRole("button", { name: "Ask Copilot" })); await screen.findByText("Accepted changes (1)");
    view.unmount(); view.client.clear(); await f.reopen(); view = mount(f.repo, f.appId);
    await user.click(await screen.findByText("Edit tracking details")); expect(screen.getByRole("textbox", { name: "Next action" })).toHaveValue("follow up with the recruiter");
    await user.click(screen.getByRole("button", { name: "Ask Copilot" })); await screen.findByText("Accepted changes (1)");
    await user.click(screen.getByText("Accepted changes (1)")); await user.click(screen.getByRole("button", { name: "Review undo" }));
    await user.click(await screen.findByRole("button", { name: "Accept change" })); await screen.findByText("Next action restored. Application history and résumé links are preserved.");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Next action" })).toHaveValue("Review saved evidence"));
    expect(await f.repo.getApplication(f.appId)).toEqual({ ...before, updatedAt: expect.any(String) }); expect(await Promise.all([f.repo.listResumeVersions(), f.repo.listSafetyRecords("application_history_entry"), f.repo.listCareerFacts()])).toEqual(untouched);
    expect(calls).not.toHaveBeenCalled();
    if (process.env.CC_INTELLIGENCE_EVIDENCE) await writeFile(`${process.env.CC_INTELLIGENCE_EVIDENCE}/application-action-ui-acceptance.json`, JSON.stringify({ status: "PASS", harness: "React/jsdom, synthetic SQLite export/reopen; not native restart", applicationId: f.appId, submittedResumeVersionId: before.submittedResumeVersionId, before, after: await f.repo.getApplication(f.appId), audit: await f.repo.listSafetyRecords(APPLICATION_NEXT_ACTION_AUDIT), unrelatedSnapshotsEqual: true, providerCalls: calls.mock.calls.length }, null, 2));
  } finally { view.unmount(); view.client.clear(); calls.mockRestore(); f.close(); }
}, 25000);

it("retains a manual draft and shows a conflict when a reviewed action changes the tracker during editing", async () => {
  const f = await applicationActionFixture(); const user = userEvent.setup(); const view = mount(f.repo, f.appId);
  try {
    await user.click(await screen.findByText("Edit tracking details")); const input = screen.getByRole("textbox", { name: "Next action" });
    fireEvent.change(input, { target: { value: "My unsaved manual draft" } });
    const action = await f.propose(); await f.repo.confirmCareerCopilotAction(action);
    await act(async () => { await view.client.invalidateQueries(); });
    expect(input).toHaveValue("My unsaved manual draft"); fireEvent.blur(input); await screen.findByRole("alert");
    expect((await f.repo.getApplication(f.appId))!.nextAction).toBe("follow up with the recruiter");
    await user.click(screen.getByRole("button", { name: "Use current value" })); expect(input).toHaveValue("follow up with the recruiter");
  } finally { view.unmount(); view.client.clear(); f.close(); }
});
