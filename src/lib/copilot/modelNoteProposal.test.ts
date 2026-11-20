import { describe, expect, it, vi } from "vitest";
import initSqlJs from "sql.js/dist/sql-asm.js";
import type Database from "@tauri-apps/plugin-sql";
import { MemoryRepository } from "../database/memoryRepository";
import { SqliteRepository } from "../database/sqliteRepository";
import { MockAIProvider } from "../ai/mockProvider";
import { reviewModelJobQuestion, sendReviewedModelJobQuestion, reviewModelNoteProposal } from "./modelConversation";
import { proposeCopilotUndo } from "./actionReview";
import { validateJobAnswer } from "./modelContract";

async function fixture(sqlite: boolean) {
  const SQL=await initSqlJs();const db=new SQL.Database();
  const adapter={execute:async(sql:string,values:unknown[]=[])=>{db.run(sql,values as (string|number|null)[]);return {rowsAffected:db.getRowsModified(),lastInsertId:0};},select:async(sql:string,values:unknown[]=[])=>{const statement=db.prepare(sql);statement.bind(values as (string|number|null)[]);const rows=[];while(statement.step())rows.push(statement.getAsObject());statement.free();return rows;}} as unknown as Database;
  const repo=sqlite?new SqliteRepository(adapter):new MemoryRepository();await repo.initialize();
  await repo.saveJobSearchPreferences({aiMatchEnabled:true,aiMatchMockMode:true,maximumAiAnalysesPerDay:10});
  const job=await repo.saveJob({company:"Example",roleTitle:"Engineer",rawDescription:"Synthetic posting",notes:"Private original"});
  const provider=new MockAIProvider();
  provider.converseJob=async()=>({data:{insufficient:true,quotes:[],noteProposal:{type:"set_job_note",jobId:job.id,text:"Ask about team scope."}},metadata:{provider:"mock",model:"mock",requestType:"career_copilot",success:true,durationMs:0,inputTokens:null,outputTokens:null,totalTokens:null,errorCode:""}});
  const suggest=async()=>{const review=await reviewModelJobQuestion(repo,job.id,"Please set my note to: Ask about team scope.",[],true);return sendReviewedModelJobQuestion(repo,review,true,undefined,provider);};
  return {repo,job,provider,suggest,close:()=>db.close()};
}

describe.each([false,true])("model note proposals (SQLite: %s)",sqlite=>{
  it("requires separate local review and acceptance, rejects replay, supports reviewed undo",async()=>{
    const f=await fixture(sqlite);
    try{
      const turn=await f.suggest();expect(await f.repo.getJob(f.job.id)).toEqual(f.job);
      expect(await f.repo.listCareerCopilotThreads(false)).toEqual([]);
      const pending=await reviewModelNoteProposal(f.repo,turn);const action=pending.assistantMessage.pendingActionsJson[0];
      expect(action.beforeJson.notes).toBe("Private original");expect(action.afterJson.notes).toBe("Ask about team scope.");
      expect(await f.repo.getJob(f.job.id)).toEqual(f.job);
      await expect(reviewModelNoteProposal(f.repo,turn)).rejects.toThrow("already reviewed");
      await f.repo.confirmCareerCopilotAction(action);
      expect((await f.repo.getJob(f.job.id))?.notes).toBe("Ask about team scope.");
      const undo=await proposeCopilotUndo(f.repo,action);
      expect((await f.repo.getJob(f.job.id))?.notes).toBe("Ask about team scope.");
      await f.repo.confirmCareerCopilotAction(undo.pendingActionsJson[0]);
      expect((await f.repo.getJob(f.job.id))?.notes).toBe("Private original");
    }finally{f.close();}
  });
  it("rejects altered or stale suggestions and cancels pending changes without job mutation",async()=>{
    const f=await fixture(sqlite);
    try{
      const turn=await f.suggest();
      await expect(reviewModelNoteProposal(f.repo,{...turn,jobId:"wrong"})).rejects.toThrow("unavailable");
      const results=await Promise.allSettled([reviewModelNoteProposal(f.repo,turn),reviewModelNoteProposal(f.repo,turn)]);
      expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
      const result=results[0];if(result.status!=="fulfilled")throw Error("Expected first review");
      await f.repo.cancelCareerCopilotAction(result.value.assistantMessage.pendingActionsJson[0]);
      expect(await f.repo.getJob(f.job.id)).toEqual(f.job);
      const stale=await f.suggest();await f.repo.saveJob({...f.job,roleTitle:"Changed"});
      await expect(reviewModelNoteProposal(f.repo,stale)).rejects.toThrow("changed");
    }finally{f.close();}
  });
  it("rolls back interrupted proposal persistence and allows review retry",async()=>{
    const f=await fixture(sqlite);
    try{
      const turn=await f.suggest();const prototype=sqlite?SqliteRepository.prototype:MemoryRepository.prototype;
      const fail=vi.spyOn(prototype,"saveCareerCopilotMessage").mockRejectedValueOnce(Error("Synthetic interruption"));
      try{await expect(reviewModelNoteProposal(f.repo,turn)).rejects.toThrow("Synthetic interruption");}finally{fail.mockRestore();}
      expect(await f.repo.listCareerCopilotThreads(false)).toEqual([]);
      expect(await f.repo.getJob(f.job.id)).toEqual(f.job);
      expect((await reviewModelNoteProposal(f.repo,turn)).assistantMessage.pendingActionsJson).toHaveLength(1);
    }finally{f.close();}
  });
});

it("rejects model proposals without opt-in, invented text, unknown actions and wrong targets",async()=>{
  const f=await fixture(false);
  try{
    const review=await reviewModelJobQuestion(f.repo,f.job.id,"Please save: Ask about team scope.");
    const base={insufficient:true,quotes:[],noteProposal:{type:"set_job_note",jobId:f.job.id,text:"Ask about team scope."}};
    expect(()=>validateJobAnswer(base,review.request)).toThrow("Unsupported");
    const allowed={...review.request,allowNoteProposal:true};
    for(const changes of [{text:"Invented achievement"},{jobId:"unknown"},{type:"delete_job"}])expect(()=>validateJobAnswer({...base,noteProposal:{...base.noteProposal,...changes}},allowed)).toThrow();
    await expect(sendReviewedModelJobQuestion(f.repo,review,true,undefined,f.provider)).rejects.toThrow("unsupported output");
    expect(await f.repo.getJob(f.job.id)).toEqual(f.job);
  }finally{f.close();}
});
