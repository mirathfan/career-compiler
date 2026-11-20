import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { createSampleWorkspace } from "../../lib/jobs/sampleWorkspace";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import { CareerCopilotPage } from "../copilot/CareerCopilotPage";

it("keeps the job assistant out of unrelated conversations and makes no automatic writes", async () => {
  const repository = await createSampleWorkspace();
  const jobs = await repository.listJobs();
  const other = await repository.saveCareerCopilotThread({ title: "Other job discussion", activeContextType: "job", activeContextId: jobs[1].id });
  await repository.saveCareerCopilotMessage({ id: "other-message", threadId: other.id, role: "assistant", content: "Unrelated private conversation", structuredContentJson: {}, toolCallsJson: [], internalCitationsJson: [], pendingActionsJson: [], provider: "deterministic", model: "local", promptVersion: "test", tokenUsageJson: { inputTokens: null, outputTokens: null, totalTokens: null }, createdAt: new Date().toISOString() });
  const writes = vi.spyOn(repository, "saveCareerCopilotMessage");
  render(<QueryClientProvider client={new QueryClient()}><RepositoryContext.Provider value={{ repository, ready: true, error: null }}><MemoryRouter><CareerCopilotPage embedded contextType="job" recordId={jobs[0].id} /></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>);
  expect(await screen.findByRole("heading", { name: "Ask about your job search" })).toBeInTheDocument();
  expect(screen.queryByText("Unrelated private conversation")).not.toBeInTheDocument();
  expect(writes).not.toHaveBeenCalled();
});
