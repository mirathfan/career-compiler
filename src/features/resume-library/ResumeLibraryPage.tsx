import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Copy, FolderOpen, RefreshCcw, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, InlineError, LoadingState } from "../../components/States";
import { useRepository } from "../../lib/database/RepositoryProvider";

export function ResumeLibraryPage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const resumesQuery = useQuery({ queryKey: ["resumes"], queryFn: () => repository.listResumeVersions() });
  const jobsQuery = useQuery({ queryKey: ["jobs"], queryFn: () => repository.listJobs() });
  const deleteResume = useMutation({
    mutationFn: (id: string) => repository.deleteResumeVersion(id),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const duplicateResume = useMutation({
    mutationFn: async (id: string) => {
      const resume = (resumesQuery.data ?? []).find((item) => item.id === id);
      if (!resume) throw new Error("Resume version not found.");
      return repository.saveResumeVersion({
        jobId: resume.jobId,
        name: `${resume.name} Copy`,
        templateId: resume.templateId,
        contentJson: resume.contentJson,
        validationJson: resume.validationJson,
        status: "draft",
        lastExportPath: "",
      });
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const renameResume = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const resume = (resumesQuery.data ?? []).find((item) => item.id === id);
      if (!resume) throw new Error("Resume version not found.");
      return repository.saveResumeVersion({ ...resume, name });
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const jobById = useMemo(
    () => new Map((jobsQuery.data ?? []).map((job) => [job.id, job])),
    [jobsQuery.data],
  );

  if (resumesQuery.isLoading || jobsQuery.isLoading) {
    return <LoadingState label="Loading resume library..." />;
  }
  if (resumesQuery.isError) throw resumesQuery.error;
  if (jobsQuery.isError) throw jobsQuery.error;

  const resumes = resumesQuery.data ?? [];

  return (
    <div>
      <PageHeader eyebrow="Local versions" title="Resume Library" />
      <div className="space-y-4 p-8">
        {error ? <InlineError message={error} /> : null}
        {resumes.length === 0 ? (
          <EmptyState
            title="No resume versions yet"
            body="Generate a tailored resume from the Tailor Resume workflow and it will appear here."
          />
        ) : (
          <div className="panel overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Validation</th>
                  <th className="px-4 py-3">Export path</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {resumes.map((resume) => {
                  const job = jobById.get(resume.jobId);
                  const errors = resume.validationJson.filter((issue) => issue.severity === "error").length;
                  return (
                    <tr key={resume.id} className="align-top">
                      <td className="px-4 py-3 font-semibold text-slate-950">{job?.company || "Unknown"}</td>
                      <td className="px-4 py-3">{job?.roleTitle || resume.name}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(resume.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">{resume.status}</td>
                      <td className={errors ? "px-4 py-3 text-red-700" : "px-4 py-3 text-emerald-700"}>
                        {errors ? `${errors} errors` : "No errors"}
                      </td>
                      <td className="max-w-64 truncate px-4 py-3 text-slate-500">
                        {resume.lastExportPath || "Not exported"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="button"
                            type="button"
                            onClick={() => {
                              const name = window.prompt("Rename resume", resume.name);
                              if (name) renameResume.mutate({ id: resume.id, name });
                            }}
                          >
                            Open
                          </button>
                          <button className="button" type="button" onClick={() => duplicateResume.mutate(resume.id)}>
                            <Copy size={14} aria-hidden="true" />
                          </button>
                          <button
                            className="button"
                            type="button"
                            onClick={() => duplicateResume.mutate(resume.id)}
                            title="Regenerate placeholder"
                          >
                            <RefreshCcw size={14} aria-hidden="true" />
                          </button>
                          <button
                            className="button"
                            type="button"
                            disabled={!resume.lastExportPath}
                            onClick={async () => {
                              try {
                                await invoke("reveal_in_finder", { path: resume.lastExportPath });
                              } catch (caught) {
                                console.error("Reveal in Finder failed", caught);
                                setError(caught instanceof Error ? caught.message : String(caught));
                              }
                            }}
                          >
                            <FolderOpen size={14} aria-hidden="true" />
                          </button>
                          <button
                            className="button button-danger"
                            type="button"
                            onClick={() => deleteResume.mutate(resume.id)}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
