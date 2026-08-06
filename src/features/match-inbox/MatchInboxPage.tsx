import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FilePlus2, RefreshCcw, Save, X } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, LoadingState } from "../../components/States";
import { Badge, PageSection, SearchInput, StatusBadge } from "../../components/ui";
import { useRepository } from "../../lib/database/repositoryContext";
import { rescoreJob } from "../../lib/job-automation/runner";
import type { Job } from "../../types/domain";

export function MatchInboxPage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("score");
  const [selectedId, setSelectedId] = useState("");
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => repository.listJobs() });
  const matches = useQuery({ queryKey: ["job-matches"], queryFn: () => repository.listJobMatches() });
  const sources = useQuery({ queryKey: ["job-sources"], queryFn: () => repository.listJobSources() });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => repository.getSettings() });
  const saveJob = useMutation({ mutationFn: (job: Job) => repository.saveJob(job), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }) });
  const addPackage = useMutation({ mutationFn: (job: Job) => repository.saveApplicationPackage({ jobId: job.id, generationStatus: "not_started", validationStatus: "not_validated", unresolvedQuestions: ["Select and validate a tailored resume."] }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["application-packages"] }) });
  const reanalyze = useMutation({ mutationFn: (job: Job) => rescoreJob(repository, job.id), onSuccess: () => queryClient.invalidateQueries() });
  const visible = useMemo(() => {
    const matchByJob = new Map((matches.data ?? []).map((match) => [match.jobId, match]));
    const needle = search.toLowerCase();
    return (jobs.data ?? []).filter((job) => ["matched", "saved", "resume_pending", "resume_ready", "ready_to_apply", "analysis_pending"].includes(job.status)).filter((job) => `${job.company} ${job.roleTitle} ${job.location}`.toLowerCase().includes(needle)).sort((a, b) => sort === "posted" ? b.postedAt.localeCompare(a.postedAt) : (matchByJob.get(b.id)?.combinedScore ?? 0) - (matchByJob.get(a.id)?.combinedScore ?? 0));
  }, [jobs.data, matches.data, search, sort]);
  if (jobs.isLoading || matches.isLoading || sources.isLoading || settings.isLoading) return <LoadingState label="Loading matches..." />;
  const matchByJob = new Map((matches.data ?? []).map((match) => [match.jobId, match]));
  const sourceById = new Map((sources.data ?? []).map((source) => [source.id, source]));
  const selected = visible.find((job) => job.id === selectedId) ?? null;
  return <div>
    <PageHeader eyebrow="Deterministic matching" title="Match Inbox" description="Review explainable local scores before spending an AI call or generating a resume." meta={<Badge tone="blue">{visible.length} reviewable</Badge>} />
    <div className="page-body space-y-5">
      <PageSection title="Qualified jobs" actions={<div className="flex gap-2"><div className="w-72"><SearchInput value={search} onChange={setSearch} placeholder="Search company, role, location" /></div><select className="field w-40" value={sort} onChange={(event) => setSort(event.target.value)}><option value="score">Match score</option><option value="posted">Date posted</option></select></div>}>
        <div className="grid gap-4 xl:grid-cols-2">{visible.map((job) => { const match = matchByJob.get(job.id); return <article key={job.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h3 className="font-semibold text-slate-950">{job.roleTitle}</h3><p className="text-sm text-slate-600">{job.company} · {job.location || "Location not listed"}</p></div><Badge tone={(match?.combinedScore ?? 0) >= 80 ? "emerald" : "blue"}>{match?.combinedScore ?? 0}%</Badge></div><div className="mt-3 flex flex-wrap gap-2"><StatusBadge status={job.status} /><Badge>{job.workplaceType.replace("_", " ")}</Badge><Badge>{sourceById.get(job.sourceId)?.sourceType ?? "manual"}</Badge>{job.changedSinceAnalysis ? <Badge tone="amber">changed</Badge> : null}</div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded bg-slate-50 p-2">Skills<br/><strong>{match?.scoreBreakdown.skills ?? 0}/25</strong></div><div className="rounded bg-slate-50 p-2">Experience<br/><strong>{match?.scoreBreakdown.experience ?? 0}/20</strong></div><div className="rounded bg-slate-50 p-2">Projects<br/><strong>{match?.scoreBreakdown.projects ?? 0}/10</strong></div></div>{match?.warnings.length ? <p className="mt-3 text-xs text-amber-700">{match.warnings[0]}</p> : null}<div className="mt-4 flex flex-wrap gap-2"><button className="button" type="button" onClick={() => setSelectedId(job.id)}>Details</button><button className="button" type="button" onClick={() => saveJob.mutate({ ...job, status: "saved" })}><Save size={14} />Save</button><button className="button" type="button" disabled={reanalyze.isPending} onClick={() => reanalyze.mutate(job)}><RefreshCcw size={14} />Reanalyze</button><Link className="button button-primary" to={`/tailor?jobId=${encodeURIComponent(job.id)}`} onClick={() => saveJob.mutate({ ...job, status: "resume_pending" })}><FilePlus2 size={14} />Generate Resume</Link><button className="button" type="button" onClick={() => addPackage.mutate(job)}>Add to Queue</button><button className="button" type="button" onClick={() => saveJob.mutate({ ...job, status: "rejected" })}><X size={14} />Reject</button>{job.applicationUrl ? <a className="button" href={job.applicationUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />Original</a> : null}</div></article>; })}</div>
        {!visible.length ? <EmptyState title="No matches yet" body="Configure a source and run Job Radar. Filtered jobs never trigger AI analysis." /> : null}
      </PageSection>
      {selected ? <PageSection title={`${selected.company} · ${selected.roleTitle}`} actions={<button className="button" type="button" onClick={() => setSelectedId("")}>Close</button>}><div className="grid gap-5 lg:grid-cols-[1fr_300px]"><div><p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.descriptionText}</p></div><aside className="space-y-3"><p className="font-semibold">Score explanation</p>{Object.entries(matchByJob.get(selected.id)?.scoreBreakdown ?? {}).map(([key, value]) => <div key={key} className="flex justify-between border-b border-slate-100 pb-1 text-sm"><span>{key}</span><strong>{value}</strong></div>)}<p className="font-semibold">Matched evidence IDs</p><div className="flex flex-wrap gap-1">{matchByJob.get(selected.id)?.matchedFactIds.map((id) => <Badge key={id}>{id}</Badge>)}</div>{settings.data?.developerMode ? <details><summary className="cursor-pointer text-sm font-semibold">Developer: raw provider payload</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(selected.sourcePayloadJson, null, 2)}</pre></details> : null}</aside></div></PageSection> : null}
    </div>
  </div>;
}
