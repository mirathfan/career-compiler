import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Link, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRepository } from "../lib/database/memoryRepository";
import { RepositoryContext } from "../lib/database/repositoryContext";
import { MockAIProvider } from "../lib/ai/mockProvider";
import { CareerAIButton, CareerAISelection, CareerAIWorkspaceProvider } from "./CareerAIWorkspace";
import { useCareerAI } from "./careerAIContext";
import { CareerAIPanel } from "./CareerAIPanel";

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
function Workspace() {
  const ai = useCareerAI()!;
  const { pathname } = useLocation();
  const record = pathname === "/jobs/one" ? { type: "job" as const, id: "one", label: "Alpha · Engineer" } : pathname === "/jobs/two" ? { type: "job" as const, id: "two", label: "Beta · Designer" } : pathname === "/applications" ? { type: "application" as const, id: "application", label: "Alpha application" } : pathname === "/library" ? { type: "resume" as const, id: "resume", label: "Synthetic resume" } : undefined;
  return <div><nav>{[["/jobs/one", "Job one"], ["/jobs/two", "Job two"], ["/applications", "Applications"], ["/library", "Résumés"], ["/profile", "Profile"], ["/activity", "Activity"]].map(([path, label]) => <Link key={path} to={path}>{label}</Link>)}</nav><Link to="/copilot?contextType=application&contextId=application">Application conversation</Link><p data-testid="route">{pathname}</p>
    {record ? <><CareerAISelection {...record} /><CareerAIButton selection={record}>Ask about selection</CareerAIButton></> : null}
    <button data-career-ai-trigger onClick={() => ai.openPanel(ai.visited ? undefined : ai.selection)}>Open Career AI</button>
    <CareerAIPanel />
  </div>;
}
async function fixture(path = "/jobs/one", open = true) {
  const repo = new MemoryRepository(); await repo.initialize();
  await repo.saveJob({ id: "one", company: "Alpha", roleTitle: "Engineer", rawDescription: "TypeScript role", notes: "PRIVATE_JOB_NOTE" });
  await repo.saveJob({ id: "two", company: "Beta", roleTitle: "Designer", rawDescription: "PRIVATE_OTHER_JOB" });
  await repo.saveApplication({ id: "application", company: "Alpha", role: "Engineer", status: "preparing", notes: "PRIVATE_APPLICATION" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const mount = () => render(<QueryClientProvider client={client}><RepositoryContext.Provider value={{ repository: repo, ready: true, error: null }}><MemoryRouter initialEntries={[path]}><CareerAIWorkspaceProvider><Workspace /></CareerAIWorkspaceProvider></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>);
  const view = mount(); const user = userEvent.setup();
  if (open) { await user.click(screen.getByRole("button", { name: "Open Career AI" }));
  await screen.findByRole("textbox", { name: "Message Career Copilot" }); }
  return { repo, client, user, view, mount };
}
async function say(user: ReturnType<typeof userEvent.setup>, message: string) {
  await user.type(screen.getByRole("textbox", { name: "Message Career Copilot" }), message);
  await user.click(screen.getByRole("button", { name: "Send" }));
}
it("keeps one conversation and draft across close, reopen, full page, dock and restart", async () => {
  const { repo, user, view, mount } = await fixture();
  await say(user, "Summarize this selected record.");
  await screen.findByRole("article", { name: "Local Copilot response" });
  const [thread] = await repo.listCareerCopilotThreads();
  await user.click(screen.getByRole("button", { name: "History & context" }));
  expect(within(screen.getByLabelText("Conversation history and context")).getByRole("button", { name: "Summarize this selected record. — job" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "History & context" }));
  await user.type(screen.getByRole("textbox", { name: "Message Career Copilot" }), "Unsent draft");
  await user.click(screen.getByRole("button", { name: "Close Career AI" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Open Career AI" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Open Career AI" }));
  expect(screen.getByRole("textbox", { name: "Message Career Copilot" })).toHaveValue("Unsent draft");
  await user.click(screen.getByRole("link", { name: "Open full-page Copilot" }));
  expect(screen.getAllByRole("textbox", { name: "Message Career Copilot" })).toHaveLength(1);
  expect(screen.getByRole("textbox", { name: "Message Career Copilot" })).toHaveValue("Unsent draft");
  await user.click(screen.getByRole("button", { name: "Dock conversation" }));
  expect(screen.getByTestId("route")).toHaveTextContent("/jobs/one");
  expect(screen.getByRole("textbox", { name: "Message Career Copilot" })).toHaveValue("Unsent draft");
  expect(await repo.listCareerCopilotThreads()).toHaveLength(1);
  view.unmount(); mount();
  await user.click(screen.getByRole("button", { name: "Open Career AI" }));
  await screen.findByRole("article", { name: "Local Copilot response" });
  expect(localStorage.getItem("careercompiler-copilot-thread")).toBe(thread.id);
});
it("keeps pending note targets fixed across views, then reopens the original thread explicitly", async () => {
  const { repo, user } = await fixture();
  await say(user, "Set job note: Synthetic follow-up.");
  await screen.findByRole("button", { name: "Accept change" });
  const original = (await repo.listCareerCopilotThreads())[0].id;
  for (const route of ["Job two", "Applications", "Résumés", "Profile", "Activity"]) {
    await user.click(screen.getByRole("link", { name: route }));
    expect(screen.getByRole("button", { name: "Accept change" })).toBeEnabled();
    expect(await repo.listCareerCopilotThreads()).toHaveLength(1);
  }
  await user.click(screen.getByRole("link", { name: "Job two" }));
  expect(screen.getByText(/conversation belongs to a different selection/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Use selected job" }));
  expect(screen.queryByRole("button", { name: "Accept change" })).toBeNull();
  await user.click(screen.getByRole("link", { name: "Job one" }));
  await user.click(screen.getByRole("button", { name: "Use selected job" }));
  await user.click(await screen.findByRole("button", { name: "Accept change" }));
  await waitFor(async () => expect((await repo.getJob("one"))?.notes).toBe("Synthetic follow-up."));
  expect((await repo.getJob("two"))?.notes).toBe("");
  expect((await repo.listCareerCopilotThreads())[0].id).toBe(original);
  await user.click(screen.getByText("Accepted changes (1)"));
  await user.click(screen.getByRole("button", { name: "Review undo" }));
  await user.click(await screen.findByRole("button", { name: "Accept change" }));
  await waitFor(async () => expect((await repo.getJob("one"))?.notes).toBe("PRIVATE_JOB_NOTE"));
});
it("rejects and cancels application changes; surfaces stale acceptance and preserves the target", async () => {
  const { repo, user } = await fixture("/applications");
  await say(user, "Update this application to interview");
  await user.click(await screen.findByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Accept change" })).toBeNull());
  expect((await repo.getApplication("application"))?.status).toBe("preparing");
  await say(user, "Update this application to interview");
  await screen.findByRole("button", { name: "Accept change" });
  await repo.saveApplication({ ...(await repo.getApplication("application"))!, status: "offer" });
  await user.click(screen.getByRole("button", { name: "Accept change" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("changed after the proposal");
  expect((await repo.getApplication("application"))?.status).toBe("offer");
});
it("blocks a deleted conversation record and retries transient read failures", async () => {
  const { repo, user, client } = await fixture();
  await say(user, "Set job note: Synthetic note.");
  await screen.findByRole("button", { name: "Accept change" });
  const read = vi.spyOn(repo, "listJobs").mockRejectedValueOnce(new Error("read failed"));
  await client.invalidateQueries({ queryKey: ["copilot-context-records"] });
  await user.click(await screen.findByRole("button", { name: "Retry loading conversation" }));
  await screen.findByRole("button", { name: "Accept change" });
  read.mockResolvedValue([]);
  await client.invalidateQueries({ queryKey: ["copilot-context-records"] });
  expect(await screen.findByRole("alert")).toHaveTextContent("context is unavailable");
  expect(screen.getByRole("button", { name: "Accept change" })).toBeDisabled();
  read.mockRestore();
});
it("supports Enter, Shift+Enter and modal cancellation without taking shortcuts from text fields", async () => {
  const { user } = await fixture();
  const composer = screen.getByRole("textbox", { name: "Message Career Copilot" });
  await user.type(composer, "Summarize{Shift>}{Enter}{/Shift}this selected record.");
  expect(composer).toHaveValue("Summarize\nthis selected record.");
  fireEvent.keyDown(composer, { key: ".", metaKey: true, shiftKey: true });
  expect(screen.getByRole("dialog")).toBeVisible();
  await user.keyboard("{Enter}");
  await screen.findByRole("article", { name: "Local Copilot response" });
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Open Career AI" })).toHaveFocus();
});
it("uses the unchanged job-only model transport after explicit review and retains local history on provider failure", async () => {
  const call = vi.spyOn(MockAIProvider.prototype, "converseJob");
  const { repo, user } = await fixture();
  await repo.saveJobSearchPreferences({ aiMatchEnabled: true, aiMatchMockMode: true });
  await say(user, "Summarize this selected record.");
  await screen.findByRole("article", { name: "Local Copilot response" });
  for (const name of ["Applications", "Résumés", "Profile", "Job one"]) await user.click(screen.getByRole("link", { name }));
  expect(call).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Ask AI about this job" }));
  await user.type(screen.getByLabelText("Question for AI"), "What role?");
  await user.click(screen.getByRole("button", { name: "Review AI request" }));
  await screen.findByRole("button", { name: "Run reviewed mock request" });
  expect(call).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Run reviewed mock request" }));
  await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
  const sent = call.mock.calls[0][0].request;
  expect(Object.keys(sent.job)).toEqual(["id", "contentHash", "company", "roleTitle", "location", "description"]);
  expect(sent.job.id).toBe("one");
  expect(JSON.stringify(sent)).not.toMatch(/PRIVATE|resume|profile|application/);
  await waitFor(() => expect(screen.getByLabelText("Question for AI")).toHaveValue(""));
  call.mockRejectedValueOnce(new Error("Provider unavailable"));
  await user.type(screen.getByLabelText("Question for AI"), "Retry question");
  await user.click(screen.getByRole("button", { name: "Review AI request" }));
  await user.click(await screen.findByRole("button", { name: "Run reviewed mock request" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("provider request failed");
  expect(within(screen.getByRole("log", { name: "Conversation messages" })).getByRole("article", { name: "Local Copilot response" })).toBeVisible();
  expect((await repo.listCareerCopilotMessages((await repo.listCareerCopilotThreads())[0].id))).toHaveLength(2);
  call.mockRestore();
});

it("opens the selected job with the keyboard shortcut and makes no provider call", async () => {
  const call = vi.spyOn(MockAIProvider.prototype, "converseJob");
  const workspaceCall = vi.spyOn(MockAIProvider.prototype, "converseWorkspace");
  const { user } = await fixture("/jobs/one", false);
  fireEvent.keyDown(window, { key: ">", code: "Period", metaKey: true, shiftKey: true });
  await screen.findByRole("textbox", { name: "Message Career Copilot" });
  expect(screen.getByText("Model scope: Job Q&A: selected job only. Connected reads: only explicitly reviewed records")).toBeVisible();
  expect(screen.getByText("Alpha · Engineer", { selector: "p" })).toBeVisible();
  for (const name of ["Job two", "Applications", "Résumés", "Profile", "Activity", "Job one"]) {
    await user.click(screen.getByRole("link", { name }));
  }
  expect(call).not.toHaveBeenCalled();
  expect(workspaceCall).not.toHaveBeenCalled();
  call.mockRestore(); workspaceCall.mockRestore();
});

it("reapplies a repeated full-page record link after an explicit local context switch", async () => {
  const { user } = await fixture();
  await user.click(screen.getByRole("link", { name: "Application conversation" }));
  expect(await screen.findByText("Conversation: application")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Dock conversation" }));
  await user.click(await screen.findByRole("button", { name: "Use selected job" }));
  expect(screen.getByText("Conversation: job")).toBeVisible();
  await user.click(screen.getByRole("link", { name: "Application conversation" }));
  expect(await screen.findByText("Conversation: application")).toBeVisible();
});
