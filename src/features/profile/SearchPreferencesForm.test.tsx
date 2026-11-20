import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { MemoryRepository } from "../../lib/database/memoryRepository";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import { SearchPreferencesForm } from "./SearchPreferencesForm";

it("saves consistent job and profile preferences only after explicit submission", async () => {
  const repository = new MemoryRepository();
  const save = vi.spyOn(repository, "saveJobSearchPreferences");
  render(<QueryClientProvider client={new QueryClient()}><RepositoryContext.Provider value={{ repository, ready: true, error: null }}><MemoryRouter><SearchPreferencesForm /></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>);
  const user = userEvent.setup();
  const roles = await screen.findByRole("textbox", { name: /Target roles/ });
  await user.clear(roles);
  await user.type(roles, "Frontend Engineer, Product Engineer");
  const locations = screen.getByRole("textbox", { name: "Locations" });
  await user.clear(locations);
  await user.type(locations, "Chicago");
  expect(save).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Save preferences" }));
  await waitFor(() => expect(screen.getByText("Preferences saved")).toBeInTheDocument());
  expect((await repository.getJobSearchPreferences()).targetRoleTitles).toEqual(["Frontend Engineer", "Product Engineer"]);
  expect((await repository.getCandidatePreferences())?.targetRoles).toEqual(["Frontend Engineer", "Product Engineer"]);
  expect(await repository.listJobAutomationRuns()).toHaveLength(0);
});
