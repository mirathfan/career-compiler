import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Link, useSearchParams } from "react-router-dom";
import { Archive, Bot, Copy, FolderOpen, RefreshCcw, Star, Trash2, WandSparkles } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, InlineError, LoadingState } from "../../components/States";
import { useRepository } from "../../lib/database/repositoryContext";
import { allResumeBullets } from "../../lib/resume/validation";
import { generateResumeRecommendations } from "../../lib/search/resumeRecommendations";
import { regenerateResumeVersion, type RegenerationResult } from "../../lib/tailoring/regenerate";

export function ResumeLibraryPage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const [openResumeId, setOpenResumeId] = useState(() => searchParams.get("resumeId") ?? "");
  const [regenerateId, setRegenerateId] = useState("");
  const [refreshAnalysis, setRefreshAnalysis] = useState(false);
  const [regenerationResult, setRegenerationResult] = useState<RegenerationResult | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [targetJobId, setTargetJobId] = useState(() => searchParams.get("jobId") ?? "");
  const resumesQuery = useQuery({ queryKey: ["resumes"], queryFn: () => repository.listResumeVersions() });
  const jobsQuery = useQuery({ queryKey: ["jobs"], queryFn: () => repository.listJobs() });
  const applicationsQuery = useQuery({ queryKey: ["applications"], queryFn: () => repository.listApplications() });
  const favoritesQuery = useQuery({ queryKey: ["resume-favorites"], queryFn: () => repository.listResumeFavorites() });
  const archivesQuery = useQuery({ queryKey: ["resume-archives"], queryFn: () => repository.listResumeArchives() });
  const recommendationsQuery = useQuery({
    queryKey: ["resume-recommendations", targetJobId],
    queryFn: () => (targetJobId ? repository.listResumeRecommendations(targetJobId) : Promise.resolve([])),
  });
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
        promptVersionsJson: resume.promptVersionsJson,
        layoutProfileId: resume.layoutProfileId,
        templateSettingsJson: resume.templateSettingsJson,
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
  const toggleFavorite = useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) => repository.setResumeFavorite(id, favorite),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const toggleArchive = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => repository.setResumeArchived(id, archived),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const generateRecommendations = useMutation({
    mutationFn: (jobId: string) => generateResumeRecommendations(repository, jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resume-recommendations", targetJobId] }),
    onError: (caught) => setError(caught instanceof Error ? caught.message : String(caught)),
  });
  const useRecommendationAsBase = useMutation({
    mutationFn: async (resumeId: string) => {
      const resume = (resumesQuery.data ?? []).find((item) => item.id === resumeId);
      if (!resume) throw new Error("Recommended resume version not found.");
      return repository.saveResumeVersion({
        jobId: targetJobId || resume.jobId,
        name: `${resume.name} - base draft`,
        templateId: resume.templateId,
        contentJson: resume.contentJson,
        validationJson: resume.validationJson,
        status: "draft",
        lastExportPath: "",
        parentResumeVersionId: resume.id,
        generationProvider: resume.generationProvider,
        generationModel: resume.generationModel,
        promptVersion: resume.promptVersion,
        promptVersionsJson: resume.promptVersionsJson,
        layoutProfileId: resume.layoutProfileId,
        templateSettingsJson: resume.templateSettingsJson,
        generationMetadataJson: resume.generationMetadataJson,
        deterministicBaselineJson: resume.deterministicBaselineJson,
      });
    },
    onSuccess: (child) => {
      setOpenResumeId(child.id);
      queryClient.invalidateQueries();
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : String(caught)),
  });

  const jobById = useMemo(
    () => new Map((jobsQuery.data ?? []).map((job) => [job.id, job])),
    [jobsQuery.data],
  );

  if ([resumesQuery, jobsQuery, applicationsQuery, favoritesQuery, archivesQuery, recommendationsQuery].some((query) => query.isLoading)) {
    return <LoadingState label="Loading resume library..." />;
  }
  if (resumesQuery.isError) throw resumesQuery.error;
  if (jobsQuery.isError) throw jobsQuery.error;
  if (applicationsQuery.isError) throw applicationsQuery.error;

  const favoriteIds = new Set((favoritesQuery.data ?? []).map((favorite) => favorite.resumeVersionId));
  const archivedIds = new Set((archivesQuery.data ?? []).map((archive) => archive.resumeVersionId));
  const submittedIds = new Set((applicationsQuery.data ?? []).flatMap((application) => [application.resumeVersionId, application.submittedResumeVersionId].filter(Boolean)));
  const normalizedSearch = search.trim().toLowerCase();
  const resumes = (resumesQuery.data ?? []).filter((resume) => {
    const job = jobById.get(resume.jobId);
    const haystack = [
      resume.name,
      resume.status,
      job?.company ?? "",
      job?.roleTitle ?? "",
      resume.contentJson.skills.join(" "),
      allResumeBullets(resume.contentJson).map(({ bullet }) => bullet.text).join(" "),
    ].join(" ").toLowerCase();
    if (normalizedSearch && !haystack.includes(normalizedSearch)) return false;
    if (statusFilter === "active" && archivedIds.has(resume.id)) return false;
    if (statusFilter === "archived" && !archivedIds.has(resume.id)) return false;
    if (statusFilter === "favorite" && !favoriteIds.has(resume.id)) return false;
    if (statusFilter === "submitted" && !submittedIds.has(resume.id)) return false;
    if (statusFilter === "draft" && resume.status !== "draft") return false;
    if (statusFilter === "ready" && resume.status === "draft") return false;
    return true;
  });

  return (
    <div>
      <PageHeader eyebrow="Local versions" title="Resume Library" />
      <div className="space-y-4 p-8">
        {error ? <InlineError message={error} /> : null}
        <section className="panel p-4">
          <div className="grid grid-cols-[minmax(220px,1fr)_180px_minmax(220px,1fr)_auto] gap-3">
            <input
              className="field"
              data-search-input
              placeholder="Search resumes, companies, roles, skills, bullets"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="active">Active</option>
              <option value="favorite">Favorite</option>
              <option value="submitted">Submitted</option>
              <option value="ready">Ready</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
            <select className="field" value={targetJobId} onChange={(event) => setTargetJobId(event.target.value)}>
              <option value="">Recommendation target job</option>
              {(jobsQuery.data ?? []).map((job) => (
                <option key={job.id} value={job.id}>
                  {[job.company, job.roleTitle].filter(Boolean).join(" - ") || "Saved job"}
                </option>
              ))}
            </select>
            <button className="button button-primary" type="button" disabled={!targetJobId || generateRecommendations.isPending} onClick={() => generateRecommendations.mutate(targetJobId)}>
              <WandSparkles size={15} />
              Recommend
            </button>
          </div>
          {targetJobId && recommendationsQuery.data?.length ? (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {recommendationsQuery.data.filter((item) => !item.explanationJson.dismissed).slice(0, 3).map((recommendation) => {
                const resume = (resumesQuery.data ?? []).find((item) => item.id === recommendation.candidateResumeVersionId);
                return (
                  <div key={recommendation.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                    <p className="font-semibold text-slate-950">{resume?.name ?? "Saved resume"}</p>
                    <p className="mt-1 text-xs text-slate-600">Score {recommendation.overallScore.toFixed(2)} | skills {recommendation.skillScore.toFixed(2)} | validation {recommendation.validationScore.toFixed(2)}</p>
                    <p className="mt-2 line-clamp-2 text-xs text-slate-600">{recommendation.explanationJson.reasons.join(" ")}</p>
                    <div className="mt-3 flex gap-2">
                      <button className="button" type="button" onClick={() => useRecommendationAsBase.mutate(recommendation.candidateResumeVersionId)}>
                        Use as base
                      </button>
                      <button className="button" type="button" onClick={() => repository.dismissResumeRecommendation(recommendation.id).then(() => queryClient.invalidateQueries())}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
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
                  const isFavorite = favoriteIds.has(resume.id);
                  const isArchived = archivedIds.has(resume.id);
                  const isSubmitted = submittedIds.has(resume.id);
                  return (
                    <Fragment key={resume.id}>
                    <tr className="align-top">
                      <td className="px-4 py-3 font-semibold text-slate-950">{job?.company || "Unknown"}</td>
                      <td className="px-4 py-3">{job?.roleTitle || resume.name}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(resume.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{resume.status === "draft" ? "Draft" : "Ready"}</span>
                          {isSubmitted ? <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Submitted</span> : null}
                          {isFavorite ? <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Favorite</span> : null}
                          {isArchived ? <span className="rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">Archived</span> : null}
                        </div>
                      </td>
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
                          <Link className="button" title="Ask Career Copilot" to={`/copilot?contextType=resume&contextId=${encodeURIComponent(resume.id)}`}>
                            <Bot size={14} aria-hidden="true" />
                          </Link>
                          <button
                            className={isFavorite ? "button border-amber-300 bg-amber-50 text-amber-800" : "button"}
                            type="button"
                            title={isFavorite ? "Remove favorite" : "Favorite resume"}
                            onClick={() => toggleFavorite.mutate({ id: resume.id, favorite: !isFavorite })}
                          >
                            <Star size={14} aria-hidden="true" />
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
                            className="button"
                            type="button"
                            title={isArchived ? "Unarchive resume" : "Archive resume"}
                            onClick={() => toggleArchive.mutate({ id: resume.id, archived: !isArchived })}
                          >
                            <Archive size={14} aria-hidden="true" />
                          </button>
                          <button
                            className="button button-danger"
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Delete ${resume.name}? This cannot be undone.`)) {
                                deleteResume.mutate(resume.id);
                              }
                            }}
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
