import { useCareerAI } from "../../components/careerAIContext";
import { PrivateJobNote } from "../../components/PrivateJobNote";
import { isHistoryApplication } from "../../lib/applications/historyContract";
import { ImportedApplicationEvidence } from "../applications/ApplicationHistoryPanel";
import { SkipJobControl } from "./PreferenceControls";
import type { PreferenceRanking } from "../../lib/jobs/preferenceRefinement";
import { ImportProvenance } from "./ImportProvenance";
import { FitExplanation } from "./FitExplanation";
import type { FitAssessment, ApplicationMatch } from "../../lib/jobs/fitAssessment";
import { lazy, Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, Maximize2, Minimize2, ArrowRight, ArrowLeft, MapPin, ExternalLink, Sparkles, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Tabs } from "../../components/ui";
import { InlineError, LoadingState } from "../../components/States";
import { useRepository } from "../../lib/database/repositoryContext";
import { jobFit, jobNextAction, jobSalary, safeJobUrl } from "../../lib/jobs/workspace";
import type { WorkspaceTab } from "../../lib/jobs/workspace";
import { useJobMatchApproval } from "../../components/useJobMatchApproval";
import { prepareBatchReview } from "../../lib/job-automation/batchReview";
import { runApprovedJobMatchBatch } from "../../lib/job-automation/aiBatch";
import { CareerAISelection } from "../../components/CareerAIWorkspace";
import { ContextCopilotDialog } from "../../components/ContextCopilotDialog";
import { SampleResumePanel } from "./SampleResumePanel";
import type { Job, JobMatch, ResumeVersion, ApplicationPackage, ApplicationRecord } from "../../types/domain";

const ExistingApplicationsPage = lazy(() => import("../applications/ApplicationsPage").then(module => ({ default: module.ApplicationsPage })));
const TailorResumePage = lazy(() => import("../tailoring/TailorResumePage").then((module) => ({ default: module.TailorResumePage })));
const JobApplicationPanel = lazy(() => import("./JobApplicationPanel").then((module) => ({ default: module.JobApplicationPanel })));


export function JobWorkspace({ ranking, sourceLabel, assessment, applicationMatch, job, match, resumes, packages, applications, initialTab = "overview", sample = false, expanded = false, onExpand, onBack }: {
  ranking?: PreferenceRanking; sourceLabel?: string; assessment?: FitAssessment; applicationMatch?: ApplicationMatch; job: Job; match?: JobMatch; resumes: ResumeVersion[]; packages: ApplicationPackage[]; applications: ApplicationRecord[]; initialTab?: WorkspaceTab; sample?: boolean; expanded?: boolean; onExpand?: () => void; onBack: () => void;
}) {
  const workspaceAI = useCareerAI();
  const repo = useRepository();
  const client = useQueryClient();
  const approval = useJobMatchApproval();
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [visited, setVisited] = useState<WorkspaceTab[]>([initialTab]);
  const [previousStatus, setPreviousStatus] = useState<Job["status"] | null>(null);
  const [notice, setNotice] = useState("");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotVisited, setCopilotVisited] = useState(false);
  const preferences = useQuery({ queryKey: ["job-search-preferences"], queryFn: () => repo.getJobSearchPreferences() });
  const history = useQuery({ queryKey: ["job-match-history", job.id], queryFn: () => repo.listJobMatchHistory(job.id), enabled: tab === "activity" });
  const status = useMutation({ mutationFn: (next: Job["status"]) => repo.saveJob({ ...job, status: next }), onSuccess: () => client.invalidateQueries(), onError: () => setNotice("") });
  const ai = useMutation({ mutationFn: async () => {
    const review = await prepareBatchReview(repo, { jobIds: [job.id], forceReanalysis: true });
    if (!await approval.request(review)) return null;
    return runApprovedJobMatchBatch(repo, { jobIds: review.preview.jobIds, approved: true, reviewedJobs: review.jobs, forceReanalysis: true, trigger: "manual" });
  }, onSuccess: (result) => { if (result) setNotice(`${result.valid} fit analyses completed; ${result.failed} failed.`); client.invalidateQueries(); } });
  const openCopilot = () => { if (workspaceAI) workspaceAI.openPanel({ type: "job", id: job.id, label: `${job.company} · ${job.roleTitle}` }); else { setCopilotVisited(true); setCopilotOpen(true); } };
  const fit = jobFit(match, job);
  const existingApplication = applicationMatch?.state === "EXACT" ? applicationMatch.records[0] : undefined;
  const next = existingApplication && isHistoryApplication(existingApplication.source) ? {label:"Review application history",tab:"overview" as const} : existingApplication && existingApplication.jobId && existingApplication.jobId !== job.id ? { label: "Open existing application", tab: "application" as const } : applicationMatch?.state === "POSSIBLE_MATCH" ? { label: "Review application history", tab: "overview" as const } : assessment && assessment.eligibility !== "ELIGIBLE" ? { label: "Review eligibility", tab: "overview" as const } : jobNextAction(job, resumes, packages, applications);
  const switchTab = (value: WorkspaceTab) => { setTab(value); setVisited((current) => current.includes(value) ? current : [...current, value]); };
  const saved = ["saved", "resume_pending", "resume_ready", "ready_to_apply"].includes(job.status);
  const url = safeJobUrl(job);
  const salary = jobSalary(job);
  return <article className="job-workspace" aria-label={`${job.company} job workspace`}>
    {!sample ? <CareerAISelection type="job" id={job.id} label={`${job.company} · ${job.roleTitle}`} /> : null}
    {approval.dialog}
    {copilotVisited ? <ContextCopilotDialog jobId={job.id} company={job.company} open={copilotOpen} onClose={() => setCopilotOpen(false)} /> : null}
    <header className="job-workspace-header">
      <button className="text-link workspace-back" type="button" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />All jobs</button>
      <ImportProvenance value={job.sourcePayloadJson}/>
      <div className="company-line"><span className="company-avatar" aria-hidden="true">{job.company.slice(0, 1) || "?"}</span><span>{job.company || "Company not specified"}</span><Badge tone={job.status === "rejected" ? "slate" : "blue"}>{job.status === "rejected" ? "Skipped" : job.status.replaceAll("_", " ")}</Badge></div>
      <h2>{job.roleTitle || "Untitled role"}</h2>
      <div className="job-meta"><span><MapPin size={14} aria-hidden="true" />{job.location || "Location not specified"}</span>{job.workplaceType !== "unspecified" ? <span>{job.workplaceType.replaceAll("_", " ")}</span> : null}{salary ? <span>{salary}</span> : <span>Compensation not provided</span>}</div>
      <div className="action-row">
        <button type="button" className="button button-primary" onClick={() => switchTab(next.tab)}>{next.label}<ArrowRight size={15} aria-hidden="true" /></button>
        <button type="button" className="button" disabled={status.isPending || !["new", "matched", "saved", "analysis_pending"].includes(job.status)} onClick={() => { setPreviousStatus(job.status); status.mutate(saved ? "matched" : "saved"); setNotice(saved ? "Removed from saved jobs." : "Job saved."); }}><BookmarkCheckOrBookmark saved={saved} />{saved ? "Saved" : "Save job"}</button>
        {onExpand ? <button type="button" className="icon-button workspace-expand" title={expanded ? "Show job list" : "Expand workspace"} aria-label={expanded ? "Show job list" : "Expand workspace"} onClick={onExpand}>{expanded ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}</button> : null}
        <SkipJobControl job={job}/><details className="job-more"><summary>More</summary><div>{url ? <a href={url} target="_blank" rel="noreferrer">View original posting</a> : null}<button type="button" onClick={(event) => { event.currentTarget.focus(); openCopilot(); }}>Ask about this job</button></div></details>
      </div>
      {notice && !status.isPending ? <div className="inline-notice" role="status">{notice}{previousStatus ? <button type="button" disabled={status.isPending} onClick={() => { status.mutate(previousStatus); setPreviousStatus(null); setNotice("Change undone."); }}><RotateCcw size={12} aria-hidden="true" />Undo</button> : null}</div> : null}
      {status.error || ai.error ? <InlineError message={(status.error ?? ai.error)!.message} /> : null}
    </header>
    <div className="workspace-tabs"><Tabs value={tab} onChange={switchTab} tabs={[{ id: "overview", label: "Overview" }, { id: "resume", label: "Resume" }, { id: "application", label: "Application" }, { id: "activity", label: "Activity" }]} label="Job workspace" /></div>
    <div hidden={tab !== "overview"} className="workspace-content">
      <PrivateJobNote notes={job.notes} onReview={openCopilot} />
      {ranking?<section className="workspace-section" aria-label="Recommendation priority"><h3>Recommendation priority</h3><p>Technical fit: {ranking.baseScore??"unknown"} · Preference adjustment: {ranking.adjustment>0?"+":""}{ranking.adjustment} · Priority: {ranking.priority??"unknown"}</p><p>{ranking.explanations.join(" ")||"No confirmed preference adjustment applies."} Preferences never change eligibility.</p></section>:null}
      {applicationMatch?.records.map(record=><ImportedApplicationEvidence key={record.id} application={record}/>)}
      {assessment && applicationMatch ? <FitExplanation assessment={assessment} application={applicationMatch} /> : null}
      <section className="workspace-section">
        <details className="explanation-details"><summary>How this fit was calculated</summary><p>{fit.aiValidated ? "Includes validated AI analysis and local scoring." : "Based on local scoring. No validated AI analysis is available."}</p>{match ? <dl>{Object.entries(match.scoreBreakdown).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value} points</dd></div>)}</dl> : null}<p>AI fit analysis only runs after you review and approve a request.</p><button className="button" type="button" disabled={ai.isPending || !preferences.data?.aiMatchEnabled} onClick={() => ai.mutate()}><Sparkles size={14} aria-hidden="true" />{ai.isPending ? "Analyzing…" : "Review AI analysis request"}</button>{!preferences.data?.aiMatchEnabled ? <Link className="text-link" to="/jobs?view=sources">Configure optional AI matching</Link> : null}</details>
      </section>
      <section className="workspace-section"><p className="muted-copy">Source: {sourceLabel || "Manual / source not recorded"} · Posted: {job.postedAt || "not provided"} · Last seen: {job.lastSeenAt || "not recorded"}</p><div className="section-heading"><h3>About the role</h3>{url ? <a className="text-link" href={url} target="_blank" rel="noreferrer">Original posting <ExternalLink size={13} aria-hidden="true" /></a> : null}</div><p className="job-description">{job.descriptionText || job.rawDescription || "No job description has been saved."}</p></section>
    </div>
    {visited.includes("resume") ? <div hidden={tab !== "resume"} className="embedded-workspace"><Suspense fallback={<LoadingState label="Opening resume workspace…" />}>{sample ? <SampleResumePanel resumes={resumes} jobId={job.id} /> : <TailorResumePage embedded jobId={job.id} />}</Suspense></div> : null}
    {visited.includes("application") ? <div hidden={tab !== "application"}><Suspense fallback={<LoadingState label="Opening application…" />}>{existingApplication && isHistoryApplication(existingApplication.source) ? <><ImportedApplicationEvidence application={existingApplication}/><Link className="button" to={`/applications?historyApplication=${encodeURIComponent(existingApplication.id)}`}>Open historical tracker record</Link></> : existingApplication && existingApplication.jobId && existingApplication.jobId !== job.id ? <><p className="workspace-note">This posting matches an existing local application. <Link to={`/jobs?jobId=${encodeURIComponent(existingApplication.jobId)}`}>Open its tracked workspace</Link></p><ExistingApplicationsPage embeddedJobId={existingApplication.jobId} /></> : <JobApplicationPanel job={job} />}</Suspense></div> : null}
    <div hidden={tab !== "activity"} className="workspace-content"><section className="workspace-section"><h3>Activity for this job</h3><ol className="activity-list"><li><strong>Job saved locally</strong><time>{new Date(job.createdAt).toLocaleString()}</time></li>{resumes.filter((resume) => resume.jobId === job.id).map((resume) => <li key={resume.id}><strong>{resume.name}</strong><span>{resume.status} · {resume.lastExportPath ? "PDF exported" : "Draft"}</span><time>{new Date(resume.createdAt).toLocaleString()}</time></li>)}{applications.filter((item) => item.jobId === job.id).flatMap((application) => application.statusHistoryJson.map((event, index) => <li key={`${application.id}-${index}`}><strong>Application: {event.status}</strong><time>{new Date(event.changedAt).toLocaleString()}</time></li>))}{history.data?.map((item) => <li key={item.id}><strong>Fit analysis recorded</strong><span>{item.combinedScore}/100</span><time>{new Date(item.createdAt).toLocaleString()}</time></li>)}</ol>{history.isError ? <InlineError message="Fit history could not be loaded. Try opening this tab again." /> : null}</section></div>
  </article>;
}

function BookmarkCheckOrBookmark({ saved }: { saved: boolean }) { return saved ? <BookmarkCheck size={15} aria-hidden="true" /> : <Bookmark size={15} aria-hidden="true" />; }
