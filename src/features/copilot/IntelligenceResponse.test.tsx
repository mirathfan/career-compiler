import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { it, expect, vi } from "vitest";
import { MemoryRepository } from "../../lib/database/memoryRepository";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import { MockAIProvider } from "../../lib/ai/mockProvider";
import { WorkspaceReadReview } from "./WorkspaceReadReview";
import { IntelligenceResponse } from "./IntelligenceResponse";
import { CareerMemoryPage } from "../career-memory/CareerMemoryPage";
import { ResumeLibraryPage } from "../resume-library/ResumeLibraryPage";
import { deterministicFallback } from "../../lib/ai/generationPipeline";
import { createGenerationFixture } from "../../test/generationFixture";

it("requires explicit comparison permissions, reviews derived output, and renders persisted reasons", async () => {
  const repo = new MemoryRepository(); await repo.initialize(); await repo.saveJobSearchPreferences({ aiMatchEnabled: true, aiMatchMockMode: true });
  const job = await repo.saveJob({ company: "Synthetic employer", roleTitle: "Python Engineer", rawDescription: "Python required. Project experience accepted. Sponsorship may be considered case by case." });
  const item = await repo.saveCareerItem({ title: "Synthetic project", type: "project", enabled: true });
  const fact = await repo.saveCareerFact({ careerItemId: item.id, statement: "Built a Python API with tested request handling.", enabled: true, evidenceStatus: "verified", skillTags: ["Python"] });
  const call = vi.spyOn(MockAIProvider.prototype, "converseWorkspace"); const complete = vi.fn(); const user = userEvent.setup();
  const view = render(<RepositoryContext.Provider value={{ repository: repo, ready: true, error: null }}><WorkspaceReadReview jobId={job.id} messages={[]} onComplete={complete}/></RepositoryContext.Provider>);
  try {
    await user.click(screen.getByRole("button", { name: "Read across selected records" }));
    expect(screen.getByRole("checkbox", { name: /Compare selected résumé/ })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Use selected job and verified/ }));
    expect(screen.getByRole("checkbox", { name: /Use saved career preferences/ })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Saved jobs" })); await user.click(await screen.findByRole("checkbox", { name: "Synthetic employer · Python Engineer" }));
    await user.click(screen.getByRole("checkbox", { name: "Verified career evidence" })); await user.click(await screen.findByRole("checkbox", { name: fact.statement }));
    fireEvent.change(screen.getByLabelText("Connected workspace question"), { target: { value: "Compare selected jobs" } });
    await user.click(screen.getByRole("button", { name: "Review tool-selection request" }));
    expect((await screen.findByLabelText("Exact connected outbound context")).textContent).toContain('"careerContext": false'); expect(call).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Run reviewed workspace mock" }));
    await waitFor(() => expect(screen.getByLabelText("Exact connected outbound context").textContent).toContain('"eligibility"'));
    expect(call).toHaveBeenCalledTimes(1); await user.click(screen.getByRole("button", { name: "Run reviewed workspace mock" }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    const messages = await repo.listCareerCopilotMessages(complete.mock.calls[0][0]);
    const record = (messages[1].structuredContentJson.workspaceRead as { records: Array<{ intelligence: unknown }> }).records[0];
    view.unmount(); render(<IntelligenceResponse value={record.intelligence}/>);
    expect(screen.getByRole("region", { name: "Deterministic career comparison" })).toBeVisible();
    expect(screen.getByText(/Eligibility: NEEDS_CONFIRMATION/)).toBeVisible();
    await user.click(screen.getByText("Evidence, gaps and confidence")); expect(screen.getByText(/Python required.*supported/)).toBeVisible();
  } finally { view.unmount(); call.mockRestore(); }
});

it("opens only the cited fact and reports a missing fact without selecting another item", async () => {
  const repo = new MemoryRepository(); await repo.initialize();
  const item = await repo.saveCareerItem({ id: "item", title: "Project", type: "project" });
  const nextItem = await repo.saveCareerItem({ id: "next-item", title: "Another project", type: "project" });
  await repo.saveCareerFact({ id: "next-fact", careerItemId: nextItem.id, statement: "Explicitly selected other project", evidenceStatus: "verified" });
  await repo.saveCareerFact({ id: "target", careerItemId: item.id, statement: "Target verified statement", evidenceStatus: "verified" });
  await repo.saveCareerFact({ id: "other", careerItemId: item.id, statement: "Other fact not selected", evidenceStatus: "verified" });
  const show = (id: string) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RepositoryContext.Provider value={{ repository: repo, ready: true, error: null }}><MemoryRouter initialEntries={[`/career-memory?factId=${id}`]}><CareerMemoryPage /></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>);
  const first = show("target");
  expect(await screen.findByDisplayValue("Target verified statement")).toBeVisible(); expect(screen.queryByDisplayValue("Other fact not selected")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Another project/ }));
  expect(await screen.findByDisplayValue("Explicitly selected other project")).toBeVisible(); first.unmount();
  const missing = show("deleted"); expect(await screen.findByRole("alert")).toHaveTextContent("No other record is selected"); expect(screen.queryByDisplayValue("Target verified statement")).not.toBeInTheDocument(); missing.unmount();
});

it("opens the exact linked child résumé, including archived versions, with no fallback for missing IDs", async () => {
  const repo = new MemoryRepository(); await repo.initialize();
  const content = deterministicFallback((await createGenerationFixture()).request);
  const job = await repo.saveJob({ id: "resume-job", company: "Synthetic", roleTitle: "Engineer", rawDescription: "Python required." });
  await repo.saveResumeVersion({ id: "master-target", jobId: job.id, name: "Master version", kind: "master", contentJson: content });
  await repo.saveResumeVersion({ id: "child-target", jobId: job.id, name: "Exact child version", kind: "tailored", parentResumeVersionId: "master-target", baseResumeVersionId: "master-target", contentJson: content });
  await repo.setResumeArchived("child-target", true);
  const call = vi.spyOn(MockAIProvider.prototype, "converseWorkspace");
  const show = (id: string) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RepositoryContext.Provider value={{ repository: repo, ready: true, error: null }}><MemoryRouter initialEntries={[`/library?resumeId=${id}`]}><ResumeLibraryPage /></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>);
  const child = show("child-target");
  expect(await screen.findByText("Exact child version")).toBeVisible();
  expect(screen.queryByText("Master version", { selector: "p.mt-1" })).not.toBeInTheDocument(); child.unmount();
  const missing = show("deleted"); expect(await screen.findByText(/Cited résumé version is unavailable/)).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Master version" })).not.toBeInTheDocument(); expect(call).not.toHaveBeenCalled(); missing.unmount(); call.mockRestore();
});
