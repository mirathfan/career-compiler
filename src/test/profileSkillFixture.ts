import type Database from "@tauri-apps/plugin-sql";
import initSqlJs from "sql.js/dist/sql-asm.js";
import { MemoryRepository } from "../lib/database/memoryRepository";
import { SqliteRepository } from "../lib/database/sqliteRepository";
import { sendCareerCopilotMessage } from "../lib/copilot/careerCopilot";
import type { TailoredResume } from "../types/domain";

export async function profileSkillFixture(sqlite = false) {
  const SQL = await initSqlJs(); let db = new SQL.Database();
  const adapter = {
    execute: async (sql: string, args: unknown[] = []) => { db.run(sql, args as never); return { rowsAffected: db.getRowsModified() }; },
    select: async (sql: string, args: unknown[] = []) => { const s = db.prepare(sql); s.bind(args as never); const rows = []; while (s.step()) rows.push(s.getAsObject()); s.free(); return rows; },
  } as unknown as Database;
  const repo = sqlite ? new SqliteRepository(adapter) : new MemoryRepository(); await repo.initialize();
  await repo.saveProfile({ id: "profile-fixture", fullName: "Synthetic Person", headline: "PRIVATE_HEADLINE", city: "", region: "", email: "private@example.invalid", phone: "", portfolioUrl: "", linkedInUrl: "", githubUrl: "", workAuthorizationNote: "PRIVATE_AUTH", updatedAt: "" });
  const item = await repo.saveCareerItem({ id: "aura", type: "project", title: "AURA", enabled: true });
  const fact = await repo.saveCareerFact({ id: "aura-langgraph", careerItemId: item.id, statement: "Built AURA agent orchestration using LangGraph.", skillTags: ["LangGraph"], evidenceStatus: "verified", enabled: true, sourceNote: "PRIVATE_NOTE", notes: "PRIVATE_FACT_NOTE" });
  await repo.saveSkill({ id: "typescript", name: "TypeScript", category: "Language" });
  const application = await repo.saveApplication({ company: "Synthetic Company", role: "Engineer", status: "applied", notes: "PRIVATE_APPLICATION" });
  await repo.saveJobSearchPreferences({ aiMatchEnabled: true, aiMatchMockMode: true, maximumAiAnalysesPerDay: 20 });
  const job = await repo.saveJob({ id: "skill-job", company: "Synthetic", roleTitle: "Engineer", rawDescription: "LangGraph experience." });
  const content: TailoredResume = { id: "synthetic-document", header: { fullName: "Synthetic Person", headline: "Engineer", location: "", email: "synthetic@example.invalid", phone: "", portfolioUrl: "", linkedInUrl: "", githubUrl: "", workAuthorizationNote: "" }, summary: [], education: [], experience: [], projects: [], skills: ["TypeScript"], sectionOrder: ["skills"], compactionActions: [], layout: { bodyFontSize: 10, spacingScale: 1, condensedSkills: false }, approvedWarningCodes: [] };
  const master = await repo.saveResumeVersion({ id: "preserved-master", jobId: job.id, name: "Synthetic Master", kind: "master", contentJson: content });
  const child = await repo.saveResumeVersion({ id: "preserved-child", jobId: job.id, name: "Synthetic Submitted", kind: "tailored", parentResumeVersionId: master.id, baseResumeVersionId: master.id, status: "exported", contentJson: content });
  await repo.saveApplication({ ...application, submittedResumeVersionId: child.id, submittedPdfHash: "synthetic-preserved-pdf-hash" });
  const send = (content: string, threadId?: string) => sendCareerCopilotMessage(repo, { content, threadId, activeContextType: "all", activeContextId: "" });
  const propose = async (threadId?: string) => (await send("Add LangGraph to my profile using AURA evidence.", threadId)).assistantMessage.pendingActionsJson[0];
  const reopen = async () => { const bytes = db.export(); db.close(); db = new SQL.Database(bytes); const next = new SqliteRepository(adapter); await next.initialize(); return next; };
  const removeProfile = () => db.run("DELETE FROM profile");
  return { repo, item, fact, application, job, send, propose, reopen, removeProfile, close: () => db.close() };
}
