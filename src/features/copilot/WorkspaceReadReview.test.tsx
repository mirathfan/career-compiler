import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import { MemoryRepository } from "../../lib/database/memoryRepository";
import { MockAIProvider } from "../../lib/ai/mockProvider";
import { WorkspaceReadReview } from "./WorkspaceReadReview";

it("defaults scopes off, reviews each request separately and sends no request on mount or navigation", async () => {
  const repo = new MemoryRepository(); await repo.initialize(); await repo.saveJobSearchPreferences({ aiMatchEnabled: true, aiMatchMockMode: true, maximumAiAnalysesPerDay: 10 });
  const job = await repo.saveJob({ company: "Selected fixture", roleTitle: "Engineer", rawDescription: "Explicit requirement", notes: "NEVER_SEND_PRIVATE" });
  const user = userEvent.setup(); const call = vi.spyOn(MockAIProvider.prototype, "converseWorkspace"); const complete = vi.fn();
  const props = { jobId: job.id, messages: [], onComplete: complete };
  const view = render(<RepositoryContext.Provider value={{ repository: repo, ready: true, error: null }}><WorkspaceReadReview {...props} /></RepositoryContext.Provider>);
  try {
    expect(call).not.toHaveBeenCalled(); await user.click(screen.getByRole("button", { name: "Read across selected records" }));
    expect(screen.getAllByRole("checkbox").every(c => !(c as HTMLInputElement).checked)).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "Saved jobs" }));
    await user.click(await screen.findByRole("checkbox", { name: "Selected fixture · Engineer" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Connected workspace question" }), { target: { value: "What is the recorded requirement?" } });
    await user.click(screen.getByRole("button", { name: "Review tool-selection request" }));
    const preview = await screen.findByLabelText("Exact connected outbound context"); expect(preview.textContent).not.toContain("NEVER_SEND_PRIVATE"); expect(preview.textContent).not.toContain("Explicit requirement"); expect(call).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Run reviewed workspace mock" }));
    await waitFor(() => expect(screen.getByLabelText("Exact connected outbound context").textContent).toContain("Explicit requirement")); expect(call).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Cancel review" })); expect(call).toHaveBeenCalledTimes(1); expect(await repo.listCareerCopilotThreads()).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Review tool-selection request" })); await user.click(await screen.findByRole("button", { name: "Run reviewed workspace mock" }));
    await waitFor(() => expect(screen.getByLabelText("Exact connected outbound context").textContent).toContain('"phase": "answer"'));
    await user.click(screen.getByRole("button", { name: "Run reviewed workspace mock" })); await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    const messages = await repo.listCareerCopilotMessages(complete.mock.calls[0][0]); expect(messages[1].internalCitationsJson[0].entityId).toBe(job.id);
    view.unmount(); expect((await repo.getJob(job.id))?.notes).toBe("NEVER_SEND_PRIVATE");
  } finally { view.unmount(); call.mockRestore(); }
});
