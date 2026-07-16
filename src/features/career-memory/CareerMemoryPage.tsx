import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCheck,
  FileInput,
  Plus,
  Save,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, InlineError, LoadingState } from "../../components/States";
import { TagList } from "../../components/TagList";
import { useRepository } from "../../lib/database/repositoryContext";
import { parseCsv } from "../../lib/utils";
import { extractNumericTokens } from "../../lib/resume/validation";
import {
  approvedCandidateToFact,
  extractEvidenceCandidates,
  type LocalEvidenceFile,
} from "../../lib/import/evidenceImport";
import type {
  CareerFact,
  CareerFactSourceType,
  CareerItem,
  CareerItemType,
  EvidenceImportCandidate,
  EvidenceStatus,
  Skill,
} from "../../types/domain";
import { SmartCareerIntake } from "./SmartCareerIntake";

const itemTypes: CareerItemType[] = ["project", "employment", "education"];
const evidenceStatuses: EvidenceStatus[] = ["user_provided", "verified", "needs_review", "prohibited"];
const sourceTypes: CareerFactSourceType[] = [
  "user_statement",
  "repository",
  "readme",
  "test_result",
  "build_output",
  "deployment_result",
  "resume",
  "manually_verified",
];
const emptyItems: CareerItem[] = [];
const emptyFacts: CareerFact[] = [];
const emptySkills: Skill[] = [];

function emptyItem(type: CareerItemType): Partial<CareerItem> & Pick<CareerItem, "type" | "title"> {
  return {
    type,
    title: "",
    organization: "",
    location: "",
    startDate: "",
    endDate: "",
    isCurrent: false,
    shortDescription: "",
    url: "",
    repositoryUrl: "",
    enabled: true,
  };
}

function emptyFact(careerItemId: string): Partial<CareerFact> & Pick<CareerFact, "careerItemId" | "statement"> {
  return {
    careerItemId,
    statement: "",
    evidenceStatus: "user_provided",
    sourceNote: "",
    sourceType: "user_statement",
    sourceReference: "",
    verificationDate: "",
    lastReviewedDate: "",
    notes: "",
    skillTags: [],
    roleTags: [],
    metricTokens: [],
    importance: 3,
    enabled: true,
  };
}

function ItemForm({
  draft,
  onChange,
  onSave,
  saveLabel,
}: {
  draft: Partial<CareerItem> & Pick<CareerItem, "type" | "title">;
  onChange: (next: Partial<CareerItem> & Pick<CareerItem, "type" | "title">) => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="text-sm font-semibold text-slate-700">
        Type
        <select
          className="field mt-1"
          value={draft.type}
          onChange={(event) => onChange({ ...draft, type: event.target.value as CareerItemType })}
        >
          {itemTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Title
        <input
          className="field mt-1"
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
        />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Organization
        <input
          className="field mt-1"
          value={draft.organization ?? ""}
          onChange={(event) => onChange({ ...draft, organization: event.target.value })}
        />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Location
        <input
          className="field mt-1"
          value={draft.location ?? ""}
          onChange={(event) => onChange({ ...draft, location: event.target.value })}
        />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Start date
        <input
          className="field mt-1"
          value={draft.startDate ?? ""}
          onChange={(event) => onChange({ ...draft, startDate: event.target.value })}
        />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        End date
        <input
          className="field mt-1"
          value={draft.endDate ?? ""}
          onChange={(event) => onChange({ ...draft, endDate: event.target.value })}
        />
      </label>
      <label className="col-span-2 text-sm font-semibold text-slate-700">
        Short description
        <textarea
          className="field mt-1 min-h-20"
          value={draft.shortDescription ?? ""}
          onChange={(event) => onChange({ ...draft, shortDescription: event.target.value })}
        />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        URL
        <input
          className="field mt-1"
          value={draft.url ?? ""}
          onChange={(event) => onChange({ ...draft, url: event.target.value })}
        />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Repository URL
        <input
          className="field mt-1"
          value={draft.repositoryUrl ?? ""}
          onChange={(event) => onChange({ ...draft, repositoryUrl: event.target.value })}
        />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input
          type="checkbox"
          checked={draft.enabled ?? true}
          onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
        />
        Enabled
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input
          type="checkbox"
          checked={draft.isCurrent ?? false}
          onChange={(event) => onChange({ ...draft, isCurrent: event.target.checked })}
        />
        Current
      </label>
      <div className="col-span-2">
        <button className="button button-primary" type="button" onClick={onSave} disabled={!draft.title.trim()}>
          <Save size={16} aria-hidden="true" />
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

function FactEditor({
  fact,
  onSave,
  onDelete,
  selected,
  onSelect,
  duplicate,
  usage,
  variants,
  reviewReasons,
}: {
  fact: CareerFact;
  onSave: (fact: CareerFact) => void;
  onDelete: () => void;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  duplicate: boolean;
  usage: Array<{ resumeName: string; bulletText: string }>;
  variants: Array<{ text: string }>;
  reviewReasons: string[];
}) {
  const [draft, setDraft] = useState({
    ...fact,
    skillTagsText: fact.skillTags.join(", "),
    roleTagsText: fact.roleTags.join(", "),
    metricTokensText: fact.metricTokens.join(", "),
  });
  const exactTokens = extractNumericTokens(draft.statement);
  const listedTokens = new Set(
    parseCsv(draft.metricTokensText).flatMap((token) => extractNumericTokens(token)),
  );
  const unlistedTokens = exactTokens.filter((token) => !listedTokens.has(token));

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} />
          Select for bulk action
        </label>
        <div className="flex gap-2 text-xs font-semibold">
          {duplicate ? <span className="text-amber-700">Possible duplicate</span> : null}
          <span className="text-slate-500">{usage.length} resume uses</span>
          <span className="text-slate-500">{variants.length} approved variants</span>
        </div>
      </div>
      <textarea
        className="field min-h-20"
        value={draft.statement}
        onChange={(event) => setDraft({ ...draft, statement: event.target.value })}
      />
      <div className="mt-3 grid grid-cols-4 gap-2">
        <select
          className="field"
          value={draft.evidenceStatus}
          onChange={(event) => setDraft({ ...draft, evidenceStatus: event.target.value as EvidenceStatus })}
        >
          {evidenceStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <input
          className="field"
          type="number"
          min={1}
          max={5}
          value={draft.importance}
          onChange={(event) => setDraft({ ...draft, importance: Number(event.target.value) })}
          aria-label="Fact importance"
        />
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
          />
          Enabled
        </label>
        <button className="button button-danger" type="button" onClick={onDelete}>
          <Trash2 size={15} aria-hidden="true" />
          Delete
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <input
          className="field"
          value={draft.skillTagsText}
          placeholder="Skill tags"
          onChange={(event) => setDraft({ ...draft, skillTagsText: event.target.value })}
        />
        <input
          className="field"
          value={draft.roleTagsText}
          placeholder="Role tags"
          onChange={(event) => setDraft({ ...draft, roleTagsText: event.target.value })}
        />
        <input
          className="field"
          value={draft.metricTokensText}
          placeholder="Metric tokens"
          onChange={(event) => setDraft({ ...draft, metricTokensText: event.target.value })}
        />
      </div>
      <input
        className="field mt-3"
        value={draft.sourceNote}
        placeholder="Source note"
        onChange={(event) => setDraft({ ...draft, sourceNote: event.target.value })}
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <select
          className="field"
          value={draft.sourceType}
          onChange={(event) =>
            setDraft({ ...draft, sourceType: event.target.value as CareerFactSourceType })
          }
          aria-label="Source type"
        >
          {sourceTypes.map((sourceType) => (
            <option key={sourceType} value={sourceType}>
              {sourceType.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <input
          className="field"
          value={draft.sourceReference}
          placeholder="Source path, URL, or reference"
          onChange={(event) => setDraft({ ...draft, sourceReference: event.target.value })}
        />
        <label className="text-xs font-semibold text-slate-600">
          Verified on
          <input
            className="field mt-1"
            type="date"
            value={draft.verificationDate}
            onChange={(event) => setDraft({ ...draft, verificationDate: event.target.value })}
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Last reviewed
          <input
            className="field mt-1"
            type="date"
            value={draft.lastReviewedDate}
            onChange={(event) => setDraft({ ...draft, lastReviewedDate: event.target.value })}
          />
        </label>
      </div>
      <textarea
        className="field mt-3 min-h-16"
        value={draft.notes}
        placeholder="Private review notes"
        onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
      />
      {reviewReasons.length ? (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Review reasons">
          {reviewReasons.map((reason) => (
            <span key={reason} className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
              {reason}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <p><strong>Exact numeric tokens:</strong> {exactTokens.length ? exactTokens.join(", ") : "None"}</p>
        {unlistedTokens.length ? (
          <p className="mt-1 font-semibold text-amber-700">
            Add {unlistedTokens.join(", ")} to metric tokens before relying on these claims.
          </p>
        ) : null}
      </div>
      {usage.length || variants.length ? (
        <details className="mt-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-700">Evidence history</summary>
          <div className="mt-2 space-y-2">
            {usage.map((entry, index) => (
              <p key={`${entry.resumeName}-${index}`}><strong>{entry.resumeName}:</strong> {entry.bulletText}</p>
            ))}
            {variants.map((variant, index) => (
              <p key={`${variant.text}-${index}`}><strong>Approved variant:</strong> {variant.text}</p>
            ))}
          </div>
        </details>
      ) : null}
      <button
        className="button mt-3"
        type="button"
        onClick={() =>
          onSave({
            ...fact,
            statement: draft.statement,
            evidenceStatus: draft.evidenceStatus,
            sourceNote: draft.sourceNote,
            sourceType: draft.sourceType,
            sourceReference: draft.sourceReference,
            verificationDate: draft.verificationDate,
            lastReviewedDate: draft.lastReviewedDate,
            notes: draft.notes,
            skillTags: parseCsv(draft.skillTagsText),
            roleTags: parseCsv(draft.roleTagsText),
            metricTokens: parseCsv(draft.metricTokensText),
            importance: draft.importance,
            enabled: draft.enabled,
          })
        }
      >
        Save fact
      </button>
    </div>
  );
}

export function CareerMemoryPage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState(emptyItem("project"));
  const [newSkill, setNewSkill] = useState<Partial<Skill> & Pick<Skill, "name" | "category">>({
    name: "",
    category: "Languages",
    proficiencyNote: "",
    enabled: true,
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [selectedFactIds, setSelectedFactIds] = useState<string[]>([]);
  const [importCandidates, setImportCandidates] = useState<EvidenceImportCandidate[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [showSmartIntake, setShowSmartIntake] = useState(false);
  const itemsQuery = useQuery({ queryKey: ["career-items"], queryFn: () => repository.listCareerItems() });
  const factsQuery = useQuery({
    queryKey: ["career-facts", search, status],
    queryFn: () => repository.listCareerFacts({ search, evidenceStatus: status }),
  });
  const skillsQuery = useQuery({ queryKey: ["skills"], queryFn: () => repository.listSkills() });
  const resumesQuery = useQuery({ queryKey: ["resumes"], queryFn: () => repository.listResumeVersions() });
  const variantsQuery = useQuery({
    queryKey: ["approved-variants"],
    queryFn: () => repository.listApprovedBulletVariants(),
  });

  const invalidate = () => queryClient.invalidateQueries();
  const seed = useMutation({ mutationFn: () => repository.seedSampleData(), onSuccess: invalidate });
  const saveItem = useMutation({ mutationFn: (item: Parameters<typeof repository.saveCareerItem>[0]) => repository.saveCareerItem(item), onSuccess: invalidate });
  const deleteItem = useMutation({ mutationFn: (id: string) => repository.deleteCareerItem(id), onSuccess: invalidate });
  const saveFact = useMutation({ mutationFn: (fact: Parameters<typeof repository.saveCareerFact>[0]) => repository.saveCareerFact(fact), onSuccess: invalidate });
  const deleteFact = useMutation({ mutationFn: (id: string) => repository.deleteCareerFact(id), onSuccess: invalidate });
  const bulkFacts = useMutation({
    mutationFn: ({
      ids,
      changes,
    }: {
      ids: string[];
      changes: Partial<Pick<CareerFact, "enabled" | "evidenceStatus">>;
    }) => repository.bulkUpdateCareerFacts(ids, changes),
    onSuccess: () => {
      setSelectedFactIds([]);
      invalidate();
    },
  });
  const saveSkill = useMutation({ mutationFn: (skill: Parameters<typeof repository.saveSkill>[0]) => repository.saveSkill(skill), onSuccess: invalidate });
  const reorder = useMutation({ mutationFn: (ids: string[]) => repository.updateCareerItemOrder(ids), onSuccess: invalidate });
  const items = itemsQuery.data ?? emptyItems;
  const facts = factsQuery.data ?? emptyFacts;
  const skills = skillsQuery.data ?? emptySkills;
  const resumes = resumesQuery.data ?? [];
  const variants = variantsQuery.data ?? [];
  const grouped = useMemo(
    () =>
      itemTypes.map((type) => ({
        type,
        items: items.filter((item) => item.type === type),
      })),
    [items],
  );

  if (
    itemsQuery.isLoading ||
    factsQuery.isLoading ||
    skillsQuery.isLoading ||
    resumesQuery.isLoading ||
    variantsQuery.isLoading
  ) {
    return <LoadingState label="Loading career memory..." />;
  }
  if (itemsQuery.isError) throw itemsQuery.error;
  if (factsQuery.isError) throw factsQuery.error;
  if (skillsQuery.isError) throw skillsQuery.error;
  if (resumesQuery.isError) throw resumesQuery.error;
  if (variantsQuery.isError) throw variantsQuery.error;

  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const counts = new Map<string, number>();
  for (const fact of facts) counts.set(fact.careerItemId, (counts.get(fact.careerItemId) ?? 0) + 1);
  const normalizeStatement = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const statementCounts = new Map<string, number>();
  for (const fact of facts) {
    const normalized = normalizeStatement(fact.statement);
    statementCounts.set(normalized, (statementCounts.get(normalized) ?? 0) + 1);
  }
  const usageByFact = new Map<string, Array<{ resumeName: string; bulletText: string }>>();
  for (const resume of resumes) {
    for (const bullet of [...resume.contentJson.projects, ...resume.contentJson.experience].flatMap(
      (section) => section.bullets,
    )) {
      for (const factId of bullet.sourceFactIds) {
        usageByFact.set(factId, [
          ...(usageByFact.get(factId) ?? []),
          { resumeName: resume.name, bulletText: bullet.text },
        ]);
      }
    }
  }
  const reviewReasonsByFact = new Map<string, string[]>();
  const staleBefore = new Date();
  staleBefore.setDate(staleBefore.getDate() - 180);
  for (const fact of facts) {
    const reasons: string[] = [];
    if (extractNumericTokens(fact.statement).length) reasons.push("Contains a numeric claim");
    if (fact.evidenceStatus === "needs_review" || !fact.lastReviewedDate) reasons.push("Not reviewed");
    if (!fact.sourceNote.trim() || !fact.sourceReference.trim()) reasons.push("Missing source detail");
    if ((statementCounts.get(normalizeStatement(fact.statement)) ?? 0) > 1) reasons.push("Possible duplicate");
    if (!(usageByFact.get(fact.id)?.length ?? 0)) reasons.push("Never used in a resume");
    if (fact.lastReviewedDate && new Date(`${fact.lastReviewedDate}T00:00:00`) < staleBefore) {
      reasons.push("Review is over 180 days old");
    }
    if (variants.filter((variant) => variant.sourceFactIds.includes(fact.id)).length > 1) {
      reasons.push("Multiple approved variants");
    }
    reviewReasonsByFact.set(fact.id, reasons);
  }
  const itemFacts = selected
    ? facts.filter(
        (fact) => fact.careerItemId === selected.id && (!reviewOnly || reviewReasonsByFact.get(fact.id)?.length),
      )
    : [];
  const selectedReviewCount = selected
    ? facts.filter(
        (fact) => fact.careerItemId === selected.id && (reviewReasonsByFact.get(fact.id)?.length ?? 0) > 0,
      ).length
    : 0;

  const chooseEvidenceFile = async () => {
    setImportError("");
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "Local evidence", extensions: ["md", "json", "toml", "txt"] }],
      });
      if (typeof path !== "string") return;
      const file = await invoke<LocalEvidenceFile>("read_evidence_file", { path });
      const candidates = extractEvidenceCandidates(file);
      setImportFileName(file.fileName);
      setImportCandidates(candidates);
      if (!candidates.length) setImportError("No deterministic evidence candidates were found in this file.");
    } catch (caught) {
      setImportCandidates([]);
      setImportError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const saveApprovedImports = async () => {
    if (!selected) return;
    const approved = importCandidates.filter((candidate) => candidate.approved && !candidate.rejected);
    if (!approved.length) return;
    try {
      await Promise.all(
        approved.map((candidate) => repository.saveCareerFact(approvedCandidateToFact(candidate, selected.id))),
      );
      setImportCandidates([]);
      setImportFileName("");
      await invalidate();
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const moveItem = (item: CareerItem, direction: -1 | 1) => {
    const ordered = [...items];
    const index = ordered.findIndex((candidate) => candidate.id === item.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    const [removed] = ordered.splice(index, 1);
    ordered.splice(target, 0, removed);
    reorder.mutate(ordered.map((candidate) => candidate.id));
  };

  return (
    <div>
      <PageHeader
        eyebrow="Evidence database"
        title="Career Memory"
        actions={
          <div className="flex gap-2">
            <button className="button" type="button" onClick={() => setShowSmartIntake((value) => !value)}>
              <FileInput size={15} aria-hidden="true" />
              Import career information
            </button>
            <button className="button" type="button" onClick={() => seed.mutate()}>
              Run safe seed
            </button>
          </div>
        }
      />
      <div className="grid grid-cols-[390px_1fr] gap-6 p-8">
        <aside className="space-y-4">
          <div className="panel p-4">
            <h3 className="text-base font-semibold text-slate-950">Add career item</h3>
            <div className="mt-4">
              <ItemForm
                draft={newItem}
                onChange={setNewItem}
                saveLabel="Add item"
                onSave={() => {
                  saveItem.mutate(newItem);
                  setNewItem(emptyItem(newItem.type));
                }}
              />
            </div>
          </div>
          <div className="panel p-4">
            <h3 className="text-base font-semibold text-slate-950">Career items</h3>
            {items.length === 0 ? (
              <EmptyState
                title="No items"
                body="Run the seed process or add a project, employment record, or education entry."
              />
            ) : (
              <div className="mt-3 space-y-4">
                {grouped.map((group) => (
                  <section key={group.type}>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {group.type}
                    </p>
                    <div className="mt-2 space-y-2">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={[
                            "w-full rounded-md border p-3 text-left text-sm",
                            selected?.id === item.id
                              ? "border-blue-300 bg-blue-50"
                              : "border-slate-200 bg-white hover:bg-slate-50",
                          ].join(" ")}
                          onClick={() => setSelectedId(item.id)}
                        >
                          <span className="block font-semibold text-slate-950">{item.title}</span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {counts.get(item.id) ?? 0} facts {item.enabled ? "" : " | disabled"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
          <div className="panel p-4">
            <h3 className="text-base font-semibold text-slate-950">Skills</h3>
            <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
              <input
                className="field"
                value={newSkill.name}
                placeholder="Skill"
                onChange={(event) => setNewSkill({ ...newSkill, name: event.target.value })}
              />
              <input
                className="field"
                value={newSkill.category}
                placeholder="Category"
                onChange={(event) => setNewSkill({ ...newSkill, category: event.target.value })}
              />
              <button
                className="button"
                type="button"
                onClick={() => {
                  saveSkill.mutate(newSkill);
                  setNewSkill({ name: "", category: newSkill.category, proficiencyNote: "", enabled: true });
                }}
                disabled={!newSkill.name.trim()}
              >
                <Plus size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-3 max-h-52 overflow-auto">
              <TagList tags={skills.filter((skill) => skill.enabled).map((skill) => skill.name)} />
            </div>
          </div>
        </aside>

        <section className="space-y-4">
          {showSmartIntake ? (
            <SmartCareerIntake
              items={items}
              facts={facts}
              skills={skills}
              selectedItemId={selected?.id ?? null}
              onDone={invalidate}
            />
          ) : null}

          <div className="panel p-4">
            <div className="grid grid-cols-[1fr_220px] gap-3">
              <input
                className="field"
                data-search-input
                placeholder="Search facts, skill tags, or role tags"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select className="field" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All evidence statuses</option>
                {evidenceStatuses.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={reviewOnly}
                onChange={(event) => setReviewOnly(event.target.checked)}
              />
              Review queue only {selected ? `(${selectedReviewCount})` : ""}
            </label>
          </div>

          {!selected ? (
            <EmptyState title="Select an item" body="Choose or create a career item to edit facts." />
          ) : (
            <>
              <div className="panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-slate-950">Edit item</h3>
                  <div className="flex gap-2">
                    <button className="button" type="button" onClick={() => moveItem(selected, -1)}>
                      <ArrowUp size={15} aria-hidden="true" />
                    </button>
                    <button className="button" type="button" onClick={() => moveItem(selected, 1)}>
                      <ArrowDown size={15} aria-hidden="true" />
                    </button>
                    <button
                      className="button button-danger"
                      type="button"
                      onClick={() => {
                        deleteItem.mutate(selected.id);
                        setSelectedId(null);
                      }}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </div>
                {saveItem.isError ? <InlineError message="Could not save career item." /> : null}
                <div className="mt-4">
                  <ItemForm
                    draft={selected}
                    onChange={(next) => saveItem.mutate({ ...selected, ...next })}
                    onSave={() => saveItem.mutate(selected)}
                    saveLabel="Save item"
                  />
                </div>
              </div>

              <div className="panel p-4">
                <h3 className="text-lg font-semibold text-slate-950">Add fact</h3>
                <button
                  className="button mt-3"
                  type="button"
                  onClick={() =>
                    saveFact.mutate({
                      ...emptyFact(selected.id),
                      statement: "New editable career fact.",
                    })
                  }
                >
                  <Plus size={15} aria-hidden="true" />
                  Add fact
                </button>
              </div>

              <div className="panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-950">Import local evidence</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Inspect a selected text or manifest file. Nothing is executed or saved without approval.
                    </p>
                  </div>
                  <button className="button" type="button" onClick={chooseEvidenceFile}>
                    <FileInput size={15} aria-hidden="true" />
                    Choose file
                  </button>
                </div>
                {importError ? <InlineError message={importError} /> : null}
                {importCandidates.length ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm font-semibold text-slate-700">Candidates from {importFileName}</p>
                    {importCandidates.map((candidate) => (
                      <div key={candidate.id} className="rounded-md border border-slate-200 p-3">
                        <p className={candidate.rejected ? "text-sm text-slate-400 line-through" : "text-sm text-slate-800"}>
                          {candidate.statement}
                        </p>
                        <p className="mt-1 break-all text-xs text-slate-500">{candidate.sourceReference}</p>
                        <div className="mt-3 flex gap-2">
                          <button
                            className={candidate.approved && !candidate.rejected ? "button button-primary" : "button"}
                            type="button"
                            onClick={() =>
                              setImportCandidates((current) =>
                                current.map((value) =>
                                  value.id === candidate.id
                                    ? { ...value, approved: true, rejected: false }
                                    : value,
                                ),
                              )
                            }
                          >
                            <Check size={15} aria-hidden="true" />
                            Approve
                          </button>
                          <button
                            className={candidate.rejected ? "button button-danger" : "button"}
                            type="button"
                            onClick={() =>
                              setImportCandidates((current) =>
                                current.map((value) =>
                                  value.id === candidate.id
                                    ? { ...value, approved: false, rejected: true }
                                    : value,
                                ),
                              )
                            }
                          >
                            <X size={15} aria-hidden="true" />
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={!importCandidates.some((candidate) => candidate.approved && !candidate.rejected)}
                      onClick={saveApprovedImports}
                    >
                      <Save size={15} aria-hidden="true" />
                      Save approved facts
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                {itemFacts.length ? (
                  <div className="panel flex flex-wrap items-center gap-2 p-3">
                    <span className="mr-auto text-sm font-semibold text-slate-700">
                      {selectedFactIds.length} selected
                    </span>
                    <button
                      className="button"
                      type="button"
                      onClick={() =>
                        setSelectedFactIds(
                          selectedFactIds.length === itemFacts.length ? [] : itemFacts.map((fact) => fact.id),
                        )
                      }
                    >
                      Select all
                    </button>
                    <button
                      className="button"
                      type="button"
                      disabled={!selectedFactIds.length}
                      onClick={() =>
                        bulkFacts.mutate({ ids: selectedFactIds, changes: { evidenceStatus: "verified" } })
                      }
                    >
                      <CheckCheck size={15} aria-hidden="true" />
                      Mark verified
                    </button>
                    <button
                      className="button"
                      type="button"
                      disabled={!selectedFactIds.length}
                      onClick={() => bulkFacts.mutate({ ids: selectedFactIds, changes: { enabled: true } })}
                    >
                      <ToggleRight size={15} aria-hidden="true" />
                      Enable
                    </button>
                    <button
                      className="button"
                      type="button"
                      disabled={!selectedFactIds.length}
                      onClick={() => bulkFacts.mutate({ ids: selectedFactIds, changes: { enabled: false } })}
                    >
                      <ToggleLeft size={15} aria-hidden="true" />
                      Disable
                    </button>
                  </div>
                ) : null}
                {itemFacts.map((fact) => (
                  <FactEditor
                    key={fact.id}
                    fact={fact}
                    onSave={(next) => saveFact.mutate(next)}
                    onDelete={() => deleteFact.mutate(fact.id)}
                    selected={selectedFactIds.includes(fact.id)}
                    onSelect={(checked) =>
                      setSelectedFactIds((current) =>
                        checked ? [...new Set([...current, fact.id])] : current.filter((id) => id !== fact.id),
                      )
                    }
                    duplicate={(statementCounts.get(normalizeStatement(fact.statement)) ?? 0) > 1}
                    usage={usageByFact.get(fact.id) ?? []}
                    variants={variants.filter((variant) => variant.sourceFactIds.includes(fact.id))}
                    reviewReasons={reviewReasonsByFact.get(fact.id) ?? []}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
