import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  Check,
  CheckCheck,
  FileJson,
  Filter,
  LoaderCircle,
  Merge,
  Package,
  RotateCcw,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { InlineError, LoadingState } from "../../components/States";
import { AlertBanner, Badge, ConfidenceBadge, PageSection, ProgressChecklist, StatusBadge } from "../../components/ui";
import { createAIProvider } from "../../lib/ai/providerFactory";
import {
  assertCareerImportReadyToSave,
  classifyCareerImportInput,
  createDeterministicCareerImportProposal,
  parseCareerImportPackageText,
  prepareCareerImportProposal,
  serializeCareerImportPackage,
} from "../../lib/import/careerIntake";
import type {
  CareerFact,
  CareerImportProposal,
  CareerImportSourceType,
  CareerImportUserDecision,
  CareerItem,
  EvidenceStatus,
  Skill,
} from "../../types/domain";
import { compactError } from "../../lib/utils";
import { useRepository } from "../../lib/database/repositoryContext";

type ProposalChange =
  | CareerImportProposal["profileChanges"][number]
  | CareerImportProposal["careerItemChanges"][number]
  | CareerImportProposal["careerFactChanges"][number]
  | CareerImportProposal["skillChanges"][number]
  | CareerImportProposal["relationshipChanges"][number];

const modes: Array<{ id: CareerImportSourceType; label: string }> = [
  { id: "paste_anything", label: "Paste anything" },
  { id: "structured_package", label: "Import structured package" },
  { id: "guided_interview", label: "Guided interview" },
  { id: "project_completion_report", label: "Project completion report" },
  { id: "resume_text", label: "Existing resume text" },
];

const evidenceStatuses: EvidenceStatus[] = ["user_provided", "verified", "needs_review", "prohibited"];

function stringify(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function updateChange(
  proposal: CareerImportProposal,
  proposalId: string,
  updater: (change: ProposalChange) => ProposalChange,
): CareerImportProposal {
  const update = <T extends ProposalChange>(changes: T[]) =>
    changes.map((change) => (change.proposalId === proposalId ? updater(change) : change)) as T[];
  return {
    ...proposal,
    profileChanges: update(proposal.profileChanges),
    careerItemChanges: update(proposal.careerItemChanges),
    careerFactChanges: update(proposal.careerFactChanges),
    skillChanges: update(proposal.skillChanges),
    relationshipChanges: update(proposal.relationshipChanges),
  };
}

function allChanges(proposal: CareerImportProposal) {
  return [
    ...proposal.profileChanges,
    ...proposal.careerItemChanges,
    ...proposal.careerFactChanges,
    ...proposal.skillChanges,
    ...proposal.relationshipChanges,
  ];
}

function decisionClass(decision: CareerImportUserDecision) {
  if (decision === "approved" || decision === "edited") return "text-emerald-700";
  if (decision === "merge") return "text-blue-700";
  if (decision === "rejected") return "text-red-700";
  return "text-slate-500";
}

function decisionButtonClass(change: ProposalChange, decision: CareerImportUserDecision, danger = false) {
  if (change.userDecision === decision) {
    return danger ? "button button-danger" : "button button-primary";
  }
  return danger ? "button button-danger" : "button";
}

function labelize(value: string) {
  return value.replaceAll("_", " ");
}

function changeLabel(change: ProposalChange) {
  const value = change.proposedValue as Record<string, unknown>;
  return String(
    value.title ??
      value.name ??
      value.statement ??
      value.fullName ??
      value.relationshipType ??
      labelize(change.targetType),
  );
}

function isSaveableWithoutMerge(change: ProposalChange) {
  return (
    (change.validationStatus === "valid" || change.validationStatus === "warning") &&
    change.duplicateCandidates.length === 0
  );
}

function isBlockedChange(change: ProposalChange) {
  return change.validationStatus === "invalid" || change.validationStatus === "conflict";
}

function isMergeableDuplicate(change: ProposalChange) {
  return change.duplicateCandidates.length > 0 && change.validationStatus !== "invalid";
}

function isPendingChange(change: ProposalChange) {
  return change.userDecision === "pending";
}

function ProposalValue({ value }: { value: unknown }) {
  if (value == null || value === "") return <p className="text-slate-500">No existing value</p>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <p className="break-words text-slate-700">{String(value)}</p>;
  }
  if (Array.isArray(value)) {
    return value.length ? (
      <div className="flex flex-wrap gap-1.5">
        {value.map((item, index) => <Badge key={`${String(item)}-${index}`}>{String(item)}</Badge>)}
      </div>
    ) : <p className="text-slate-500">None</p>;
  }
  if (typeof value === "object") {
    return (
      <dl className="space-y-2">
        {Object.entries(value as Record<string, unknown>).filter(([key]) => !["id", "createdAt", "updatedAt"].includes(key)).map(([key, entry]) => (
          <div key={key}>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{labelize(key)}</dt>
            <dd className="mt-0.5 break-words text-slate-700">
              {Array.isArray(entry) ? entry.join(", ") || "None" : typeof entry === "object" && entry !== null ? JSON.stringify(entry) : String(entry ?? "") || "None"}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <p>{String(value)}</p>;
}

export function SmartCareerIntake({
  items,
  facts,
  skills,
  selectedItemId,
  onDone,
}: {
  items: CareerItem[];
  facts: CareerFact[];
  skills: Skill[];
  selectedItemId: string | null;
  onDone: () => Promise<unknown> | unknown;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<CareerImportSourceType>("paste_anything");
  const [sourceText, setSourceText] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [proposal, setProposal] = useState<CareerImportProposal | null>(null);
  const [editingId, setEditingId] = useState("");
  const [editText, setEditText] = useState("");
  const [filter, setFilter] = useState<"all" | "warnings" | "conflicts">("all");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: () => repository.getProfile() });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => repository.getSettings() });
  const importsQuery = useQuery({
    queryKey: ["career-imports"],
    queryFn: () => repository.listCareerImportRecords(),
  });
  const applyImport = useMutation({
    mutationFn: (ready: CareerImportProposal) => repository.applyCareerImportProposal(ready),
    onSuccess: async (record) => {
      setStatus(`Saved ${record.approvedCount} approved changes.`);
      setProposal(null);
      setSourceText("");
      await queryClient.invalidateQueries();
      await onDone();
    },
    onError: (caught) => setError(compactError(caught)),
  });
  const undoImport = useMutation({
    mutationFn: () => repository.undoLastCareerImport(),
    onSuccess: async (record) => {
      setStatus(record ? `Undid import ${record.sourceTitle}.` : "No import is available to undo.");
      await queryClient.invalidateQueries();
      await onDone();
    },
    onError: (caught) => setError(compactError(caught)),
  });

  const context = useMemo(
    () => ({
      profile: profileQuery.data ?? null,
      careerItems: items,
      careerFacts: facts,
      skills,
    }),
    [facts, items, profileQuery.data, skills],
  );

  if (profileQuery.isLoading || settingsQuery.isLoading || importsQuery.isLoading) {
    return <LoadingState label="Loading intake..." />;
  }
  if (profileQuery.isError) throw profileQuery.error;
  if (settingsQuery.isError) throw settingsQuery.error;
  if (importsQuery.isError) throw importsQuery.error;

  const settings = settingsQuery.data;
  if (!settings) return <LoadingState label="Loading intake..." />;
  const latestImport = (importsQuery.data ?? []).find((record) => !record.undoneAt);
  const usesOpenAIExtraction =
    settings.aiProvider === "openai" && mode !== "structured_package" && mode !== "guided_interview";
  const readyToSave = proposal
    ? (() => {
        try {
          assertCareerImportReadyToSave(proposal);
          return true;
        } catch {
          return false;
        }
      })()
    : false;

  const extract = async () => {
    if (isExtracting) return;
    setError("");
    setStatus("");
    setIsExtracting(true);
    try {
      if (mode === "structured_package") {
        setStatus("Parsing structured package...");
        const parsed = parseCareerImportPackageText(sourceText);
        setProposal(prepareCareerImportProposal(parsed.proposal, context));
        setStatus("Package parsed and ready for review.");
        return;
      }
      if (mode === "guided_interview") {
        setStatus("Generating local interview proposal...");
        const draft = createDeterministicCareerImportProposal({
          text: sourceText,
          sourceType: "guided_interview",
          sourceTitle: sourceTitle || "Guided interview answers",
          sourceReference: "guided interview draft",
        });
        setProposal(prepareCareerImportProposal(draft, context));
        setStatus("Interview answers converted into proposals.");
        return;
      }
      setStatus(
        usesOpenAIExtraction
          ? "OpenAI extraction is running. This can take a few minutes for long Candidate Brain prompts."
          : "Generating local proposal...",
      );
      const provider = createAIProvider(settings.aiProvider);
      const sourceType = mode === "paste_anything" ? classifyCareerImportInput(sourceText) : mode;
      const result = await provider.extractCareerInformation({
        text: sourceText,
        sourceType,
        sourceTitle: sourceTitle || modes.find((item) => item.id === mode)?.label || "Career intake",
        sourceReference: sourceTitle || "manual paste",
        modelName: settings.modelName,
      });
      setProposal(prepareCareerImportProposal(result.data, context));
      setStatus(`${settings.aiProvider === "openai" ? "OpenAI" : "Mock"} extraction is ready for review.`);
    } catch (caught) {
      setError(compactError(caught));
      setStatus("Extraction did not complete. Review the error and try again.");
    } finally {
      setIsExtracting(false);
    }
  };

  const setDecision = (proposalId: string, decision: CareerImportUserDecision) => {
    if (!proposal) return;
    setProposal(updateChange(proposal, proposalId, (change) => ({ ...change, userDecision: decision })));
    const change = allChanges(proposal).find((item) => item.proposalId === proposalId);
    setStatus(`${change ? changeLabel(change) : "Proposal"} marked ${labelize(decision)}.`);
  };

  const applyBulkDecision = (
    label: string,
    decision: CareerImportUserDecision,
    predicate: (change: ProposalChange) => boolean,
  ) => {
    if (!proposal) return;
    let changed = 0;
    const next = allChanges(proposal).reduce((current, change) => {
      if (!predicate(change)) return current;
      changed += 1;
      return updateChange(current, change.proposalId, (candidate) => ({ ...candidate, userDecision: decision }));
    }, proposal);
    setProposal(next);
    setStatus(`${label}: ${changed} proposal${changed === 1 ? "" : "s"} marked ${labelize(decision)}.`);
  };

  const bulkApproveSaveable = () => {
    applyBulkDecision("Approve saveable", "approved", (change) => isPendingChange(change) && isSaveableWithoutMerge(change));
  };

  const bulkMergeDuplicates = () => {
    applyBulkDecision("Merge duplicates", "merge", (change) => isPendingChange(change) && isMergeableDuplicate(change));
  };

  const bulkRejectDuplicates = () => {
    applyBulkDecision(
      "Reject duplicates",
      "rejected",
      (change) => isPendingChange(change) && change.duplicateCandidates.length > 0,
    );
  };

  const bulkRejectBlocked = () => {
    applyBulkDecision("Reject invalid/conflicts", "rejected", (change) => isPendingChange(change) && isBlockedChange(change));
  };

  const rejectPending = () => {
    if (!proposal) return;
    applyBulkDecision("Reject pending", "rejected", isPendingChange);
  };

  const setAllFactEvidence = (evidenceStatus: EvidenceStatus) => {
    if (!proposal) return;
    setProposal({
      ...proposal,
      careerFactChanges: proposal.careerFactChanges.map((change) => ({
        ...change,
        proposedValue: { ...change.proposedValue, evidenceStatus },
      })),
    });
  };

  const beginEdit = (change: ProposalChange) => {
    setEditingId(change.proposalId);
    setEditText(stringify(change.proposedValue));
  };

  const saveEdit = (proposalId: string) => {
    if (!proposal) return;
    try {
      const parsed = JSON.parse(editText) as ProposalChange["proposedValue"];
      const edited = updateChange(proposal, proposalId, (change) => ({
        ...change,
        proposedValue: parsed,
        userDecision: "edited",
      }) as ProposalChange);
      setProposal(prepareCareerImportProposal(edited, context));
      setEditingId("");
      setEditText("");
    } catch (caught) {
      setError(compactError(caught));
    }
  };

  const exportPackage = async () => {
    setError("");
    try {
      const exported = await repository.createCareerImportPackage(selectedItemId ? [selectedItemId] : undefined);
      const path = await save({
        defaultPath: "careercompiler-import-package.json",
        filters: [{ name: "CareerCompiler package", extensions: ["json"] }],
      });
      if (path) await invoke("write_text_file", { path, text: serializeCareerImportPackage(exported) });
      setStatus("Career memory package exported.");
    } catch (caught) {
      setError(compactError(caught));
    }
  };

  const grouped = proposal
    ? [
        ["Profile", proposal.profileChanges],
        ["Projects", proposal.careerItemChanges.filter((change) => change.proposedValue.type === "project")],
        ["Employment", proposal.careerItemChanges.filter((change) => change.proposedValue.type === "employment")],
        ["Education", proposal.careerItemChanges.filter((change) => change.proposedValue.type === "education")],
        ["Facts", proposal.careerFactChanges],
        ["Skills", proposal.skillChanges],
        ["Questions requiring answers", []],
      ] as const
    : [];

  const visible = (change: ProposalChange) =>
    filter === "all" ||
    (filter === "warnings" && (change.validationStatus === "warning" || change.validationStatus === "invalid")) ||
    (filter === "conflicts" && change.validationStatus === "conflict");
  const proposalChanges = proposal ? allChanges(proposal) : [];
  const proposalBreakdown = {
    safe: proposalChanges.filter(isSaveableWithoutMerge).length,
    needsConfirmation: proposalChanges.filter((change) => change.validationStatus === "warning").length,
    conflicts: proposalChanges.filter((change) => change.validationStatus === "conflict" || change.validationStatus === "invalid").length,
    duplicates: proposalChanges.filter((change) => change.duplicateCandidates.length).length,
    pending: proposalChanges.filter((change) => change.userDecision === "pending").length,
    skipped: proposalChanges.filter((change) => change.userDecision === "rejected").length,
    mergeableDuplicates: proposalChanges.filter(isMergeableDuplicate).length,
    blocked: proposalChanges.filter(isBlockedChange).length,
    pendingSafe: proposalChanges.filter((change) => isPendingChange(change) && isSaveableWithoutMerge(change)).length,
    pendingMergeableDuplicates: proposalChanges.filter((change) => isPendingChange(change) && isMergeableDuplicate(change)).length,
    pendingDuplicates: proposalChanges.filter((change) => isPendingChange(change) && change.duplicateCandidates.length).length,
    pendingBlocked: proposalChanges.filter((change) => isPendingChange(change) && isBlockedChange(change)).length,
  };

  return (
    <PageSection
      title="Smart Career Intake"
      description="Paste or import career information, review proposed records by category, resolve conflicts, and save only approved changes."
      actions={
        <>
          <button className="button" type="button" onClick={exportPackage}>
            <Package size={15} aria-hidden="true" />
            Export package
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              if (window.confirm("Undo the most recent Smart Career Intake import?")) undoImport.mutate();
            }}
            disabled={!latestImport || undoImport.isPending}
          >
            <RotateCcw size={15} aria-hidden="true" />
            Undo import
          </button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            {["Paste or upload", "Extract proposals", "Review categories", "Resolve issues", "Save approved"].map((step, index) => (
              <Badge key={step} tone={proposal ? (index < 2 ? "emerald" : "blue") : index === 0 ? "blue" : "slate"}>
                {index + 1}. {step}
              </Badge>
            ))}
          </div>
          <AlertBanner tone="blue" title="Nothing is saved during extraction">
            Proposed records stay in this review panel until you approve them and choose Save approved changes.
          </AlertBanner>
        </div>
        <ProgressChecklist
          items={[
            { label: "Input collected", complete: Boolean(sourceText.trim()), detail: sourceTitle || "Add a source title to make review easier." },
            { label: "Proposal generated", complete: Boolean(proposal), detail: proposal ? `${proposalChanges.length} proposed changes` : "Run extraction to preview changes.", warning: true },
            { label: "Decisions made", complete: Boolean(proposal && proposalBreakdown.pending === 0), detail: proposal ? `${proposalBreakdown.pending} proposals still pending` : "Review after extraction.", warning: true },
            { label: "Ready to save", complete: readyToSave, detail: readyToSave ? "Only approved or merged changes will be saved." : "Reject invalid rows or mark conflicts as merge/update.", warning: true },
          ]}
        />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
        <select
          className="field"
          value={mode}
          onChange={(event) => setMode(event.target.value as CareerImportSourceType)}
          disabled={isExtracting}
        >
          {modes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <input
          className="field"
          value={sourceTitle}
          placeholder="Source title or reference"
          onChange={(event) => setSourceTitle(event.target.value)}
          disabled={isExtracting}
        />
      </div>

      {mode === "guided_interview" ? (
        <div className="mt-3 grid grid-cols-5 gap-2 text-xs font-semibold text-slate-600">
          {["Profile", "Employment", "Project", "Education", "Source or proof"].map((label) => (
            <span key={label} className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
              {label}
            </span>
          ))}
        </div>
      ) : null}

      <textarea
        className="field mt-3 min-h-44"
        value={sourceText}
        placeholder={
          mode === "structured_package"
            ? "Paste a CareerCompiler import package JSON"
            : "Paste career information, project notes, resume text, or interview answers"
        }
        onChange={(event) => setSourceText(event.target.value)}
        disabled={isExtracting}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="button button-primary"
          type="button"
          onClick={extract}
          disabled={!sourceText.trim() || isExtracting}
          aria-busy={isExtracting}
        >
          {isExtracting ? (
            <LoaderCircle size={15} aria-hidden="true" className="animate-spin" />
          ) : mode === "structured_package" ? (
            <FileJson size={15} aria-hidden="true" />
          ) : (
            <Wand2 size={15} aria-hidden="true" />
          )}
          {isExtracting
            ? usesOpenAIExtraction
              ? "Extracting with OpenAI..."
              : "Generating proposal..."
            : usesOpenAIExtraction
              ? "Extract with OpenAI"
              : "Generate proposal"}
        </button>
        <button className="button" type="button" onClick={() => setSourceText("")} disabled={isExtracting}>
          <X size={15} aria-hidden="true" />
          Clear
        </button>
        {mode === "guided_interview" ? (
          <button
            className="button"
            type="button"
            onClick={() => setStatus("Draft saved locally in this review panel.")}
            disabled={isExtracting}
          >
            <Upload size={15} aria-hidden="true" />
            Save draft
          </button>
        ) : null}
      </div>
      {error ? <InlineError message={error} /> : null}
      {status ? <p className="mt-3 text-sm font-semibold text-blue-800">{status}</p> : null}

      {proposal ? (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <h4 className="text-base font-semibold text-slate-950">Review import proposal</h4>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Bulk actions handle repetitive rows. Duplicates can be skipped or merged into the matching existing record.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="emerald">{proposalBreakdown.safe} safe to import</Badge>
                <Badge tone="amber">{proposalBreakdown.needsConfirmation} need confirmation</Badge>
                <Badge tone="red">{proposalBreakdown.conflicts} conflicts</Badge>
                <Badge tone="blue">{proposalBreakdown.duplicates} possible duplicates</Badge>
                <Badge>{proposalBreakdown.pending} pending decisions</Badge>
                <Badge>{proposalBreakdown.skipped} skipped</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <select className="field w-44" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
                <option value="all">All proposals</option>
                <option value="warnings">Warnings/errors</option>
                <option value="conflicts">Conflicts</option>
              </select>
            </div>
          </div>
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">Bulk resolution</span>
              <button className="button" type="button" onClick={bulkApproveSaveable} disabled={proposalBreakdown.pendingSafe === 0}>
                <CheckCheck size={15} aria-hidden="true" />
                Approve saveable ({proposalBreakdown.pendingSafe})
              </button>
              <button
                className="button"
                type="button"
                onClick={bulkMergeDuplicates}
                disabled={proposalBreakdown.pendingMergeableDuplicates === 0}
              >
                <Merge size={15} aria-hidden="true" />
                Merge duplicates ({proposalBreakdown.pendingMergeableDuplicates})
              </button>
              <button className="button" type="button" onClick={bulkRejectDuplicates} disabled={proposalBreakdown.pendingDuplicates === 0}>
                <X size={15} aria-hidden="true" />
                Reject duplicates ({proposalBreakdown.pendingDuplicates})
              </button>
              <button className="button button-danger" type="button" onClick={bulkRejectBlocked} disabled={proposalBreakdown.pendingBlocked === 0}>
                <X size={15} aria-hidden="true" />
                Reject invalid/conflicts ({proposalBreakdown.pendingBlocked})
              </button>
              <button className="button button-danger" type="button" onClick={rejectPending} disabled={proposalBreakdown.pending === 0}>
                <X size={15} aria-hidden="true" />
                Reject pending
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Filter size={15} aria-hidden="true" />
            <span className="font-semibold text-slate-700">Fact evidence</span>
            <select className="field w-52" onChange={(event) => setAllFactEvidence(event.target.value as EvidenceStatus)} defaultValue="">
              <option value="" disabled>
                Bulk status
              </option>
              {evidenceStatuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 space-y-4">
            {grouped.map(([label, changes]) => (
              <section key={label}>
                <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</h4>
                {label === "Questions requiring answers" && proposal.unresolvedQuestions.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-amber-800">
                    {proposal.unresolvedQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-2 space-y-3">
                  {changes.filter(visible).map((change) => (
                    <div key={`${label}-${change.proposalId}`} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-950">{labelize(change.targetType)}</span>
                            <StatusBadge status={change.validationStatus} />
                            <span className={`text-xs font-semibold ${decisionClass(change.userDecision)}`}>
                              {labelize(change.userDecision)}
                            </span>
                            <ConfidenceBadge value={change.confidence} />
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{change.reason}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className={decisionButtonClass(change, "approved")}
                            type="button"
                            aria-pressed={change.userDecision === "approved"}
                            onClick={() => setDecision(change.proposalId, "approved")}
                            disabled={isBlockedChange(change)}
                            title={isBlockedChange(change) ? "Invalid and conflicting rows must be edited, merged, or rejected." : "Approve this proposal"}
                          >
                            <Check size={14} aria-hidden="true" />
                            Approve
                          </button>
                          <button className="button" type="button" onClick={() => beginEdit(change)}>
                            Edit
                          </button>
                          <button
                            className={decisionButtonClass(change, "merge")}
                            type="button"
                            aria-pressed={change.userDecision === "merge"}
                            onClick={() => setDecision(change.proposalId, "merge")}
                            disabled={!change.duplicateCandidates.length && change.validationStatus !== "conflict"}
                            title="Merge/update the existing matching record with this proposal"
                          >
                            <Merge size={14} aria-hidden="true" />
                            Merge/update
                          </button>
                          <button
                            className={decisionButtonClass(change, "rejected", true)}
                            type="button"
                            aria-pressed={change.userDecision === "rejected"}
                            onClick={() => setDecision(change.proposalId, "rejected")}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                        <div className="rounded border border-slate-200 bg-slate-50 p-2">
                          <p className="font-semibold text-slate-700">Proposed value</p>
                          <div className="mt-2 max-h-56 overflow-auto">
                            <ProposalValue value={change.proposedValue} />
                          </div>
                        </div>
                        <div className="rounded border border-slate-200 bg-slate-50 p-2">
                          <p className="font-semibold text-slate-700">Existing value</p>
                          <div className="mt-2 max-h-56 overflow-auto">
                            <ProposalValue value={change.existingValue} />
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                        {change.sourceExcerpt || "No source excerpt supplied."}
                      </p>
                      {[...change.validationIssues, ...change.conflictDetails].length ? (
                        <ul className="mt-2 space-y-1 text-xs font-semibold text-amber-800">
                          {[...change.validationIssues, ...change.conflictDetails].map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      ) : null}
                      {change.duplicateCandidates.length ? (
                        <p className="mt-2 text-xs text-slate-500">Duplicate candidates: {change.duplicateCandidates.join(", ")}</p>
                      ) : null}
                      {editingId === change.proposalId ? (
                        <div className="mt-3">
                          <textarea className="field min-h-40 font-mono text-xs" value={editText} onChange={(event) => setEditText(event.target.value)} />
                          <div className="mt-2 flex gap-2">
                            <button className="button button-primary" type="button" onClick={() => saveEdit(change.proposalId)}>
                              Save edit
                            </button>
                            <button className="button" type="button" onClick={() => setEditingId("")}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
            <button className="button" type="button" onClick={() => setProposal(null)}>
              Close review
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={!readyToSave || applyImport.isPending}
              onClick={() => proposal && applyImport.mutate(prepareCareerImportProposal(proposal, context))}
            >
              Save approved changes
            </button>
          </div>
          {!readyToSave ? (
            <p className="mt-2 text-right text-xs font-semibold text-amber-700">
              Resolve every pending proposal. Invalid rows must be rejected or edited; conflicts must be merged/updated or rejected.
            </p>
          ) : null}
        </div>
      ) : null}
    </PageSection>
  );
}
