import { lazy, Suspense, useEffect, useMemo, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, BookmarkCheck, BriefcaseBusiness, MapPin, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useRepository } from "../../lib/database/repositoryContext";
import { Badge, Tabs } from "../../components/ui";
import { LoadingState } from "../../components/States";
import { loadFitFeed, filterFitFeed, type FitFeedView } from "../../lib/jobs/fitFeed";
import { eligibilityLabel } from "../../lib/jobs/fitAssessment";
import type { WorkspaceTab } from "../../lib/jobs/workspace";
import { useResumeEditorStore } from "../../stores/resumeEditorStore";
import { useJobFeedNavigation } from "./useJobFeedNavigation";
import { JobImportDialog } from "./JobImportDialog";
import { useQueryClient } from "@tanstack/react-query";
import { RankingPreferences } from "./PreferenceControls";
import { JobWorkspace } from "./JobWorkspace";

const JobSourcesPanel = lazy(() => import("./JobSourcesPanel").then((module) => ({ default: module.JobSourcesPanel })));

export function JobsPage({ sample = false }: { sample?: boolean }) {
  const repo = useRepository();
  const client = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const importButton = useRef<HTMLButtonElement>(null);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [workplace, setWorkplace] = useState("");
  const [sort, setSort] = useState("fit");
  const [expanded, setExpanded] = useState(false);
  const [sourcesVisited, setSourcesVisited] = useState(params.get("view") === "sources");
  const [mobileDetail, setMobileDetail] = useState(Boolean(params.get("jobId")));
  const requestedView = params.get("view");
  const view: FitFeedView = ["skipped", "saved", "all", "excluded", "confirmation", "applied"].includes(requestedView ?? "") ? requestedView as FitFeedView : "recommended";
  const sourcesView = requestedView === "sources";
  const navigation = useJobFeedNavigation(JSON.stringify([view, search, workplace, sort]));
  const feed = useQuery({ queryKey: ["job-fit-feed"], queryFn: () => loadFitFeed(repo) });
  const assessmentByJob = useMemo(() => new Map(feed.data?.map(row => [row.job.id,row])), [feed.data]);
  const visible = useMemo(() => filterFitFeed(feed.data ?? [], view, search, workplace, sort).map(row => row.job), [feed.data, view, search, workplace, sort]);
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => repo.listJobs() });
  const matches = useQuery({ queryKey: ["job-matches"], queryFn: () => repo.listJobMatches() });
  const resumes = useQuery({ queryKey: ["resume-versions"], queryFn: () => repo.listResumeVersions() });
  const packages = useQuery({ queryKey: ["application-packages"], queryFn: () => repo.listApplicationPackages() });
  const applications = useQuery({ queryKey: ["applications"], queryFn: () => repo.listApplications() });
  const facts = useQuery({ queryKey: ["career-facts"], queryFn: () => repo.listCareerFacts() });
  const preferences = useQuery({ queryKey: ["job-search-preferences"], queryFn: () => repo.getJobSearchPreferences() });
  const sources = useQuery({ queryKey: ["job-sources"], queryFn: () => repo.listJobSources() });
  const sourceLabels = useMemo(() => new Map(sources.data?.map(source => [source.id, `${source.name} · ${source.sourceType}`])), [sources.data]);
  const sourceLabel = (id: string) => sourceLabels.get(id) || (id.startsWith("import:") ? `Local import · ${id.split(":")[1]}` : (/^synthetic-(greenhouse|lever|ashby)$/.test(id) ? `${id.replace("synthetic-", "")} · synthetic fixture` : "Source not recorded"));
  useEffect(() => {
    if (params.get("jobId") || sourcesView || !feed.data) return;
    const first = visible[0];
    if (first) { const next = new URLSearchParams(params); next.set("jobId", first.id); setParams(next, { replace: true }); }
  }, [params, sourcesView, feed.data, visible, view, search, workplace, sort, setParams]);
  const queries = [feed, jobs, matches, resumes, packages, applications, facts, preferences, sources];
  if (queries.some((query) => query.isLoading)) return <LoadingState label="Opening your job workspace…" />;
  const failed = queries.find((query) => query.isError);
  if (failed) throw failed.error;
  const selectedId = params.get("jobId");
  const selected = selectedId ? jobs.data?.find((job) => job.id === selectedId) : visible[0];
  const tabParam = params.get("tab");
  const initialTab: WorkspaceTab = ["resume", "application", "activity"].includes(tabParam ?? "") ? tabParam as WorkspaceTab : "overview";
  const matchByJob = new Map(matches.data?.map((match) => [match.jobId, match]));
  const onboard = !sample && (!(facts.data?.length) || !preferences.data?.targetRoleTitles.length);
  const changeView = (next: string) => { if (next === "sources") setSourcesVisited(true); const nextParams = new URLSearchParams(params); nextParams.set("view", next); setParams(nextParams, { replace: true }); };
  const select = (id: string, row: HTMLButtonElement) => { if (!sample && selected?.id !== id && useResumeEditorStore.getState().dirty && !window.confirm("Switch jobs with unsaved resume edits? Save your draft first if you want to keep these edits.")) return; const next = new URLSearchParams(params); next.set("jobId", id); next.delete("tab"); setParams(next, { replace: true }); setMobileDetail(true); navigation.enter(id, row); };
  return <div className="jobs-page">
    <JobImportDialog returnFocus={importButton} open={importOpen} onClose={()=>setImportOpen(false)} onSaved={id=>{setImportOpen(false);void client.invalidateQueries();const next=new URLSearchParams(params);next.set("jobId",id);next.set("view","saved");setParams(next);setMobileDetail(true);}}/>
    <header className="workspace-page-header"><div><span className="section-kicker">Your next opportunity</span><h1>Find a role worth your time.</h1><p>{preferences.data?.targetRoleTitles.length ? `Looking for ${preferences.data.targetRoleTitles.slice(0, 2).join(" or ")}${preferences.data.preferredLocations.length ? ` · ${preferences.data.preferredLocations.join(", ")}` : ""}` : "Explore roles, understand your fit, and prepare a strong application."}</p></div><div className="action-row"><RankingPreferences/><Link className="button" to="/applications#history-import">Application history</Link><Link className="button" to="/profile?section=preferences"><SlidersHorizontal size={15} aria-hidden="true" />Preferences</Link><button ref={importButton} className="button button-primary" onClick={()=>setImportOpen(true)}><Plus size={16} aria-hidden="true" />Add a job</button></div></header>
    {onboard ? <section className="getting-started" aria-label="Get started"><div><span className="section-kicker">Make this yours</span><h2>A little setup. A more useful job search.</h2><p>Add your background and choose what you want. You can explore jobs along the way.</p></div><div className="setup-path"><Link to="/profile?section=import&intake=1"><span>1</span><strong>Add your resume</strong><small>{facts.data?.length ? "Background added" : "Import or paste your experience"}</small><ArrowRight size={15} aria-hidden="true" /></Link><Link to="/profile?section=evidence"><span>2</span><strong>Review your background</strong><small>Confirm what your resumes can use</small><ArrowRight size={15} aria-hidden="true" /></Link><Link to="/profile?section=preferences"><span>3</span><strong>Choose your next role</strong><small>{preferences.data?.targetRoleTitles.length ? "Preferences saved" : "Roles, locations, and work style"}</small><ArrowRight size={15} aria-hidden="true" /></Link></div></section> : null}
    <div className="jobs-toolbar"><Tabs value={sourcesView ? "sources" : view} onChange={changeView} tabs={[{ id: "recommended", label: "For you" }, { id: "confirmation", label: "Needs Confirmation" }, { id: "applied", label: "Applied" }, { id: "saved", label: "Saved" }, { id: "all", label: "All jobs" }, { id: "skipped", label: "Skipped" }, { id: "excluded", label: "Excluded" }, { id: "sources", label: "Companies" }]} label="Jobs views" /><span className="field-hint">{sources.data?.length ?? 0} company sources · Local-first</span></div>
    {sourcesVisited ? <div hidden={!sourcesView}><Suspense fallback={<LoadingState label="Opening company sources…" />}><JobSourcesPanel /></Suspense></div> : null}
    <div hidden={sourcesView} className={`jobs-split ${mobileDetail ? "show-job-detail" : ""} ${expanded ? "workspace-expanded" : ""}`}>
      <section ref={navigation.feed} tabIndex={-1} className="job-list-pane" aria-label="Job results"><div className="job-list-filters"><label className="search-field"><Search size={16} aria-hidden="true" /><span className="sr-only">Search jobs</span><input className="field" data-search-input placeholder="Role, company, or location" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="filter-pair"><label><span className="sr-only">Work arrangement</span><select className="field" value={workplace} onChange={(event) => setWorkplace(event.target.value)}><option value="">Any work style</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="on_site">On-site</option></select></label><label><span className="sr-only">Sort jobs</span><select className="field" value={sort} onChange={(event) => setSort(event.target.value)}><option value="fit">Recommendation priority</option><option value="newest">Newest first</option></select></label></div><p className="results-count" role="status">{visible.length} {visible.length === 1 ? "opportunity" : "opportunities"}</p></div>
        <div className="job-results">{visible.map((job) => { const assessment = assessmentByJob.get(job.id)!.assessment; const fit = { score: assessment.score, strengths: assessment.reasons.filter(reason => reason.status === "ELIGIBLE").map(reason=>reason.explanation), reasons: [] as string[] }; return <button key={job.id} data-job-id={job.id} type="button" className={`job-result ${selected?.id === job.id ? "job-result-selected" : ""}`} aria-pressed={selected?.id === job.id} onClick={event => select(job.id, event.currentTarget)}><span className="job-result-top"><span className="company-avatar" aria-hidden="true">{job.company.slice(0, 1) || "?"}</span><span className="job-result-company">{job.company || "Company not specified"}</span>{["saved", "resume_pending", "resume_ready", "ready_to_apply"].includes(job.status) ? <BookmarkCheck size={15} aria-label="Saved job" /> : null}{fit.score !== null ? <span className={`fit-pill ${fit.score >= 75 ? "fit-pill-strong" : ""}`}>{fit.score}/100</span> : <span className="fit-pill">Unknown fit</span>}</span><span className={`eligibility-status eligibility-${assessment.eligibility.toLowerCase()}`}>{eligibilityLabel[assessment.eligibility]}</span><strong className="job-result-title">{job.roleTitle || "Untitled role"}</strong><span className="job-result-location"><MapPin size={13} aria-hidden="true" />{job.location || "Location not specified"}{job.workplaceType !== "unspecified" ? ` · ${job.workplaceType.replaceAll("_", " ")}` : ""}</span><span className="job-result-date">{job.salaryMin !== null || job.salaryMax !== null ? `Compensation: ${job.salaryCurrency || "currency not provided"} ${job.salaryMin ?? "?"}–${job.salaryMax ?? "?"}` : "Compensation not provided"} · Source: {sourceLabel(job.sourceId)}</span><span className="job-result-date">{assessmentByJob.get(job.id)?.ranking?.explanations.join(" ")}</span><span className="job-result-date">{assessmentByJob.get(job.id)?.application.state === "POSSIBLE_MATCH" ? "Possible application history match" : assessmentByJob.get(job.id)?.application.state === "EXACT" ? `Application: ${assessmentByJob.get(job.id)?.application.records[0]?.status ?? "unknown"}` : "No confirmed application"}</span><span className="job-result-date">{Array.from(new Set(assessment.reasons.filter(reason=>reason.dimension==="skills" && reason.status==="ELIGIBLE").map(reason=>reason.explanation.split(" is supported")[0]))).slice(0,4).join(" · ")}</span><span className="job-result-reason">{fit.strengths[0] || fit.reasons[0] || "Open this job to review the requirements."}</span>{job.postedAt ? <span className="job-result-date">Posted {new Date(job.postedAt).toLocaleDateString()}</span> : null}</button>; })}</div>
        {!visible.length ? <div className="job-list-empty"><Search size={25} aria-hidden="true" /><h3>{jobs.data?.length ? "No jobs in this view" : "Your next opportunity starts here"}</h3><p>{jobs.data?.length ? "Try another view or broaden your filters." : "Add a job description, or follow a company’s career board to discover roles."}</p>{jobs.data?.length ? <button className="button" type="button" onClick={() => { setSearch(""); setWorkplace(""); changeView("all"); }}>Reset filters</button> : <><button className="button button-primary" type="button" onClick={() => changeView("sources")}>Choose companies</button><Link className="text-link" to="/tailor">Paste a job description</Link></>}</div> : null}
      </section>
      <section ref={navigation.detail} tabIndex={-1} className="job-detail-pane" aria-label="Selected opportunity">{selected ? <JobWorkspace key={selected.id} sourceLabel={sourceLabel(selected.sourceId)} ranking={assessmentByJob.get(selected.id)?.ranking} assessment={assessmentByJob.get(selected.id)?.assessment} applicationMatch={assessmentByJob.get(selected.id)?.application} job={selected} match={matchByJob.get(selected.id)} resumes={resumes.data ?? []} packages={packages.data ?? []} applications={applications.data ?? []} initialTab={initialTab} sample={sample} expanded={expanded} onExpand={() => setExpanded((current) => !current)} onBack={() => { setMobileDetail(false); setExpanded(false); navigation.back(selected.id); }} /> : <div className="opportunity-placeholder"><div className="placeholder-icon"><BriefcaseBusiness size={32} aria-hidden="true" /></div><span className="section-kicker">A workspace for every opportunity</span><h2>Find your fit.<br />Make your next move.</h2><p>Choose a job to see why it fits, prepare your resume, and keep your application together.</p>{!sample ? <Link className="button" to="/preview">Try the sample workspace <ArrowRight size={15} aria-hidden="true" /></Link> : null}{selectedId ? <button className="text-link" type="button" onClick={() => { const next = new URLSearchParams(params); next.delete("jobId"); next.delete("tab"); setParams(next); }}>That saved job isn’t available. Return to the list.</button> : null}</div>}</section>
    </div>
    {!sample ? <footer className="jobs-footer"><Link to="/dashboard">Workspace overview</Link><Link to="/preview">Explore a sample</Link><Badge tone="slate">Final submission stays with you</Badge></footer> : null}
  </div>;
}
