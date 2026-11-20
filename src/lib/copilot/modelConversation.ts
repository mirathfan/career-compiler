import { proposeJobNote } from "./careerCopilot";
import type { AppRepository } from "../database/repository";
import type { AIProvider } from "../ai/provider";
import { createAIProvider } from "../ai/providerFactory";
import { isIsolatedRuntime } from "../acceptance/runtime";
import { budgetUsage, reserveBudget, markMockAttempt, finishBudget } from "../job-automation/budget";
import { createId } from "../utils";
import { validateJobAnswer, type JobAnswer, type JobConversationRequest } from "./modelContract";

export interface ModelJobTurn { jobId: string; question: string; answer: JobAnswer; provider: "mock" | "openai"; model: string }
export interface ModelJobReview { request: JobConversationRequest; provider: "mock" | "openai"; model: string; dailyUsed: number; dailyLimit: number }
const reviews = new WeakMap<ModelJobReview, { serialized: string; binding: string; repo: AppRepository }>();
const turns = new WeakMap<ModelJobTurn, { serialized: string; binding: string; repo: AppRepository; proposalCreated?: boolean }>();

export async function modelJobContext(repo: AppRepository, jobId: string) {
  const [job, settings, preferences] = await Promise.all([repo.getJob(jobId), repo.getSettings(), repo.getJobSearchPreferences()]);
  if (!job || ["filtered_out", "rejected", "archived", "closed"].includes(job.status)) throw new Error("Select an available saved job before reviewing an AI question.");
  if (!preferences.aiMatchEnabled || preferences.maximumAiAnalysesPerRun < 1) throw new Error("Enable AI analysis and a nonzero per-run limit in Job Radar before using AI Q&A.");
  const model = preferences.aiMatchModel || settings.modelName;
  if (!model.trim()) throw new Error("Configure a model before using AI Q&A.");
  const provider = isIsolatedRuntime() || preferences.aiMatchMockMode || settings.aiProvider === "mock" ? "mock" as const : "openai" as const;
  // Explicit field allowlist. Never spread a job, career records, notes or old Copilot messages.
  const selected = { id: job.id, contentHash: job.contentHash, company: job.company, roleTitle: job.roleTitle, location: job.location, description: job.rawDescription.slice(0, 12000) };
  const binding = JSON.stringify({ selected, updatedAt: job.updatedAt, provider, model, preferences });
  return { selected, provider, model, binding, dailyLimit: preferences.maximumAiAnalysesPerDay };
}

export async function reviewModelJobQuestion(repo: AppRepository, jobId: string, question: string, history: ModelJobTurn[] = [], allowNoteProposal = false): Promise<ModelJobReview> {
  if (!question.trim() || question.length > 2000) throw new Error("Enter a question between 1 and 2,000 characters.");
  const current = await modelJobContext(repo, jobId);
  const previous = history.slice(-3).map(turn => {
    const receipt = turns.get(turn);
    if (turn.jobId !== jobId || !receipt || receipt.binding !== current.binding || receipt.serialized !== JSON.stringify(turn)) throw new Error("Conversation context changed. Start a new AI conversation.");
    const answer = validateJobAnswer(turn.answer, { job: current.selected, question: turn.question, history: [], allowNoteProposal: true });
    return { question: turn.question, answer: { ...answer, noteProposal: null } };
  });
  const usage = await budgetUsage(repo, new Date().toISOString().slice(0, 10));
  if (usage.reserved >= current.dailyLimit) throw new Error("The shared daily AI request limit has been reached.");
  const review: ModelJobReview = { request: { job: current.selected, question, history: previous, allowNoteProposal }, provider: current.provider, model: current.model, dailyUsed: usage.reserved, dailyLimit: current.dailyLimit };
  reviews.set(review, { serialized: JSON.stringify(review), binding: current.binding, repo });
  return review;
}

export function discardModelJobReview(review: ModelJobReview) { reviews.delete(review); }

export async function sendReviewedModelJobQuestion(repo: AppRepository, review: ModelJobReview, approved: boolean, signal?: AbortSignal, injectedProvider?: AIProvider): Promise<ModelJobTurn> {
  const receipt = reviews.get(review);
  if (!approved || !receipt || receipt.repo !== repo || receipt.serialized !== JSON.stringify(review)) throw new Error("Review and explicitly approve the unchanged AI request first.");
  reviews.delete(review); // Every approval is single-use, including failed attempts.
  const reviewed = JSON.parse(receipt.serialized) as ModelJobReview;
  const stopped = () => { if (signal?.aborted) throw new Error("AI response discarded. Any request already sent may still incur charges."); };
  stopped();
  const current = await modelJobContext(repo, reviewed.request.job.id);
  if (current.binding !== receipt.binding) throw new Error("Job or AI configuration changed. Review the request again.");
  const provider = injectedProvider ?? createAIProvider(current.provider);
  if (provider.mode !== current.provider || !provider.converseJob) throw new Error("The configured provider does not support selected-job Q&A.");
  const attemptId = createId("copilot-attempt");
  stopped();
  if (!await reserveBudget(repo, attemptId, current.selected.id, current.selected.contentHash, new Date().toISOString(), current.provider)) throw new Error("AI budget is exhausted or this job has an active request.");
  try {
    stopped();
    const latest = await modelJobContext(repo, current.selected.id);
    if (latest.binding !== receipt.binding) throw new Error("Job or AI configuration changed. Review the request again.");
    if (current.provider === "mock") await markMockAttempt(repo, attemptId);
    let output;
    try { output = await provider.converseJob({ request: { ...reviewed.request, budgetAttemptId: attemptId }, modelName: current.model }); }
    catch { throw new Error("The AI provider request failed. Check model/key configuration and connectivity, then review a new request. No job data was changed."); }
    stopped();
    if ((await modelJobContext(repo, current.selected.id)).binding !== receipt.binding) throw new Error("The job changed during the request. Response discarded; review fresh context.");
    let answer: JobAnswer;
    try { answer = validateJobAnswer(output.data, reviewed.request); }
    catch { throw new Error("The model returned unsupported output or unverifiable evidence. No answer was accepted."); }
    const turn: ModelJobTurn = { jobId: current.selected.id, question: reviewed.request.question, answer, provider: current.provider, model: current.model };
    turns.set(turn, { serialized: JSON.stringify(turn), binding: current.binding, repo });
    return turn;
  } finally { await finishBudget(repo, attemptId); }
}


// Model output can only become a pending local proposal. No job mutation occurs here.
export async function reviewModelNoteProposal(repo: AppRepository, turn: ModelJobTurn) {
  const receipt = turns.get(turn);
  if (!receipt || receipt.repo !== repo || receipt.proposalCreated || receipt.serialized !== JSON.stringify(turn) || !turn.answer.noteProposal) throw new Error("This model suggestion is unavailable, changed or already reviewed.");
  const snapshot = JSON.parse(receipt.serialized) as ModelJobTurn;
  receipt.proposalCreated = true; // Synchronous ownership prevents concurrent duplicate reviews.
  try {
    return await repo.transaction(async tx => {
      const current = await modelJobContext(tx, snapshot.jobId);
      if (current.binding !== receipt.binding) throw new Error("The selected job or settings changed. Request a fresh model suggestion.");
      validateJobAnswer(snapshot.answer, { job: current.selected, question: snapshot.question, history: [], allowNoteProposal: true });
      return proposeJobNote(tx, { activeContextType: "job", activeContextId: snapshot.jobId, text: snapshot.answer.noteProposal!.text });
    });
  } catch (error) { receipt.proposalCreated = false; throw error; }
}
