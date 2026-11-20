import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { MemoryRepository } from "../../lib/database/memoryRepository";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import { MockAIProvider } from "../../lib/ai/mockProvider";
import { WorkspaceReadReview } from "./WorkspaceReadReview";
import { SynthesisResponse } from "./SynthesisResponse";

it("keeps scopes off, exposes a local fallback after failure, and renders a retried synthesis with keyboard-accessible details", async () => {
  const repo = new MemoryRepository(); await repo.initialize(); await repo.saveJobSearchPreferences({ aiMatchEnabled: true, aiMatchMockMode: true, maximumAiAnalysesPerDay: 10 });
  const job = await repo.saveJob({ company: "Synthetic", roleTitle: "Python Engineer", rawDescription: "Python required. Sponsorship may be considered case by case." });
  const item = await repo.saveCareerItem({ title: "Synthetic project", type: "project", enabled: true });
  const fact = await repo.saveCareerFact({ careerItemId: item.id, statement: "Built a Python API with tested request handling.", enabled: true, evidenceStatus: "verified", skillTags: ["Python"] });
  const original = MockAIProvider.prototype.converseWorkspace; let fail = true;
  const call = vi.spyOn(MockAIProvider.prototype, "converseWorkspace").mockImplementation(async function(this: MockAIProvider, input) { if (input.request.phase === "answer" && fail) { fail = false; throw new Error("Provider unavailable"); } return original.call(this, input); });
  const user = userEvent.setup(); const complete = vi.fn();
  const view = render(<RepositoryContext.Provider value={{ repository: repo, ready: true, error: null }}><WorkspaceReadReview jobId={job.id} messages={[]} onComplete={complete}/></RepositoryContext.Provider>);
  try {
    await user.click(screen.getByRole("button", { name: "Read across selected records" }));
    expect(screen.getByRole("checkbox", { name: /Compose a grounded/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /responsibility overlap/ })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Compose a grounded/ })); await user.click(screen.getByRole("checkbox", { name: /Use selected job and verified/ }));
    await user.click(screen.getByRole("checkbox", { name: "Saved jobs" })); await user.click(await screen.findByRole("checkbox", { name: "Synthetic · Python Engineer" }));
    await user.click(screen.getByRole("checkbox", { name: "Verified career evidence" })); await user.click(await screen.findByRole("checkbox", { name: fact.statement }));
    fireEvent.change(screen.getByLabelText("Connected workspace question"), { target: { value: "Which job should I prioritize?" } }); expect(call).not.toHaveBeenCalled();
    for (let attempt = 0; attempt < 2; attempt++) {
      await user.click(screen.getByRole("button", { name: "Review tool-selection request" })); await screen.findByLabelText("Exact connected outbound context");
      await user.click(screen.getByRole("button", { name: "Run reviewed workspace mock" })); await waitFor(() => expect(screen.getByLabelText("Exact connected outbound context").textContent).toContain('"synthesisEvidence"'));
      const send = screen.getByRole("button", { name: "Run reviewed workspace mock" }); send.focus(); await user.keyboard("{Enter}");
      if (!attempt) { expect(await screen.findByRole("alert")).toHaveTextContent("Provider unavailable"); expect(await repo.listCareerCopilotThreads()).toHaveLength(0); await user.click(screen.getByText("Review local results — no model explanation was saved")); expect(screen.getByRole("region", { name: "Deterministic career comparison" })).toBeVisible(); }
    }
    await waitFor(() => expect(complete).toHaveBeenCalledOnce()); expect(call).toHaveBeenCalledTimes(4);
    const messages = await repo.listCareerCopilotMessages(complete.mock.calls[0][0]); const data = messages[1].structuredContentJson.workspaceRead as { synthesis: unknown; synthesisEvidence: unknown };
    view.unmount(); const answer = render(<SynthesisResponse answer={data.synthesis} evidence={data.synthesisEvidence} mock/>);
    expect(screen.getByRole("region", { name: "Grounded conversational answer" })).toBeVisible(); expect(screen.getByText(/number 1/)).toBeVisible();
    await user.click(screen.getByText("Uncertainty and evidence limits")); expect(screen.getByText(/Employer sponsorship wording is ambiguous/)).toBeVisible(); expect(screen.getByText("Suggested next steps")).toBeVisible(); answer.unmount();
  } finally { view.unmount(); call.mockRestore(); }
});

it("shows verified empty/refusal states and rejects damaged saved explanations", () => {
  const empty = render(<SynthesisResponse answer={{ status: "insufficient", answer: [], uncertainties: [], nextSteps: [] }} evidence={[]} mock/>);
  expect(screen.getByRole("status")).toHaveTextContent("not enough permitted evidence"); empty.unmount();
  const refused = render(<SynthesisResponse answer={{ status: "refused", answer: [], uncertainties: [], nextSteps: [] }} evidence={[]} mock={false}/>);
  expect(screen.getByRole("status")).toHaveTextContent("declined"); refused.unmount();
  const bad = render(<SynthesisResponse answer={{ answer: "Guaranteed offer" }} evidence={[]} mock/>); expect(screen.getByRole("alert")).toHaveTextContent("could not be verified"); bad.unmount();
});
