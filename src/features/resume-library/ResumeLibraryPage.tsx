import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Copy, FolderOpen, RefreshCcw, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, InlineError, LoadingState } from "../../components/States";
import { useRepository } from "../../lib/database/repositoryContext";
import { regenerateResumeVersion, type RegenerationResult } from "../../lib/tailoring/regenerate";

export function ResumeLibraryPage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [openResumeId, setOpenResumeId] = useState("");
  const [regenerateId, setRegenerateId] = useState("");
  const [refreshAnalysis, setRefreshAnalysis] = useState(false);
  const [regenerationResult, setRegenerationResult] = useState<RegenerationResult | null>(null);
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
        parentResumeVersionId: "",
        generationProvider: resume.generationProvider,
        generationModel: resume.generationModel,
        promptVersion: resume.promptVersion,
        generationMetadataJson: resume.generationMetadataJson,
        deterministicBaselineJson: resume.deterministicBaselineJson,
      });
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const regenerateResume = useMutation({
    mutationFn: (id: string) => regenerateResumeVersion({ repository, resumeVersionId: id, refreshAnalysis }),
    onSuccess: (result) => {
      setRegenerationResult(result);
      setOpenResumeId(result.child.id);
      setRegenerateId("");
      queryClient.invalidateQueries();
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : String(caught)),
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
        {regenerationResult ? (
          <div className="panel p-4">
            <h3 className="font-semibold text-slate-950">Regeneration diff</h3>
            <p className="mt-1 text-sm text-slate-600">
              Created {regenerationResult.child.name} from parent {regenerationResult.parent.name}. The parent remains unchanged.
            </p>
            <div className="mt-3 max-h-64 space-y-2 overflow-auto">
              {regenerationResult.diff.map((entry, index) => (
                <div key={`${entry.category}-${index}`} className="border-b border-slate-100 pb-2 text-sm">
                  <p className="font-semibold uppercase text-slate-500">{entry.category.replace("_", " ")}</p>
                  {entry.before ? <p className="text-red-700">Before: {entry.before}</p> : null}
                  {entry.after ? <p className="text-emerald-700">After: {entry.after}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {regenerateId ? (
          <div className="panel flex items-center gap-4 p-4">
            <div className="mr-auto">
              <h3 className="font-semibold text-slate-950">Regenerate as a child version</h3>
              <p className="text-sm text-slate-600">Current Career Memory will be reranked and locked content will be preserved.</p>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={refreshAnalysis} onChange={(event) => setRefreshAnalysis(event.target.checked)} />
              Refresh job analysis
            </label>
            <button className="button" type="button" onClick={() => setRegenerateId("")}>Cancel</button>
            <button className="button button-primary" type="button" disabled={regenerateResume.isPending} onClick={() => regenerateResume.mutate(regenerateId)}>
              <RefreshCcw size={14} />{regenerateResume.isPending ? "Regenerating..." : "Create child version"}
            </button>
          </div>
        ) : null}
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
                  <th className="px-4 py-3">Version</th>
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
                    <Fragment key={resume.id}>
                    <tr className="align-top">
                      <td className="px-4 py-3 font-semibold text-slate-950">{job?.company || "Unknown"}</td>
                      <td className="px-4 py-3">{job?.roleTitle || resume.name}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(resume.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">{resume.status}</td>
                      <td className="px-4 py-3 text-slate-600">{resume.parentResumeVersionId ? "Child" : "Root"}</td>
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
                            onClick={() => setOpenResumeId((current) => current === resume.id ? "" : resume.id)}
                          >
                            Open
                          </button>
                          <button className="button" type="button" onClick={() => duplicateResume.mutate(resume.id)}>
                            <Copy size={14} aria-hidden="true" />
                          </button>
                          <button
                            className="button"
                            type="button"
                            onClick={() => setRegenerateId(resume.id)}
                            title="Regenerate as child version"
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
                    {openResumeId === resume.id ? (
                      <tr>
                        <td colSpan={8} className="bg-slate-50 px-5 py-4">
                          <div className="grid grid-cols-[260px_1fr] gap-5 text-sm">
                            <div>
                              <p className="font-semibold text-slate-950">Generation</p>
                              <p className="mt-1 text-slate-600">{resume.generationProvider} | {resume.generationModel || "no model"}</p>
                              <p className="text-slate-600">Prompt {resume.promptVersion || "legacy"}</p>
                              {resume.parentResumeVersionId ? <p className="mt-2 text-slate-600">Parent: {resume.parentResumeVersionId}</p> : null}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-950">Included bullets</p>
                              {[...resume.contentJson.projects, ...resume.contentJson.experience].flatMap((section) =>
                                section.bullets.filter((bullet) => bullet.included).map((bullet) => (
                                  <p key={bullet.id} className="mt-1 text-slate-600"><strong>{section.title}:</strong> {bullet.text}</p>
                                )),
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
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
