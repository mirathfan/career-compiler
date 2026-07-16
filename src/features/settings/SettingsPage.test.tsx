import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../../App";
import { RepositoryProvider } from "../../lib/database/RepositoryProvider";

function renderAt(route: string) {
  window.location.hash = route;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RepositoryProvider>
        <Suspense fallback={<div>Opening CareerCompiler...</div>}>
          <App />
        </Suspense>
      </RepositoryProvider>
    </QueryClientProvider>,
  );
}

describe("profile-required setup pages", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "";
  });

  it("keeps Settings navigable before a profile exists", async () => {
    renderAt("#/settings");

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Set up Career Memory first" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Career Memory" })).toHaveAttribute("href", "#/career-memory");
  });

  it("keeps Evaluation Lab navigable before a profile exists", async () => {
    renderAt("#/evaluation");

    expect(await screen.findByRole("heading", { name: "Evaluation Lab" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Set up Career Memory first" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Career Memory" })).toHaveAttribute("href", "#/career-memory");
  });
});
