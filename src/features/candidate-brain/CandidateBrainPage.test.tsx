import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../../App";
import { RepositoryProvider } from "../../lib/database/RepositoryProvider";

function renderApp() {
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

describe("Candidate Brain sensitive vault", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "#/dashboard";
  });

  it("locks the current draft value when the user clicks Lock immediately after typing", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /run safe seed/i }));
    await user.click(screen.getByRole("link", { name: "Candidate Brain" }));

    const sponsorship = await screen.findByLabelText("Future sponsorship requirement");
    await user.type(sponsorship, "No");
    const card = sponsorship.closest(".rounded-md");
    expect(card).toBeTruthy();
    await user.click(within(card as HTMLElement).getByRole("button", { name: "Lock" }));

    await waitFor(() => expect(sponsorship).toHaveAttribute("readonly"));
    expect(sponsorship).toHaveValue("No");

    const stored = JSON.parse(localStorage.getItem("careercompiler-dev") ?? "{}") as {
      sensitiveAnswers?: Array<{ key: string; locked: boolean; value: unknown }>;
    };
    expect(stored.sensitiveAnswers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "future_sponsorship",
          locked: true,
          value: "No",
        }),
      ]),
    );
  });
});
