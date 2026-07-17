import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Link, useSearchParams } from "react-router-dom";
import { Archive, Bot, Copy, FolderOpen, RefreshCcw, Star, Trash2, WandSparkles } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, InlineError, LoadingState } from "../../components/States";
import { Badge, PageSection, SearchInput, StatusBadge, StatCard } from "../../components/ui";
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
      <PageHeader
        eyebrow="Local versions"
        title="Resume Library"
        description="Find, compare, reuse, and manage generated resumes without exposing raw version IDs as the primary interface."
        meta={
          <>
            <Badge tone="blue">{resumesQuery.data?.length ?? 0} total</Badge>
            <Badge tone="amber">{favoriteIds.size} favorites</Badge>
            <Badge tone="emerald">{submittedIds.size} used in applications</Badge>
          </>
        }
      />
      <div className="page-body space-y-5">
        {error ? <InlineError message={error} /> : null}
        <PageSection title="Find a resume" description="Search by company, role, skill, or bullet text. Generate recommendations against a saved job when you need a base version.">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_minmax(220px,1fr)_auto]">
            <SearchInput value={search} onChange={setSearch} placeholder="Search resumes, companies, roles, skills, bullets" />
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
            <div className="mt-4 grid gap-3 md:grid-cols-3">
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
        </PageSection>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Visible resumes" value={resumes.length} detail={`Filtered by ${statusFilter}`} />
          <StatCard label="Validation clear" value={resumes.filter((resume) => !resume.validationJson.some((issue) => issue.severity === "error")).length} detail="No blocking validation errors" tone="emerald" />
          <StatCard label="Exported PDFs" value={resumes.filter((resume) => resume.lastExportPath).length} detail="Can reveal from Finder" />
        </div>

        {regenerationResult ? (
          <PageSection title="Regeneration diff" description={`Created ${regenerationResult.child.name} from parent ${regenerationResult.parent.name}. The parent remains unchanged.`}>
            <div className="mt-3 max-h-64 space-y-2 overflow-auto">
              {regenerationResult.diff.map((entry, index) => (
                <div key={`${entry.category}-${index}`} className="border-b border-slate-100 pb-2 text-sm">
                  <p className="font-semibold uppercase text-slate-500">{entry.category.replace("_", " ")}</p>
                  {entry.before ? <p className="text-red-700">Before: {entry.before}</p> : null}
                  {entry.after ? <p className="text-emerald-700">After: {entry.after}</p> : null}
                </div>
              ))}
            </div>
          </PageSection>
        ) : null}
        {regenerateId ? (
          <div className="panel flex flex-wrap items-center gap-4 p-4">
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
          <div className="grid gap-4 xl:grid-cols-2">
            {resumes.map((resume) => {
              const job = jobById.get(resume.jobId);
              const errors = resume.validationJson.filter((issue) => issue.severity === "error").length;
              const isFavorite = favoriteIds.has(resume.id);
              const isArchived = archivedIds.has(resume.id);
              const isSubmitted = submittedIds.has(resume.id);
              const includedBullets = [...resume.contentJson.projects, ...resume.contentJson.experience].flatMap((section) =>
                section.bullets.filter((bullet) => bullet.included).map((bullet) => ({ section: section.title, text: bullet.text, id: bullet.id })),
              );
              return (
                <article key={resume.id} className="panel p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-500">{job?.company || "Saved resume"}</p>
                      <h3 className="mt-1 truncate text-lg font-semibold text-slate-950">{job?.roleTitle || resume.name}</h3>
                      <p className="mt-1 text-sm text-slate-600">{resume.name}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <StatusBadge status={resume.status === "draft" ? "draft" : "ready"} />
                      {errors ? <Badge tone="red">{errors} validation errors</Badge> : <Badge tone="emerald">validation clear</Badge>}
                      {isSubmitted ? <Badge tone="emerald">used in application</Badge> : null}
                      {isFavorite ? <Badge tone="amber">favorite</Badge> : null}
                      {isArchived ? <Badge>archived</Badge> : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                    <div><p className="eyebrow">Created</p><p className="mt-1 text-slate-700">{new Date(resume.createdAt).toLocaleDateString()}</p></div>
                    <div><p className="eyebrow">Version</p><p className="mt-1 text-slate-700">{resume.parentResumeVersionId ? "Child" : "Root"}</p></div>
                    <div><p className="eyebrow">Applications</p><p className="mt-1 text-slate-700">{isSubmitted ? "Used" : "Not used"}</p></div>
                    <div><p className="eyebrow">Export</p><p className="mt-1 truncate text-slate-700">{resume.lastExportPath ? "PDF exported" : "Not exported"}</p></div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="button" type="button" onClick={() => setOpenResumeId((current) => current === resume.id ? "" : resume.id)}>
                      {openResumeId === resume.id ? "Hide details" : "Preview"}
                    </button>
                    <button className="button" type="button" onClick={() => duplicateResume.mutate(resume.id)}>
                      <Copy size={14} aria-hidden="true" /> Duplicate
                    </button>
                    <Link className="button" to={`/copilot?contextType=resume&contextId=${encodeURIComponent(resume.id)}`}>
                      <Bot size={14} aria-hidden="true" /> Ask Copilot
                    </Link>
                    <button className={isFavorite ? "button border-amber-300 bg-amber-50 text-amber-800" : "button"} type="button" onClick={() => toggleFavorite.mutate({ id: resume.id, favorite: !isFavorite })}>
                      <Star size={14} aria-hidden="true" /> {isFavorite ? "Unfavorite" : "Favorite"}
                    </button>
                    <button className="button" type="button" onClick={() => setRegenerateId(resume.id)}>
                      <RefreshCcw size={14} aria-hidden="true" /> Regenerate
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
                      <FolderOpen size={14} aria-hidden="true" /> Reveal
                    </button>
                    <button className="button" type="button" onClick={() => toggleArchive.mutate({ id: resume.id, archived: !isArchived })}>
                      <Archive size={14} aria-hidden="true" /> {isArchived ? "Unarchive" : "Archive"}
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
                      <Trash2 size={14} aria-hidden="true" /> Delete
                    </button>
                  </div>

                  {openResumeId === resume.id ? (
                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
                        <div className="text-sm">
                          <p className="font-semibold text-slate-950">Generation</p>
                          <p className="mt-1 text-slate-600">{resume.generationProvider} | {resume.generationModel || "No model recorded"}</p>
                          <p className="text-slate-600">Prompt {resume.promptVersion || "legacy"}</p>
                          {resume.parentResumeVersionId ? <p className="mt-2 text-slate-600">Child of an earlier resume version</p> : null}
                          {resume.lastExportPath ? <p className="mt-2 break-all text-xs text-slate-500">{resume.lastExportPath}</p> : null}
                        </div>
                        <div className="text-sm">
                          <p className="font-semibold text-slate-950">Included bullets</p>
                          <div className="mt-2 max-h-72 space-y-2 overflow-auto">
                            {includedBullets.map((bullet) => (
                              <p key={bullet.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                                <strong>{bullet.section}:</strong> {bullet.text}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
