import { expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "../../App";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import { configureIsolatedRuntime } from "../../lib/acceptance/runtime";
import { resumeAuditFixture } from "../../test/resumeAuditFixture";

it("connects Résumés to local document intake and distinct creation/tailoring actions", async () => {
  configureIsolatedRuntime();
  const f = await resumeAuditFixture(), user = userEvent.setup();
  window.location.hash = "#/library";
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RepositoryContext.Provider value={{ repository: f.repo, ready: true, error: null }}><App /></RepositoryContext.Provider></QueryClientProvider>);
  await screen.findByRole("heading", { name: "Resumes" });
  expect(screen.getByText(/extracts local PDF\/DOCX text/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create Master Résumé" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Tailor for job" })).toHaveAttribute("href", "#/jobs");
  expect(screen.getByText(/Create Master Résumé builds a general résumé from your approved profile/)).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "Import existing résumé" }));
  await user.selectOptions(await screen.findByRole("combobox", { name: "Input format" }), "resume_text");
  const before = await f.repo.listCareerFacts();
  await user.type(screen.getByRole("textbox", { name: "Career information" }), "Project title: Another Synthetic Project\n- Built TypeScript interfaces for a synthetic monitoring tool.\nSkill tags: TypeScript");
  await user.click(screen.getByRole("button", { name: "Generate proposal" }));
  await screen.findByText("Review import proposal");
  expect(screen.queryByText("Illinois Institute of Technology")).not.toBeInTheDocument();
  expect(await f.repo.listCareerFacts()).toEqual(before);
  expect(await f.repo.listResumeVersions()).toEqual([]);
  expect(screen.getByLabelText("Select PDF or DOCX")).toHaveAttribute("accept", ".pdf,.docx");
});

it("blocks starter generation from unreviewed evidence with a useful error and no résumé write", async () => {
  configureIsolatedRuntime();
  const f = await resumeAuditFixture(), user = userEvent.setup();
  for (const fact of f.facts) await f.repo.saveCareerFact({ ...fact, evidenceStatus: "needs_review" });
  window.location.hash = `#/tailor?jobId=${f.jobs[0].id}`;
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RepositoryContext.Provider value={{ repository: f.repo, ready: true, error: null }}><App /></RepositoryContext.Provider></QueryClientProvider>);
  await user.click(await screen.findByRole("button", { name: "Analyze job" }));
  await user.click(await screen.findByRole("button", { name: "Save job and score evidence" }));
  await user.click(await screen.findByRole("button", { name: "Create starter Master Resume" }));
  expect(await screen.findByText("Add or import project/work facts before creating a starter Master Resume.")).toBeInTheDocument();
  expect(await f.repo.listResumeVersions()).toEqual([]);
});

it("duplicates a standalone Master without inventing a job or changing its original", async () => {
  configureIsolatedRuntime();
  const f = await resumeAuditFixture(), user = userEvent.setup();
  const { prepareProfileMaster, saveProfileMaster } = await import("../../lib/tailoring/profileMaster");
  const master = await saveProfileMaster(f.repo, await prepareProfileMaster(f.repo), true);
  const jobsBefore = await f.repo.listJobs();
  window.location.hash = "#/library";
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RepositoryContext.Provider value={{ repository: f.repo, ready: true, error: null }}><App /></RepositoryContext.Provider></QueryClientProvider>);
  await user.click(await screen.findByText("More options"));
  await user.click(screen.getByRole("button", { name: "Duplicate" }));
  await waitFor(async () => expect(await f.repo.listResumeVersions()).toHaveLength(2));
  const copy = (await f.repo.listResumeVersions()).find(version => version.id !== master.id)!;
  expect(copy).toMatchObject({ jobId: "", kind: "master", parentResumeVersionId: master.id, status: "draft" });
  expect(await f.repo.getResumeVersion(master.id)).toEqual(master);
  expect(await f.repo.listJobs()).toEqual(jobsBefore);
});
