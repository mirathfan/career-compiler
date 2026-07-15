import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, InlineError, LoadingState } from "../../components/States";
import { TagList } from "../../components/TagList";
import { useRepository } from "../../lib/database/RepositoryProvider";
import { parseCsv } from "../../lib/utils";
import type { CareerFact, CareerItem, CareerItemType, EvidenceStatus, Skill } from "../../types/domain";

const itemTypes: CareerItemType[] = ["project", "employment", "education"];
const evidenceStatuses: EvidenceStatus[] = ["user_provided", "verified", "needs_review", "prohibited"];
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
}: {
  fact: CareerFact;
  onSave: (fact: CareerFact) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState({
    ...fact,
    skillTagsText: fact.skillTags.join(", "),
    roleTagsText: fact.roleTags.join(", "),
    metricTokensText: fact.metricTokens.join(", "),
  });

  return (
    <div className="rounded-md border border-slate-200 p-3">
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
      <button
        className="button mt-3"
        type="button"
        onClick={() =>
          onSave({
            ...fact,
            statement: draft.statement,
            evidenceStatus: draft.evidenceStatus,
            sourceNote: draft.sourceNote,
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
  const itemsQuery = useQuery({ queryKey: ["career-items"], queryFn: () => repository.listCareerItems() });
  const factsQuery = useQuery({
    queryKey: ["career-facts", search, status],
    queryFn: () => repository.listCareerFacts({ search, evidenceStatus: status }),
  });
  const skillsQuery = useQuery({ queryKey: ["skills"], queryFn: () => repository.listSkills() });

  const invalidate = () => queryClient.invalidateQueries();
  const seed = useMutation({ mutationFn: () => repository.seedSampleData(), onSuccess: invalidate });
  const saveItem = useMutation({ mutationFn: (item: Parameters<typeof repository.saveCareerItem>[0]) => repository.saveCareerItem(item), onSuccess: invalidate });
  const deleteItem = useMutation({ mutationFn: (id: string) => repository.deleteCareerItem(id), onSuccess: invalidate });
  const saveFact = useMutation({ mutationFn: (fact: Parameters<typeof repository.saveCareerFact>[0]) => repository.saveCareerFact(fact), onSuccess: invalidate });
  const deleteFact = useMutation({ mutationFn: (id: string) => repository.deleteCareerFact(id), onSuccess: invalidate });
  const saveSkill = useMutation({ mutationFn: (skill: Parameters<typeof repository.saveSkill>[0]) => repository.saveSkill(skill), onSuccess: invalidate });
  const reorder = useMutation({ mutationFn: (ids: string[]) => repository.updateCareerItemOrder(ids), onSuccess: invalidate });
  const items = itemsQuery.data ?? emptyItems;
  const facts = factsQuery.data ?? emptyFacts;
  const skills = skillsQuery.data ?? emptySkills;
  const grouped = useMemo(
    () =>
      itemTypes.map((type) => ({
        type,
        items: items.filter((item) => item.type === type),
      })),
    [items],
  );

  if (itemsQuery.isLoading || factsQuery.isLoading || skillsQuery.isLoading) {
    return <LoadingState label="Loading career memory..." />;
  }
  if (itemsQuery.isError) throw itemsQuery.error;
  if (factsQuery.isError) throw factsQuery.error;
  if (skillsQuery.isError) throw skillsQuery.error;

  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const itemFacts = selected ? facts.filter((fact) => fact.careerItemId === selected.id) : [];
  const counts = new Map<string, number>();
  for (const fact of facts) counts.set(fact.careerItemId, (counts.get(fact.careerItemId) ?? 0) + 1);

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
          <button className="button" type="button" onClick={() => seed.mutate()}>
            Run safe seed
          </button>
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
          <div className="panel p-4">
            <div className="grid grid-cols-[1fr_220px] gap-3">
              <input
                className="field"
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

              <div className="space-y-3">
                {itemFacts.map((fact) => (
                  <FactEditor
                    key={fact.id}
                    fact={fact}
                    onSave={(next) => saveFact.mutate(next)}
                    onDelete={() => deleteFact.mutate(fact.id)}
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
