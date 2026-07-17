import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Bot, Check, Copy, FileText, FolderOpen, Plus, Save, Send, Wand2 } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, LoadingState } from "../../components/States";
import { Badge, PageSection, SearchInput, StatusBadge, Tabs } from "../../components/ui";
import { prepareApplicationReview } from "../../lib/applications/applicationReview";
import { applicationQuestionTypes, normalizeDetectedField } from "../../lib/applications/questionClassifier";
import { useRepository } from "../../lib/database/repositoryContext";
import type { ApplicationFieldRecord, ApplicationQuestionType, ApplicationRecord, ApplicationStatus } from "../../types/domain";

const statuses: ApplicationStatus[] = [
  "preparing",
  "ready",
  "applied",
  "interview",
  "rejected",
  "offer",
  "withdrawn",
];

type ApplicationView = "needs_review" | "ready" | "filled" | "submitted" | "interviewing" | "closed";

const applicationViews: Array<{ id: ApplicationView; label: string }> = [
  { id: "needs_review", label: "Needs review" },
  { id: "ready", label: "Ready to fill" },
  { id: "filled", label: "Awaiting submission" },
  { id: "submitted", label: "Submitted" },
  { id: "interviewing", label: "Interviewing" },
  { id: "closed", label: "Closed" },
];

export function ApplicationsPage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ company: "", role: "", jobUrl: "" });
  const [reviewApplicationId, setReviewApplicationId] = useState("");
  const [activeView, setActiveView] = useState<ApplicationView>("needs_review");
  const [search, setSearch] = useState("");
  const [fieldDraft, setFieldDraft] = useState({
    question: "",
    inputType: "text",
    normalizedQuestionType: "unknown" as ApplicationQuestionType,
  });
  const applications = useQuery({ queryKey: ["applications"], queryFn: () => repository.listApplications() });
  const resumes = useQuery({ queryKey: ["resume-versions"], queryFn: () => repository.listResumeVersions() });
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => repository.listJobs() });
  const fields = useQuery({ queryKey: ["application-fields"], queryFn: () => repository.listApplicationFields() });
  const saveApplication = useMutation({
    mutationFn: (application: Partial<ApplicationRecord> & Pick<ApplicationRecord, "company" | "role">) =>
      repository.saveApplication(application),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });
  const saveField = useMutation({
    mutationFn: (field: Parameters<typeof repository.saveApplicationField>[0]) =>
      repository.saveApplicationField(field),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["application-fields"] }),
  });
  const saveApprovedAnswer = useMutation({
    mutationFn: (field: ApplicationFieldRecord) =>
      repository.saveApprovedApplicationAnswer({
        normalizedQuestionType: field.normalizedQuestionType,
        originalQuestion: field.originalQuestion,
        answer: String(field.finalAnswer ?? field.generatedAnswer ?? ""),
        sourceClaimIds: field.claimIds,
        sourceStoryIds: field.storyIds,
        approvedByUser: true,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approved-application-answers"] }),
  });
  const prepareReview = useMutation({
    mutationFn: async (application: ApplicationRecord) => {
      const job = (jobs.data ?? []).find((item) => item.id === application.jobId) ?? null;
      const detected = normalizeDetectedField({
        id: `manual-${Date.now()}`,
        label: fieldDraft.question,
        inputType: fieldDraft.inputType,
        detectedFieldType: fieldDraft.inputType,
      });
      detected.normalizedQuestionType =
        fieldDraft.normalizedQuestionType === "unknown"
          ? detected.normalizedQuestionType
          : fieldDraft.normalizedQuestionType;
      return prepareApplicationReview({ repository, application, job, fields: [detected] });
    },
    onSuccess: () => {
      setFieldDraft({ question: "", inputType: "text", normalizedQuestionType: "unknown" });
      queryClient.invalidateQueries();
    },
  });

  if (applications.isLoading || resumes.isLoading || jobs.isLoading || fields.isLoading) return <LoadingState label="Loading applications..." />;
  if (applications.isError) throw applications.error;
  if (resumes.isError) throw resumes.error;
  if (jobs.isError) throw jobs.error;
  if (fields.isError) throw fields.error;
  const resumeById = new Map((resumes.data ?? []).map((resume) => [resume.id, resume]));
  const allApplications = applications.data ?? [];
  const fieldsByApplication = new Map<string, ApplicationFieldRecord[]>();
  for (const field of fields.data ?? []) {
    fieldsByApplication.set(field.applicationId, [...(fieldsByApplication.get(field.applicationId) ?? []), field]);
  }
  const selectedApplication = (applications.data ?? []).find((application) => application.id === reviewApplicationId) ?? null;
  const reviewFields = (fields.data ?? []).filter((field) => field.applicationId === reviewApplicationId);
  const matchesView = (application: ApplicationRecord, view: ApplicationView) => {
    const applicationFields = fieldsByApplication.get(application.id) ?? [];
    const needsReview = applicationFields.some((field) => field.requiresReview);
    if (view === "needs_review") return application.status === "preparing" || needsReview;
    if (view === "ready") return application.status === "ready" && !needsReview;
    if (view === "filled") return application.status === "ready" && applicationFields.length > 0 && !needsReview;
    if (view === "submitted") return application.status === "applied" || application.status === "offer";
    if (view === "interviewing") return application.status === "interview";
    return application.status === "rejected" || application.status === "withdrawn";
  };
  const viewCounts = Object.fromEntries(
    applicationViews.map((view) => [view.id, allApplications.filter((application) => matchesView(application, view.id)).length]),
  ) as Record<ApplicationView, number>;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleApplications = allApplications.filter((application) => {
    if (!matchesView(application, activeView)) return false;
    if (!normalizedSearch) return true;
    return [application.company, application.role, application.jobUrl, application.nextAction, application.recruiter]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch);
  });
  const primaryAction = (application: ApplicationRecord) => {
    if (application.status === "preparing") return "Review answers";
    if (application.status === "ready") return "Fill application";
    if (application.status === "applied") return "Add interview";
    if (application.status === "interview") return "Update interview";
    if (application.status === "rejected" || application.status === "withdrawn") return "Reopen";
    return "Open application";
  };

  return (
    <div>
      <PageHeader
        eyebrow="Local job tracker"
        title="Applications"
        description="Track daily application work, review generated answers, and keep final submission manual."
        meta={
          <>
            <Badge tone="amber">{viewCounts.needs_review} need review</Badge>
            <Badge tone="blue">{viewCounts.ready + viewCounts.filled} ready to fill</Badge>
            <Badge tone="emerald">{viewCounts.submitted} submitted</Badge>
          </>
        }
      />
      <div className="page-body space-y-5">
        <PageSection title="New application" description="Create a local draft, then attach a resume and generated answers before opening the real application form.">
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr_auto]">
            <input className="field" placeholder="Company" value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} />
            <input className="field" placeholder="Role" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} />
            <input className="field" placeholder="Job URL" value={draft.jobUrl} onChange={(event) => setDraft({ ...draft, jobUrl: event.target.value })} />
            <button className="button button-primary" type="button" disabled={!draft.company.trim() || !draft.role.trim()} onClick={async () => {
              await saveApplication.mutateAsync({ ...draft, status: "preparing" });
              setDraft({ company: "", role: "", jobUrl: "" });
            }}><Plus size={16} />Add</button>
          </div>
        </PageSection>

        <PageSection
          title="Application workflow"
          description="Use the view tabs to focus on the next action instead of scanning a raw tracker table."
          actions={<div className="w-72"><SearchInput value={search} onChange={setSearch} placeholder="Search applications" /></div>}
        >
          <Tabs
            value={activeView}
            onChange={setActiveView}
            tabs={applicationViews.map((view) => ({ ...view, count: viewCounts[view.id] }))}
            label="Application views"
          />
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {visibleApplications.map((application) => {
                const resume = resumeById.get(application.resumeVersionId);
                const applicationFields = fieldsByApplication.get(application.id) ?? [];
                const isReviewing = reviewApplicationId === application.id;
                const needsReview = applicationFields.filter((field) => field.requiresReview).length;
                return (
                  <article key={application.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold text-slate-950">{application.company}</h3>
                        <p className="text-sm text-slate-600">{application.role}</p>
                        {application.jobUrl ? <a className="mt-1 inline-block max-w-full truncate text-xs font-semibold text-blue-700" href={application.jobUrl} target="_blank" rel="noreferrer">Job posting</a> : null}
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <StatusBadge status={application.status} />
                        {needsReview ? <Badge tone="amber">{needsReview} need review</Badge> : <Badge tone="emerald">answers clear</Badge>}
                        <Badge>{application.atsPlatform || "No ATS"}</Badge>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                      <div><p className="eyebrow">Resume</p><p className="mt-1 truncate text-slate-700">{resume?.name || "Not linked"}</p></div>
                      <div><p className="eyebrow">Fields</p><p className="mt-1 text-slate-700">{applicationFields.length} detected</p></div>
                      <div><p className="eyebrow">Last activity</p><p className="mt-1 text-slate-700">{new Date(application.updatedAt).toLocaleDateString()}</p></div>
                    </div>

                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      <label className="block text-xs font-semibold text-slate-500">Status<select className="field mt-1" value={application.status} onChange={(event) => saveApplication.mutate({ ...application, status: event.target.value as ApplicationStatus, appliedDate: event.target.value === "applied" && !application.appliedDate ? new Date().toISOString().slice(0, 10) : application.appliedDate })}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                      <label className="block text-xs font-semibold text-slate-500">Resume<select className="field mt-1" value={application.resumeVersionId} onChange={(event) => saveApplication.mutate({ ...application, resumeVersionId: event.target.value })}><option value="">Not linked</option>{(resumes.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                      <label className="block text-xs font-semibold text-slate-500">Applied<input className="field mt-1" type="date" value={application.appliedDate} onChange={(event) => saveApplication.mutate({ ...application, appliedDate: event.target.value })} /></label>
                      <label className="block text-xs font-semibold text-slate-500">Follow-up<input className="field mt-1" type="date" value={application.followUpDate} onChange={(event) => saveApplication.mutate({ ...application, followUpDate: event.target.value })} /></label>
                    </div>

                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      <input className="field" placeholder="Recruiter" defaultValue={application.recruiter} onBlur={(event) => { if (event.target.value !== application.recruiter) saveApplication.mutate({ ...application, recruiter: event.target.value }); }} />
                      <input className="field" placeholder="Next action" defaultValue={application.nextAction} onBlur={(event) => { if (event.target.value !== application.nextAction) saveApplication.mutate({ ...application, nextAction: event.target.value }); }} />
                      <textarea className="field min-h-20 md:col-span-2" placeholder="Notes" defaultValue={application.notes} onBlur={(event) => { if (event.target.value !== application.notes) saveApplication.mutate({ ...application, notes: event.target.value }); }} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button className={isReviewing ? "button button-primary" : "button"} type="button" aria-pressed={isReviewing} onClick={() => setReviewApplicationId((current) => current === application.id ? "" : application.id)}>
                        <Wand2 size={15} />{primaryAction(application)}
                      </button>
                      {application.status !== "applied" ? <button className="button" type="button" onClick={() => saveApplication.mutate({ ...application, status: "applied", appliedDate: application.appliedDate || new Date().toISOString().slice(0, 10) })}><Send size={15} />Mark submitted</button> : null}
                      <Link className="button" to={`/copilot?contextType=application&contextId=${encodeURIComponent(application.id)}`}><Bot size={15} />Ask Copilot</Link>
                      {resume ? <Link className="button" to={`/library?resumeId=${encodeURIComponent(resume.id)}`}><FileText size={15} />Open resume</Link> : null}
                      {resume?.lastExportPath ? <button className="button" type="button" onClick={() => void invoke("reveal_in_finder", { path: resume.lastExportPath })}><FolderOpen size={15} />Reveal PDF</button> : null}
                      <button className="button" type="button" onClick={() => saveApplication.mutate({ ...application, id: undefined, role: `${application.role} - related`, status: "preparing", appliedDate: "", createdAt: undefined, updatedAt: undefined })}><Copy size={15} />Duplicate</button>
                    </div>
                  </article>
                );
              })}
          </div>
          {!visibleApplications.length ? (
            <div className="mt-4">
              <EmptyState title="No applications in this view" body="Create a draft application or switch views to see other records." />
            </div>
          ) : null}
        </PageSection>

        {selectedApplication ? (
          <PageSection
            title={`Application review: ${selectedApplication.company}`}
            description="Review generated answers, edit long responses comfortably, and keep final submission manual in the browser."
            actions={<button className="button" type="button" onClick={() => setReviewApplicationId("")}>Close</button>}
          >

            <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_180px_220px_auto]">
              <input className="field" placeholder="Detected question or field label" value={fieldDraft.question} onChange={(event) => setFieldDraft({ ...fieldDraft, question: event.target.value })} />
              <input className="field" placeholder="Input type" value={fieldDraft.inputType} onChange={(event) => setFieldDraft({ ...fieldDraft, inputType: event.target.value })} />
              <select className="field" value={fieldDraft.normalizedQuestionType} onChange={(event) => setFieldDraft({ ...fieldDraft, normalizedQuestionType: event.target.value as ApplicationQuestionType })}>
                {applicationQuestionTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <button className="button button-primary" type="button" disabled={!fieldDraft.question.trim() || prepareReview.isPending} onClick={() => prepareReview.mutate(selectedApplication)}>
                <Wand2 size={15} aria-hidden="true" />
                Generate
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {reviewFields.map((field) => {
                const stateClass = field.answerSource === "fixed_profile" || field.answerSource === "locked_sensitive"
                  ? "border-emerald-200 bg-emerald-50"
                  : field.answerSource === "approved_answer"
                    ? "border-blue-200 bg-blue-50"
                    : field.requiresReview
                      ? "border-amber-200 bg-amber-50"
                      : "border-slate-200 bg-white";
                return (
                  <div key={field.id} className={`rounded-md border p-3 ${stateClass}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-950">{field.originalQuestion}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusBadge status={field.normalizedQuestionType} />
                          <StatusBadge status={field.answerSource} />
                          <Badge tone={field.confidence >= 0.8 ? "emerald" : field.confidence >= 0.5 ? "amber" : "red"}>{Math.round(field.confidence * 100)}% confidence</Badge>
                          {field.requiresReview ? <Badge tone="red">requires user input</Badge> : null}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="icon-button" title="Approve answer" type="button" onClick={() => saveField.mutate({ ...field, approved: true, requiresReview: false })}><Check size={15} /></button>
                        <button className="icon-button" title="Save to answer memory" type="button" disabled={!String(field.finalAnswer ?? "").trim()} onClick={() => saveApprovedAnswer.mutate(field)}><Save size={15} /></button>
                      </div>
                    </div>
                    <textarea className="field mt-3 min-h-20 bg-white" defaultValue={String(field.finalAnswer ?? "")} onBlur={(event) => { if (event.target.value !== String(field.finalAnswer ?? "")) saveField.mutate({ ...field, finalAnswer: event.target.value, userEdited: true, requiresReview: true }); }} />
                    {field.warnings.length ? <div className="mt-2 flex flex-wrap gap-2">{field.warnings.map((warning) => <span key={warning} className="rounded border border-amber-200 bg-white px-2 py-1 text-xs font-semibold text-amber-800">{warning}</span>)}</div> : null}
                    {field.reasoningSummary ? <p className="mt-2 text-xs text-slate-600">{field.reasoningSummary}</p> : null}
                  </div>
                );
              })}
              {!reviewFields.length ? <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No detected application fields saved yet.</p> : null}
            </div>
          </PageSection>
        ) : null}
      </div>
    </div>
  );
}
