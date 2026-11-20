import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { App } from "../App";
import { RepositoryContext } from "../lib/database/repositoryContext";
import { MemoryRepository } from "../lib/database/memoryRepository";

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "#/dashboard";
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
});

function renderWorkspace() {
  return render(<QueryClientProvider client={new QueryClient()}>
    <RepositoryContext.Provider value={{ repository: new MemoryRepository(), ready: true, error: null }}><Suspense fallback={<div>Opening workspace…</div>}><App /></Suspense></RepositoryContext.Provider>
  </QueryClientProvider>);
}

it("finds destinations by task, navigates with the keyboard, and closes", async () => {
  const user = userEvent.setup();
  renderWorkspace();
  await user.click(await screen.findByRole("button", { name: "Go to a screen" }));
  const dialog = screen.getByRole("dialog");
  const search = within(dialog).getByRole("textbox", { name: "Find a screen" });
  expect(search).toHaveFocus();
  await user.type(search, "salary");
  expect(within(dialog).getByRole("button", { name: /My profile data/ })).toBeInTheDocument();
  await user.keyboard("{ArrowDown}{Enter}");
  await waitFor(() => expect(window.location.hash).toBe("#/profile"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("opens with the shortcut, handles no results, and cancels without navigating", async () => {
  const user = userEvent.setup();
  renderWorkspace();
  await screen.findByRole("button", { name: "Go to a screen" });
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByRole("textbox"), "zzzzzzzz");
  expect(within(dialog).getByText(/No screens match/)).toBeInTheDocument();
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(window.location.hash).toBe("#/dashboard");
});

it("skips navigation without changing the hash-router route", async () => {
  const user = userEvent.setup();
  renderWorkspace();
  await screen.findByRole("button", { name: "Go to a screen" });
  await user.click(screen.getByRole("link", { name: "Skip to content" }));
  expect(window.location.hash).toBe("#/dashboard");
  expect(screen.getByRole("main")).toHaveFocus();
});
