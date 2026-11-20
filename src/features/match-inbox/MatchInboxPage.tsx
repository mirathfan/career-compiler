import { useJobMatchApproval } from "../../components/useJobMatchApproval";
import { prepareBatchReview } from "../../lib/job-automation/batchReview";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FilePlus2, RefreshCcw, Save, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, InlineError, LoadingState } from "../../components/States";
import { Badge, PageSection, SearchInput, StatusBadge } from "../../components/ui";
import { useRepository } from "../../lib/database/repositoryContext";
import { runApprovedJobMatchBatch, setDeterministicScoreOnly } from "../../lib/job-automation/aiBatch";
import { jobMatchAnalysisState, readJobMatchAnalysisAudit } from "../../lib/job-automation/analysisState";
import { rescoreJob } from "../../lib/job-automation/runner";
import type { Job } from "../../types/domain";

const stateTone = (state: string): "slate" | "blue" | "emerald" | "amber" | "red" => {
  if (state === "valid" || state === "valid_after_repair") return "emerald";
  if (state === "failed") return "red";
  if (state === "stale" || state === "approval_required") return "amber";
  if (state === "running" || state === "queued") return "blue";
  return "slate";
};

export function MatchInboxPage() {
  const repository = useRepository();
  const approval = useJobMatchApproval();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("score");
  const [selectedId, setSelectedId] = useState("");
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => repository.listJobs() });
  const matches = useQuery({ queryKey: ["job-matches"], queryFn: () => repository.listJobMatches() });
  const sources = useQuery({ queryKey: ["job-sources"], queryFn: () => repository.listJobSources() });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => repository.getSettings() });
  const preferences = useQuery({ queryKey: ["job-search-preferences"], queryFn: () => repository.getJobSearchPreferences() });
  const history = useQuery({
    queryKey: ["job-match-history", selectedId],
    queryFn: () => repository.listJobMatchHistory(selectedId),
    enabled: Boolean(selectedId),
  });
  const saveJob = useMutation({ mutationFn: (job: Job) => repository.saveJob(job), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }) });
  const addPackage = useMutation({ mutationFn: (job: Job) => repository.saveApplicationPackage({ jobId: job.id, generationStatus: "not_started", validationStatus: "not_validated", unresolvedQuestions: ["Select and validate a tailored resume."] }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["application-packages"] }) });
  const deterministicRescore = useMutation({ mutationFn: (job: Job) => rescoreJob(repository, job.id), onSuccess: () => queryClient.invalidateQueries() });
  const deterministicOnly = useMutation({ mutationFn: (jobId: string) => setDeterministicScoreOnly(repository, jobId), onSuccess: () => queryClient.invalidateQueries() });
  const aiAnalyze = useMutation({
    mutationFn: async ({ jobIds, force }: { jobIds: string[]; force: boolean }) => {
      if (!preferences.data?.aiMatchEnabled) throw new Error("Enable AI matching in Job Radar before requesting analysis.");
      const review = await prepareBatchReview(repository, { jobIds: jobIds, forceReanalysis: force });
      const preview = review.preview;
      const approved = await approval.request(review);
      if (!approved) throw new Error("AI analysis cancelled before any request was sent.");
      return runApprovedJobMatchBatch(repository, { jobIds: preview.jobIds, approved: true, reviewedJobs: review.jobs, trigger: force ? "reanalysis" : "manual", forceReanalysis: force });
    },
    onSuccess: (result) => {
      setError("");
      setAiMessage(`${result.valid} valid; ${result.repaired} repaired; ${result.failed} failed.`);
      setCheckedIds([]);
      queryClient.invalidateQueries();
    },
    onError: (caught) => { setError(caught instanceof Error ? caught.message : String(caught)); queryClient.invalidateQueries(); },
  });
  const visible = useMemo(() => {
    const matchByJob = new Map((matches.data ?? []).map((match) => [match.jobId, match]));
    const needle = search.toLowerCase();
    return (jobs.data ?? [])
      .filter((job) => ["matched", "saved", "resume_pending", "resume_ready", "ready_to_apply", "analysis_pending"].includes(job.status))
      .filter((job) => `${job.company} ${job.roleTitle} ${job.location}`.toLowerCase().includes(needle))
      .sort((a, b) => sort === "posted" ? b.postedAt.localeCompare(a.postedAt) : (matchByJob.get(b.id)?.combinedScore ?? 0) - (matchByJob.get(a.id)?.combinedScore ?? 0));
  }, [jobs.data, matches.data, search, sort]);
  if (jobs.isLoading || matches.isLoading || sources.isLoading || settings.isLoading || preferences.isLoading) return <LoadingState label="Loading matches..." />;
  const matchByJob = new Map((matches.data ?? []).map((match) => [match.jobId, match]));
  const sourceById = new Map((sources.data ?? []).map((source) => [source.id, source]));
  const selected = visible.find((job) => job.id === selectedId) ?? null;
  const selectedMatch = selected ? matchByJob.get(selected.id) : null;
  const selectedAudit = readJobMatchAnalysisAudit(selectedMatch?.analysisJson);
  const selectedOutput = selectedAudit?.finalAcceptedOutput;

  return <div>
    {approval.dialog}
    <PageHeader eyebrow="Evidence-grounded matching" title="Match Inbox" description="Compare local deterministic scoring with optional, explicitly approved AI analysis. Failed or stale AI output never replaces the deterministic score." meta={<Badge tone="blue">{visible.length} reviewable</Badge>} />
    <div className="page-body space-y-5">
      {error ? <InlineError message={error} /> : null}
      {aiMessage ? <p className="text-sm font-semibold text-emerald-700">{aiMessage}</p> : null}
      <PageSection title="Qualified jobs" actions={<div className="flex flex-wrap gap-2"><button className="button" type="button" disabled={!checkedIds.length || aiAnalyze.isPending} onClick={() => aiAnalyze.mutate({ jobIds: checkedIds, force: false })}><Sparkles size={14} />Analyze Selected ({checkedIds.length})</button><div className="w-72"><SearchInput value={search} onChange={setSearch} placeholder="Search company, role, location" /></div><select className="field w-40" value={sort} onChange={(event) => setSort(event.target.value)}><option value="score">Combined score</option><option value="posted">Date posted</option></select></div>}>
        <div className="grid gap-4 xl:grid-cols-2">{visible.map((job) => {
          const match = matchByJob.get(job.id);
          const auditState = jobMatchAnalysisState(match?.analysisJson);
          const displayState = auditState === "not_requested" && preferences.data?.aiMatchEnabled && preferences.data.aiMatchRequireApproval ? "approval_required" : auditState;
          return <article key={job.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><input className="mt-1" type="checkbox" checked={checkedIds.includes(job.id)} onChange={(event) => setCheckedIds((current) => event.target.checked ? [...new Set([...current, job.id])] : current.filter((id) => id !== job.id))} /><div><h3 className="font-semibold text-slate-950">{job.roleTitle}</h3><p className="text-sm text-slate-600">{job.company} · {job.location || "Location not listed"}</p></div></div><Badge tone={(match?.combinedScore ?? 0) >= 80 ? "emerald" : "blue"}>{match?.combinedScore ?? 0}% combined</Badge></div>
            <div className="mt-3 flex flex-wrap gap-2"><StatusBadge status={job.status} /><Badge tone={stateTone(displayState)}>AI: {displayState.replaceAll("_", " ")}</Badge><Badge>{job.workplaceType.replace("_", " ")}</Badge><Badge>{sourceById.get(job.sourceId)?.sourceType ?? "manual"}</Badge>{job.changedSinceAnalysis ? <Badge tone="amber">changed</Badge> : null}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded bg-slate-50 p-2">Deterministic<br/><strong>{match?.deterministicScore ?? 0}%</strong></div><div className="rounded bg-slate-50 p-2">AI<br/><strong>{match?.aiScore === null || match?.aiScore === undefined ? "—" : `${match.aiScore}%`}</strong></div><div className="rounded bg-slate-50 p-2">Combined<br/><strong>{match?.combinedScore ?? 0}%</strong></div></div>
            {match?.warnings.length ? <p className="mt-3 text-xs text-amber-700">{match.warnings[0]}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2"><button className="button" type="button" onClick={() => setSelectedId(job.id)}>Details & history</button><button className="button" type="button" onClick={() => saveJob.mutate({ ...job, status: "saved" })}><Save size={14} />Save</button><button className="button" type="button" disabled={deterministicRescore.isPending} onClick={() => deterministicRescore.mutate(job)}><RefreshCcw size={14} />Local rescore</button><button className="button" type="button" disabled={aiAnalyze.isPending} onClick={() => aiAnalyze.mutate({ jobIds: [job.id], force: match?.aiScore !== null && match?.aiScore !== undefined })}><Sparkles size={14} />{match?.aiScore === null ? "Analyze with AI" : "Reanalyze AI"}</button><button className="button" type="button" disabled={deterministicOnly.isPending} onClick={() => deterministicOnly.mutate(job.id)}>Use deterministic only</button><Link className="button button-primary" to={`/tailor?jobId=${encodeURIComponent(job.id)}`} onClick={() => saveJob.mutate({ ...job, status: "resume_pending" })}><FilePlus2 size={14} />Generate Resume</Link><button className="button" type="button" onClick={() => addPackage.mutate(job)}>Add to Queue</button><button className="button" type="button" onClick={() => saveJob.mutate({ ...job, status: "rejected" })}><X size={14} />Reject</button>{job.applicationUrl ? <a className="button" href={job.applicationUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />Original</a> : null}</div>
          </article>;
        })}</div>
        {!visible.length ? <EmptyState title="No matches yet" body="Configure a source and run Job Radar. Filtered jobs never trigger AI analysis." /> : null}
      </PageSection>
      {selected ? <PageSection title={`${selected.company} · ${selected.roleTitle}`} actions={<button className="button" type="button" onClick={() => setSelectedId("")}>Close</button>}>
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]"><div><p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.descriptionText}</p></div><aside className="space-y-4">
          <div><p className="font-semibold">Score explanation</p>{Object.entries(selectedMatch?.scoreBreakdown ?? {}).map(([key, value]) => <div key={key} className="flex justify-between border-b border-slate-100 pb-1 text-sm"><span>{key}</span><strong>{value}</strong></div>)}</div>
          <div><p className="font-semibold">AI audit</p><p className="text-sm text-slate-600">State: {jobMatchAnalysisState(selectedMatch?.analysisJson).replaceAll("_", " ")}</p><p className="text-sm text-slate-600">Model: {selectedAudit?.model || "not requested"}</p><p className="text-sm text-slate-600">Prompt: {selectedAudit?.promptVersion || "—"}</p><p className="text-sm text-slate-600">Repair: {selectedAudit?.repairAttempted ? "attempted once" : "not attempted"}</p><p className="text-sm text-slate-600">Analyzed: {selectedAudit?.createdAt ? new Date(selectedAudit.createdAt).toLocaleString() : "—"}</p>{selectedAudit?.errorMessage ? <p className="mt-1 text-sm text-red-700">{selectedAudit.errorMessage}</p> : null}</div>
          <div><p className="font-semibold">Required qualifications</p><ul className="list-disc pl-5 text-sm text-slate-600">{selectedOutput?.requiredQualifications.map((item) => <li key={item}>{item}</li>)}</ul>{!selectedOutput?.requiredQualifications.length ? <p className="text-sm text-slate-500">No validated AI analysis.</p> : null}</div>
          <div><p className="font-semibold">Preferred qualifications</p><ul className="list-disc pl-5 text-sm text-slate-600">{selectedOutput?.preferredQualifications.map((item) => <li key={item}>{item}</li>)}</ul>{!selectedOutput?.preferredQualifications.length ? <p className="text-sm text-slate-500">No validated AI analysis.</p> : null}</div>
          <div><p className="font-semibold">Compatibility</p><p className="text-sm text-slate-600">Experience: {selectedOutput?.experienceCompatibility ?? selectedMatch?.experienceCompatibility ?? "unclear"}</p><p className="text-sm text-slate-600">Location: {selectedOutput?.locationCompatibility ?? selectedMatch?.locationCompatibility ?? "unclear"}</p><p className="text-sm text-slate-600">Sponsorship: {selectedOutput?.sponsorshipStatus ?? selectedMatch?.sponsorshipStatus ?? "not_mentioned"}</p></div>
          <div><p className="font-semibold">Missing requirements</p><ul className="list-disc pl-5 text-sm text-slate-600">{(selectedOutput?.missingRequirements ?? selectedMatch?.missingRequirements ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div><p className="font-semibold">Strengths</p><ul className="list-disc pl-5 text-sm text-slate-600">{(selectedOutput?.strengths ?? selectedMatch?.strengths ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div><p className="font-semibold">Concerns</p><ul className="list-disc pl-5 text-sm text-slate-600">{(selectedOutput?.concerns ?? selectedMatch?.concerns ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div><p className="font-semibold">Matched evidence IDs</p><div className="flex flex-wrap gap-1">{(selectedOutput?.matchedEvidenceIds ?? selectedMatch?.matchedFactIds ?? []).map((id) => <Badge key={id}>{id}</Badge>)}</div></div>
          <details><summary className="cursor-pointer text-sm font-semibold">Analysis history ({history.data?.length ?? 0})</summary><div className="mt-2 space-y-2">{history.data?.map((item) => { const audit = readJobMatchAnalysisAudit(item.analysisJson); return <div key={item.id} className="rounded border border-slate-200 p-2 text-xs text-slate-600"><p>{new Date(item.createdAt).toLocaleString()} · {audit?.state?.replaceAll("_", " ") ?? "legacy"}</p><p>Deterministic {item.deterministicScore}% · AI {item.aiScore ?? "—"} · Combined {item.combinedScore}%</p><p>{audit?.promptVersion || "No prompt version"}{audit?.repairAttempted ? " · repaired" : ""}</p></div>; })}</div></details>
          {settings.data?.developerMode ? <details><summary className="cursor-pointer text-sm font-semibold">Developer: raw provider payload</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(selected.sourcePayloadJson, null, 2)}</pre></details> : null}
        </aside></div>
      </PageSection> : null}
    </div>
  </div>;
}
