import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useJobMatchApproval } from "./useJobMatchApproval";
import { MemoryRepository } from "../lib/database/memoryRepository";
import { prepareBatchReview, type BatchReview } from "../lib/job-automation/batchReview";
import { MockAIProvider } from "../lib/ai/mockProvider";
import { runApprovedJobMatchBatch } from "../lib/job-automation/aiBatch";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(cleanup);
async function fixture() {
  const repository = new MemoryRepository(); await repository.initialize();
  await repository.saveJobSearchPreferences({ aiMatchEnabled: true, aiMatchMockMode: true, aiMatchMinimumDeterministicScore: 0 });
  await repository.saveCareerItem({ id: "parent", title: "Synthetic project", type: "project" });
  await repository.saveCareerFact({ id: "eligible", careerItemId: "parent", statement: "Built TypeScript software", skillTags: ["TypeScript"], evidenceStatus: "verified" });
  await repository.saveCareerFact({ id: "excluded", careerItemId: "parent", statement: "Private disabled evidence", evidenceStatus: "prohibited" });
  await repository.saveJob({ id: "job", company: "Synthetic", roleTitle: "Software Engineer", descriptionText: "TypeScript software", rawDescription: "TypeScript software", status: "matched" });
  await repository.saveJobMatch({ jobId: "job", deterministicScore: 80, combinedScore: 80 });
  return { repository, review: await prepareBatchReview(repository, { jobIds: ["job"] }) };
}
function Harness({ review, decision }: { review: BatchReview; decision: (approved: boolean) => void }) {
  const approval = useJobMatchApproval();
  return <><button onClick={async () => decision(await approval.request(review))}>Review batch</button>{approval.dialog}</>;
}
describe("actual in-app approval flow", () => {
  it("shows bounded evidence and explicitly approves execution without approving a package", async () => {
    const { repository, review } = await fixture(); const provider = new MockAIProvider(); const analyze = vi.spyOn(provider, "analyzeJobMatch");
    const decision = vi.fn(async approved => { if (approved) await runApprovedJobMatchBatch(repository, { jobIds: review.preview.jobIds, reviewedJobs: review.jobs, approved, trigger: "manual", provider }); });
    render(<Harness review={review} decision={decision} />); fireEvent.click(screen.getByText("Review batch"));
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    expect(screen.getByText("eligible")).toBeInTheDocument(); expect(screen.queryByText("excluded")).toBeNull(); expect(analyze).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Approve mock analysis"));
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect((await repository.getJobMatch("job"))?.aiScore).not.toBeNull());
    expect(await repository.listApplicationPackages()).toHaveLength(0);
  });
  it.each(["button", "escape", "unmount"])("%s cancels without a request", async method => {
    const { review } = await fixture(); const decision = vi.fn(); const view = render(<Harness review={review} decision={decision} />);
    fireEvent.click(screen.getByText("Review batch"));
    if (method === "button") fireEvent.click(screen.getByText("Cancel analysis"));
    if (method === "escape") fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
    if (method === "unmount") view.unmount();
    await waitFor(() => expect(decision).toHaveBeenCalledWith(false));
  });
});
