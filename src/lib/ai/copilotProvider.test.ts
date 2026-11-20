import { beforeEach, expect, it, vi } from "vitest";
const { invokeMock } = vi.hoisted(()=>({invokeMock:vi.fn()}));
vi.mock("@tauri-apps/api/core",()=>({invoke:invokeMock}));
import { OpenAIProvider } from "./openAIProvider";
const request={budgetAttemptId:"synthetic-reservation",job:{id:"synthetic-job",contentHash:"synthetic-hash",company:"Example",roleTitle:"Engineer",location:"Remote",description:"Synthetic"},question:"What role?",history:[]};
beforeEach(()=>invokeMock.mockReset());
it("uses the real native structured provider path with the career_copilot budget request type",async()=>{
  invokeMock.mockResolvedValue({outputText:JSON.stringify({noteProposal:null,insufficient:false,quotes:[{jobId:"synthetic-job",field:"roleTitle",quote:"Engineer"}]}),durationMs:1,inputTokens:10,outputTokens:5,totalTokens:15});
  const answer=await new OpenAIProvider().converseJob({request,modelName:"configured-model"});
  expect(answer.metadata.provider).toBe("openai");
  expect(invokeMock).toHaveBeenCalledWith("run_openai_structured",{request:expect.objectContaining({requestType:"career_copilot",schemaName:"career_copilot_job_quotes_v1",input:request,model:"configured-model"})});
});
it("rejects malformed structured output and propagates native credential failure without retry",async()=>{
  invokeMock.mockResolvedValueOnce({outputText:'{"tools":["saveJob"]}',durationMs:1});
  await expect(new OpenAIProvider().converseJob({request,modelName:"configured-model"})).rejects.toThrow("schema");
  invokeMock.mockRejectedValueOnce("missing_api_key|No key configured");
  await expect(new OpenAIProvider().converseJob({request,modelName:"configured-model"})).rejects.toThrow("No key configured");
  expect(invokeMock).toHaveBeenCalledTimes(2);
});

it("connects approved selected-job service requests to OpenAI mode without exposing private fields",async()=>{
  const {MemoryRepository}=await import("../database/memoryRepository");
  const {reviewModelJobQuestion,sendReviewedModelJobQuestion}=await import("../copilot/modelConversation");
  const repo=new MemoryRepository();await repo.initialize();
  await repo.saveSettings({...await repo.getSettings(),aiProvider:"openai",modelName:"configured-model"});
  await repo.saveJobSearchPreferences({aiMatchEnabled:true,aiMatchMockMode:false,aiMatchModel:"",maximumAiAnalysesPerDay:10});
  const job=await repo.saveJob({company:"Example",roleTitle:"Engineer",rawDescription:"Synthetic",notes:"PRIVATE"});
  const review=await reviewModelJobQuestion(repo,job.id,"What role?");
  expect(review.provider).toBe("openai");expect(invokeMock).not.toHaveBeenCalled();
  invokeMock.mockResolvedValue({outputText:JSON.stringify({noteProposal:null,insufficient:false,quotes:[{jobId:job.id,field:"roleTitle",quote:"Engineer"}]}),durationMs:1,inputTokens:10,outputTokens:5,totalTokens:15});
  const turn=await sendReviewedModelJobQuestion(repo,review,true);
  expect(turn.provider).toBe("openai");
  expect(JSON.stringify(invokeMock.mock.calls)).not.toContain("PRIVATE");
  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(await repo.getJob(job.id)).toEqual(job);
});
