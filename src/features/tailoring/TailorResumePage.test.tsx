import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach } from "vitest";
import { App } from "../../App";
import { RepositoryProvider } from "../../lib/database/RepositoryProvider";

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RepositoryProvider>
        <App />
      </RepositoryProvider>
    </QueryClientProvider>,
  );
}

describe("main tailoring workflow", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("runs the mock provider workflow from sample job to generated resume", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /run safe seed/i }));
    await user.click(screen.getByRole("link", { name: /tailor resume/i }));

    await user.click(await screen.findByRole("button", { name: /use sample job/i }));
    await user.click(screen.getByRole("button", { name: /analyze job/i }));
    expect(await screen.findByText(/job analysis/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /score evidence/i }));
    expect(await screen.findByText(/resume plan/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /generate resume/i }));

    await waitFor(() => expect(screen.getByText(/resume editor/i)).toBeInTheDocument());
    expect(screen.getAllByText(/source facts:/i).length).toBeGreaterThan(0);
  });
});
