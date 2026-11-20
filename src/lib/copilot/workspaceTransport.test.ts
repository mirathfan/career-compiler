import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { OpenAIProvider } from "../ai/openAIProvider";
import type { WorkspaceRequest } from "./workspaceContract";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
it("uses existing structured transport with an exact bounded allowlist and no hidden context", async () => {
  const provider = new OpenAIProvider(); const request: WorkspaceRequest = { job: { id: "job-1", contentHash: "hash" }, phase: "plan", question: "Which record?", catalog: [{ tool: "get_job", id: "job-1", label: "Synthetic role" }], records: [], budgetAttemptId: "attempt-1" };
  vi.mocked(invoke).mockResolvedValue({ outputText: JSON.stringify({ calls: [{ tool: "get_job", ids: ["job-1"] }] }), durationMs: 1, inputTokens: 1, outputTokens: 1, totalTokens: 2 });
  const result = await provider.converseWorkspace({ request, modelName: "configured" }); expect(result.data.phase).toBe("plan");
  expect(invoke).toHaveBeenCalledWith("run_openai_structured", expect.objectContaining({ request: expect.objectContaining({ requestType: "career_copilot", input: request, schemaName: "career_workspace_plan_v1" }) }));
  await expect(provider.converseWorkspace({ request: { ...request, secret: "private" } as WorkspaceRequest, modelName: "configured" })).rejects.toThrow(); expect(invoke).toHaveBeenCalledTimes(1);
});

it("uses the existing capped transport for synthesis without adding hidden records or a new command", async () => {
  vi.mocked(invoke).mockClear();
  const provider = new OpenAIProvider();
  const request: WorkspaceRequest = { job: { id: "job-1", contentHash: "hash" }, phase: "answer", question: "Explain the reviewed result", catalog: [{ tool: "get_job", id: "job-1", label: "Synthetic" }], records: [], responseStyle: "synthesis", synthesisEvidence: [{ id: "e0", category: "answer", subjectId: "job-1", required: true, variants: ["The selected job needs eligibility confirmation."], sources: [{ type: "job", id: "job-1", label: "Synthetic" }] }], budgetAttemptId: "attempt-1" };
  vi.mocked(invoke).mockResolvedValue({ outputText: JSON.stringify({ status: "answered", answer: [{ text: request.synthesisEvidence![0].variants[0], evidenceId: "e0" }], uncertainties: [], nextSteps: [] }), durationMs: 1, inputTokens: 1, outputTokens: 1, totalTokens: 2 });
  const result = await provider.converseWorkspace({ request, modelName: "configured" }); expect(result.data.phase).toBe("answer");
  expect(invoke).toHaveBeenCalledWith("run_openai_structured", expect.objectContaining({ request: expect.objectContaining({ requestType: "career_copilot", input: request, schemaName: "career_workspace_quotes_v1" }) }));
  expect(vi.mocked(invoke).mock.calls[0][1]).not.toHaveProperty("key");
  await expect(provider.converseWorkspace({ request: { ...request, privateProfile: {} } as WorkspaceRequest, modelName: "configured" })).rejects.toThrow(); expect(invoke).toHaveBeenCalledTimes(1);
});

it("uses a strict optional skill-suggestion response without sending profile fields or new native commands", async () => {
  vi.mocked(invoke).mockClear();
  const provider = new OpenAIProvider();
  const request: WorkspaceRequest = { job: { id: "job-1", contentHash: "hash" }, phase: "answer", question: "Add LangGraph to my profile.", catalog: [{ tool: "get_career_fact", id: "fact", label: "AURA" }], records: [], allowProfileSkillProposal: true };
  const output = { answer: { insufficient: true, quotes: [] }, profileSkillProposal: { operation: "add_evidence_backed_profile_skill", skillName: "LangGraph", evidenceIds: ["fact"] } };
  vi.mocked(invoke).mockResolvedValue({ outputText: JSON.stringify(output), durationMs: 1, inputTokens: 1, outputTokens: 1, totalTokens: 2 });
  const result = await provider.converseWorkspace({ request, modelName: "configured" }); expect(result.data).toMatchObject({ phase: "answer", ...output });
  expect(invoke).toHaveBeenCalledWith("run_openai_structured", expect.objectContaining({ request: expect.objectContaining({ input: request, requestType: "career_copilot", schemaName: "career_workspace_quotes_v1" }) }));
  await expect(provider.converseWorkspace({ request: { ...request, profile: { fullName: "SECRET" } } as WorkspaceRequest, modelName: "configured" })).rejects.toThrow(); expect(invoke).toHaveBeenCalledTimes(1);
  vi.mocked(invoke).mockResolvedValue({ outputText: JSON.stringify({ ...output, profileSkillProposal: { ...output.profileSkillProposal, sql: "DELETE FROM profile" } }), durationMs: 1 });
  await expect(provider.converseWorkspace({ request, modelName: "configured" })).rejects.toThrow("structured schema");
});

it("accepts only the restricted opt-in bullet suggestion through the unchanged native command", async () => {
  vi.mocked(invoke).mockClear();
  const provider = new OpenAIProvider();
  const request: WorkspaceRequest = { job:{id:"job",contentHash:"hash"},phase:"answer",question:"Improve my selected bullet.",catalog:[],records:[],allowResumeBulletProposal:true };
  const proposal = { operation:"revise_resume_bullet",evidenceId:"fact",replacementText:"Built AURA using LangGraph." };
  vi.mocked(invoke).mockResolvedValue({ outputText:JSON.stringify({answer:{insufficient:true,quotes:[]},resumeBulletProposal:proposal}),durationMs:1 });
  expect((await provider.converseWorkspace({request,modelName:"configured"})).data).toMatchObject({resumeBulletProposal:proposal});
  expect(invoke).toHaveBeenCalledWith("run_openai_structured",expect.objectContaining({request:expect.objectContaining({input:request,requestType:"career_copilot"})}));
  vi.mocked(invoke).mockResolvedValue({ outputText:JSON.stringify({answer:{insufficient:true,quotes:[]},resumeBulletProposal:{...proposal,sourceId:"model-target"}}),durationMs:1 });
  await expect(provider.converseWorkspace({request,modelName:"configured"})).rejects.toThrow("structured schema");
  await expect(provider.converseWorkspace({request:{...request,allowProfileSkillProposal:true},modelName:"configured"})).rejects.toThrow("one proposed action");
});
