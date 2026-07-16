import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, MessageSquarePlus, Send, Trash2, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, InlineError, LoadingState } from "../../components/States";
import { sendCareerCopilotMessage } from "../../lib/copilot/careerCopilot";
import { useRepository } from "../../lib/database/repositoryContext";
import type {
  CareerCopilotContextType,
  CareerCopilotMessage,
  CareerCopilotPendingAction,
  InternalCitation,
} from "../../types/domain";

const starterQuestions = [
  "Which resume should I use for this job?",
  "Have I applied to NVIDIA before?",
  "Which applications used Forge?",
  "Compare my full-stack and AI resumes.",
  "Draft a grounded answer to why this role.",
  "Show applications that need follow-up.",
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

function citationLink(source: InternalCitation) {
  if (source.entityType === "resume" || source.parentEntityType === "resume") {
    return `/library?resumeId=${encodeURIComponent(source.parentEntityType === "resume" ? source.parentEntityId : source.entityId)}`;
  }
  if (source.entityType === "application" || source.parentEntityType === "application") {
    return "/applications";
  }
  if (source.entityType === "job" || source.parentEntityType === "job") {
    return "/tailor";
  }
  return "/career-memory";
}

function SourceChip({ source }: { source: InternalCitation }) {
  return (
    <Link
      className="inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-800"
      to={citationLink(source)}
      title={source.detail || source.entityType}
    >
      <span className="truncate">{source.label}</span>
    </Link>
  );
}

function MessageBubble({ message }: { message: CareerCopilotMessage }) {
  const isUser = message.role === "user";
  return (
    <article className={isUser ? "ml-auto max-w-[78%] rounded-md bg-blue-700 px-4 py-3 text-sm leading-6 text-white" : "max-w-[82%] rounded-md border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800"}>
      <p className="whitespace-pre-wrap">{message.content}</p>
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

export function CareerCopilotPage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState<CareerCopilotContextType>(
    (searchParams.get("contextType") as CareerCopilotContextType | null) ?? "all",
  );
  const [contextId] = useState(() => searchParams.get("contextId") ?? "");
  const [error, setError] = useState("");

  const threadsQuery = useQuery({
    queryKey: ["career-copilot-threads"],
    queryFn: () => repository.listCareerCopilotThreads(false),
  });
  const selectedThread = useMemo(
    () => threadsQuery.data?.find((thread) => thread.id === selectedThreadId) ?? threadsQuery.data?.[0],
    [selectedThreadId, threadsQuery.data],
  );
  const messagesQuery = useQuery({
    queryKey: ["career-copilot-messages", selectedThread?.id ?? ""],
    queryFn: () => (selectedThread ? repository.listCareerCopilotMessages(selectedThread.id) : Promise.resolve([])),
  });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => repository.getSettings() });
  const searchDiagnosticsQuery = useQuery({
    queryKey: ["search-diagnostics"],
    queryFn: () => repository.getSearchDiagnostics(),
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) =>
      sendCareerCopilotMessage(repository, {
        threadId: selectedThread?.id,
        content,
        activeContextType: selectedThread?.activeContextType ?? scope,
        activeContextId: selectedThread?.activeContextId ?? contextId,
      }),
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
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (caught) => setError(caught instanceof Error ? caught.message : String(caught)),
  });
  const cancelAction = useMutation({
    mutationFn: (action: CareerCopilotPendingAction) => repository.cancelCareerCopilotAction(action),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  if (threadsQuery.isLoading || messagesQuery.isLoading || settingsQuery.isLoading || searchDiagnosticsQuery.isLoading) {
    return <LoadingState label="Loading Career Copilot..." />;
  }
  if (threadsQuery.isError) throw threadsQuery.error;
  if (messagesQuery.isError) throw messagesQuery.error;

  const messages = messagesQuery.data ?? [];
  const pendingActions = messages.flatMap((message) =>
    message.pendingActionsJson.filter((action) => action.status === "pending"),
  );
  const selectedSources = messages.flatMap((message) => message.internalCitationsJson);

  const submit = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    sendMessage.mutate(trimmed);
  };

  return (
    <div>
      <PageHeader eyebrow="Cited local assistant" title="Career Copilot" />
      <div className="grid h-[calc(100vh-92px)] grid-cols-[280px_minmax(0,1fr)_320px] overflow-hidden">
        <aside className="border-r border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button className="button button-primary w-full" type="button" onClick={() => createThread.mutate()}>
              <MessageSquarePlus size={15} />
              New
            </button>
          </div>
          <select className="field mt-3" value={scope} onChange={(event) => setScope(event.target.value as CareerCopilotContextType)}>
            {scopes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <div className="mt-4 space-y-2">
            {(threadsQuery.data ?? []).map((thread) => (
              <button
                key={thread.id}
                className={thread.id === selectedThread?.id ? "w-full rounded-md bg-blue-50 px-3 py-2 text-left text-sm font-semibold text-blue-800" : "w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100"}
                type="button"
                onClick={() => setSelectedThreadId(thread.id)}
              >
                <span className="block truncate">{thread.title}</span>
                <span className="block truncate text-xs font-normal text-slate-500">{thread.activeContextType.replace("_", " ")}</span>
              </button>
            ))}
            {!threadsQuery.data?.length ? <p className="px-2 py-8 text-center text-sm text-slate-500">No conversations yet.</p> : null}
          </div>
        </aside>

        <main className="flex min-w-0 flex-col bg-[#f6f7f9]">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-5 py-3">
            <div className="mr-auto min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{selectedThread?.title ?? "Career Copilot"}</p>
              <p className="text-xs text-slate-500">
                Search docs {searchDiagnosticsQuery.data?.documentCount ?? 0} | FTS5 {searchDiagnosticsQuery.data?.fts5Available ? "on" : "fallback"} | Semantic {settingsQuery.data?.semanticSearchMode ?? "disabled"}
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

          <div className="flex-1 space-y-4 overflow-auto p-5">
            {error ? <InlineError message={error} /> : null}
            {messages.length ? (
              messages.map((message) => <MessageBubble key={message.id} message={message} />)
            ) : (
              <EmptyState title="Ask about your job search" body="Career Copilot answers from saved local records and cites the records it used." />
            )}
          </div>

          <div className="border-t border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {starterQuestions.map((question) => (
                <button key={question} className="button" type="button" onClick={() => submit(question)}>
                  {question}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea
                className="field min-h-16 flex-1"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit(draft);
                  }
                }}
              />
              <button className="button button-primary self-stretch" type="button" disabled={sendMessage.isPending || !draft.trim()} onClick={() => submit(draft)}>
                <Send size={16} />
                Send
              </button>
            </div>
          </div>
        </main>

        <aside className="space-y-4 overflow-auto border-l border-slate-200 bg-white p-4">
          <section>
            <h3 className="text-sm font-semibold text-slate-950">Pending actions</h3>
            <div className="mt-3 space-y-3">
              {pendingActions.map((action) => (
                <div key={action.id} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                  <p className="font-semibold text-amber-950">{action.label}</p>
                  <p className="mt-1 text-xs text-amber-800">{action.recordsAffected.map((record) => record.label).join(", ")}</p>
                  <div className="mt-3 flex gap-2">
                    <button className="button button-primary" type="button" onClick={() => confirmAction.mutate(action)}>
                      <Check size={14} />
                      Confirm
                    </button>
                    <button className="button" type="button" onClick={() => cancelAction.mutate(action)}>
                      <X size={14} />
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
              {!pendingActions.length ? <p className="text-sm text-slate-500">No pending writes.</p> : null}
            </div>
          </section>

          <section className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-950">Sources</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedSources.length ? selectedSources.map((source) => <SourceChip key={`${source.id}-${source.label}`} source={source} />) : <p className="text-sm text-slate-500">No sources cited yet.</p>}
            </div>
          </section>

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
  );
}
