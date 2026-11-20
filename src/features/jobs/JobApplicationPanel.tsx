import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useRepository } from "../../lib/database/repositoryContext";
import { selectWorkspaceResume } from "../../lib/jobs/applicationWorkspace";
import { requireApprovedPackage, updatePackageResume } from "../../lib/job-automation/applicationPackages";
import { safeJobUrl } from "../../lib/jobs/workspace";
import { InlineError, LoadingState } from "../../components/States";
import { ApplicationsPage } from "../applications/ApplicationsPage";
import type { Job } from "../../types/domain";

export function JobApplicationPanel({ job }: { job: Job }) {
  const repo = useRepository();
  const client = useQueryClient();
  const packages = useQuery({ queryKey: ["application-packages"], queryFn: () => repo.listApplicationPackages() });
  const resumes = useQuery({ queryKey: ["resume-versions"], queryFn: () => repo.listResumeVersions() });
  const applications = useQuery({ queryKey: ["applications"], queryFn: () => repo.listApplications() });
  const change = useMutation({ mutationFn: (id: string) => selectWorkspaceResume(repo, job.id, id), onSuccess: () => client.invalidateQueries() });
  const approve = useMutation({ mutationFn: () => updatePackageResume(repo, job.id, item?.resumeVersionId ?? "", true), onSuccess: () => client.invalidateQueries() });
  const open = useMutation({ mutationFn: async () => {
    if (!await requireApprovedPackage(repo, job.id)) throw new Error("Approve a resume for this application first.");
    const url = safeJobUrl(job);
    if (!url) throw new Error("No valid application URL has been saved for this job.");
    if ("__TAURI_INTERNALS__" in window) { const { openUrl } = await import("@tauri-apps/plugin-opener"); await openUrl(url); }
    else window.open(url, "_blank", "noopener,noreferrer");
  } });
  if (packages.isLoading || resumes.isLoading || applications.isLoading) return <LoadingState label="Loading application readiness…" />;
  if (packages.isError) throw packages.error;
  if (resumes.isError) throw resumes.error;
  if (applications.isError) throw applications.error;
  const item = packages.data?.find((candidate) => candidate.jobId === job.id);
  const eligible = resumes.data?.filter((resume) => resume.jobId === job.id) ?? [];
  const selected = eligible.find((resume) => resume.id === item?.resumeVersionId);
  const valid = Boolean(selected?.lastExportPath) && !selected?.validationJson.some((issue) => issue.severity === "error");
  const tracker = applications.data?.find((application) => application.jobId === job.id);
  const submitted = Boolean(tracker && (tracker.submittedAt || ["applied", "interview", "offer", "rejected", "withdrawn"].includes(tracker.status)));
  const busy = change.isPending || approve.isPending || open.isPending;
  return <div className="workspace-content">
    <div className="workspace-section"><span className="section-kicker">Application readiness</span><h3>{submitted ? "Keep track of what happens next" : "Take your reviewed resume with you"}</h3><p className="muted-copy">Opening the company website never marks this application as submitted. You make the final submission.</p>
      {!submitted ? <>
        <label className="form-label">Resume for this job<select className="field" value={item?.resumeVersionId ?? ""} disabled={busy || !eligible.length} onChange={(event) => change.mutate(event.target.value)}><option value="">Choose a tailored resume</option>{eligible.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}{resume.lastExportPath ? " · PDF exported" : " · Draft"}</option>)}</select></label>
        {!eligible.length ? <p className="field-hint">Prepare a resume in the Resume tab first.</p> : !valid ? <p className="field-hint">Select a resume with an exported PDF and no validation errors before approving it.</p> : null}
        <div className="action-row"><button type="button" className="button button-primary" disabled={busy || !valid || Boolean(item?.approvedAt)} onClick={() => approve.mutate()}><ShieldCheck size={16} aria-hidden="true" />{approve.isPending ? "Approving…" : item?.approvedAt ? "Resume approved" : "Approve this resume"}</button>
        <button type="button" className="button" disabled={busy || !valid || !item?.approvedAt || !safeJobUrl(job)} onClick={() => open.mutate()}><ExternalLink size={15} aria-hidden="true" />{open.isPending ? "Opening…" : "Open application"}</button></div>
        {!safeJobUrl(job) ? <p className="field-hint">This job has no application URL. Add one through the existing job or tracker tools.</p> : null}
      </> : <p className="success-copy">Submitted history and its resume are preserved.</p>}
      {change.error || approve.error || open.error ? <InlineError message={(change.error ?? approve.error ?? open.error)!.message} /> : null}
      <Link className="text-link" to="/browser-extension">Set up browser autofill <ExternalLink size={13} aria-hidden="true" /></Link>
    </div>
    {tracker ? <ApplicationsPage embeddedJobId={job.id} /> : <div className="workspace-note"><h4>Your answers and tracking will appear here</h4><p>Select a resume above to create the preparation record. Review any missing answers before using browser autofill.</p></div>}
  </div>;
}
