import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach } from "vitest";
import { Suspense } from "react";
import { MemoryRouter } from "react-router-dom";
import { MemoryRepository } from "../../lib/database/memoryRepository";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import { MockAIProvider } from "../../lib/ai/mockProvider";
import { sampleJob } from "./sampleJob";
import { TailorResumePage } from "./TailorResumePage";
import { App } from "../../App";
import { RepositoryProvider } from "../../lib/database/RepositoryProvider";

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RepositoryProvider>
        <Suspense fallback={<div>Opening CareerCompiler…</div>}><App /></Suspense>
      </RepositoryProvider>
    </QueryClientProvider>,
  );
}

describe("main tailoring workflow", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
    localStorage.clear();
    window.location.hash = "#/dashboard";
  });

  it("lazy-loads the mock workflow and persists only after explicit save", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /run safe seed/i }));
    await user.click(screen.getByRole("link", { name: "Résumés" }));
    await user.click(await screen.findByRole("link", { name: "Tailor for job" }));
    await user.click(await screen.findByRole("link", { name: "Paste a job description" }));

    await user.click(await screen.findByRole("button", { name: /use sample job/i }));
    await user.click(screen.getByRole("button", { name: /analyze job/i }));
    expect(await screen.findByText(/job analysis/i)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("careercompiler-dev") ?? "{}").jobs).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /save job and score evidence/i }));
    expect(JSON.parse(localStorage.getItem("careercompiler-dev") ?? "{}").jobs).toHaveLength(1);
    expect(await screen.findByText(/tailoring controls/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create tailored variant/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /create starter master resume/i }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("careercompiler-dev") ?? "{}");
      expect(stored.resumes.some((resume: { kind?: string }) => resume.kind === "master")).toBe(true);
    });
    await user.click(screen.getByRole("button", { name: /confirm base resume/i }));
    await user.click(screen.getByRole("button", { name: /create tailored variant/i }));

    await waitFor(() => expect(screen.getByText(/generation review/i)).toBeInTheDocument());
    expect(screen.getAllByText(/exact source facts/i).length).toBeGreaterThan(0);
    expect(localStorage.getItem("careercompiler-resume-draft-v3")).toContain("resume");
    const beforeApproval = JSON.parse(localStorage.getItem("careercompiler-dev") ?? "{}");
    expect(beforeApproval.resumes).toHaveLength(1);
    expect(beforeApproval.resumes[0].kind).toBe("master");
    const closeEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(closeEvent);
    expect(closeEvent.defaultPrevented).toBe(true);
    await user.click(screen.getByRole("button", { name: /accept all/i }));
    expect(JSON.parse(localStorage.getItem("careercompiler-dev") ?? "{}").resumes).toHaveLength(1);
    await user.click(screen.getByRole("checkbox", { name: "I reviewed the content and ordering changes for this job." }));
    await user.click(screen.getByRole("button", { name: "Save reviewed child" }));
    await screen.findByRole("button", { name: "Save draft" });
    const stored = JSON.parse(localStorage.getItem("careercompiler-dev") ?? "{}");
    expect(stored.resumes).toHaveLength(2);
    const tailored = stored.resumes.find((item: { kind?: string }) => item.kind === "tailored");
    expect(tailored.parentResumeVersionId).toBe(beforeApproval.resumes[0].id);
    expect(tailored.baseResumeVersionId).toBe(tailored.parentResumeVersionId);
    expect(stored.resumes.find((item: { kind?: string }) => item.kind === "master")).toEqual(beforeApproval.resumes[0]);

    expect(screen.getByRole("button", { name: /export pdf/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /export pdf/i })).toHaveAttribute(
      "title",
      expect.stringContaining("email"),
    );
  });
});

it("continues from an already saved job without saving a duplicate", async () => {
  const repository = new MemoryRepository();
  await repository.seedSampleData();
  const analyzed = await new MockAIProvider().analyzeJob({ ...sampleJob, modelName: "mock" });
  const job = await repository.saveJob({ ...sampleJob, analysisJson: analyzed.data });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoryContext.Provider value={{ repository, ready: true, error: null }}>
        <MemoryRouter initialEntries={[`/tailor?jobId=${job.id}`]}><TailorResumePage /></MemoryRouter>
      </RepositoryContext.Provider>
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Continue to evidence" }));
  expect(await screen.findByText("Tailoring controls")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Back to analysis" }));
  await user.click(screen.getByRole("button", { name: "Continue to evidence" }));
  expect(await screen.findByText("Tailoring controls")).toBeInTheDocument();
  expect(await repository.listJobs()).toHaveLength(1);
});

it("analyzes an existing unscored job without changing its identity or source metadata", async () => {
  const repository = new MemoryRepository();
  await repository.seedSampleData();
  const job = await repository.saveJob({ ...sampleJob, analysisJson: null, sourceId: "source-example", location: "Chicago", workplaceType: "hybrid" });
  const user = userEvent.setup();
  render(<QueryClientProvider client={new QueryClient()}><RepositoryContext.Provider value={{ repository, ready: true, error: null }}><MemoryRouter initialEntries={[`/jobs?jobId=${job.id}`]}><TailorResumePage embedded jobId={job.id} /></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>);
  await waitFor(() => expect(screen.getByLabelText("Full job description")).toHaveValue(sampleJob.rawDescription));
  await user.click(screen.getByRole("button", { name: "Analyze job" }));
  await user.click(await screen.findByRole("button", { name: "Save job and score evidence" }));
  const jobs = await repository.listJobs();
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ id: job.id, sourceId: "source-example", location: "Chicago", workplaceType: "hybrid" });
});
