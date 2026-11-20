import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import { preparationFixture } from "../../test/preparationFixture";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import type { AppRepository } from "../../lib/database/repository";
import { CareerCopilotPage } from "./CareerCopilotPage";
import { MockAIProvider } from "../../lib/ai/mockProvider";
beforeEach(() => localStorage.clear());
function Location() { const location = useLocation(); return <p data-testid="route">{location.pathname}{location.search}</p>; }
function mount(repo: AppRepository, jobId: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return { client, ...render(<QueryClientProvider client={client}><RepositoryContext.Provider value={{ repository: repo, ready: true, error: null }}><MemoryRouter><Location /><CareerCopilotPage embedded contextType="job" recordId={jobId}/></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>) };
}
async function say(user: ReturnType<typeof userEvent.setup>, text: string) { fireEvent.change(screen.getByRole("textbox", { name: "Message Career Copilot" }), { target: { value: text } }); await waitFor(()=>expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Send" })); }
const row = (name: string) => within(screen.getByRole("listitem", { name: `${name} preparation` }));
it("composes one plan inside the conversation scroll area, reviews independently with keyboard, reopens SQLite state and reverses each accepted operation", async () => {
    const f = await preparationFixture(true), user = userEvent.setup(), calls = vi.spyOn(MockAIProvider.prototype, "converseWorkspace").mockRejectedValue(new Error("Provider unavailable"));
    let view = mount(f.repo, f.job.id);
    try {
        const before = { resumes: await f.repo.listResumeVersions(), apps: await f.repo.listApplications(), skills: await f.repo.listSkills(), history: await f.repo.listSafetyRecords("application_history_entry") };
        await user.click(await screen.findByRole("button", { name: "Prepare this job" }));
        await screen.findByRole("region", { name: "Career preparation plan" });
        expect(within(screen.getByRole("log", { name: "Conversation messages" })).getByRole("region", { name: "Career preparation plan" })).toBeVisible();
        expect(screen.queryByRole("button", { name: /Accept (?:all|plan)/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Accept change" })).not.toBeInTheDocument();
        await user.click(screen.getByText("Inspect fit, version ranking and evidence"));
        expect(screen.getAllByText(/Sponsorship unknown/).length).toBeGreaterThan(0);
        expect(screen.getByRole("link", { name: "Open source résumé" })).toHaveAttribute("href", `/library?resumeId=${f.source.id}`);
        await user.click(screen.getByRole("link", { name: "Open profile" }));
        await waitFor(()=>expect(screen.getByTestId("route")).toHaveTextContent("/profile"));
        await user.click(row("Résumé bullet").getByRole("button", { name: "Review suggestion" }));
        await screen.findByRole("button", { name: "Reject proposal" });
        await user.click(screen.getByRole("button", { name: "Reject proposal" }));
        await screen.findByText("Proposal rejected. No domain record was changed.");
        expect(await f.repo.listResumeVersions()).toEqual(before.resumes);
        await waitFor(() => expect(row("Profile skill").getByRole("button", { name: "Review suggestion" })).toBeEnabled());
        await user.click(row("Profile skill").getByRole("button", { name: "Review suggestion" }));
        const accept = await screen.findByRole("button", { name: "Accept change" });
        accept.focus();
        await user.keyboard("{Enter}");
        await screen.findByText("Skill added to your profile. Review undo is available under Accepted changes.");
        await waitFor(() => expect(row("Profile skill").getByRole("status")).toHaveTextContent("Accepted"));
        expect(row("Résumé bullet").getByRole("status")).toHaveTextContent("Rejected");
        await say(user, "Now improve the AURA bullet.");
        await screen.findByRole("button", { name: "Accept change" });
        expect(screen.getByText("Current bullet")).toBeVisible();
        expect(screen.getByText("Proposed bullet")).toBeVisible();
        view.unmount();
        view.client.clear();
        await f.reopen();
        view = mount(f.repo, f.job.id);
        await screen.findByRole("button", { name: "Accept change" });
        await waitFor(()=>expect(row("Résumé bullet").getByRole("status")).toHaveTextContent("Pending approval"));
        await user.click(screen.getByRole("button", { name: "Accept change" }));
        await screen.findByText("New résumé child saved. Source and submitted versions preserved; PDF not yet rendered.");
        await say(user, "Set my next action to review this application tomorrow.");
        await screen.findByRole("button", { name: "Accept change" });
        expect(await f.repo.listApplications()).toEqual(before.apps);
        await user.click(screen.getByRole("button", { name: "Accept change" }));
        await screen.findByText("Next action saved to the local tracker. No message or reminder was sent.");
        await waitFor(() => expect(row("Application next action").getByRole("status")).toHaveTextContent("Accepted"));
        for (const original of before.resumes)
            expect(await f.repo.getResumeVersion(original.id)).toEqual(original);
        expect(await f.repo.getApplication(f.appId)).toEqual(before.apps.find(a => a.id === f.appId));
        await user.click(screen.getByText("Accepted changes (3)"));
        for (let i = 0; i < 3; i++) {
            await waitFor(()=>expect(screen.getAllByRole("button", { name: "Review undo" })[0]).toBeEnabled());
            await user.click(screen.getAllByRole("button", { name: "Review undo" })[0]);
            await user.click(await screen.findByRole("button", { name: "Accept change" }));
            await waitFor(() => expect(screen.queryByRole("button", { name: "Accept change" })).not.toBeInTheDocument());
        }
        await waitFor(() => expect(row("Résumé bullet").getByRole("status")).toHaveTextContent("Archived"));
        expect(await f.repo.listSkills()).toEqual(before.skills);
        expect((await f.repo.getApplication(f.app.id))!.nextAction).toBe("");
        expect(await f.repo.listSafetyRecords("application_history_entry")).toEqual(before.history);
        expect(calls).not.toHaveBeenCalled();
        if (process.env.CC_INTELLIGENCE_EVIDENCE)
            await writeFile(`${process.env.CC_INTELLIGENCE_EVIDENCE}/preparation-ui-acceptance.json`, JSON.stringify({ status: "PASS", harness: "React/jsdom and synthetic SQL.js SQLite, not native", jobId: f.job.id, sourceId: f.source.id, applicationId: f.app.id, keyboardApproval: true, independentApprovalAndReversal: true, partialRestart: true, providerCalls: 0, originalsPreserved: true }, null, 2));
    }
    finally {
        view.unmount();
        view.client.clear();
        calls.mockRestore();
        f.close();
    }
}, 20000);
it("shows stale evidence and leaves the pending proposal unchanged when acceptance is refused", async () => {
    const f = await preparationFixture(), user = userEvent.setup();
    const view = mount(f.repo, f.job.id);
    try {
        await user.click(await screen.findByRole("button", { name: "Prepare this job" }));
        await screen.findByRole("region", { name: "Career preparation plan" });
        await waitFor(() => expect(row("Profile skill").getByRole("button", { name: "Review suggestion" })).toBeEnabled());
        await user.click(row("Profile skill").getByRole("button", { name: "Review suggestion" }));
        await screen.findByRole("button", { name: "Accept change" });
        const before = await f.repo.listSkills();
        await f.repo.saveCareerFact({ ...f.fact, evidenceStatus: "needs_review" });
        await user.click(screen.getByRole("button", { name: "Accept change" }));
        await screen.findByRole("alert");
        await waitFor(() => expect(row("Profile skill").getByRole("status")).toHaveTextContent("Stale / conflicted"));
        expect(await f.repo.listSkills()).toEqual(before);
        await user.click(screen.getByRole("button", { name: "Reject proposal" }));
        await screen.findByText("Proposal rejected. No domain record was changed.");
    }
    finally {
        view.unmount();
        view.client.clear();
        f.close();
    }
});
