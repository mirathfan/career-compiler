import { answerPreparationQuery } from "./preparationWorkflow";
import { answerResumeBulletQuery } from "./resumeBulletActions";
import { answerApplicationNextAction } from "./applicationNextAction";
import { answerProfileSkillQuery } from "./profileSkillActions";
import type {
  ApplicationRecord,
  CareerCopilotContextType,
  CareerCopilotMessage,
  CareerCopilotPendingAction,
  CareerCopilotThread,
  CareerCopilotToolCall,
  InternalCitation,
  Job,
  ResumeVersion,
  SearchEntityType,
} from "../../types/domain";
import { PROMPT_VERSIONS } from "../ai/prompts";
import type { AppRepository } from "../database/repository";
import { semanticResumeDiff } from "../resume/diff";
import { allResumeBullets } from "../resume/validation";
import { generateResumeRecommendations } from "../search/resumeRecommendations";
import { createId, nowIso } from "../utils";

export interface SendCareerCopilotMessageInput {
  threadId?: string;
  content: string;
  activeContextType?: CareerCopilotContextType;
  activeContextId?: string;
}

export interface CareerCopilotTurn {
  thread: CareerCopilotThread;
  userMessage: CareerCopilotMessage;
  assistantMessage: CareerCopilotMessage;
}

function citation(
  entityType: SearchEntityType,
  entityId: string,
  label: string,
  detail = "",
  parentEntityType: SearchEntityType | "" = "",
  parentEntityId = "",
): InternalCitation {
  return {
    id: `${entityType}:${entityId}:${parentEntityId}`,
    entityType,
    entityId,
    parentEntityType,
    parentEntityId,
    label,
    detail,
  };
}

function messageBase(threadId: string, role: CareerCopilotMessage["role"], content: string): CareerCopilotMessage {
  return {
    id: createId("copilot-message"),
    threadId,
    role,
    content,
    structuredContentJson: {},
    toolCallsJson: [],
    internalCitationsJson: [],
    pendingActionsJson: [],
    provider: "deterministic",
    model: "local-career-copilot",
    promptVersion: PROMPT_VERSIONS.careerCopilot,
    tokenUsageJson: { inputTokens: null, outputTokens: null, totalTokens: null },
    createdAt: nowIso(),
  };
}

function sentence(value: string) {
  return value.endsWith(".") || value.endsWith("?") || value.endsWith("!") ? value : `${value}.`;
}

function companyFromQuery(query: string) {
  const match =
    query.match(/applied to\s+([a-z0-9 .&-]+?)\s+before/i) ??
    query.match(/applied to\s+([a-z0-9 .&-]+)/i) ??
    query.match(/before at\s+([a-z0-9 .&-]+)/i);
  return match?.[1]?.replace(/\b(before|already|previously)\b.*$/i, "").replace(/[?.!].*$/, "").trim() ?? "";
}

function mentionsStatusUpdate(query: string) {
  return /\b(update|mark|set)\b.+\b(applied|interview|rejected|offer|withdrawn|ready|preparing)\b/i.test(query);
}

function statusFromQuery(query: string): ApplicationRecord["status"] | "" {
  const statuses: ApplicationRecord["status"][] = ["preparing", "ready", "applied", "interview", "rejected", "offer", "withdrawn"];
  const destination = query.match(/(?:to|as)\s+(preparing|ready|applied|interview|rejected|offer|withdrawn)\b/i)?.[1]?.toLowerCase();
  if (destination) return destination as ApplicationRecord["status"];
  return statuses.find((status) => new RegExp(`\\b${status}\\b`, "i").test(query)) ?? "";
}

/** Guided drafts either persist a reviewable proposal atomically or remain unsaved. */
export async function proposeJobNote(repository: AppRepository, input: Omit<SendCareerCopilotMessageInput, "content"> & { text: string }): Promise<CareerCopilotTurn> {
  return repository.transaction(async tx => {
    const turn = await sendCareerCopilotMessage(tx, { ...input, content: `Set job note: ${input.text}` });
    if (!turn.assistantMessage.pendingActionsJson.some(action => action.type === "set_job_note")) throw new Error(turn.assistantMessage.content);
    return turn;
  });
}

export async function sendCareerCopilotMessage(
  repository: AppRepository,
  input: SendCareerCopilotMessageInput,
): Promise<CareerCopilotTurn> {
  return repository.transaction(tx => sendCareerCopilotTurn(tx, input));
}

async function sendCareerCopilotTurn(repository: AppRepository, input: SendCareerCopilotMessageInput): Promise<CareerCopilotTurn> {
  if (!input.content.trim() || input.content.length > 12000) throw new Error("Enter a message between 1 and 12,000 characters.");
  const existing = input.threadId ? await repository.getCareerCopilotThread(input.threadId) : null;
  if (input.threadId && !existing) throw new Error("This conversation is no longer available. Start a new conversation.");
  const context = existing ?? { activeContextType: input.activeContextType ?? "all", activeContextId: input.activeContextId ?? "" };
  if (["job", "application", "resume"].includes(context.activeContextType)) {
    const record = context.activeContextType === "job" ? await repository.getJob(context.activeContextId)
      : context.activeContextType === "application" ? await repository.getApplication(context.activeContextId)
      : await repository.getResumeVersion(context.activeContextId);
    if (!record) throw new Error("The selected record is missing. Choose an existing record in a new conversation.");
  }
  const thread = existing ?? await repository.saveCareerCopilotThread({ title: titleFromContent(input.content), ...context });
  if (input.threadId && ((input.activeContextType && input.activeContextType !== thread.activeContextType) || (input.activeContextId !== undefined && input.activeContextId !== thread.activeContextId))) {
    throw new Error("This conversation has a different context. Start a new conversation to switch records.");
  }
  const userMessage = await repository.saveCareerCopilotMessage(
    messageBase(thread.id, "user", input.content),
  );
  const response = await answer(repository, thread, input.content);
  const assistantDraft = messageBase(thread.id, "assistant", response.content);
  const assistantMessage = await repository.saveCareerCopilotMessage({
    ...assistantDraft,
    toolCallsJson: response.toolCalls,
    internalCitationsJson: response.citations,
    pendingActionsJson: response.pendingActions.map((action) => ({
      ...action,
      messageId: assistantDraft.id,
    })),
    structuredContentJson: {
      ...("preparationPlan" in response ? { preparationPlan: response.preparationPlan } : {}),
      ...("preparationReview" in response ? { preparationReview: response.preparationReview } : {}),
      ...("preparationSkip" in response ? { preparationSkip: response.preparationSkip } : {}),
      ...("applicationActionContext" in response ? { applicationActionContext: response.applicationActionContext } : {}),
      ...("profileSkillContext" in response ? { profileSkillContext: response.profileSkillContext } : {}),
      ...( "privateJobNote" in response ? { privateJobNote: response.privateJobNote } : {}),
      contextPreview: response.contextPreview,
      sourceCount: response.citations.length,
      pendingActionCount: response.pendingActions.length,
    },
  });
  return { thread, userMessage, assistantMessage };
}

async function answer(repository: AppRepository, thread: CareerCopilotThread, query: string) {
  const preparation = await answerPreparationQuery(repository, thread, query);
  if (preparation) return preparation;
  const resumeAnswer = await answerResumeBulletQuery(repository, thread, query);
  if (resumeAnswer) return resumeAnswer;
  const applicationAnswer = await answerApplicationNextAction(repository, thread, query);
  if (applicationAnswer) return applicationAnswer;
  const skillAnswer = await answerProfileSkillQuery(repository, thread, query);
  if (skillAnswer) return skillAnswer;
  const lower = query.toLowerCase();
  const toolCalls: CareerCopilotToolCall[] = [];
  const citations: InternalCitation[] = [];
  const pendingActions: CareerCopilotPendingAction[] = [];
  const contextPreview: unknown[] = [];

  const addTool = (name: CareerCopilotToolCall["name"], args: Record<string, unknown>, resultSummary: string) => {
    toolCalls.push({ id: createId("tool-call"), name, argumentsJson: args, resultSummary });
  };
  const addCitation = (next: InternalCitation) => {
    if (!citations.some((item) => item.id === next.id)) citations.push(next);
  };

  if (/^set job note\s*:/i.test(query.trimStart())) {
    const notes = query.trimStart().replace(/^set job note\s*:\s?/i, "");
    if (thread.activeContextType !== "job" || !thread.activeContextId) return insufficient("Select a saved job before setting its note.");
    if (!notes.trim() || notes.length > 4000) return insufficient("Supply a nonempty job note of at most 4,000 characters after Set job note:. No note was changed.");
    const job = await repository.getJob(thread.activeContextId);
    if (!job) throw new Error("The selected job is missing.");
    if ((job.notes ?? "").length > 4000) return insufficient("The existing note exceeds this tool's 4,000-character limit. No note was changed.");
    if ((job.notes ?? "") === notes) return insufficient("This job already has that exact note. No change is needed.");
    const prior = (await repository.listCareerCopilotMessages(thread.id)).flatMap(message => message.pendingActionsJson);
    if (prior.some(action => action.type === "set_job_note" && action.status === "pending")) return insufficient("Review or cancel the pending job-note proposal before requesting another.");
    const action: CareerCopilotPendingAction = {
      id: createId("pending-action"), threadId: thread.id, messageId: "", type: "set_job_note",
      label: `Set note for ${job.company} · ${job.roleTitle}`,
      recordsAffected: [{ entityType: "job", entityId: job.id, label: `${job.company} · ${job.roleTitle}` }],
      beforeJson: { notes: job.notes ?? "", job }, afterJson: { jobId: job.id, notes },
      status: "pending", createdAt: nowIso(), resolvedAt: "",
    };
    pendingActions.push(action);
    addCitation(citation("job", job.id, `${job.company} · ${job.roleTitle}`));
    return insufficient("Review the exact replacement note below. This is your supplied text, not verified career evidence. The saved job stays unchanged until you accept.");
  }

  if (mentionsStatusUpdate(query)) {
    const applications = await repository.listApplications();
    const status = statusFromQuery(query);
    const named = applications.filter(application =>
      application.company.trim() && lower.includes(application.company.toLowerCase()) &&
      (!applications.some(other => other.id !== application.id && other.company === application.company) || lower.includes(application.role.toLowerCase())),
    );
    const target = thread.activeContextType === "application" && thread.activeContextId
      ? applications.find(application => application.id === thread.activeContextId)
      : named.length === 1 ? named[0] : undefined;
    addTool("search_applications", { query }, `${applications.length} application records inspected.`);
    if (!target || !status) {
      return {
        content: "Name the company and role, or open Copilot from a specific application. I need one unambiguous application before proposing a change. No application records were changed.",
        toolCalls,
        citations,
        pendingActions,
        contextPreview,
      };
    }
    const action: CareerCopilotPendingAction = {
      id: createId("pending-action"),
      threadId: thread.id,
      messageId: "",
      type: "update_application_status",
      label: `Update ${target.company} ${target.role} to ${status}`,
      recordsAffected: [{ entityType: "application", entityId: target.id, label: `${target.company} ${target.role}` }],
      beforeJson: { status: target.status, appliedDate: target.appliedDate, nextAction: target.nextAction, updatedAt: target.updatedAt },
      afterJson: {
        applicationId: target.id,
        status,
        appliedDate: status === "applied" ? target.appliedDate || new Date().toISOString().slice(0, 10) : target.appliedDate,
      },
      status: "pending",
      createdAt: nowIso(),
      resolvedAt: "",
    };
    pendingActions.push(action);
    addCitation(citation("application", target.id, `Application: ${target.company}`, target.role));
    contextPreview.push({ application: target.id, before: action.beforeJson, after: action.afterJson });
    return {
      content: `I found the ${target.company} ${target.role} application. I prepared a pending action to change its status from ${target.status} to ${status}; your tracker stays unchanged until you accept it.`,
      toolCalls,
      citations,
      pendingActions,
      contextPreview,
    };
  }

  if (/\b(summari[sz]e|show|tell me about)\b.*\b(this|selected)\b/.test(lower)) {
    if (thread.activeContextType === "job") {
      const job = await repository.getJob(thread.activeContextId);
      if (!job) return insufficient("Choose a saved job first.");
      addCitation(citation("job", job.id, `${job.company} · ${job.roleTitle}`));
      contextPreview.push({ job: job.id, company: job.company, role: job.roleTitle, location: job.location, description: job.rawDescription.slice(0, 1200) });
      return {
        ...insufficient(`${job.roleTitle} at ${job.company}. Location: ${job.location || "not recorded"}. Saved description: ${job.rawDescription.slice(0, 1200) || "not recorded"}`),
        // Explicit local summary display only; not retrieval, embedding or provider context.
        privateJobNote: { jobId: job.id, text: job.notes ?? "", provenance: "user_authored_unverified", capturedAt: job.updatedAt },
      };
    }
    if (thread.activeContextType === "application") {
      const application = await repository.getApplication(thread.activeContextId);
      if (!application) return insufficient("Choose a saved application first.");
      addCitation(citation("application", application.id, `${application.company} · ${application.role}`));
      contextPreview.push({ application: application.id, status: application.status, appliedDate: application.appliedDate });
      return insufficient(`${application.role} at ${application.company}. Tracker status: ${application.status}. Applied date: ${application.appliedDate || "not recorded"}.`);
    }
    if (thread.activeContextType === "resume") {
      const resume = await repository.getResumeVersion(thread.activeContextId);
      if (!resume) return insufficient("Choose a saved resume first.");
      addCitation(citation("resume", resume.id, resume.name));
      contextPreview.push({ resume: resume.id, name: resume.name, status: resume.status, updatedAt: resume.updatedAt });
      return insufficient(`${resume.name}. Status: ${resume.status}. Last updated: ${resume.updatedAt}. This is the selected saved version; no resume content was changed.`);
    }
    return insufficient("Choose a saved job, application or resume to summarize.");
  }

  if (lower.includes("which resume") || lower.includes("use for this") || lower.includes("base resume")) {
    const job = await jobFromContext(repository, thread);
    if (!job) {
      return insufficient("I need a saved job context before I can recommend a base resume.");
    }
    const recommendations = await generateResumeRecommendations(repository, job.id);
    addTool("recommend_base_resumes", { targetJobId: job.id }, `${recommendations.length} candidate resumes scored.`);
    addCitation(citation("job", job.id, `Job: ${job.company || "Saved job"}`, job.roleTitle));
    const resumes = await repository.listResumeVersions();
    const best = recommendations[0];
    if (!best) {
      return insufficient("I did not find an older saved resume to use as a base for this job.");
    }
    const resume = resumes.find((item) => item.id === best.candidateResumeVersionId);
    if (resume) addCitation(citation("resume", resume.id, `Resume: ${resume.name}`, `Score ${best.overallScore.toFixed(2)}`, "job", resume.jobId));
    contextPreview.push({ job: job.id, recommendation: best });
    return {
      content: [
        `I would start from ${resume?.name ?? "the top recommended saved resume"}.`,
        best.explanationJson.reasons.map(sentence).join(" "),
        best.explanationJson.matchingSkills.length
          ? `Matching skills: ${best.explanationJson.matchingSkills.slice(0, 8).join(", ")}.`
          : "I found limited direct skill overlap, so review the evidence before reusing it.",
        best.explanationJson.requiredChanges.length
          ? `Before submitting, ${best.explanationJson.requiredChanges.join(" ")}`
          : "It looks reusable as a draft base, but the source resume should still remain unchanged.",
      ].join(" "),
      toolCalls,
      citations,
      pendingActions,
      contextPreview,
    };
  }

  if (lower.includes("applied to") || lower.includes("applied before")) {
    const company = companyFromQuery(query);
    const applications = await repository.listApplications();
    const matches = applications.filter((application) =>
      company
        ? application.company.toLowerCase().includes(company.toLowerCase())
        : lower.includes(application.company.toLowerCase()),
    );
    addTool("search_applications", { company: company || "from query" }, `${matches.length} matching applications.`);
    matches.forEach((application) => addCitation(citation("application", application.id, `Application: ${application.company}`, `${application.role} | ${application.status}`)));
    contextPreview.push(...matches.map((application) => ({ application: application.id, status: application.status })));
    if (!matches.length) {
      return insufficient(`I could not find a saved application record${company ? ` for ${company}` : ""}.`);
    }
    return {
      content: `Yes. I found ${matches.length} saved application${matches.length === 1 ? "" : "s"}: ${matches.map((application) => `${application.company} ${application.role} (${application.status}${application.appliedDate ? `, ${application.appliedDate}` : ""})`).join("; ")}.`,
      toolCalls,
      citations,
      pendingActions,
      contextPreview,
    };
  }

  if (lower.includes("compare") && lower.includes("resume")) {
    const resumes = await repository.listResumeVersions();
    addTool("compare_resumes", { query }, `${resumes.length} resumes inspected.`);
    if (resumes.length < 2) return insufficient("I need at least two saved resumes to compare.");
    const [left, right] = resumes;
    const diff = semanticResumeDiff(left.contentJson, right.contentJson);
    addCitation(citation("resume", left.id, `Resume: ${left.name}`, left.status, "job", left.jobId));
    addCitation(citation("resume", right.id, `Resume: ${right.name}`, right.status, "job", right.jobId));
    contextPreview.push({ left: left.id, right: right.id, diffCount: diff.length });
    return {
      content: diff.length
        ? `Comparing ${left.name} with ${right.name}: ${diff.slice(0, 5).map((entry) => `${entry.category.replace("_", " ")} in ${entry.section}`).join("; ")}.`
        : `I did not find meaningful bullet, skill, or section-order differences between ${left.name} and ${right.name}.`,
      toolCalls,
      citations,
      pendingActions,
      contextPreview,
    };
  }

  if (lower.includes("why this") || lower.includes("draft") || lower.includes("interested")) {
    const job = await jobFromContext(repository, thread);
    const facts = await repository.listCareerFacts();
    const results = await repository.searchCareerDocuments(query, { entityTypes: ["career_fact", "approved_bullet_variant", "resume_bullet"] });
    addTool("search_career_memory", { query }, `${results.length} supporting records retrieved.`);
    if (job) addCitation(citation("job", job.id, `Job: ${job.company || "Saved job"}`, job.roleTitle));
    results.slice(0, 4).forEach((result) => addCitation(result.sourceRef));
    const supportedFacts = facts.filter((fact) => citations.some((source) => source.entityId === fact.id)).slice(0, 3);
    contextPreview.push({ job: job?.id ?? "", citations: citations.map((source) => source.id) });
    if (!job || !results.length) {
      return insufficient("I need a saved job and supporting career evidence before drafting an application answer.");
    }
    return {
      content: [
        `Draft answer: I am interested in ${job.roleTitle || "this role"} at ${job.company || "the company"} because the role aligns with evidence I can support from my project history.`,
        supportedFacts.map((fact) => sentence(fact.statement)).join(" "),
        "I would keep the final answer grounded in these records and avoid adding company claims that are not in the saved job description.",
      ].filter(Boolean).join(" "),
      toolCalls,
      citations,
      pendingActions,
      contextPreview,
    };
  }

  const results = await repository.searchCareerDocuments(query);
  addTool("search_career_memory", { query }, `${results.length} records retrieved.`);
  results.slice(0, 6).forEach((result) => addCitation(result.sourceRef));
  contextPreview.push(...results.slice(0, 6).map((result) => ({ document: result.document.id, score: result.scores.final })));
  if (!results.length) {
    return insufficient("I could not find internal records that answer that. I will not invent candidate information.");
  }
  return {
    content: `I found ${results.length} relevant internal record${results.length === 1 ? "" : "s"}. ${results.slice(0, 3).map((result) => `${result.document.title}: ${result.snippet}`).join(" ")}`,
    toolCalls,
    citations,
    pendingActions,
    contextPreview,
  };

  function insufficient(content: string) {
    return { content, toolCalls, citations, pendingActions, contextPreview };
  }
}

async function jobFromContext(repository: AppRepository, thread: CareerCopilotThread): Promise<Job | null> {
  if (thread.activeContextType === "job" && thread.activeContextId) return repository.getJob(thread.activeContextId);
  if (thread.activeContextType === "application" && thread.activeContextId) {
    const application = await repository.getApplication(thread.activeContextId);
    return application?.jobId ? repository.getJob(application.jobId) : null;
  }
  if (thread.activeContextType === "resume" && thread.activeContextId) {
    const resume = await repository.getResumeVersion(thread.activeContextId);
    return resume?.jobId ? repository.getJob(resume.jobId) : null;
  }
  return null;
}

function titleFromContent(content: string) {
  const words = content.trim().split(/\s+/).slice(0, 7).join(" ");
  return words || "Career Copilot";
}

export function citedResumeFacts(resume: ResumeVersion) {
  return new Set(allResumeBullets(resume.contentJson).flatMap(({ bullet }) => bullet.sourceFactIds));
}
