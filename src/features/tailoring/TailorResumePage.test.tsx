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

  it("lazy-loads the mock workflow and persists only after explicit save", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /run safe seed/i }));
    await user.click(screen.getByRole("link", { name: /tailor resume/i }));

    await user.click(await screen.findByRole("button", { name: /use sample job/i }));
    await user.click(screen.getByRole("button", { name: /analyze job/i }));
    expect(await screen.findByText(/job analysis/i)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("careercompiler-dev") ?? "{}").jobs).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /save job and score evidence/i }));
    expect(JSON.parse(localStorage.getItem("careercompiler-dev") ?? "{}").jobs).toHaveLength(1);
    expect(await screen.findByText(/tailoring controls/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /generate tailored resume/i }));

    await waitFor(() => expect(screen.getByText(/generation review/i)).toBeInTheDocument());
    expect(screen.getAllByText(/exact source facts/i).length).toBeGreaterThan(0);
    expect(localStorage.getItem("careercompiler-resume-draft-v3")).toContain("resume");

    await user.click(screen.getByRole("button", { name: /accept all/i }));
    const closeEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(closeEvent);
    expect(closeEvent.defaultPrevented).toBe(true);
  });
});
