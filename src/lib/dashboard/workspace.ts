import type { ApplicationRecord, CareerImportRecord, ResumeVersion } from "../../types/domain";
import type { AppRepository } from "../database/repository";

export interface WorkspaceAction { id: string; title: string; detail: string; to: string; priority: number; order: string }
export interface WorkspaceEvent { id: string; title: string; detail: string; at: string; to?: string }
export const applicationLink = (id: string) => `/applications?applicationId=${encodeURIComponent(id)}`;
export const resumeLink = (id: string) => `/library?resumeId=${encodeURIComponent(id)}`;
export const jobLink = (id: string) => `/jobs?view=all&jobId=${encodeURIComponent(id)}`;

export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function validDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function displayRecordedDate(value: string): string {
  if (validDay(value)) return new Date(`${value}T12:00:00`).toLocaleDateString();
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Date not recorded";
}
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
const isOpen = (application: ApplicationRecord) => !["rejected", "withdrawn"].includes(application.status);
export function isFollowUpDue(application: ApplicationRecord, today = localDay()): boolean {
  return isOpen(application) && validDay(application.followUpDate) && application.followUpDate <= today;
}

// Only existing dated events are included. updatedAt is not an invented status event.
export function buildWorkspaceActivity(applications: ApplicationRecord[], resumes: ResumeVersion[], imports: CareerImportRecord[]): WorkspaceEvent[] {
  const events: WorkspaceEvent[] = [];
  for (const application of applications) {
    application.statusHistoryJson.forEach((event, index) => {
      events.push({ id: `application:${application.id}:${index}`, title: `${application.company || "Company not recorded"} · ${application.role || "Role not recorded"}`, detail: `Application status: ${event.status}`, at: event.changedAt, to: applicationLink(application.id) });
    });
  }
  for (const resume of resumes) events.push({ id: `resume:${resume.id}`, title: resume.name || "Untitled resume", detail: "Resume version created", at: resume.createdAt, to: resumeLink(resume.id) });
  for (const record of imports) {
    events.push({ id: `import:${record.id}`, title: record.sourceTitle || "Career evidence import", detail: `Reviewed import · ${record.approvedCount} approved · ${record.mergedCount} merged`, at: record.createdAt });
    if (record.undoneAt) events.push({ id: `undo:${record.id}`, title: record.sourceTitle || "Career evidence import", detail: "Import undone", at: record.undoneAt });
  }
  return events.filter(event => event.at && Number.isFinite(Date.parse(event.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || byId(a, b));
}

export async function loadWorkspaceActivity(repository: AppRepository) {
  const [applications, resumes, imports] = await Promise.all([
    repository.listApplications(), repository.listResumeVersions(), repository.listCareerImportRecords(),
  ]);
  return buildWorkspaceActivity(applications, resumes, imports);
}

export async function loadWorkspaceSummary(repository: AppRepository, today = localDay()) {
  const [metrics, applications, jobs, resumes, archives, imports] = await Promise.all([
    repository.getDashboardMetrics(), repository.listApplications(), repository.listJobs(),
    repository.listResumeVersions(), repository.listResumeArchives(), repository.listCareerImportRecords(),
  ]);
  const archived = new Set(archives.map(record => record.resumeVersionId));
  const draftResumes = resumes.filter(resume => resume.status === "draft" && !archived.has(resume.id));
  const drafts = applications.filter(application => application.status === "preparing");
  const scheduled = applications.filter(application => isOpen(application) && validDay(application.followUpDate));
  const due = scheduled.filter(application => isFollowUpDue(application, today));
  const savedJobs = jobs.filter(job => ["saved", "resume_pending", "resume_ready", "ready_to_apply"].includes(job.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byId(a, b));
  const actions: WorkspaceAction[] = due.map(application => ({
    id: `follow-up:${application.id}`, title: `Follow up with ${application.company || "this company"}`,
    detail: `${application.role || "Role not recorded"}${application.nextAction ? ` · ${application.nextAction}` : ""} · ${application.followUpDate < today ? "Overdue" : "Due today"}: ${displayRecordedDate(application.followUpDate)}`,
    to: applicationLink(application.id), priority: 0, order: application.followUpDate,
  }));
  for (const application of drafts) actions.push({ id: `draft:${application.id}`, title: `Continue ${application.company || "application"}`, detail: [application.role || "Role not recorded", application.nextAction, validDay(application.followUpDate) ? `Follow-up: ${displayRecordedDate(application.followUpDate)}` : ""].filter(Boolean).join(" · "), to: applicationLink(application.id), priority: 1, order: application.createdAt });
  for (const resume of draftResumes) actions.push({ id: `resume:${resume.id}`, title: `Review ${resume.name || "untitled resume"}`, detail: "Draft resume · review evidence and validation before export", to: resumeLink(resume.id), priority: 2, order: resume.createdAt });
  if (metrics.factsNeedingReview) actions.push({ id: "evidence", title: "Review your career evidence", detail: `${metrics.factsNeedingReview} facts marked needs review`, to: "/profile?section=evidence", priority: 3, order: "" });
  // Explicit due dates first, then drafts, resume reviews, evidence. Oldest first within each group; stable ID breaks ties.
  actions.sort((a, b) => a.priority - b.priority || a.order.localeCompare(b.order) || byId(a, b));
  return {
    metrics, draftApplications: drafts.length, dueFollowUps: due.length,
    upcomingFollowUps: scheduled.length - due.length, draftResumes: draftResumes.length,
    savedJobs, actions, activity: buildWorkspaceActivity(applications, resumes, imports),
  };
}
