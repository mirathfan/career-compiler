import { resumeBulletFixture } from "./resumeBulletFixture";
import { sendCareerCopilotMessage } from "../lib/copilot/careerCopilot";
import { findPreparationPlan } from "../lib/copilot/preparationWorkflow";
export async function preparationFixture(sqlite = false) {
    const f = await resumeBulletFixture(sqlite);
    // The inherited reversal fixture deliberately includes a duplicate locked bullet.
    // Keep it preserved but excluded so this recommendation scenario starts with a valid résumé.
    const source = await f.repo.saveResumeVersion({ ...f.source, contentJson: { ...f.source.contentJson, projects: f.source.contentJson.projects.map(section => ({ ...section, bullets: section.bullets.map(b => b.locked ? { ...b, included: false } : b) })) }, resumeDocumentJson: undefined });
    const job = await f.repo.saveJob({ ...f.job, roleTitle: "AI Engineer", rawDescription: "Required skills: TypeScript and LangGraph. Build and test agent workflows.", descriptionText: "Required skills: TypeScript and LangGraph. Build and test agent workflows." });
    const historical = (await f.repo.getApplication(f.appId))!;
    await f.repo.saveApplication({ ...historical, jobId: "" });
    const app = await f.repo.saveApplication({ id: "preparation-application", jobId: job.id, company: job.company, role: job.roleTitle, status: "preparing", nextAction: "", followUpDate: "" });
    const send = (content: string, threadId?: string) => sendCareerCopilotMessage(f.repo, { content, threadId, activeContextType: "job", activeContextId: job.id });
    const plan = async () => { const result = await send("Help me prepare for this AI Engineer job. Check my profile, improve my résumé, and organize my next application step."); const plan = findPreparationPlan([result.assistantMessage]); return { ...result, plan }; };
    return { ...f, get repo() { return f.repo; }, source, job, app, send, plan };
}
