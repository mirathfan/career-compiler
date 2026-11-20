import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import { MemoryRepository } from "../../lib/database/memoryRepository";
import { DashboardPage } from "./DashboardPage";

it("offers guided intake first and keeps later setup and development tools collapsed", async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoryContext.Provider value={{ repository: new MemoryRepository(), ready: true, error: null }}>
        <MemoryRouter><DashboardPage /></MemoryRouter>
      </RepositoryContext.Provider>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("link", { name: "Start guided intake" })).toHaveAttribute("href", "/career-memory?intake=1");
  expect(screen.getByText("Later setup steps").closest("details")).not.toHaveAttribute("open");
  expect(screen.getByText("Development sample data").closest("details")).not.toHaveAttribute("open");
  expect(screen.queryByRole("link", { name: "Start tailoring" })).not.toBeInTheDocument();
  await user.click(screen.getByText("Later setup steps"));
  expect(screen.getByRole("link", { name: /Review sensitive answers/ })).toBeVisible();
});

it("links workspace tasks to the right screen", async () => {
  const repository = new MemoryRepository();
  await repository.seedSampleData();
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoryContext.Provider value={{ repository, ready: true, error: null }}>
        <MemoryRouter><DashboardPage /></MemoryRouter>
      </RepositoryContext.Provider>
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "Your Workspace" });
  await user.click(screen.getByText("Workspace setup & tools"));
  expect(await screen.findByRole("link", { name: /Add career evidence/ })).toHaveAttribute("href", "/career-memory?intake=1");
  expect(screen.getByRole("link", { name: /Review sensitive answers/ })).toHaveAttribute("href", "/candidate-brain?tab=sensitive");
  expect(screen.getByRole("link", { name: /Connect your browser/ })).toHaveAttribute("href", "/browser-extension");
  await user.tab();
});

it("renders actual counts and exact next-action links without changing application identities", async () => {
  const repository = new MemoryRepository();
  await repository.saveApplication({ id: "draft-one", company: "Synthetic Co", role: "Engineer", status: "preparing" });
  await repository.saveApplication({ id: "submitted-one", company: "Synthetic Co", role: "Another role", status: "applied", submittedResumeVersionId: "historical-v1" });
  await repository.saveJob({ id: "saved-one", company: "Synthetic Co", roleTitle: "Saved role", status: "saved", rawDescription: "Synthetic description" });
  render(<QueryClientProvider client={new QueryClient()}><RepositoryContext.Provider value={{ repository, ready: true, error: null }}><MemoryRouter><DashboardPage /></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>);
  expect(await screen.findByRole("link", { name: /Draft applications: 1/ })).toBeVisible();
  expect(screen.getByRole("link", { name: /Saved jobs: 1/ })).toBeVisible();
  expect(screen.getByRole("link", { name: /Follow-ups due: 0/ })).toBeVisible();
  expect(screen.getByRole("link", { name: /Continue Synthetic Co/ })).toHaveAttribute("href", "/applications?applicationId=draft-one");
  expect(screen.getByRole("link", { name: /Saved role.*Synthetic Co/ })).toHaveAttribute("href", "/jobs?view=all&jobId=saved-one");
  expect(screen.getByRole("link", { name: "Open Career Copilot" })).toHaveAttribute("href", "/copilot");
  expect((await repository.getApplication("submitted-one"))?.submittedResumeVersionId).toBe("historical-v1");
});
