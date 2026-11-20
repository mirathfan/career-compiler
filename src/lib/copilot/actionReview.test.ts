import { describe, expect, it, vi } from "vitest";
import initSqlJs from "sql.js/dist/sql-asm.js";
import type Database from "@tauri-apps/plugin-sql";
import { MemoryRepository } from "../database/memoryRepository";
import { SqliteRepository } from "../database/sqliteRepository";
import { proposeJobNote, sendCareerCopilotMessage } from "./careerCopilot";
import { proposeCopilotUndo } from "./actionReview";

async function fixture(sqlite: boolean) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const adapter = {
    execute: async (sql: string, values: unknown[] = []) => { db.run(sql, values as (string | number | null)[]); return { rowsAffected: db.getRowsModified(), lastInsertId: 0 }; },
    select: async (sql: string, values: unknown[] = []) => {
      const statement = db.prepare(sql); statement.bind(values as (string | number | null)[]);
      const rows = []; while (statement.step()) rows.push(statement.getAsObject()); statement.free(); return rows;
    },
  } as unknown as Database;
  const repo = sqlite ? new SqliteRepository(adapter) : new MemoryRepository();
  await repo.initialize();
  const app = await repo.saveApplication({ company: "Example Studio", role: "Engineer", status: "preparing" });
  const propose = async () => (await sendCareerCopilotMessage(repo, { content: "Update this application to interview", activeContextType: "application", activeContextId: app.id })).assistantMessage.pendingActionsJson[0];
  return { repo, app, propose, close: () => db.close() };
}

describe.each([false, true])("reviewed status changes (SQLite: %s)", sqlite => {
  it("requires one explicit target instead of falling back to the first application", async () => {
    const f = await fixture(sqlite);
    try {
      const result = await sendCareerCopilotMessage(f.repo, { content: "Update this application to interview" });
      expect(result.assistantMessage.pendingActionsJson).toEqual([]);
      await f.repo.saveApplication({ company: "Example Studio", role: "Designer" });
      const ambiguous = await sendCareerCopilotMessage(f.repo, { content: "Mark Example Studio as interview" });
      expect(ambiguous.assistantMessage.pendingActionsJson).toEqual([]);
    } finally { f.close(); }
  });
  it("rejects stale, tampered, cancelled and replayed proposals without writing", async () => {
    const f = await fixture(sqlite);
    try {
      const action = await f.propose();
      await expect(f.repo.confirmCareerCopilotAction({ ...action, afterJson: { ...action.afterJson, status: "offer" } })).rejects.toThrow("changed");
      await f.repo.saveApplication({ ...f.app, status: "rejected" });
      await expect(f.repo.confirmCareerCopilotAction(action)).rejects.toThrow("changed after");
      const cancelled = await f.propose(); await f.repo.cancelCareerCopilotAction(cancelled);
      await expect(f.repo.confirmCareerCopilotAction(cancelled)).rejects.toThrow("no longer pending");
      expect((await f.repo.getApplication(f.app.id))?.status).toBe("rejected");
      const fresh = await f.propose(); await f.repo.confirmCareerCopilotAction(fresh);
      await expect(f.repo.confirmCareerCopilotAction(fresh)).rejects.toThrow("no longer pending");
    } finally { f.close(); }
  });
  it("reviews undo separately, preserves notes, and prevents duplicate undo", async () => {
    const f = await fixture(sqlite);
    try {
      const action = await f.propose();
      expect((await f.repo.getApplication(f.app.id))?.status).toBe("preparing");
      await f.repo.confirmCareerCopilotAction(action);
      const message = await proposeCopilotUndo(f.repo, action);
      expect((await f.repo.getApplication(f.app.id))?.status).toBe("interview");
      await expect(proposeCopilotUndo(f.repo, action)).rejects.toThrow("already exists");
      await f.repo.confirmCareerCopilotAction(message.pendingActionsJson[0]);
      expect((await f.repo.getApplication(f.app.id))?.status).toBe("preparing");
      const messages = await f.repo.listCareerCopilotMessages(action.threadId);
      expect(messages.flatMap(m => m.pendingActionsJson).filter(a => a.status === "confirmed")).toHaveLength(2);
    } finally { f.close(); }
  });
});


describe.each([false, true])("reviewed job notes (SQLite: %s)", sqlite => {
  it("requires explicit context and bounded text, avoids duplicate proposals, cancels and reviews undo", async () => {
    const f = await fixture(sqlite);
    try {
      const job = await f.repo.saveJob({ company: "Example Notes", roleTitle: "Engineer", rawDescription: "Synthetic description" });
      const send = (content: string, threadId?: string) => sendCareerCopilotMessage(f.repo, { content, threadId, activeContextType: "job", activeContextId: job.id });
      expect((await sendCareerCopilotMessage(f.repo, { content: "Set job note: example" })).assistantMessage.pendingActionsJson).toEqual([]);
      for (const content of ["Set job note: ", `Set job note: ${"x".repeat(4001)}`]) expect((await send(content)).assistantMessage.pendingActionsJson).toEqual([]);
      await expect(send(" ")).rejects.toThrow("Enter a message");
      const text = "User supplied note.\nAsk about team scope.  ";
      const turn = await send(`Set job note: ${text}`);
      const action = turn.assistantMessage.pendingActionsJson[0];
      expect(action.afterJson.notes).toBe(text);
      expect((await f.repo.getJob(job.id))?.notes).toBe("");
      expect((await send(`Set job note: ${text}`, turn.thread.id)).assistantMessage.pendingActionsJson).toEqual([]);
      await f.repo.cancelCareerCopilotAction(action);
      expect((await f.repo.getJob(job.id))?.notes).toBe("");
      await expect(f.repo.confirmCareerCopilotAction(action)).rejects.toThrow("no longer pending");
      const fresh = (await send(`Set job note: ${text}`, turn.thread.id)).assistantMessage.pendingActionsJson[0];
      await f.repo.confirmCareerCopilotAction(fresh);
      expect((await f.repo.getJob(job.id))?.notes).toBe(text);
      expect((await send(`Set job note: ${text}`, turn.thread.id)).assistantMessage.pendingActionsJson).toEqual([]);
      await expect(f.repo.confirmCareerCopilotAction(fresh)).rejects.toThrow("no longer pending");
      const undo = await proposeCopilotUndo(f.repo, fresh);
      expect((await f.repo.getJob(job.id))?.notes).toBe(text);
      await expect(proposeCopilotUndo(f.repo, fresh)).rejects.toThrow("already exists");
      await f.repo.confirmCareerCopilotAction(undo.pendingActionsJson[0]);
      expect((await f.repo.getJob(job.id))?.notes).toBe("");
      expect((await f.repo.getJob(job.id))?.rawDescription).toBe(job.rawDescription);
      expect((await f.repo.listCareerCopilotMessages(turn.thread.id)).flatMap(m => m.pendingActionsJson).filter(a => a.status === "confirmed")).toHaveLength(2);
    } finally { f.close(); }
  });
  it("rejects wrong targets, changed jobs, stale undo and missing jobs", async () => {
    const f = await fixture(sqlite);
    try {
      const job = await f.repo.saveJob({ company: "Example Notes", rawDescription: "Synthetic", notes: "Original" });
      const other = await f.repo.saveJob({ company: "Example Other", rawDescription: "Synthetic" });
      const send = () => sendCareerCopilotMessage(f.repo, { content: "Set job note: Revised", activeContextType: "job", activeContextId: job.id });
      const turn = await send(); const action = turn.assistantMessage.pendingActionsJson[0];
      await expect(f.repo.confirmCareerCopilotAction({ ...action, afterJson: { ...action.afterJson, jobId: other.id } })).rejects.toThrow("changed");
      await expect(sendCareerCopilotMessage(f.repo, { content: "Set job note: Wrong", threadId: turn.thread.id, activeContextType: "job", activeContextId: other.id })).rejects.toThrow("different context");
      await f.repo.saveJob({ ...job, roleTitle: "Changed role" });
      await expect(f.repo.confirmCareerCopilotAction(action)).rejects.toThrow("changed after");
      const fresh = (await send()).assistantMessage.pendingActionsJson[0];
      await f.repo.confirmCareerCopilotAction(fresh);
      await f.repo.saveJob({ ...(await f.repo.getJob(job.id))!, notes: "Later edit" });
      await expect(proposeCopilotUndo(f.repo, fresh)).rejects.toThrow("changed since");
      expect((await f.repo.getJob(other.id))?.notes).toBe("");
      await expect(sendCareerCopilotMessage(f.repo, { content: "Set job note: Note", activeContextType: "job", activeContextId: "missing" })).rejects.toThrow("record is missing");
    } finally { f.close(); }
  });
  it("cancels undo safely and rejects an undo if the job changes before acceptance", async () => {
    const f = await fixture(sqlite);
    try {
      const job = await f.repo.saveJob({ rawDescription: "Synthetic", notes: "Before" });
      const action = (await sendCareerCopilotMessage(f.repo, { content: "Set job note: After", activeContextType: "job", activeContextId: job.id })).assistantMessage.pendingActionsJson[0];
      await f.repo.confirmCareerCopilotAction(action);
      const cancelled = await proposeCopilotUndo(f.repo, action);
      await f.repo.cancelCareerCopilotAction(cancelled.pendingActionsJson[0]);
      expect((await f.repo.getJob(job.id))?.notes).toBe("After");
      const undo = await proposeCopilotUndo(f.repo, action);
      await f.repo.saveJob({ ...(await f.repo.getJob(job.id))!, notes: "Later manual edit" });
      await expect(f.repo.confirmCareerCopilotAction(undo.pendingActionsJson[0])).rejects.toThrow("changed after");
      expect((await f.repo.getJob(job.id))?.notes).toBe("Later manual edit");
    } finally { f.close(); }
  });
  it("rejects guided no-op and invalid drafts without saving partial conversations", async () => {
    const f = await fixture(sqlite);
    try {
      const job = await f.repo.saveJob({rawDescription:"Synthetic",notes:"Existing"});
      const context = {activeContextType:"job" as const,activeContextId:job.id};
      for (const text of ["", "Existing", "x".repeat(4001)]) await expect(proposeJobNote(f.repo,{...context,text})).rejects.toThrow();
      expect(await f.repo.listCareerCopilotThreads(false)).toEqual([]);
      const turn = await proposeJobNote(f.repo,{...context,text:"  Exact text  "});
      expect(turn.assistantMessage.pendingActionsJson[0].afterJson.notes).toBe("  Exact text  ");
      expect((await f.repo.getJob(job.id))?.notes).toBe("Existing");
    } finally {f.close();}
  });
  it("rolls back interrupted proposal creation without leaving a partial conversation", async () => {
    const f = await fixture(sqlite);
    try {
      const job = await f.repo.saveJob({ rawDescription: "Synthetic" });
      const prototype = sqlite ? SqliteRepository.prototype : MemoryRepository.prototype;
      const original = prototype.saveCareerCopilotMessage;
      const fail = vi.spyOn(prototype, "saveCareerCopilotMessage").mockImplementation(async function (this: typeof f.repo, message) {
        if (message.role === "assistant") throw new Error("Interrupted response");
        return original.call(this, message);
      });
      try {
        await expect(sendCareerCopilotMessage(f.repo, { content: "Set job note: Example", activeContextType: "job", activeContextId: job.id })).rejects.toThrow("Interrupted response");
      } finally { fail.mockRestore(); }
      expect(await f.repo.listCareerCopilotThreads(false)).toEqual([]);
      expect((await f.repo.getJob(job.id))?.notes).toBe("");
    } finally { f.close(); }
  });
  it("rolls back interrupted acceptance and permits a safe retry", async () => {
    const f = await fixture(sqlite);
    try {
      const job = await f.repo.saveJob({ rawDescription: "Synthetic", notes: "Before" });
      const action = (await sendCareerCopilotMessage(f.repo, { content: "Set job note: After", activeContextType: "job", activeContextId: job.id })).assistantMessage.pendingActionsJson[0];
      const prototype = (sqlite ? SqliteRepository.prototype : MemoryRepository.prototype) as unknown as { replacePendingAction: () => Promise<void> };
      const fail = vi.spyOn(prototype, "replacePendingAction").mockRejectedValueOnce(new Error("Injected interruption"));
      try { await expect(f.repo.confirmCareerCopilotAction(action)).rejects.toThrow("Injected interruption"); } finally { fail.mockRestore(); }
      expect((await f.repo.getJob(job.id))?.notes).toBe("Before");
      expect((await f.repo.listCareerCopilotMessages(action.threadId)).flatMap(m => m.pendingActionsJson)[0].status).toBe("pending");
      await f.repo.confirmCareerCopilotAction(action);
      expect((await f.repo.getJob(job.id))?.notes).toBe("After");
    } finally { f.close(); }
  });
});
