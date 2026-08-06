import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Plus, Radar, RefreshCcw, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, InlineError, LoadingState } from "../../components/States";
import { Badge, PageSection, StatCard } from "../../components/ui";
import { useRepository } from "../../lib/database/repositoryContext";
import { adapterForSource } from "../../lib/job-automation/adapters";
import { runJobAutomation } from "../../lib/job-automation/runner";
import { parseCsv } from "../../lib/utils";
import type { JobSearchPreferences, JobSource, JobSourceType } from "../../types/domain";

const supportedTypes: JobSourceType[] = ["greenhouse", "lever", "ashby"];

export function JobRadarPage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [sourceDraft, setSourceDraft] = useState({ name: "", companyName: "", sourceType: "greenhouse" as JobSourceType, sourceIdentifier: "", careersUrl: "" });
  const sources = useQuery({ queryKey: ["job-sources"], queryFn: () => repository.listJobSources() });
  const preferences = useQuery({ queryKey: ["job-search-preferences"], queryFn: () => repository.getJobSearchPreferences() });
  const runs = useQuery({ queryKey: ["job-automation-runs"], queryFn: () => repository.listJobAutomationRuns() });
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => repository.listJobs() });
  const saveSource = useMutation({ mutationFn: (source: Parameters<typeof repository.saveJobSource>[0]) => repository.saveJobSource(source), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["job-sources"] }) });
  const savePreferences = useMutation({ mutationFn: (value: Partial<JobSearchPreferences>) => repository.saveJobSearchPreferences(value), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["job-search-preferences"] }) });
  const runSearch = useMutation({
    mutationFn: () => runJobAutomation(repository),
    onSuccess: () => { setError(""); queryClient.invalidateQueries(); },
    onError: (caught) => setError(caught instanceof Error ? caught.message : String(caught)),
  });

  if (sources.isLoading || preferences.isLoading || runs.isLoading || jobs.isLoading) return <LoadingState label="Loading Job Radar..." />;
  if (sources.isError) throw sources.error;
  if (preferences.isError) throw preferences.error;
  const prefs = preferences.data;
  if (!prefs) return null;
  const latest = runs.data?.[0];
  const updateCsv = (key: "targetRoleTitles" | "preferredLocations" | "excludedCompanies" | "excludedTitleKeywords" | "requiredKeywords" | "preferredSkills" | "seniorityLevels" | "employmentTypes", value: string) => savePreferences.mutate({ [key]: parseCsv(value) });

  const testSource = async () => {
    setError(""); setTestMessage("Testing public source…");
    const candidate = { ...sourceDraft, id: "source-test", enabled: true, pollingIntervalHours: 24, lastCheckedAt: "", lastSuccessAt: "", lastError: "", createdAt: "", updatedAt: "" } satisfies JobSource;
    const adapter = adapterForSource(candidate.sourceType);
    if (!adapter) { setTestMessage(""); setError("This source type is manual-only."); return; }
    try {
      const validation = await adapter.validateSource(candidate);
      if (!validation.valid) throw new Error(validation.errors.join(" "));
      const fetched = await adapter.fetchJobs(candidate, { maxAttempts: 1 });
      setTestMessage(`Source is healthy. ${fetched.length} published job${fetched.length === 1 ? "" : "s"} found.`);
    } catch (caught) { setTestMessage(""); setError(caught instanceof Error ? caught.message : String(caught)); }
  };

  return <div>
    <PageHeader eyebrow="Public ATS discovery" title="Job Radar" description="Check configured public career boards, normalize postings, and score them locally. The desktop schedule runs only while CareerCompiler is open." meta={<><Badge tone={prefs.automationEnabled ? "emerald" : "slate"}>automation {prefs.automationEnabled ? "enabled" : "paused"}</Badge><Badge tone="blue">manual submission only</Badge></>} />
    <div className="page-body space-y-5">
      {error ? <InlineError message={error} /> : null}
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Sources" value={sources.data?.length ?? 0} icon={Radar} />
        <StatCard label="Discovered jobs" value={jobs.data?.length ?? 0} icon={Activity} />
        <StatCard label="Last fetched" value={latest?.jobsFetched ?? 0} />
        <StatCard label="High matches" value={latest?.summary.highMatchJobIds.length ?? 0} tone="emerald" />
      </div>
      <PageSection title="Search controls" description="A run never submits an application and does not make paid AI calls. Deterministic filters run before scoring.">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm font-semibold text-slate-700">Automation<select className="field mt-1" value={prefs.automationEnabled ? "enabled" : "paused"} onChange={(event) => savePreferences.mutate({ automationEnabled: event.target.value === "enabled" })}><option value="paused">Paused</option><option value="enabled">Run on launch when overdue</option></select></label>
          <label className="text-sm font-semibold text-slate-700">Polling hours<input className="field mt-1" type="number" min={1} max={720} value={prefs.pollingIntervalHours} onChange={(event) => savePreferences.mutate({ pollingIntervalHours: Number(event.target.value) })} /></label>
          <label className="text-sm font-semibold text-slate-700">Minimum score<input className="field mt-1" type="number" min={0} max={100} value={prefs.minimumMatchScore} onChange={(event) => savePreferences.mutate({ minimumMatchScore: Number(event.target.value) })} /></label>
          <label className="text-sm font-semibold text-slate-700">Maximum age (days)<input className="field mt-1" type="number" min={1} max={365} value={prefs.maximumJobAgeDays} onChange={(event) => savePreferences.mutate({ maximumJobAgeDays: Number(event.target.value) })} /></label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">Target roles<input className="field mt-1" defaultValue={prefs.targetRoleTitles.join(", ")} onBlur={(event) => updateCsv("targetRoleTitles", event.target.value)} /></label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">Preferred locations<input className="field mt-1" defaultValue={prefs.preferredLocations.join(", ")} onBlur={(event) => updateCsv("preferredLocations", event.target.value)} /></label>
          <label className="text-sm font-semibold text-slate-700">Remote preference<select className="field mt-1" value={prefs.remotePreference} onChange={(event) => savePreferences.mutate({ remotePreference: event.target.value as JobSearchPreferences["remotePreference"] })}><option value="any">Any</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="on_site">On-site</option></select></label>
          <label className="text-sm font-semibold text-slate-700">Max jobs scored/run<input className="field mt-1" type="number" min={1} max={200} value={prefs.maximumJobsAnalyzedPerRun} onChange={(event) => savePreferences.mutate({ maximumJobsAnalyzedPerRun: Number(event.target.value) })} /></label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">Preferred skills<input className="field mt-1" defaultValue={prefs.preferredSkills.join(", ")} onBlur={(event) => updateCsv("preferredSkills", event.target.value)} /></label>
          <label className="text-sm font-semibold text-slate-700">Seniority levels<input className="field mt-1" placeholder="entry, mid" defaultValue={prefs.seniorityLevels.join(", ")} onBlur={(event) => updateCsv("seniorityLevels", event.target.value)} /></label>
          <label className="text-sm font-semibold text-slate-700">Employment types<input className="field mt-1" placeholder="Full-time" defaultValue={prefs.employmentTypes.join(", ")} onBlur={(event) => updateCsv("employmentTypes", event.target.value)} /></label>
          <label className="text-sm font-semibold text-slate-700">Minimum salary<input className="field mt-1" type="number" min={0} value={prefs.salaryMinimum ?? ""} onChange={(event) => savePreferences.mutate({ salaryMinimum: event.target.value ? Number(event.target.value) : null })} /></label>
          <label className="text-sm font-semibold text-slate-700">Salary currency<input className="field mt-1" value={prefs.salaryCurrency} onChange={(event) => savePreferences.mutate({ salaryCurrency: event.target.value.toUpperCase().slice(0, 3) })} /></label>
          <label className="text-sm font-semibold text-slate-700">Citizenship language<select className="field mt-1" value={prefs.citizenshipRestrictionBehavior} onChange={(event) => savePreferences.mutate({ citizenshipRestrictionBehavior: event.target.value as JobSearchPreferences["citizenshipRestrictionBehavior"] })}><option value="warn">Warn</option><option value="reject">Reject</option><option value="ignore">Ignore</option></select></label>
          <label className="text-sm font-semibold text-slate-700">Sponsorship language<select className="field mt-1" value={prefs.sponsorshipFilteringBehavior} onChange={(event) => savePreferences.mutate({ sponsorshipFilteringBehavior: event.target.value as JobSearchPreferences["sponsorshipFilteringBehavior"] })}><option value="warn">Warn</option><option value="reject_unavailable">Reject unavailable</option><option value="ignore">Ignore</option></select></label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">Excluded companies<input className="field mt-1" defaultValue={prefs.excludedCompanies.join(", ")} onBlur={(event) => updateCsv("excludedCompanies", event.target.value)} /></label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">Excluded title keywords<input className="field mt-1" defaultValue={prefs.excludedTitleKeywords.join(", ")} onBlur={(event) => updateCsv("excludedTitleKeywords", event.target.value)} /></label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">Required keywords<input className="field mt-1" defaultValue={prefs.requiredKeywords.join(", ")} onBlur={(event) => updateCsv("requiredKeywords", event.target.value)} /></label>
        </div>
        <div className="mt-4 flex gap-2"><button className="button button-primary" type="button" disabled={runSearch.isPending} onClick={() => runSearch.mutate()}><RefreshCcw size={15} />{runSearch.isPending ? "Searching…" : "Run Search Now"}</button>{latest ? <p className="self-center text-sm text-slate-600">{latest.summary.message}</p> : null}</div>
      </PageSection>
      <PageSection title="Add public job source" description="Use the public board token/site name only. CareerCompiler does not scrape authenticated pages or generic sites.">
        <div className="grid gap-3 lg:grid-cols-5">
          <input className="field" placeholder="Display name" value={sourceDraft.name} onChange={(event) => setSourceDraft({ ...sourceDraft, name: event.target.value })} />
          <input className="field" placeholder="Company" value={sourceDraft.companyName} onChange={(event) => setSourceDraft({ ...sourceDraft, companyName: event.target.value })} />
          <select className="field" value={sourceDraft.sourceType} onChange={(event) => setSourceDraft({ ...sourceDraft, sourceType: event.target.value as JobSourceType })}>{supportedTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <input className="field" placeholder="Board token / site name" value={sourceDraft.sourceIdentifier} onChange={(event) => setSourceDraft({ ...sourceDraft, sourceIdentifier: event.target.value })} />
          <input className="field" placeholder="Careers URL (optional)" value={sourceDraft.careersUrl} onChange={(event) => setSourceDraft({ ...sourceDraft, careersUrl: event.target.value })} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2"><button className="button" type="button" disabled={!sourceDraft.sourceIdentifier.trim()} onClick={() => void testSource()}>Test source</button><button className="button button-primary" type="button" disabled={!sourceDraft.name.trim() || !sourceDraft.companyName.trim() || !sourceDraft.sourceIdentifier.trim()} onClick={async () => { await saveSource.mutateAsync(sourceDraft); setSourceDraft({ name: "", companyName: "", sourceType: "greenhouse", sourceIdentifier: "", careersUrl: "" }); setTestMessage(""); }}><Plus size={15} />Save source</button>{testMessage ? <p className="self-center text-sm font-semibold text-emerald-700">{testMessage}</p> : null}</div>
      </PageSection>
      <PageSection title="Source health" description="One failed source is recorded and does not block the remaining sources.">
        <div className="space-y-2">{sources.data?.map((source) => <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-3"><div><p className="font-semibold text-slate-950">{source.name} <span className="font-normal text-slate-500">· {source.sourceType}</span></p><p className="text-xs text-slate-500">Last success: {source.lastSuccessAt ? new Date(source.lastSuccessAt).toLocaleString() : "never"}</p>{source.lastError ? <p className="mt-1 text-xs text-red-700">{source.lastError}</p> : null}</div><div className="flex gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={source.enabled} onChange={(event) => saveSource.mutate({ ...source, enabled: event.target.checked })} />Enabled</label><button className="icon-button" title="Delete source" type="button" onClick={async () => { await repository.deleteJobSource(source.id); queryClient.invalidateQueries({ queryKey: ["job-sources"] }); }}><Trash2 size={15} /></button></div></div>)}</div>
        {!sources.data?.length ? <EmptyState title="No job sources configured" body="The app remains fully usable. Add a public Greenhouse, Lever, or Ashby board when ready." /> : null}
      </PageSection>
    </div>
  </div>;
}
