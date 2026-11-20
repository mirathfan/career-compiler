import { parseHistoryFile, previewHistoryImport, executeHistoryImport } from "../lib/applications/historyImport";
import { historyFixtures } from "../lib/applications/historyFixtures";
import { profileSkillFixture } from "./profileSkillFixture";
import type { AppRepository } from "../lib/database/repository";
import { sendCareerCopilotMessage } from "../lib/copilot/careerCopilot";

export async function applicationActionFixture(sqlite = false) {
  const f = await profileSkillFixture(sqlite); let repo: AppRepository = f.repo;
  const original = (await repo.getApplication(f.application.id))!;
  await repo.deleteApplication(original.id);
  const row = { ...JSON.parse(historyFixtures[0].text).records[0], employer: "Synthetic Company", role: "Engineer", appliedAt: "", postingUrl: "https://example.invalid/synthetic-tracker", requisition: "synthetic-tracker" };
  const draft = await parseHistoryFile("synthetic-tracker.json", JSON.stringify({ schema: "cc-synthetic-history-v1", synthetic: true, namespace: "sprint4-1-synthetic", records: [row] }));
  const choices = { [draft.rows[0].reviewId]: { action: "new" as const } };
  const preview = await previewHistoryImport(repo, draft, choices);
  await executeHistoryImport(repo, draft, choices, preview.reviewFingerprint, true);
  const app = (await repo.listApplications())[0];
  await repo.saveApplication({ ...app, jobId: f.job.id, nextAction: "Review saved evidence", followUpDate: "", submittedResumeVersionId: original.submittedResumeVersionId, submittedPdfHash: original.submittedPdfHash });
  const send = (content: string, threadId?: string, applicationId: string | null = app.id) => sendCareerCopilotMessage(repo, { content, threadId, ...(!threadId ? { activeContextType: applicationId ? "application" as const : "all" as const, activeContextId: applicationId ?? "" } : {}) });
  const propose = async (content = "Set my next action to follow up with the recruiter on 2026-11-20.", threadId?: string) => (await send(content, threadId)).assistantMessage.pendingActionsJson[0];
  return { ...f, get repo() { return repo; }, appId: app.id, send, propose, reopen: async () => { repo = await f.reopen(); return repo; } };
}
