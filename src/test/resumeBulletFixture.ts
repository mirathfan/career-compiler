import { applicationActionFixture } from "./applicationActionFixture";
import { proposeLocalResumeBullet } from "../lib/copilot/resumeBulletActions";
import { sendCareerCopilotMessage } from "../lib/copilot/careerCopilot";
import type { ResumeBullet, TailoredResume } from "../types/domain";
export async function resumeBulletFixture(sqlite = false) {
  const f = await applicationActionFixture(sqlite);
  const repo = f.repo;
  await repo.saveProfile({ ...(await repo.getProfile())!, city: "Austin", region: "TX", phone: "555-0100", headline: "Software Engineer" });
  const master = (await repo.getResumeVersion("preserved-master"))!;
  const originalFact = await repo.saveCareerFact({ id: "original-aura", careerItemId: f.item.id, statement: "Built AURA using TypeScript.", skillTags: ["TypeScript"], enabled: true, evidenceStatus: "verified" });
  const bullet: ResumeBullet = { id: "aura-bullet", text: originalFact.statement, sourceFactIds: [originalFact.id], relevanceScore: 1, isUserEdited: false, included: true, locked: false, approved: true, rejected: false, generationSource: "deterministic", generationReason: "Synthetic original", keywordsAddressed: [], selectionReason: "Synthetic" };
  const content: TailoredResume = { ...master.contentJson, header: { ...master.contentJson.header, location: "Austin, TX", phone: "555-0100" }, sectionOrder: ["projects", "skills"], projects: [{ careerItemId: f.item.id, title: f.item.title, organization: f.item.organization, location: f.item.location, startDate: f.item.startDate, endDate: f.item.endDate, isCurrent: f.item.isCurrent, locked: false, bullets: [bullet, { ...bullet, id: "unrelated-locked", text: originalFact.statement, locked: true }] }] };
  const source = await repo.saveResumeVersion({ ...master, contentJson: content, resumeDocumentJson: undefined });
  const target = { sourceId: source.id, bulletId: bullet.id };
  const propose = async (threadId?: string) => {
    const id = await proposeLocalResumeBullet(f.repo, f.job.id, target, f.fact.id, threadId);
    return (await f.repo.listCareerCopilotMessages(id)).flatMap(m => m.pendingActionsJson).at(-1)!;
  };
  const send = (content: string, threadId: string) => sendCareerCopilotMessage(f.repo, { content, threadId, activeContextType: "job", activeContextId: f.job.id });
  return { ...f, get repo() { return f.repo; }, source, target, originalFact, propose, send };
}
