import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Copy, FileText, FolderOpen, Plus, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState } from "../../components/States";
import { useRepository } from "../../lib/database/repositoryContext";
import type { ApplicationRecord, ApplicationStatus } from "../../types/domain";

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
  const applications = useQuery({ queryKey: ["applications"], queryFn: () => repository.listApplications() });
  const resumes = useQuery({ queryKey: ["resume-versions"], queryFn: () => repository.listResumeVersions() });
  const saveApplication = useMutation({
    mutationFn: (application: Partial<ApplicationRecord> & Pick<ApplicationRecord, "company" | "role">) =>
      repository.saveApplication(application),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });

  if (applications.isLoading || resumes.isLoading) return <LoadingState label="Loading applications..." />;
  if (applications.isError) throw applications.error;
  if (resumes.isError) throw resumes.error;
  const resumeById = new Map((resumes.data ?? []).map((resume) => [resume.id, resume]));

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
              <tr><th className="px-4 py-3">Company / role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Applied</th><th className="px-4 py-3">Resume</th><th className="px-4 py-3">Notes</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody>
              {(applications.data ?? []).map((application) => {
                const resume = resumeById.get(application.resumeVersionId);
                return (
                  <tr key={application.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-4 py-3"><p className="font-semibold text-slate-950">{application.company}</p><p className="text-slate-500">{application.role}</p>{application.jobUrl ? <a className="text-xs text-blue-700" href={application.jobUrl} target="_blank" rel="noreferrer">Job posting</a> : null}</td>
                    <td className="px-4 py-3"><select className="field min-w-32" value={application.status} onChange={(event) => saveApplication.mutate({ ...application, status: event.target.value as ApplicationStatus, appliedDate: event.target.value === "applied" && !application.appliedDate ? new Date().toISOString().slice(0, 10) : application.appliedDate })}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></td>
                    <td className="px-4 py-3"><input className="field w-36" type="date" value={application.appliedDate} onChange={(event) => saveApplication.mutate({ ...application, appliedDate: event.target.value })} /></td>
                    <td className="max-w-56 px-4 py-3 text-xs text-slate-600">{resume ? <><p className="font-semibold text-slate-800">{resume.name}</p><p>{resume.status}</p></> : "Not linked"}</td>
                    <td className="px-4 py-3"><textarea className="field min-h-20 min-w-56" defaultValue={application.notes} onBlur={(event) => { if (event.target.value !== application.notes) saveApplication.mutate({ ...application, notes: event.target.value }); }} /></td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-2">
                      {application.status !== "applied" ? <button className="icon-button" title="Mark applied" type="button" onClick={() => saveApplication.mutate({ ...application, status: "applied", appliedDate: application.appliedDate || new Date().toISOString().slice(0, 10) })}><Send size={15} /></button> : null}
                      {resume ? <Link className="icon-button" title="Open associated resume" to={`/library?resumeId=${encodeURIComponent(resume.id)}`}><FileText size={15} /></Link> : null}
                      {resume?.lastExportPath ? <button className="icon-button" title="Reveal exported PDF" type="button" onClick={() => void invoke("reveal_in_finder", { path: resume.lastExportPath })}><FolderOpen size={15} /></button> : null}
                      <button className="icon-button" title="Duplicate for a related role" type="button" onClick={() => saveApplication.mutate({ ...application, id: undefined, role: `${application.role} - related`, status: "preparing", appliedDate: "", createdAt: undefined, updatedAt: undefined })}><Copy size={15} /></button>
                    </div></td>
                  </tr>
                );
              })}
              {!applications.data?.length ? <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={6}>No application records yet.</td></tr> : null}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
