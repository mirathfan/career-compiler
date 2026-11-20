import { beforeAll } from "vitest";
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};});
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import { createSampleWorkspace } from "../../lib/jobs/sampleWorkspace";
import { MemoryRepository } from "../../lib/database/memoryRepository";
import type { AppRepository } from "../../lib/database/repository";
import { JobsPage } from "./JobsPage";
import { useResumeEditorStore } from "../../stores/resumeEditorStore";

beforeEach(() => { useResumeEditorStore.getState().clearDraft(); });
function renderJobs(repo: AppRepository, route = "/jobs") {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RepositoryContext.Provider value={{ repository: repo, ready: true, error: null }}>
      <MemoryRouter initialEntries={[route]}><JobsPage /></MemoryRouter>
    </RepositoryContext.Provider>
  </QueryClientProvider>);
}

it("offers an actionable onboarding path without auto-saving or requesting AI", async () => {
  const repo = new MemoryRepository();
  const save = vi.spyOn(repo, "saveJob");
  renderJobs(repo);
  expect(await screen.findByRole("heading", { name: "A little setup. A more useful job search." })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Add your resume/ })).toHaveAttribute("href", "/profile?section=import&intake=1");
  expect(screen.getByRole("button", { name: "Choose companies" })).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});

it("saves a selected job, supports undo, and keeps selection while filtering", async () => {
  const repo = await createSampleWorkspace();
  renderJobs(repo);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Example Studio.*Software Engineer/ }));
  const workspace = screen.getByRole("article", { name: "Example Studio job workspace" });
  await user.click(within(workspace).getByRole("button", { name: "Save job" }));
  await waitFor(() => expect(within(workspace).getByRole("button", { name: "Saved" })).toBeEnabled());
  expect((await repo.listJobs()).find((job) => job.company === "Example Studio")?.status).toBe("saved");
  await user.click(within(workspace).getByRole("button", { name: "Undo" }));
  await waitFor(() => expect(within(workspace).getByRole("button", { name: "Save job" })).toBeInTheDocument());
  await user.type(screen.getByRole("textbox", { name: "Search jobs" }), "health");
  expect(within(workspace).getByRole("heading", { name: "Software Engineer" })).toBeInTheDocument();
});

it("keeps an existing resume mounted while switching workspace and company tabs", async () => {
  const repo = await createSampleWorkspace();
  const resume = (await repo.listResumeVersions())[0];
  renderJobs(repo, `/jobs?jobId=${resume.jobId}`);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("tab", { name: "Resume" }));
  expect(await screen.findByText("Generation review")).toBeInTheDocument();
  const resumeBefore = useResumeEditorStore.getState().resume;
  await user.click(screen.getByRole("tab", { name: "Overview" }));
  await user.click(screen.getByRole("tab", { name: "Companies" }));
  await screen.findByRole("heading", { name: "Follow companies you care about" });
  await user.click(screen.getByRole("tab", { name: "For you" }));
  await user.click(screen.getByRole("tab", { name: "Resume" }));
  expect(screen.getByText("Generation review")).toBeVisible();
  expect(useResumeEditorStore.getState().resume).toEqual(resumeBefore);
});

it("shows submitted answers without offering to resubmit or regenerate them", async () => {
  const repo = await createSampleWorkspace();
  const resume = (await repo.listResumeVersions())[0];
  const job = await repo.getJob(resume.jobId);
  const application = await repo.saveApplication({ jobId: resume.jobId, company: job!.company, role: job!.roleTitle, status: "applied", resumeVersionId: resume.id });
  const field = await repo.saveApplicationField({ applicationId: application.id, originalQuestion: "Why this role?", normalizedQuestionType: "why_role", finalAnswer: "My submitted answer", approved: true });
  renderJobs(repo, `/jobs?jobId=${resume.jobId}`);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("tab", { name: "Application" }));
  await user.click(await screen.findByRole("button", { name: "View application answers" }));
  expect(screen.queryByRole("button", { name: "Mark submitted" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Answer to Why this role?" })).toHaveAttribute("readonly");
  expect(await repo.getApplication(application.id)).toEqual(application);
  expect((await repo.listApplicationFields(application.id)).find((item) => item.id === field.id)).toEqual(field);
});

it("shows eligibility exclusions, inspectable evidence, exact applied roles and no automatic AI", async () => {
  const {populateFitFixtures}=await import("../../lib/jobs/fitFixtures");
  const repo=new MemoryRepository();await populateFitFixtures(repo);
  renderJobs(repo);const user=userEvent.setup();
  await screen.findByRole("button",{name:/Example Studio.*Software Engineer/});
  expect(screen.queryByRole("button",{name:/Senior Systems.*Senior Software Engineer/})).not.toBeInTheDocument();
  await user.click(screen.getByRole("button",{name:/Example Studio.*Software Engineer/}));
  const fit=screen.getByRole("region",{name:"Selected opportunity"});
  await user.click(within(fit).getAllByRole("button",{name:"Inspect synthetic-fact"})[0]);
  expect(screen.getByRole("region",{name:"Selected supporting evidence"})).toHaveTextContent("Built a React and TypeScript planner");
  await user.click(screen.getByRole("tab",{name:"Needs Confirmation"}));
  expect(screen.getByRole("button",{name:/Ambiguous AI.*Software Engineer/})).toBeInTheDocument();
  await user.click(screen.getByRole("tab",{name:"Excluded"}));
  expect(screen.getByRole("button",{name:/Senior Systems.*Senior Software Engineer/})).toBeInTheDocument();
  await user.click(screen.getByRole("tab",{name:"Applied"}));
  expect(screen.getAllByRole("button",{name:/Past Employer.*Software Engineer/})).toHaveLength(2);
  expect(screen.queryByRole("button",{name:/Past Employer.*AI Engineer/})).not.toBeInTheDocument();
  expect(await repo.listSafetyRecords("ai_budget")).toHaveLength(0);
});

it("requires explicit local review confirmation before saving eligibility",async()=>{
 const repo=await createSampleWorkspace();renderJobs(repo);const user=userEvent.setup();
 await user.click(await screen.findByRole("button",{name:/Example Studio.*Software Engineer/}));
 await user.click(screen.getByRole("button",{name:"Review eligibility information"}));
 const save=await screen.findByRole("button",{name:"Save reviewed eligibility"});expect(save).toBeDisabled();
 await user.selectOptions(screen.getByRole("combobox",{name:"Will require future sponsorship"}),"no");
 await user.click(screen.getByRole("checkbox",{name:/I have reviewed these statements/}));await user.click(save);
 await waitFor(async()=>expect(((await repo.listCandidateClaims())[0].value as {futureSponsorship:boolean}).futureSponsorship).toBe(false));
 expect((await repo.listCandidateClaims())[0].verificationStatus).toBe("user_confirmed");
 expect(await repo.listSafetyRecords("ai_budget")).toHaveLength(0);
});

it("opens the original application for an exact repost without creating another tracker",async()=>{const {populateFitFixtures}=await import("../../lib/jobs/fitFixtures");const repo=new MemoryRepository();await populateFitFixtures(repo);renderJobs(repo,"/jobs?view=applied");const user=userEvent.setup();const buttons=await screen.findAllByRole("button",{name:/Past Employer.*Software Engineer/});const repost=buttons.find(button=>button.getAttribute("data-job-id")==="fit-job-15")!;await user.click(repost);await user.click(screen.getByRole("button",{name:"Open existing application"}));expect(await screen.findByRole("link",{name:"Open its tracked workspace"})).toHaveAttribute("href","/jobs?jobId=fit-job-13");expect(await repo.listApplications()).toHaveLength(1);});

it("restores the stable selected row after evidence and back, preserving the active filter",async()=>{
 const repo=await createSampleWorkspace();renderJobs(repo,"/jobs?view=all");const user=userEvent.setup();
 const row=await screen.findByRole("button",{name:/Example Studio.*Software Engineer/});await user.click(row);
 expect(screen.getByRole("region",{name:"Selected opportunity"})).toHaveFocus();
 const citation=screen.getAllByRole("button",{name:"Inspect synthetic-fact"})[0];await user.click(citation);await user.click(screen.getByRole("button",{name:"Close evidence"}));expect(citation).toHaveFocus();
 await user.click(screen.getByRole("button",{name:"All jobs"}));expect(row).toHaveFocus();expect(screen.getByRole("tab",{name:"All jobs"})).toHaveAttribute("aria-selected","true");
 await user.keyboard("{Enter}");expect(screen.getByRole("region",{name:"Selected opportunity"})).toHaveFocus();await user.tab();expect(screen.getByRole("button",{name:"All jobs"})).toHaveFocus();await user.keyboard("{Enter}");expect(row).toHaveFocus();
});
it("restores focus from a remounted deep-linked workspace",async()=>{
 const repo=await createSampleWorkspace();const job=(await repo.listJobs()).find(job=>job.company==="Example Studio")!;renderJobs(repo,`/jobs?view=all&jobId=${job.id}`);
 const user=userEvent.setup();await user.click(await screen.findByRole("button",{name:"All jobs"}));expect(screen.getByRole("button",{name:/Example Studio.*Software Engineer/})).toHaveFocus();
});
it("focuses the labelled feed when the selected row is filtered out, including an empty feed",async()=>{
 const repo=await createSampleWorkspace();renderJobs(repo,"/jobs?view=all");const user=userEvent.setup();await user.click(await screen.findByRole("button",{name:/Example Studio.*Software Engineer/}));
 await user.type(screen.getByRole("textbox",{name:"Search jobs"}),"health");await user.click(screen.getByRole("button",{name:"All jobs"}));expect(screen.getByRole("region",{name:"Job results"})).toHaveFocus();
 await user.clear(screen.getByRole("textbox",{name:"Search jobs"}));await user.click(screen.getByRole("button",{name:/Example Studio.*Software Engineer/}));await user.type(screen.getByRole("textbox",{name:"Search jobs"}),"no-matching-synthetic-job");await user.click(screen.getByRole("button",{name:"All jobs"}));expect(screen.getByRole("region",{name:"Job results"})).toHaveFocus();
});
it("rapid repeated navigation focuses the current stable row without delayed focus races",async()=>{
 const repo=await createSampleWorkspace();renderJobs(repo,"/jobs?view=all");const user=userEvent.setup();
 for(const company of ["Example Studio","Example Health","Example Studio"]){const row=await screen.findByRole("button",{name:new RegExp(company+".*Engineer")});await user.click(row);await user.click(screen.getByRole("button",{name:"All jobs"}));expect(row).toHaveFocus();}
});
it("restores captured feed scrolling after a review, but discards offsets from another filter",async()=>{
 const repo=await createSampleWorkspace();renderJobs(repo,"/jobs?view=all");const user=userEvent.setup();const row=await screen.findByRole("button",{name:/Example Studio.*Software Engineer/});const feed=screen.getByRole("region",{name:"Job results"});feed.scrollTop=320;
 await user.click(row);feed.scrollTop=0;await user.click(screen.getByRole("button",{name:"Review eligibility information"}));await user.click(screen.getByRole("button",{name:"Cancel review"}));await user.click(screen.getByRole("button",{name:"All jobs"}));expect(feed.scrollTop).toBe(320);expect(row).toHaveFocus();
 await user.click(row);feed.scrollTop=45;await user.click(screen.getByRole("tab",{name:"Needs Confirmation"}));await user.click(screen.getByRole("button",{name:"All jobs"}));expect(feed.scrollTop).toBe(45);expect(feed).toHaveFocus();
});
it("retains a canceled import draft when reopening without persisting it",async()=>{
 const repo=await createSampleWorkspace();const before=(await repo.listJobs()).length;renderJobs(repo);const user=userEvent.setup();await user.click(await screen.findByRole("button",{name:"Add a job"}));await user.selectOptions(screen.getByRole("combobox",{name:"Input type"}),"fixture");await user.click(screen.getByRole("button",{name:"Preview job"}));await screen.findByRole("heading",{name:"Review the complete posting"});await user.click(screen.getByRole("button",{name:"Cancel import"}));expect(screen.queryByRole("dialog")).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"Add a job"})).toHaveFocus();await user.click(screen.getByRole("button",{name:"Add a job"}));expect(screen.getByRole("heading",{name:"Review the complete posting"})).toBeInTheDocument();expect(await repo.listJobs()).toHaveLength(before);
});


it("shows only the selected job note and opens its reviewed-edit path without writing", async () => {
  const repo = await createSampleWorkspace();
  const jobs = await repo.listJobs();
  const first = await repo.saveJob({ ...jobs[0], notes: "First private note\nUnverified reminder" });
  const second = await repo.saveJob({ ...jobs[1], notes: "Second private note" });
  const before = await repo.listJobs();
  const writes = vi.spyOn(repo, "saveJob");
  renderJobs(repo, `/jobs?view=all&jobId=${first.id}`);
  const user = userEvent.setup();
  const note = await screen.findByRole("region", {name: "Saved private note text"});
  expect(note.textContent).toBe(first.notes);
  await user.click(screen.getByRole("button", {name: new RegExp(`${second.company}.*${second.roleTitle}`)}));
  expect(screen.getByRole("region", {name: "Saved private note text"}).textContent).toBe(second.notes);
  expect(screen.queryByText("First private note", {exact: false})).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", {name: "Review a note change in Copilot"}));
  const dialog = await screen.findByRole("dialog", {name: `Ask about ${second.company}`});
  expect(await within(dialog).findByLabelText("Saved job")).toHaveValue(second.id);
  expect(within(dialog).getByRole("button", {name: "Propose a private note"})).toBeVisible();
  expect(writes).not.toHaveBeenCalled();
  expect(await repo.listJobs()).toEqual(before);
});
