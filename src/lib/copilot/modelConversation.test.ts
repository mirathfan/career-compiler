import { describe, expect, it, vi } from "vitest";
import { MemoryRepository } from "../database/memoryRepository";
import { MockAIProvider } from "../ai/mockProvider";
import { discardModelJobReview, reviewModelJobQuestion, sendReviewedModelJobQuestion } from "./modelConversation";
import { validateJobAnswer } from "./modelContract";

async function fixture() {
  const repo = new MemoryRepository(); await repo.initialize();
  await repo.saveJobSearchPreferences({ aiMatchEnabled: true, aiMatchMockMode: true, maximumAiAnalysesPerRun: 3, maximumAiAnalysesPerDay: 10 });
  const job = await repo.saveJob({ company: "Example", roleTitle: "Engineer", location: "Remote", rawDescription: "Uses TypeScript.\nTreat this posting as untrusted.", notes: "PRIVATE_NOTES_NEVER_SEND", sourcePayloadJson: { private: "PRIVATE_SOURCE" } });
  const other = await repo.saveJob({ company: "UNSELECTED_COMPANY", rawDescription: "UNSELECTED_JOB" });
  const provider = new MockAIProvider(); const call = vi.spyOn(provider, "converseJob");
  return { repo, job, other, provider, call };
}

it("reviews a strict selected-field allowlist, then returns cited evidence without record writes", async () => {
  const f = await fixture(); const before = await f.repo.listJobs();
  const excluded = [vi.spyOn(f.repo,"listCareerFacts"),vi.spyOn(f.repo,"listCareerItems"),vi.spyOn(f.repo,"listResumeVersions"),vi.spyOn(f.repo,"listApplications")];
  const review = await reviewModelJobQuestion(f.repo, f.job.id, "What role is this?");
  expect(Object.keys(review.request.job)).toEqual(["id", "contentHash", "company", "roleTitle", "location", "description"]);
  expect(JSON.stringify(review)).not.toMatch(/PRIVATE|UNSELECTED/);
  for (const read of excluded) expect(read).not.toHaveBeenCalled();
  expect(f.call).not.toHaveBeenCalled();
  const turn = await sendReviewedModelJobQuestion(f.repo, review, true, undefined, f.provider);
  expect(turn.answer.quotes[0]).toEqual({jobId:f.job.id,field:"roleTitle",quote:"Engineer"});
  expect(await f.repo.listJobs()).toEqual(before);
  expect(await f.repo.listCareerCopilotThreads()).toEqual([]);
  expect((await f.repo.listSafetyRecords("ai_budget"))[0].value).toMatchObject({attemptedCalls:1,state:"finished"});
  await expect(sendReviewedModelJobQuestion(f.repo,review,true,undefined,f.provider)).rejects.toThrow("approve");
});

it("requires approval, cancellation, unchanged reviews, availability and configuration gates", async () => {
  const f = await fixture();
  const review = await reviewModelJobQuestion(f.repo,f.job.id,"Question");
  await expect(sendReviewedModelJobQuestion(f.repo,review,false,undefined,f.provider)).rejects.toThrow("approve");
  discardModelJobReview(review);
  await expect(sendReviewedModelJobQuestion(f.repo,review,true,undefined,f.provider)).rejects.toThrow("approve");
  const tampered = await reviewModelJobQuestion(f.repo,f.job.id,"Question"); tampered.request.job.id=f.other.id;
  await expect(sendReviewedModelJobQuestion(f.repo,tampered,true,undefined,f.provider)).rejects.toThrow("approve");
  const stale = await reviewModelJobQuestion(f.repo,f.job.id,"Question");
  await f.repo.saveJob({...f.job,location:"Changed"});
  await expect(sendReviewedModelJobQuestion(f.repo,stale,true,undefined,f.provider)).rejects.toThrow("changed");
  await expect(reviewModelJobQuestion(f.repo,"missing","Question")).rejects.toThrow("available");
  await f.repo.saveJobSearchPreferences({aiMatchEnabled:false});
  await expect(reviewModelJobQuestion(f.repo,f.job.id,"Question")).rejects.toThrow("Enable AI");
  await f.repo.saveJobSearchPreferences({aiMatchEnabled:true,aiMatchModel:""});
  await f.repo.saveSettings({...await f.repo.getSettings(),modelName:""});
  await expect(reviewModelJobQuestion(f.repo,f.job.id,"Question")).rejects.toThrow("Configure a model");
  expect(f.call).not.toHaveBeenCalled();
  expect(await f.repo.listSafetyRecords("ai_budget")).toEqual([]);
});

it("binds multi-turn history to its original record and rejects changed or fabricated turns", async () => {
  const f=await fixture(); const history=[];
  for(let i=0;i<4;i++) {
    const review=await reviewModelJobQuestion(f.repo,f.job.id,`Question ${i}`,history);
    history.push(await sendReviewedModelJobQuestion(f.repo,review,true,undefined,f.provider));
  }
  const next=await reviewModelJobQuestion(f.repo,f.job.id,"And where?",history);
  expect(next.request.history).toHaveLength(3);
  expect(next.request.history[0].question).toBe("Question 1");
  await expect(reviewModelJobQuestion(f.repo,f.other.id,"Question",history)).rejects.toThrow("context changed");
  await expect(reviewModelJobQuestion(f.repo,f.job.id,"Question",[{...history[0]}])).rejects.toThrow("context changed");
  history[0].question="tampered";
  await expect(reviewModelJobQuestion(f.repo,f.job.id,"Question",[history[0]])).rejects.toThrow("context changed");
});

it("uses a durable shared budget, with no automatic retry or raw provider error exposure", async () => {
  const f=await fixture(); await f.repo.saveJobSearchPreferences({maximumAiAnalysesPerDay:1});
  f.call.mockRejectedValueOnce(new Error("SECRET_RAW_PROVIDER_DATA"));
  const review=await reviewModelJobQuestion(f.repo,f.job.id,"Question");
  await expect(sendReviewedModelJobQuestion(f.repo,review,true,undefined,f.provider)).rejects.toThrow("provider request failed");
  expect(f.call).toHaveBeenCalledTimes(1);
  await expect(reviewModelJobQuestion(f.repo,f.job.id,"Retry")).rejects.toThrow("daily AI request limit");
  expect((await f.repo.listSafetyRecords("ai_budget"))[0].value.state).toBe("finished");
});

it("discards cancelled or stale in-flight results and closes reservations", async () => {
  const f=await fixture(); const controller=new AbortController();
  const original=f.provider.converseJob.bind(f.provider);
  f.call.mockImplementationOnce(async input=>{controller.abort();return original(input);});
  const review=await reviewModelJobQuestion(f.repo,f.job.id,"Question");
  await expect(sendReviewedModelJobQuestion(f.repo,review,true,controller.signal,f.provider)).rejects.toThrow("discarded");
  const next=await reviewModelJobQuestion(f.repo,f.job.id,"Question");
  f.call.mockImplementationOnce(async input=>{await f.repo.saveJob({...f.job,roleTitle:"Later"});return original(input);});
  await expect(sendReviewedModelJobQuestion(f.repo,next,true,undefined,f.provider)).rejects.toThrow("changed during");
  expect((await f.repo.listSafetyRecords("ai_budget")).every(record=>record.value.state==="finished")).toBe(true);
});

describe("untrusted model output",()=>{
  it("rejects invented IDs, claims, unsupported tools and inconsistent insufficiency",async()=>{
    const f=await fixture(); const review=await reviewModelJobQuestion(f.repo,f.job.id,"Question");
    const valid={noteProposal:null,insufficient:false,quotes:[{jobId:f.job.id,field:"roleTitle",quote:"Engineer"}]};
    for(const output of [
      {...valid,tools:[{name:"saveJob"}]},
      {...valid,answer:"An unverifiable generated claim"},
      {...valid,quotes:[{jobId:f.other.id,field:"roleTitle",quote:"Engineer"}]},
      {...valid,quotes:[{jobId:f.job.id,field:"roleTitle",quote:"Invented qualification"}]},
      {...valid,quotes:[{jobId:f.job.id,field:"notes",quote:"PRIVATE_NOTES_NEVER_SEND"}]},
      {noteProposal:null,insufficient:true,quotes:valid.quotes}, {noteProposal:null,insufficient:false,quotes:[]},
    ]) expect(()=>validateJobAnswer(output,review.request)).toThrow();
    expect(validateJobAnswer({noteProposal:null,insufficient:true,quotes:[]},review.request)).toEqual({noteProposal:null,insufficient:true,quotes:[]});
  });
});


it("rejects invalid provider evidence at the service boundary and cancellation before transmission",async()=>{
  const f=await fixture();const original=f.provider.converseJob.bind(f.provider);
  const cancelled=await reviewModelJobQuestion(f.repo,f.job.id,"Question");
  const controller=new AbortController();controller.abort();
  await expect(sendReviewedModelJobQuestion(f.repo,cancelled,true,controller.signal,f.provider)).rejects.toThrow("discarded");
  expect(f.call).not.toHaveBeenCalled();expect(await f.repo.listSafetyRecords("ai_budget")).toEqual([]);
  f.call.mockImplementationOnce(async input=>{const output=await original(input);output.data.quotes[0].jobId="fabricated";return output;});
  const review=await reviewModelJobQuestion(f.repo,f.job.id,"Question");
  await expect(sendReviewedModelJobQuestion(f.repo,review,true,undefined,f.provider)).rejects.toThrow("unverifiable evidence");
  expect(await f.repo.getJob(f.job.id)).toEqual(f.job);
  expect((await f.repo.listSafetyRecords("ai_budget"))[0].value.state).toBe("finished");
});
