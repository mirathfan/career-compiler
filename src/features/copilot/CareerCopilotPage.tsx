import { PreparationPlanView } from "./PreparationPlanView";
import { findPreparationPlan } from "../../lib/copilot/preparationWorkflow";
import { RESUME_BULLET_ACTION, ResumeBulletBefore, ResumeBulletAfter } from "../../lib/copilot/resumeBulletContract";
import { APPLICATION_NEXT_ACTION, NextActionAfter, NextActionBefore } from "../../lib/copilot/applicationActionContract";
import { PROFILE_SKILL_ACTION } from "../../lib/copilot/profileSkillContract";
import { ProfileSkillAfter } from "../../lib/copilot/profileSkillActions";
import { citationTarget, citationHref, verifiedCitationHref } from "../../lib/copilot/citationNavigation";
import { IntelligenceResponse } from "./IntelligenceResponse";
import { SynthesisResponse } from "./SynthesisResponse";
import { ResumeBulletComposer } from "./ResumeBulletComposer";
import { ModelJobConversation } from "./ModelJobConversation";
import { JobNoteComposer } from "./JobNoteComposer";
import { PrivateJobNote } from "../../components/PrivateJobNote";
import type { CopilotContextRequest, WorkspaceSelection } from "../../lib/copilot/workspaceContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, MessageSquarePlus, Send, Trash2, X } from "lucide-react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, InlineError, LoadingState } from "../../components/States";
import { Badge, PageSection } from "../../components/ui";
import { proposeCopilotUndo } from "../../lib/copilot/actionReview";
import { proposeJobNote, sendCareerCopilotMessage } from "../../lib/copilot/careerCopilot";
import { useRepository } from "../../lib/database/repositoryContext";
import type {
  CareerCopilotContextType,
  CareerCopilotMessage,
  CareerCopilotPendingAction,
  InternalCitation,
} from "../../types/domain";

const starterQuestions = [
  "Summarize this selected record.",
  "Does my profile include LangGraph?",
  "What applications need my attention?",
  "Which resume should I use for this job?",
  "Have I applied to NVIDIA before?",
  "Which applications used Forge?",
  "Compare my full-stack and AI resumes.",
  "Draft a grounded answer to why this role.",
  "Update my application at Example Company to interview.",
];

const scopes: Array<{ value: CareerCopilotContextType; label: string }> = [
  { value: "all", label: "All career data" },
  { value: "career_memory", label: "Career Memory" },
  { value: "job_search", label: "Job search history" },
  { value: "resume_library", label: "Resume Library" },
  { value: "job", label: "Current job" },
  { value: "application", label: "Current application" },
  { value: "resume", label: "Current resume" },
];

function SourceChip({ source }: { source: InternalCitation }) {
  const repo = useRepository(); const navigate = useNavigate();
  const [error, setError] = useState(""); const [opening, setOpening] = useState(false);
  const target = citationTarget(source);
  if (!target) return <span className="text-xs">{source.label}: record destination unavailable</span>;
  return <span className="inline-flex max-w-full flex-col">
    <Link className="inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-800"
      to={citationHref(target)} title={source.detail || source.entityType} aria-disabled={opening}
      onClick={async event => { event.preventDefault(); if (opening) return; setOpening(true); setError(""); try { navigate(await verifiedCitationHref(repo, source)); } catch (e) { setError(e instanceof Error ? e.message : "Cited record unavailable."); } finally { setOpening(false); } }}>
      <span className="truncate">{source.label}</span>
    </Link>
    {error ? <span role="alert" className="text-xs text-red-700">{error}</span> : null}
  </span>;
}

function ResumeBulletDetails({ action, sources }: { action: CareerCopilotPendingAction; sources: InternalCitation[] }) {
  const before = ResumeBulletBefore.safeParse(action.beforeJson), after = ResumeBulletAfter.safeParse(action.afterJson);
  if (!before.success || !after.success) return <p role="alert">Invalid résumé proposal. Reject and prepare a fresh draft.</p>;
  const a = after.data;
  return <dl className="mt-3 space-y-3 rounded bg-white p-3 [overflow-wrap:anywhere]">
    <div><dt>Target job</dt><dd>{a.jobLabel} [{a.jobId}]</dd></div>
    <div><dt>Source résumé</dt><dd>{a.sourceName} [{a.sourceId}]</dd></div>
    <div><dt>Target section</dt><dd>{a.sectionLabel} · {a.bulletId}</dd></div>
    <div><dt>Current bullet</dt><dd className="whitespace-pre-wrap">{before.data.text}</dd></div>
    <div><dt>Proposed bullet</dt><dd className="whitespace-pre-wrap">{a.replacementText}</dd></div>
    <div><dt>Reason</dt><dd>{a.reason}</dd></div>
    <div><dt>Evidence and source</dt><dd className="flex flex-wrap gap-2">{sources.map(source => <SourceChip source={source} key={source.id}/>)}</dd></div>
    <div><dt>Impact</dt><dd>{a.undoOf ? "Archives the unchanged, unused generated child. Keeps its content, files and audit; does not erase version creation." : "Creates one new draft child. Source, Master and submitted attachments remain unchanged. Text review only; no PDF has been rendered."}</dd><dd>Child: {a.childId}</dd></div>
    <div><dt>Revise</dt><dd>Reject this proposal and select another verified statement to prepare a fresh review.</dd></div>
  </dl>;
}

function ApplicationNextActionDetails({ action, sources }: { action: CareerCopilotPendingAction; sources: InternalCitation[] }) {
  const before = NextActionBefore.safeParse(action.beforeJson); const after = NextActionAfter.safeParse(action.afterJson);
  if (!before.success || !after.success) return <p role="alert">Invalid application proposal. Reject it and request a fresh review.</p>;
  const value = after.data;
  return <dl className="mt-3 space-y-3 rounded-md bg-white p-3 [overflow-wrap:anywhere]">
    <div><dt className="text-xs text-slate-500">Application</dt><dd>{action.recordsAffected[0]?.label}</dd></div>
    <div><dt className="text-xs text-slate-500">Current next action</dt><dd>{before.data.values.nextAction || "None recorded"}</dd><dd>Follow-up: {before.data.values.followUpDate || "None recorded"}</dd></div>
    <div><dt className="text-xs text-slate-500">Proposed next action</dt><dd>{value.values.nextAction || "None recorded"}</dd><dd>Follow-up: {value.values.followUpDate || "None recorded"}</dd></div>
    <div><dt className="text-xs text-slate-500">Reason and provenance</dt><dd>{value.reason}</dd><dd className="whitespace-pre-wrap">{value.instruction}</dd>{value.undoOf ? <dd>Restores the exact tracker values from before the accepted change; the original instruction is retained as provenance.</dd> : value.time.expression ? <dd>Date resolved from “{value.time.expression}” using {value.time.today} ({value.time.timeZone}); the reviewed date stays fixed.</dd> : <dd>No new date requested; the recorded date is preserved.</dd>}</div>
    <div><dt className="text-xs text-slate-500">Recorded sources</dt><dd className="flex flex-wrap gap-2">{sources.filter(source => ["application", "job", "resume"].includes(source.entityType)).map(source => <SourceChip key={source.id} source={source}/>)}</dd></div>
    <div><dt className="text-xs text-slate-500">Review</dt><dd>Updates the local tracker only. Sends no email or reminder. To revise, reject this draft and request a fresh proposal. Undo also requires review.</dd></div>
  </dl>;
}

function ProfileSkillDetails({ action, sources }: { action: CareerCopilotPendingAction; sources: InternalCitation[] }) {
  const parsed = ProfileSkillAfter.safeParse(action.afterJson);
  if (!parsed.success) return <p role="alert">Invalid profile-skill proposal. Reject it and request a fresh review.</p>;
  const value = parsed.data;
  return <dl className="mt-3 space-y-3 rounded-md bg-white p-3 [overflow-wrap:anywhere]">
    <div><dt className="text-xs text-slate-500">Target</dt><dd>Career Profile → Skills · {value.profileId}</dd></div>
    <div><dt className="text-xs text-slate-500">Current</dt><dd>{value.undoOf ? value.skill.name : "Skill not listed"}</dd></div>
    <div><dt className="text-xs text-slate-500">Proposed</dt><dd>{value.undoOf ? "Undo this accepted addition only:" : "Add:"} {value.skill.name}</dd><dd className="text-xs">Category: {value.skill.category} · Exact skill ID: {value.skill.id}</dd></div>
    <div><dt className="text-xs text-slate-500">Evidence</dt><dd className="space-y-1">{value.evidenceIds.map(id => { const source = sources.find(c => c.entityType === "career_fact" && c.entityId === id); return <div key={id}><SourceChip source={source ?? { id: `career_fact:${id}:`, entityType: "career_fact", entityId: id, label: `Inspect evidence ${id}`, detail: "Supporting evidence for this accepted addition", parentEntityType: "", parentEntityId: "" }} /></div>; })}</dd></div>
    <div><dt className="text-xs text-slate-500">Reason</dt><dd>{value.reason}</dd></div>
    <div><dt className="text-xs text-slate-500">Review</dt><dd>Separate approval is required. To revise, reject this draft and discuss a fresh proposal. Undo also requires review and a conflict check.</dd></div>
  </dl>;
}

function MessageBubble({ message }: { message: CareerCopilotMessage }) {
  const isUser = message.role === "user";
  const note = message.structuredContentJson.privateJobNote as { jobId?: unknown; text?: unknown; provenance?: unknown } | undefined;
  const connected = message.structuredContentJson.workspaceRead as { records?: Array<{ intelligence?: unknown }>; references?: { focusedJobId?: string | null }; synthesis?: unknown; synthesisEvidence?: unknown } | undefined;
  const comparisons = Array.isArray(connected?.records) ? connected.records.flatMap(r => r.intelligence ? [r.intelligence] : []) : [];
  const showNote = !isUser && note && typeof note.text === "string" && note.provenance === "user_authored_unverified" && message.internalCitationsJson.some(source => source.entityType === "job" && source.entityId === note.jobId);
  return (
    <article aria-label={isUser ? "Your message" : message.structuredContentJson.workspaceRead ? "Model-selected evidence response" : "Local Copilot response"} className={isUser ? "ml-auto max-w-[78%] rounded-md bg-blue-700 px-4 py-3 text-sm leading-6 text-white" : "max-w-[82%] rounded-md border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800"}>
      {connected?.synthesis ? <SynthesisResponse answer={connected.synthesis} evidence={connected.synthesisEvidence} mock={message.provider === "mock"}/> : <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</p>}
      {connected?.synthesis && typeof message.structuredContentJson.profileSkillNotice === "string" ? <p>{message.structuredContentJson.profileSkillNotice}</p> : null}
      {connected?.references?.focusedJobId ? <p className="mt-2 text-xs font-semibold">Follow-up job: {message.internalCitationsJson.find(c => c.entityType === "job" && c.entityId === connected.references?.focusedJobId)?.label ?? connected.references.focusedJobId}</p> : null}
      {connected?.synthesis && comparisons.length ? <details className="mt-3"><summary className="cursor-pointer font-semibold">Inspect full local comparisons</summary>{comparisons.map((value, index) => <IntelligenceResponse key={index} value={value} />)}</details> : comparisons.map((value, index) => <IntelligenceResponse key={index} value={value} />)}
      {showNote ? <div className="mt-3 min-w-0"><PrivateJobNote notes={note.text as string} /><p className="mt-1 text-xs text-slate-500">Saved note at the time of this summary. Summarize again to see later changes.</p></div> : null}
      {!isUser && message.internalCitationsJson.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {message.internalCitationsJson.map((source) => (
            <SourceChip key={source.id} source={source} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function CareerCopilotPage({ embedded = false, contextType, recordId, managed = false, panel = false, requestedContext, workspaceSelection }: { embedded?: boolean; contextType?: CareerCopilotContextType; recordId?: string; managed?: boolean; panel?: boolean; requestedContext?: CopilotContextRequest; workspaceSelection?: WorkspaceSelection } = {}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedThreadId, setSelectedThreadId] = useState(() => managed && !requestedContext ? localStorage.getItem("careercompiler-copilot-thread") ?? "" : "");
  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState<CareerCopilotContextType>(
    contextType ?? (searchParams.get("contextType") as CareerCopilotContextType | null) ?? "all",
  );
  const [contextId, setContextId] = useState(() => recordId ?? searchParams.get("contextId") ?? "");
  const [error, setError] = useState("");
  const [actionResult, setActionResult] = useState("");
  const [handledRequest, setHandledRequest] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const conversation = useRef<HTMLDivElement>(null);
  const reviewPanel = useRef<HTMLElement>(null);
  const panelBody = useRef<HTMLDivElement>(null);

  const threadsQuery = useQuery({
    queryKey: ["career-copilot-threads"],
    queryFn: () => repository.listCareerCopilotThreads(false),
  });
  const availableThreads = useMemo(() => (threadsQuery.data ?? []).filter((thread) => (!embedded || managed) || (thread.activeContextType === scope && thread.activeContextId === contextId)), [threadsQuery.data, embedded, managed, scope, contextId]);
  const selectedThread = useMemo(
    () => selectedThreadId === "new-context" ? undefined : availableThreads.find((thread) => thread.id === selectedThreadId) ?? availableThreads.find(thread => thread.activeContextType === scope && thread.activeContextId === contextId),
    [selectedThreadId, availableThreads, scope, contextId],
  );
  const recordsQuery = useQuery({
    queryKey: ["copilot-context-records"],
    queryFn: async () => {
      const [jobs, applications, resumes] = await Promise.all([repository.listJobs(), repository.listApplications(), repository.listResumeVersions()]);
      return {
        job: jobs.map(record => ({ id: record.id, label: `${record.company} · ${record.roleTitle}` })),
        application: applications.map(record => ({ id: record.id, label: `${record.company} · ${record.role} · ${record.status}` })),
        resume: resumes.map(record => ({ id: record.id, label: `${record.name} · ${record.status}` })),
      };
    },
  });
  const recordScope = (value: CareerCopilotContextType): value is "job" | "application" | "resume" => ["job", "application", "resume"].includes(value);
  const options = recordScope(scope) ? recordsQuery.data?.[scope] ?? [] : [];
  const activeScope = selectedThread?.activeContextType ?? scope;
  const activeId = selectedThread?.activeContextId ?? contextId;
  const activeRecord = recordScope(activeScope) ? recordsQuery.data?.[activeScope].find(record => record.id === activeId) : undefined;
  const missingContext = recordScope(activeScope) && !activeRecord;
  const contextLabel = recordScope(activeScope) ? activeRecord?.label ?? "Choose an existing saved record" : scopes.find(item => item.value === activeScope)?.label ?? "All career data";
  const switchContext = (nextScope: CareerCopilotContextType, nextId: string) => {
    setScope(nextScope); setContextId(nextId); setSelectedThreadId("new-context"); setDraft(""); setError(""); setActionResult("");
  };
  const messagesQuery = useQuery({
    queryKey: ["career-copilot-messages", selectedThread?.id ?? ""],
    queryFn: () => (selectedThread ? repository.listCareerCopilotMessages(selectedThread.id) : Promise.resolve([])),
  });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => repository.getSettings() });


  const sendMessage = useMutation({
    mutationFn: (input: string | { note: string }) => {
      const context = { threadId: selectedThread?.id, activeContextType: selectedThread?.activeContextType ?? scope, activeContextId: selectedThread?.activeContextId ?? contextId };
      return typeof input === "string" ? sendCareerCopilotMessage(repository, { ...context, content: input }) : proposeJobNote(repository, { ...context, text: input.note });
    },
    onSuccess: (turn) => {
      setSelectedThreadId(turn.thread.id);
      setDraft("");
      void queryClient.invalidateQueries();
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : String(caught)),
  });

  const createThread = useMutation({
    mutationFn: () => repository.saveCareerCopilotThread({ title: "New conversation", activeContextType: scope, activeContextId: contextId }),
    onSuccess: async (thread) => {
      setSelectedThreadId(thread.id);
      await queryClient.invalidateQueries({ queryKey: ["career-copilot-threads"] });
    },
  });

  const archiveThread = useMutation({
    mutationFn: (id: string) => repository.archiveCareerCopilotThread(id),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const deleteThread = useMutation({
    mutationFn: (id: string) => repository.deleteCareerCopilotThread(id),
    onSuccess: () => {
      setSelectedThreadId("");
      void queryClient.invalidateQueries();
    },
  });
  const confirmAction = useMutation({
    mutationFn: (action: CareerCopilotPendingAction) => repository.confirmCareerCopilotAction(action),
    onSuccess: (action) => { setError(""); setActionResult(action.type === RESUME_BULLET_ACTION ? action.afterJson.undoOf ? "Generated child archived. Version content and audit are retained." : "New résumé child saved. Source and submitted versions preserved; PDF not yet rendered." : action.type === APPLICATION_NEXT_ACTION ? action.afterJson.undoOf ? "Next action restored. Application history and résumé links are preserved." : "Next action saved to the local tracker. No message or reminder was sent." : action.type === PROFILE_SKILL_ACTION ? action.afterJson.undoOf ? "Skill addition undone. Supporting evidence is preserved." : "Skill added to your profile. Review undo is available under Accepted changes." : "Change accepted."); return queryClient.invalidateQueries(); },
    onError: (caught) => { setError(caught instanceof Error ? caught.message : String(caught)); void queryClient.invalidateQueries({queryKey:["preparation-view"]}); },
  });
  const undoAction = useMutation({
    mutationFn: (action: CareerCopilotPendingAction) => proposeCopilotUndo(repository, action),
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (caught) => setError(caught instanceof Error ? caught.message : String(caught)),
  });
  const cancelAction = useMutation({
    mutationFn: (action: CareerCopilotPendingAction) => repository.cancelCareerCopilotAction(action),
    onSuccess: () => { setError(""); setActionResult("Proposal rejected. No domain record was changed."); return queryClient.invalidateQueries(); },
    onError: (caught) => setError(caught instanceof Error ? caught.message : String(caught)),
  });

  useEffect(() => {
    if (managed && selectedThread) localStorage.setItem("careercompiler-copilot-thread", selectedThread.id);
  }, [managed, selectedThread]);
  useEffect(() => {
    const element = conversation.current;
    if (element && messagesQuery.data?.length) element.scrollTop = element.scrollHeight;
  }, [messagesQuery.data]);
  if (requestedContext && handledRequest !== requestedContext.token && !sendMessage.isPending && !createThread.isPending) {
    setHandledRequest(requestedContext.token);
    if (activeScope !== requestedContext.type || activeId !== requestedContext.id) {
      setScope(requestedContext.type); setContextId(requestedContext.id); setSelectedThreadId(""); setDraft(""); setError("");
    }
  }

  if (threadsQuery.isLoading || settingsQuery.isLoading || recordsQuery.isLoading) {
    return <LoadingState label="Loading Career Copilot..." />;
  }
  if (threadsQuery.isError || messagesQuery.isError || recordsQuery.isError || settingsQuery.isError) return <div role="alert" className="p-4"><p>Career Copilot could not load local records. Your saved conversation is retained.</p><button className="button" onClick={() => { void threadsQuery.refetch(); void messagesQuery.refetch(); void recordsQuery.refetch(); void settingsQuery.refetch(); }}>Retry loading conversation</button></div>;

  const messages = messagesQuery.data ?? [];
  const pendingActions = messages.flatMap((message) =>
    message.pendingActionsJson.filter((action) => action.status === "pending"),
  );
  const selectedSources = [...new Map(messages.flatMap(message => message.internalCitationsJson).map(source => [source.id, source])).values()];
  const preparationPlan = findPreparationPlan(messages);
  const acceptedActions = messages.flatMap(message => message.pendingActionsJson).filter(action => action.status === "confirmed" && ["update_application_status", "set_job_note", PROFILE_SKILL_ACTION, APPLICATION_NEXT_ACTION, RESUME_BULLET_ACTION].includes(action.type) && !action.afterJson.undoOf);

  const submit = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || sendMessage.isPending || missingContext) return;
    setError("");
    sendMessage.mutate(content);
  };

  return (
    <div className={managed ? "career-ai-content" : undefined}>
      {!embedded && !managed ? (
      <PageHeader
        eyebrow="Your career workspace"
        title="Career Copilot"
        description="Find answers in your saved records. Review changes before they happen."
        meta={
          <>
            <Badge tone="blue">Local tools · optional reviewed AI</Badge>
            <Badge>Changes need your approval</Badge>
          </>
        }
      />
) : null}
      {managed ? <div className="career-ai-context">
        <div className="flex items-center justify-between gap-2"><strong>Conversation: {activeScope === "all" ? "All career data" : activeScope.replaceAll("_", " ")}</strong><button className="text-link" type="button" aria-expanded={historyOpen} onClick={() => { setHistoryOpen(!historyOpen); if (!historyOpen && panelBody.current) panelBody.current.scrollTop = 0; }}>History & context</button></div>
        <p>{contextLabel}</p>
        <p>Model scope: {activeScope === "job" && !missingContext ? "Job Q&A: selected job only. Connected reads: only explicitly reviewed records" : "Unavailable for this context"}</p>
        <p>Local tools may read supporting records. Navigation sends nothing.</p>
        {pendingActions.length ? <button className="text-link" onClick={() => reviewPanel.current?.scrollIntoView({ block: "nearest" })}>Review pending changes ({pendingActions.length})</button> : null}
        {workspaceSelection && (activeScope !== workspaceSelection.type || activeId !== workspaceSelection.id) ? <div className="career-ai-context-mismatch"><p>This conversation belongs to a different selection. Existing proposals keep their original target.</p><button className="button" disabled={sendMessage.isPending || createThread.isPending} onClick={() => { switchContext(workspaceSelection.type, workspaceSelection.id); setSelectedThreadId(""); }}>Use selected {workspaceSelection.type}</button></div> : null}
      </div> : null}
      <div ref={panelBody} className={managed ? "career-ai-body" : embedded ? "copilot-inline" : "page-body"}>
      <div className={managed ? "career-ai-grid" : embedded ? "copilot-inline-grid" : "grid min-h-[calc(100vh-190px)] gap-4 lg:grid-cols-[220px_minmax(0,1fr)]"}>
        <aside aria-label="Conversation history and context" className="panel p-4 career-ai-history" hidden={managed ? panel && !historyOpen : embedded}>
          {managed && selectedThread ? <div className="mb-3 flex gap-2"><button className="button" disabled={sendMessage.isPending} onClick={() => archiveThread.mutate(selectedThread.id)}>Archive</button><button className="button" disabled={sendMessage.isPending} onClick={() => { if (window.confirm(`Delete ${selectedThread.title}?`)) deleteThread.mutate(selectedThread.id); }}>Delete</button></div> : null}
          <div className="flex items-center gap-2">
            <button className="button button-primary w-full" type="button" disabled={sendMessage.isPending || createThread.isPending || (recordScope(scope) && !options.some(record => record.id === contextId))} onClick={() => createThread.mutate()}>
              <MessageSquarePlus size={15} />
              New
            </button>
          </div>
          <label className="mt-3 block text-xs font-semibold text-slate-600">Context for a new conversation</label>
          <select aria-label="Context for a new conversation" className="field mt-2" value={scope} disabled={sendMessage.isPending || createThread.isPending} onChange={(event) => switchContext(event.target.value as CareerCopilotContextType, "")}>
            {scopes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          {recordScope(scope) ? <label className="mt-3 block text-xs font-semibold text-slate-600">
            Saved {scope}
            <select aria-label={`Saved ${scope}`} className="field mt-2" value={contextId} disabled={sendMessage.isPending || createThread.isPending} onChange={event => switchContext(scope, event.target.value)}>
              <option value="">Choose a saved {scope}…</option>
              {options.map((record, index) => <option key={record.id} value={record.id}>{record.label}{options.filter(other => other.label === record.label).length > 1 ? ` · Record ${index + 1}` : ""}</option>)}
            </select>
            {!options.length ? <span className="mt-2 block font-normal">No saved {scope} records yet.</span> : null}
          </label> : null}
          <button className="button mt-2" disabled={recordsQuery.isFetching || sendMessage.isPending} onClick={() => recordsQuery.refetch()}>Refresh records</button>
          <p className="mt-3 text-xs text-slate-500">Changing context starts a separate conversation. Earlier proposals stay with their original records.</p>
          <div className="mt-4 space-y-2">
            {availableThreads.map((thread) => (
              <button
                key={thread.id}
                aria-label={`${thread.title} — ${thread.activeContextType.replaceAll("_", " ")}`}
                className={thread.id === selectedThread?.id ? "w-full rounded-md bg-blue-50 px-3 py-2 text-left text-sm font-semibold text-blue-800" : "w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100"}
                type="button"
                disabled={sendMessage.isPending} onClick={() => { setSelectedThreadId(thread.id); setScope(thread.activeContextType); setContextId(thread.activeContextId); setDraft(""); setError(""); }}
              >
                <span className="block truncate">{thread.title}</span>
                <span className="block truncate text-xs font-normal text-slate-500">{thread.activeContextType.replace("_", " ")}</span>
              </button>
            ))}
            {!threadsQuery.data?.length ? <p className="px-2 py-8 text-center text-sm text-slate-500">No conversations yet.</p> : null}
          </div>
        </aside>

        <section className="career-ai-conversation panel flex min-h-[640px] min-w-0 flex-col overflow-hidden">
          <div hidden={managed} className="flex items-center gap-2 border-b border-slate-200 bg-white px-5 py-3">
            <div className="mr-auto min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{selectedThread?.title ?? "Career Copilot"}</p>
              <p className="text-xs text-slate-500">
                Answers link to the saved records used. Changes always need your review.
              </p>
            </div>
            {selectedThread ? (
              <>
                <button className="icon-button" title="Archive conversation" type="button" onClick={() => archiveThread.mutate(selectedThread.id)}>
                  <Archive size={15} />
                </button>
                <button className="icon-button" title="Delete conversation" type="button" onClick={() => {
                  if (window.confirm(`Delete ${selectedThread.title}?`)) deleteThread.mutate(selectedThread.id);
                }}>
                  <Trash2 size={15} />
                </button>
              </>
            ) : null}
          </div>

          <div hidden={managed && !missingContext} className="border-b border-slate-200 px-5 py-3 text-sm" aria-label="Conversation context">
            <span className="font-semibold">{activeScope.replaceAll("_", " ")}: </span>{contextLabel}
            {missingContext ? <p role="alert" className="mt-1 text-amber-800">This context is unavailable. Choose a saved record for a new conversation. Existing proposals cannot be accepted here.</p> : null}
          </div>
          {activeScope === "job" && !missingContext ? <div className="career-ai-model"><ModelJobConversation key={activeId} jobId={activeId} label={contextLabel} onProposal={threadId => { setSelectedThreadId(threadId); void queryClient.invalidateQueries(); }} /></div> : null}
          {activeScope === "job" && !missingContext ? <ResumeBulletComposer key={`${activeId}:${selectedThread?.id ?? "new"}`} jobId={activeId} threadId={selectedThread?.id} messages={messages} onComplete={threadId => { setSelectedThreadId(threadId); void queryClient.invalidateQueries(); }} /> : null}
          <div ref={conversation} role="log" aria-label="Conversation messages" aria-live="polite" className="career-ai-messages flex-1 space-y-4 overflow-auto p-5">
            {error ? <div role="alert"><InlineError message={error} /></div> : null}
            {messagesQuery.isLoading ? <LoadingState label="Loading this conversation…" /> : messages.length ? (
              messages.map((message) => <MessageBubble key={message.id} message={message} />)
            ) : (
              <div className="space-y-4">
                {!managed ? <EmptyState title="Ask about your job search" body="Career Copilot answers from saved local records and cites the records it used." /> : <p className="text-sm text-slate-500">Ask a question about saved records.</p>}
                <PageSection title="Useful starters" description={managed ? undefined : "Choose a task to begin with local context already scoped."}>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(managed ? ["Summarize this selected record.", ...(activeScope === "job" ? ["Which resume should I use for this job?", "Have I applied to this company before?"] : activeScope === "application" ? ["What needs attention?", "Set my next action to follow up with the recruiter on Friday."] : ["Does my profile include LangGraph?", "Which applications used Forge?"])] : embedded ? ["Which resume should I use for this job?", "What experience supports this role?", "Have I applied to this company before?"] : starterQuestions).map((question) => (
                      <button key={question} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800" type="button" disabled={sendMessage.isPending} onClick={() => setDraft(question)}>
                        {question}
                      </button>
                    ))}
                  </div>
                </PageSection>
              </div>
            )}
          {preparationPlan && selectedThread ? <PreparationPlanView threadId={selectedThread.id} planId={preparationPlan.id} busy={sendMessage.isPending || confirmAction.isPending || cancelAction.isPending} onSay={text => sendMessage.mutate(text)} onReview={id => { const target = document.getElementById(`copilot-action-${id}`); target?.focus(); target?.scrollIntoView({ block: "nearest" }); }}/> : null}
          </div>

          <div className="career-ai-composer border-t border-slate-200 bg-white p-4">
            <p hidden={managed} className="mb-3 text-xs text-slate-500">Local record search, resume comparisons, reviewed application next actions, profile-skill additions, application-status changes and job notes. Free-form AI editing is not available yet.</p>
            {activeScope === "job" && !missingContext ? <button className="button mb-3" disabled={sendMessage.isPending} onClick={() => sendMessage.mutate("Help me prepare for this job.")}>Prepare this job</button> : null}
            {sendMessage.isPending ? <p role="status" className="mb-2 text-sm">Checking your saved records…</p> : null}
            {activeScope === "job" && !missingContext ? <JobNoteComposer key={`${activeId}:${selectedThread?.id ?? "new"}`} targetLabel={contextLabel} disabled={sendMessage.isPending || createThread.isPending} pendingNote={pendingActions.some(action => action.type === "set_job_note")} onPropose={async text => {
              await sendMessage.mutateAsync({ note: text });
            }} /> : null}
            <div className="flex gap-2">
              <textarea
                aria-label="Message Career Copilot"
                placeholder={embedded && !managed ? "Ask about this job or your supporting experience…" : "Ask about your job search…"}
                className="field min-h-16 flex-1"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submit(draft);
                  }
                }}
              />
              <button className="button button-primary self-stretch" type="button" disabled={sendMessage.isPending || missingContext || !draft.trim()} onClick={() => submit(draft)}>
                <Send size={16} />
                Send
              </button>
            </div>
          </div>
        </section>

        <aside ref={reviewPanel} aria-label="Review changes and sources" className={managed ? "career-ai-review panel space-y-4 p-4" : embedded ? "panel space-y-4 p-4" : "panel space-y-4 p-4 lg:col-start-2"}>
          <section>
            <h3 className="text-sm font-semibold text-slate-950">Review changes ({pendingActions.length})</h3>
            <div className="mt-3 space-y-3">
              {pendingActions.map((action) => (
                <div key={action.id} id={`copilot-action-${action.id}`} tabIndex={-1} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                  <p className="font-semibold text-amber-950">{action.label}</p>
                  <p className="mt-1 text-xs text-amber-800">{action.recordsAffected.map((record) => record.label).join(", ")}</p>
                  {action.type === RESUME_BULLET_ACTION ? <ResumeBulletDetails action={action} sources={messages.find(m => m.id === action.messageId)?.internalCitationsJson ?? []}/> : action.type === APPLICATION_NEXT_ACTION ? <ApplicationNextActionDetails action={action} sources={messages.find(m => m.id === action.messageId)?.internalCitationsJson ?? []}/> : action.type === PROFILE_SKILL_ACTION ? <ProfileSkillDetails action={action} sources={messages.find(m => m.id === action.messageId)?.internalCitationsJson ?? []}/> : action.type === "set_job_note" ? <dl className="mt-3 space-y-3 rounded-md bg-white p-3">
                    <div><dt className="text-xs text-slate-500">Before</dt><dd className="whitespace-pre-wrap break-words">{String(action.beforeJson.notes || "No note")}</dd></div>
                    <div><dt className="text-xs text-slate-500">After</dt><dd className="whitespace-pre-wrap break-words">{String(action.afterJson.notes || "No note")}</dd></div>
                  </dl> : <dl className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-white p-3">
                    <div><dt className="text-xs text-slate-500">Before</dt><dd>{String(action.beforeJson.status ?? "—")}</dd><dd className="text-xs">Applied date: {String(action.beforeJson.appliedDate || "Not recorded")}</dd></div>
                    <div><dt className="text-xs text-slate-500">After</dt><dd>{String(action.afterJson.status ?? "—")}</dd><dd className="text-xs">Applied date: {String(action.afterJson.appliedDate || "Not recorded")}</dd></div>
                  </dl>}
                  <p className="mt-2 text-xs">{action.type === RESUME_BULLET_ACTION ? "Only the reviewed draft child or archive flag is created. No source version or application attachment changes." : action.type === APPLICATION_NEXT_ACTION ? "Changes only the reviewed next action and follow-up date. Status, submission evidence and résumé identity are preserved." : action.type === PROFILE_SKILL_ACTION ? "Changes only the reviewed profile skill. No saved résumé or application is rewritten. Future matching may use the new skill." : action.type === "set_job_note" ? "Replaces this job’s private note only. User-supplied text is not verified career evidence." : "Updates your tracker only. Does not submit an application."}</p>
                  <div className="mt-3 flex gap-2">
                    <button className="button button-primary" type="button" disabled={missingContext || confirmAction.isPending || cancelAction.isPending} onClick={() => confirmAction.mutate(action)}>
                      <Check size={14} />
                      Accept change
                    </button>
                    <button className="button" type="button" disabled={confirmAction.isPending || cancelAction.isPending} onClick={() => cancelAction.mutate(action)}>
                      <X size={14} />
                      {(action.type === PROFILE_SKILL_ACTION || action.type === APPLICATION_NEXT_ACTION || action.type === RESUME_BULLET_ACTION) ? "Reject proposal" : "Cancel"}
                    </button>
                  </div>
                </div>
              ))}
              {!pendingActions.length ? <p className="text-sm text-slate-500">No pending writes.</p> : null}
            </div>
          </section>

          {actionResult ? <p role="status" className="text-sm">{actionResult}</p> : null}
          {acceptedActions.length ? <details className="border-t border-slate-200 pt-4"><summary className="cursor-pointer text-sm font-semibold">Accepted changes ({acceptedActions.length})</summary>{acceptedActions.map(action => <div key={action.id} className="mt-3 flex flex-wrap items-center gap-3 text-sm"><span>{action.label}</span>{action.type === RESUME_BULLET_ACTION ? <><SourceChip source={{ id: `resume:${action.afterJson.childId}:`, entityType: "resume", entityId: String(action.afterJson.childId), label: "Open exact child", detail: "Created version; PDF status is shown in the library", parentEntityType: "", parentEntityId: "" }}/><details><summary>Show what changed</summary><ResumeBulletDetails action={action} sources={messages.find(m => m.id === action.messageId)?.internalCitationsJson ?? []}/></details></> : null}{(action.type === PROFILE_SKILL_ACTION || action.type === APPLICATION_NEXT_ACTION || action.type === RESUME_BULLET_ACTION) && messages.some(m => m.pendingActionsJson.some(a => a.afterJson.undoOf === action.id && a.status === "confirmed")) ? <span>{action.type === RESUME_BULLET_ACTION ? "Child archived · content and audit retained" : "Undone · audit retained"}</span> : <><span>{action.type === RESUME_BULLET_ACTION ? "Reviewed archiving available while unchanged and unused" : "Reversible through review"}</span><button className="button" disabled={undoAction.isPending} onClick={() => undoAction.mutate(action)}>Review undo</button></>}</div>)}</details> : null}
          <details className="border-t border-slate-200 pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-950">Sources ({selectedSources.length})</summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedSources.length ? selectedSources.map((source) => <SourceChip key={`${source.id}-${source.label}`} source={source} />) : <p className="text-sm text-slate-500">No sources cited yet.</p>}
            </div>
          </details>

          {settingsQuery.data?.developerMode ? (
            <section className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-950">Context preview</h3>
              <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                {JSON.stringify(messages.at(-1)?.structuredContentJson?.contextPreview ?? [], null, 2)}
              </pre>
            </section>
          ) : null}
        </aside>
      </div>
      </div>
    </div>
  );
}
