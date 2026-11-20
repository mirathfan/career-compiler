import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import { MemoryRepository } from "../../lib/database/memoryRepository";
import { ApplicationsPage } from "./ApplicationsPage";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
});

it.each(["applicationId", "historyApplication"])("opens the exact %s record across status views without writes", async parameter => {
  const repo = new MemoryRepository();
  await repo.saveApplication({ id: "one", company: "Same Company", role: "First role", status: "preparing" });
  await repo.saveApplication({ id: "two", company: "Same Company", role: "Exact role", status: "ready", submittedResumeVersionId: "original" });
  const save = vi.spyOn(repo, "saveApplication");
  render(<QueryClientProvider client={new QueryClient()}><RepositoryContext.Provider value={{ repository: repo, ready: true, error: null }}><MemoryRouter initialEntries={[`/applications?${parameter}=two`]}><ApplicationsPage /></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>);
  expect(await screen.findByText("Exact role")).toBeVisible();
  expect(screen.queryByText("First role")).not.toBeInTheDocument();
  expect(within(screen.getByRole("status")).getByText("Showing the linked application record.")).toBeVisible();
  expect(save).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Show all applications" }));
  expect(await screen.findByText("First role")).toBeVisible();
});

it("shows an unavailable record honestly without selecting another application", async () => {
  const repo = new MemoryRepository();
  await repo.saveApplication({ company: "Synthetic", role: "Unrelated" });
  render(<QueryClientProvider client={new QueryClient()}><RepositoryContext.Provider value={{ repository: repo, ready: true, error: null }}><MemoryRouter initialEntries={["/applications?applicationId=missing"]}><ApplicationsPage /></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>);
  expect(await screen.findByText("This application record is not available.")).toBeVisible();
  expect(screen.queryByText("Unrelated")).not.toBeInTheDocument();
});

it("opens the due follow-up queue across status tabs using only explicit dates", async () => {
  const repo = new MemoryRepository();
  await repo.saveApplication({ company: "Synthetic", role: "Due interview", status: "interview", followUpDate: "2020-01-01" });
  await repo.saveApplication({ company: "Synthetic", role: "Old without date", status: "applied", createdAt: "2020-01-01T00:00:00Z" });
  render(<QueryClientProvider client={new QueryClient()}><RepositoryContext.Provider value={{ repository: repo, ready: true, error: null }}><MemoryRouter initialEntries={["/applications?followUps=due"]}><ApplicationsPage /></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>);
  expect(await screen.findByText("Due interview")).toBeVisible();
  expect(screen.queryByText("Old without date")).not.toBeInTheDocument();
});
