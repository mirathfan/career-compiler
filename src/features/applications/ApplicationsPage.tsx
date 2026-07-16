import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Bot, Check, Copy, FileText, FolderOpen, Plus, Save, Send, Wand2 } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState } from "../../components/States";
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

export function ApplicationsPage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ company: "", role: "", jobUrl: "" });
  const [reviewApplicationId, setReviewApplicationId] = useState("");
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
  const selectedApplication = (applications.data ?? []).find((application) => application.id === reviewApplicationId) ?? null;
  const reviewFields = (fields.data ?? []).filter((field) => field.applicationId === reviewApplicationId);

  return (
    <div>
      <PageHeader eyebrow="Local job tracker" title="Applications" />
      <div className="space-y-5 p-8">
        <section className="panel p-5">
          <h3 className="text-lg font-semibold text-slate-950">New application</h3>
          <div className="mt-4 grid grid-cols-[1fr_1fr_1.4fr_auto] gap-3">
            <input className="field" placeholder="Company" value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} />
            <input className="field" placeholder="Role" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} />
            <input className="field" placeholder="Job URL" value={draft.jobUrl} onChange={(event) => setDraft({ ...draft, jobUrl: event.target.value })} />
            <button className="button button-primary" type="button" disabled={!draft.company.trim() || !draft.role.trim()} onClick={async () => {
              await saveApplication.mutateAsync({ ...draft, status: "preparing" });
              setDraft({ company: "", role: "", jobUrl: "" });
            }}><Plus size={16} />Add</button>
          </div>
        </section>

        <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3">Company / role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Dates</th><th className="px-4 py-3">Resume</th><th className="px-4 py-3">Review</th><th className="px-4 py-3">Notes and next action</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody>
              {(applications.data ?? []).map((application) => {
                const resume = resumeById.get(application.resumeVersionId);
                const applicationFields = (fields.data ?? []).filter((field) => field.applicationId === application.id);
                const isReviewing = reviewApplicationId === application.id;
                return (
                  <Fragment key={application.id}>
                    <tr className="border-b border-slate-100 align-top last:border-0">
                      <td className="px-4 py-3"><p className="font-semibold text-slate-950">{application.company}</p><p className="text-slate-500">{application.role}</p>{application.jobUrl ? <a className="text-xs text-blue-700" href={application.jobUrl} target="_blank" rel="noreferrer">Job posting</a> : null}</td>
                      <td className="px-4 py-3"><select className="field min-w-32" value={application.status} onChange={(event) => saveApplication.mutate({ ...application, status: event.target.value as ApplicationStatus, appliedDate: event.target.value === "applied" && !application.appliedDate ? new Date().toISOString().slice(0, 10) : application.appliedDate })}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></td>
                      <td className="space-y-2 px-4 py-3"><label className="block text-xs font-semibold text-slate-500">Applied<input className="field mt-1 w-36" type="date" value={application.appliedDate} onChange={(event) => saveApplication.mutate({ ...application, appliedDate: event.target.value })} /></label><label className="block text-xs font-semibold text-slate-500">Follow-up<input className="field mt-1 w-36" type="date" value={application.followUpDate} onChange={(event) => saveApplication.mutate({ ...application, followUpDate: event.target.value })} /></label></td>
                      <td className="max-w-64 px-4 py-3 text-xs text-slate-600"><select className="field w-full" value={application.resumeVersionId} onChange={(event) => saveApplication.mutate({ ...application, resumeVersionId: event.target.value })}><option value="">Not linked</option>{(resumes.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{resume ? <><p className="mt-2 font-semibold text-slate-800">{resume.name}</p><p>{application.submittedResumeVersionId === resume.id ? "Submitted version" : resume.status}</p></> : null}</td>
                      <td className="px-4 py-3 text-xs text-slate-600"><p>{applicationFields.length} fields</p><p>{applicationFields.filter((field) => field.requiresReview).length} need review</p><p>{application.atsPlatform || "No ATS"}</p></td>
                      <td className="space-y-2 px-4 py-3"><input className="field min-w-56" placeholder="Recruiter" defaultValue={application.recruiter} onBlur={(event) => { if (event.target.value !== application.recruiter) saveApplication.mutate({ ...application, recruiter: event.target.value }); }} /><input className="field min-w-56" placeholder="Next action" defaultValue={application.nextAction} onBlur={(event) => { if (event.target.value !== application.nextAction) saveApplication.mutate({ ...application, nextAction: event.target.value }); }} /><textarea className="field min-h-20 min-w-56" defaultValue={application.notes} onBlur={(event) => { if (event.target.value !== application.notes) saveApplication.mutate({ ...application, notes: event.target.value }); }} /></td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-2">
                        <button className="icon-button" title="Open application review" type="button" aria-pressed={isReviewing} onClick={() => setReviewApplicationId((current) => current === application.id ? "" : application.id)}><Wand2 size={15} /></button>
                        {application.status !== "applied" ? <button className="icon-button" title="Mark applied" type="button" onClick={() => saveApplication.mutate({ ...application, status: "applied", appliedDate: application.appliedDate || new Date().toISOString().slice(0, 10) })}><Send size={15} /></button> : null}
                        <Link className="icon-button" title="Ask Career Copilot" to={`/copilot?contextType=application&contextId=${encodeURIComponent(application.id)}`}><Bot size={15} /></Link>
                        {resume ? <Link className="icon-button" title="Open associated resume" to={`/library?resumeId=${encodeURIComponent(resume.id)}`}><FileText size={15} /></Link> : null}
                        {resume?.lastExportPath ? <button className="icon-button" title="Reveal exported PDF" type="button" onClick={() => void invoke("reveal_in_finder", { path: resume.lastExportPath })}><FolderOpen size={15} /></button> : null}
                        <button className="icon-button" title="Duplicate for a related role" type="button" onClick={() => saveApplication.mutate({ ...application, id: undefined, role: `${application.role} - related`, status: "preparing", appliedDate: "", createdAt: undefined, updatedAt: undefined })}><Copy size={15} /></button>
                      </div></td>
                    </tr>
                  </Fragment>
                );
              })}
              {!applications.data?.length ? <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={7}>No application records yet.</td></tr> : null}
            </tbody>
          </table>
        </section>

        {selectedApplication ? (
          <section className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Application review: {selectedApplication.company}</h3>
                <p className="mt-1 text-sm text-slate-600">Review complete - submit manually in the browser.</p>
              </div>
              <button className="button" type="button" onClick={() => setReviewApplicationId("")}>Close</button>
            </div>

            <div className="mt-4 grid grid-cols-[1fr_180px_220px_auto] gap-2">
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
                        <p className="mt-1 text-xs font-semibold text-slate-600">{field.normalizedQuestionType} | {field.answerSource} | confidence {Math.round(field.confidence * 100)}%</p>
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
          </section>
        ) : null}
      </div>
    </div>
  );
}
