import { MasterPdfPreview } from "./MasterPdfPreview";
import { ProfileMasterCreator } from "./ProfileMasterCreator";
import { CareerAIButton, CareerAISelection } from "../../components/CareerAIWorkspace";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Link, useSearchParams } from "react-router-dom";
import {
  Archive,
  Bot,
  Check,
  Copy,
  FileCheck2,
  FileSearch,
  FolderOpen,
  Gauge,
  Pencil,
  RefreshCcw,
  RotateCcw,
  ShieldAlert,
  Star,
  Trash2,
  TrendingUp,
  WandSparkles,
  X,
} from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, InlineError, LoadingState } from "../../components/States";
import { AlertBanner, Badge, PageSection, SearchInput, StatusBadge, StatCard } from "../../components/ui";
import { useRepository } from "../../lib/database/repositoryContext";
import { estimateResumePageCount } from "../../lib/resume/compaction";
import { allResumeBullets, validateResumeClaims } from "../../lib/resume/validation";
import {
  improveResumeFromReview,
  reviewResumeVersion,
  type ResumeImprovementResult,
} from "../../lib/resume/review";
import { generateResumeRecommendations } from "../../lib/search/resumeRecommendations";
import { regenerateResumeVersion, type RegenerationResult } from "../../lib/tailoring/regenerate";
import type {
  ResumeImprovementProposal,
  ResumeReview,
  ResumeReviewFinding,
  ResumeReviewMode,
  ResumeVersion,
  TailoredResume,
} from "../../types/domain";

const ResumePreview = lazy(() =>
  import("../tailoring/ResumePreview").then((module) => ({ default: module.ResumePreview })),
);

function scoreTone(score: number) {
  if (score >= 85) return "text-emerald-700";
  if (score >= 70) return "text-blue-700";
  if (score >= 55) return "text-amber-700";
  return "text-red-700";
}

function reviewModeLabel(mode: ResumeReviewMode) {
  if (mode === "job_specific") return "Job-specific";
  if (mode === "pre_submission") return "Final pre-submission";
  return "General";
}

function safetyTone(safety: ResumeImprovementProposal["safety"]) {
  if (safety === "safe") return "emerald" as const;
  if (safety === "blocked") return "red" as const;
  return "amber" as const;
}

function FindingList({ title, findings }: { title: string; findings: ResumeReviewFinding[] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <div className="mt-2 max-h-48 space-y-2 overflow-auto">
        {findings.map((finding) => (
          <div key={finding.id} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-700">
            <p className="font-semibold text-slate-900">{finding.category}</p>
            <p>{finding.message}</p>
            <p className="mt-1 text-slate-500">{finding.recommendation}</p>
          </div>
        ))}
        {!findings.length ? <p className="text-sm text-slate-500">None found.</p> : null}
      </div>
    </div>
  );
}

function ReviewSummary({
  review,
  onImprove,
  approvedProposalIds,
  onProposalApprovalChange,
  improving,
  stale,
}: {
  review: ResumeReview;
  onImprove: () => void;
  approvedProposalIds: string[];
  onProposalApprovalChange: (proposalId: string, approved: boolean) => void;
  improving: boolean;
  stale: boolean;
}) {
  const safeChanges = review.recommendedChanges.filter((change) => change.safety === "safe" && change.safeToAutoApply && !change.confirmationRequired).length;
  const totalTokens = review.requestMetadata.reduce((total, call) => total + (call.totalTokens ?? 0), 0);
  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">{reviewModeLabel(review.reviewMode)} review</p>
          <p className={`mt-1 text-4xl font-semibold tracking-normal ${scoreTone(review.overallScore)}`}>{review.overallScore}</p>
          <p className="mt-1 text-xs text-slate-500">
            Risk {review.factualRiskLevel} | {review.readyToSubmit ? "ready to submit" : "not ready yet"} | {new Date(review.generatedAt).toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {review.reviewSource === "hybrid" ? "OpenAI + local checks" : "Local checks only"} | {review.model} | PDF {review.pdfVisualReviewed ? "visually reviewed" : "not visually reviewed"}{totalTokens ? ` | ${totalTokens.toLocaleString()} tokens` : ""}
          </p>
        </div>
        <button
          className="button button-primary"
          type="button"
          disabled={!safeChanges || !approvedProposalIds.length || improving || stale}
          onClick={onImprove}
          title={stale ? "Run a fresh review after the latest resume edit." : safeChanges ? "Create optimized child resume" : "No safe automatic changes are available."}
        >
          <WandSparkles size={15} />
          {improving ? "Improving..." : "Improve with approval"}
        </button>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-4">
        {review.categoryScores.map((score) => (
          <div key={score.id} className="rounded-md border border-slate-200 bg-white p-3">
            <p className="truncate text-xs font-semibold text-slate-500">{score.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${scoreTone(score.score)}`}>{score.score}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{score.rationale}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <FindingList title="Strengths" findings={review.strengths} />
        <FindingList title="Weaknesses" findings={review.weaknesses} />
        <FindingList title="Critical issues" findings={review.criticalIssues} />
      </div>
      <div className="mt-4">
        <p className="text-sm font-semibold text-slate-950">Recommended changes</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {review.recommendedChanges.map((change) => (
            <div key={change.id} className="rounded-md border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700">
              <div className="flex items-start justify-between gap-2">
                <label className="flex min-w-0 items-start gap-2 font-semibold text-slate-900">
                  {change.safety === "safe" && change.safeToAutoApply && !change.confirmationRequired ? (
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={approvedProposalIds.includes(change.id)}
                      onChange={(event) => onProposalApprovalChange(change.id, event.target.checked)}
                    />
                  ) : null}
                  <span>{change.title}</span>
                </label>
                <Badge tone={safetyTone(change.safety)}>{change.safety.replace("_", " ")}</Badge>
              </div>
              <p className="mt-1">{change.rationale}</p>
              <p className="mt-1 text-slate-500">{change.category} | {change.priority} priority | expected +{change.expectedScoreImpact} | {change.confirmationRequired ? "confirmation required" : "approved safe operation"}</p>
              {change.evidence.length ? <p className="mt-1 line-clamp-2 text-slate-500">Evidence: {change.evidence.join("; ")}</p> : null}
              {change.before ? <p className="mt-2 line-clamp-2 text-red-700">Before: {change.before}</p> : null}
              {change.after ? <p className="line-clamp-2 text-emerald-700">After: {change.after}</p> : null}
            </div>
          ))}
          {!review.recommendedChanges.length ? <p className="text-sm text-slate-500">No changes recommended.</p> : null}
        </div>
      </div>
    </div>
  );
}

function ImprovementSummary({
  result,
  onApprove,
  onReject,
  onEdit,
  onRestore,
  onAnotherPass,
  busy,
  canApprove,
}: {
  result: ResumeImprovementResult;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onRestore: () => void;
  onAnotherPass: () => void;
  busy: boolean;
  canApprove: boolean;
}) {
  const delta = result.improvedReview.overallScore - result.originalReview.overallScore;
  const hasAnotherSafePass = !result.run.stopReason && result.run.passNumber < 2 && delta >= 2 && result.improvedReview.recommendedChanges.some((change) => change.safety === "safe" && change.safeToAutoApply && !change.confirmationRequired);
  return (
    <PageSection
      title="Optimizer result"
      description={`${result.improvedResume.name} was created as a child version. The source resume remains unchanged.`}
      actions={
        <>
          <Badge tone={delta >= 0 ? "emerald" : "amber"} icon={TrendingUp}>
            {result.originalReview.overallScore} to {result.improvedReview.overallScore}
          </Badge>
          <Badge tone={result.run.pdfStatus === "rendered" ? "emerald" : result.run.pdfStatus === "failed" ? "red" : "amber"}>
            PDF {result.run.pdfStatus}{result.run.pdfPageCount ? `, ${result.run.pdfPageCount} page${result.run.pdfPageCount === 1 ? "" : "s"}` : ""}
          </Badge>
        </>
      }
    >
      {result.run.pdfError ? <AlertBanner tone="amber" title="PDF render warning">{result.run.pdfError}</AlertBanner> : null}
      {result.run.stopReason ? <AlertBanner tone="slate" title="Automatic optimization stopped">{result.run.stopReason.replaceAll("_", " ")}.</AlertBanner> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Original score" value={result.originalReview.overallScore} detail={result.sourceResume.name} icon={Gauge} />
        <StatCard label="Improved score" value={result.improvedReview.overallScore} detail={delta >= 0 ? `+${delta} points` : `${delta} points`} icon={TrendingUp} tone={delta >= 0 ? "emerald" : "amber"} />
        <StatCard label="Safe edits applied" value={result.run.appliedProposalIds.length} detail={`${result.run.skippedProposalIds.length} skipped or review-only`} icon={Check} tone="emerald" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="text-sm font-semibold text-slate-950">Exact changes</p>
          <div className="mt-2 max-h-72 space-y-2 overflow-auto">
            {result.run.diff.map((entry, index) => (
              <div key={`${entry.category}-${index}`} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                <p className="font-semibold uppercase text-slate-500">{entry.category.replace("_", " ")}</p>
                {entry.before ? <p className="mt-1 text-red-700">Before: {entry.before}</p> : null}
                {entry.after ? <p className="mt-1 text-emerald-700">After: {entry.after}</p> : null}
                <p className="mt-1 text-xs text-slate-500">{entry.explanation}</p>
              </div>
            ))}
            {!result.run.diff.length ? <p className="text-sm text-slate-500">No semantic diff was produced.</p> : null}
          </div>
        </div>
        <div>
          <FindingList title="Remaining weaknesses" findings={[...result.improvedReview.criticalIssues, ...result.improvedReview.weaknesses]} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="button button-primary" type="button" disabled={busy || !canApprove} onClick={onApprove} title={canApprove ? "Approve improved version" : "The latest review has remaining issues or is out of date."}>
          <Check size={15} /> Approve
        </button>
        <button className="button" type="button" disabled={busy} onClick={onReject}>
          <X size={15} /> Reject
        </button>
        <button className="button" type="button" disabled={busy} onClick={onEdit}>
          <Pencil size={15} /> Edit
        </button>
        <button className="button" type="button" disabled={busy} onClick={onRestore}>
          <RotateCcw size={15} /> Restore original
        </button>
        <button className="button" type="button" disabled={busy || !hasAnotherSafePass} onClick={onAnotherPass} title={hasAnotherSafePass ? "Create another optimized child version" : "Optimizer stopped because no material safe pass remains or the two-pass limit was reached."}>
          <RefreshCcw size={15} /> Run another pass
        </button>
      </div>
    </PageSection>
  );
}

export function ResumeLibraryPage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedResumeId = searchParams.get("resumeId");
  const [error, setError] = useState("");
  const [openResumeId, setOpenResumeId] = useState(() => searchParams.get("resumeId") ?? "");
  const [regenerateId, setRegenerateId] = useState("");
  const [refreshAnalysis, setRefreshAnalysis] = useState(false);
  const [regenerationResult, setRegenerationResult] = useState<RegenerationResult | null>(null);
  const [activeReview, setActiveReview] = useState<ResumeReview | null>(null);
  const [approvedProposalIds, setApprovedProposalIds] = useState<string[]>([]);
  const [improvementResult, setImprovementResult] = useState<ResumeImprovementResult | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [targetJobId, setTargetJobId] = useState(() => searchParams.get("jobId") ?? "");
  const [reviewResumeId, setReviewResumeId] = useState(() => searchParams.get("resumeId") ?? "");
  useEffect(() => { if (requestedResumeId) { setOpenResumeId(requestedResumeId); setReviewResumeId(requestedResumeId); } }, [requestedResumeId]);
  const [reviewJobId, setReviewJobId] = useState(() => searchParams.get("jobId") ?? "");
  const [reviewToolsOpen, setReviewToolsOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState<ResumeReviewMode>(() => searchParams.get("jobId") ? "job_specific" : "general");
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [editingResumeId, setEditingResumeId] = useState("");
  const [editingResume, setEditingResume] = useState<TailoredResume | null>(null);
  const resumesQuery = useQuery({ queryKey: ["resumes"], queryFn: () => repository.listResumeVersions() });
  const jobsQuery = useQuery({ queryKey: ["jobs"], queryFn: () => repository.listJobs() });
  const applicationsQuery = useQuery({ queryKey: ["applications"], queryFn: () => repository.listApplications() });
  const favoritesQuery = useQuery({ queryKey: ["resume-favorites"], queryFn: () => repository.listResumeFavorites() });
  const archivesQuery = useQuery({ queryKey: ["resume-archives"], queryFn: () => repository.listResumeArchives() });
  const reviewsQuery = useQuery({ queryKey: ["resume-reviews"], queryFn: () => repository.listResumeReviews() });
  const improvementRunsQuery = useQuery({ queryKey: ["resume-improvement-runs"], queryFn: () => repository.listResumeImprovementRuns() });
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: () => repository.getProfile() });
  const factsQuery = useQuery({ queryKey: ["career-facts"], queryFn: () => repository.listCareerFacts() });
  const itemsQuery = useQuery({ queryKey: ["career-items"], queryFn: () => repository.listCareerItems() });
  const skillsQuery = useQuery({ queryKey: ["skills"], queryFn: () => repository.listSkills() });
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
        kind: resume.kind === "master" && !resume.jobId ? "master" : "tailored",
        templateId: resume.templateId,
        contentJson: resume.contentJson,
        validationJson: resume.validationJson,
        status: "draft",
        lastExportPath: "",
        parentResumeVersionId: resume.id,
        baseResumeVersionId: resume.id,
        generationProvider: resume.generationProvider,
        generationModel: resume.generationModel,
        promptVersion: resume.promptVersion,
        promptVersionsJson: resume.promptVersionsJson,
        layoutProfileId: resume.layoutProfileId,
        templateSettingsJson: resume.templateSettingsJson,
        generationMetadataJson: resume.generationMetadataJson,
        deterministicBaselineJson: resume.contentJson,
      });
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const markMaster = useMutation({
    mutationFn: async (id: string) => {
      const resume = (resumesQuery.data ?? []).find((item) => item.id === id);
      if (!resume) throw new Error("Resume version not found.");
      return repository.saveResumeVersion({
        ...resume,
        kind: "master",
        parentResumeVersionId: "",
        baseResumeVersionId: "",
        name: resume.name.toLowerCase().includes("master") ? resume.name : `Master Resume - ${resume.name}`,
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
        kind: "tailored",
        templateId: resume.templateId,
        contentJson: resume.contentJson,
        validationJson: resume.validationJson,
        status: "draft",
        lastExportPath: "",
        parentResumeVersionId: resume.id,
        baseResumeVersionId: resume.id,
        generationProvider: resume.generationProvider,
        generationModel: resume.generationModel,
        promptVersion: resume.promptVersion,
        promptVersionsJson: resume.promptVersionsJson,
        layoutProfileId: resume.layoutProfileId,
        templateSettingsJson: resume.templateSettingsJson,
        generationMetadataJson: resume.generationMetadataJson,
        deterministicBaselineJson: resume.contentJson,
      });
    },
    onSuccess: (child) => {
      setOpenResumeId(child.id);
      queryClient.invalidateQueries();
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : String(caught)),
  });
  const runReview = useMutation({
    mutationFn: async () => {
      if (!reviewResumeId) throw new Error("Select a resume to review.");
      if (reviewMode === "job_specific" && !reviewJobId) {
        throw new Error("Select a saved job for a job-specific review.");
      }
      const resume = (resumesQuery.data ?? []).find((item) => item.id === reviewResumeId);
      if (!resume) throw new Error("Resume version not found.");
      let pdfPageCount: number | null = null;
      let pdfRenderError = "";
      let pdfDataUrl = "";
      try {
        const { countPdfPages, pdfBytesToDataUrl, renderResumePdfBytes } = await import("../../lib/resume/pdf");
        const bytes = await renderResumePdfBytes(resume.contentJson, resume.templateSettingsJson);
        pdfPageCount = await countPdfPages(bytes);
        pdfDataUrl = pdfBytesToDataUrl(bytes);
      } catch (caught) {
        pdfRenderError = caught instanceof Error ? caught.message : String(caught);
      }
      return reviewResumeVersion({
        repository,
        resumeVersionId: reviewResumeId,
        jobId: reviewMode === "general" ? undefined : reviewJobId || undefined,
        reviewMode,
        pdfPageCount,
        pdfRenderError,
        pdfDataUrl,
      });
    },
    onSuccess: (review) => {
      setActiveReview(review);
      setImprovementResult(null);
      setOpenResumeId(review.resumeId);
      setApprovedProposalIds(review.recommendedChanges.filter((item) => item.safety === "safe" && item.safeToAutoApply && !item.confirmationRequired).map((item) => item.id));
      queryClient.invalidateQueries({ queryKey: ["resume-reviews"] });
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : String(caught)),
  });
  const improveReview = useMutation({
    mutationFn: ({ reviewId, proposalIds }: { reviewId: string; proposalIds: string[] }) =>
      improveResumeFromReview({
        repository,
        reviewId,
        approvedProposalIds: proposalIds,
        renderPdf: async (resume, templateSettings) => {
          const { countPdfPages, pdfBytesToDataUrl, renderResumePdfBytes } = await import("../../lib/resume/pdf");
          const bytes = await renderResumePdfBytes(resume, templateSettings);
          const pdfPath = await invoke<string>("write_generated_resume_pdf", {
            fileStem: `${resume.id}-optimized`,
            bytes: Array.from(bytes),
          });
          return {
            pageCount: await countPdfPages(bytes),
            pdfDataUrl: pdfBytesToDataUrl(bytes),
            pdfPath,
          };
        },
      }),
    onSuccess: (result) => {
      setImprovementResult(result);
      setActiveReview(result.improvedReview);
      setOpenResumeId(result.improvedResume.id);
      setReviewResumeId(result.improvedResume.id);
      setApprovedProposalIds(result.improvedReview.recommendedChanges.filter((item) => item.safety === "safe" && item.safeToAutoApply && !item.confirmationRequired).map((item) => item.id));
      queryClient.invalidateQueries();
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : String(caught)),
  });
  const approveReviewedResume = useMutation({
    mutationFn: async (resumeId: string) => {
      const resume = (resumesQuery.data ?? []).find((item) => item.id === resumeId);
      if (!resume) throw new Error("Resume version not found.");
      const latestReview = (await repository.listResumeReviews(resumeId))
        .filter((review) => review.resumeId === resumeId)
        .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
      if (!latestReview || latestReview.generatedAt < resume.updatedAt) {
        throw new Error("Run a fresh review after the latest resume edit before approval.");
      }
      if (!latestReview.readyToSubmit) {
        throw new Error("The latest resume review still has blocking or high-risk issues.");
      }
      return repository.saveResumeVersion({ ...resume, status: "approved" });
    },
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (caught) => setError(caught instanceof Error ? caught.message : String(caught)),
  });
  const rejectReviewedResume = useMutation({
    mutationFn: (resumeId: string) => repository.setResumeArchived(resumeId, true),
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (caught) => setError(caught instanceof Error ? caught.message : String(caught)),
  });
  const saveEditedResume = useMutation({
    mutationFn: async () => {
      if (!editingResumeId || !editingResume) throw new Error("No resume edit is active.");
      const original = (resumesQuery.data ?? []).find((item) => item.id === editingResumeId);
      if (!original) throw new Error("Resume version not found.");
      const issues = validateResumeClaims({
        resume: editingResume,
        facts: factsQuery.data ?? [],
        items: itemsQuery.data ?? [],
        skills: skillsQuery.data ?? [],
        profile: profileQuery.data ?? null,
      });
      return repository.saveResumeVersion({
        ...original,
        contentJson: editingResume,
        validationJson: issues,
        status: "draft",
        lastExportPath: "",
      });
    },
    onSuccess: (saved) => {
      setEditingResumeId("");
      setEditingResume(null);
      setActiveReview(null);
      setImprovementResult(null);
      setReviewResumeId(saved.id);
      setOpenResumeId(saved.id);
      queryClient.invalidateQueries();
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : String(caught)),
  });

  const jobById = useMemo(
    () => new Map((jobsQuery.data ?? []).map((job) => [job.id, job])),
    [jobsQuery.data],
  );
  const latestReviewByResume = useMemo(() => {
    const map = new Map<string, ResumeReview>();
    for (const review of reviewsQuery.data ?? []) {
      const current = map.get(review.resumeId);
      if (!current || review.generatedAt > current.generatedAt) map.set(review.resumeId, review);
    }
    return map;
  }, [reviewsQuery.data]);
  const latestRunByResume = useMemo(() => {
    const map = new Map<string, NonNullable<typeof improvementRunsQuery.data>[number]>();
    for (const run of improvementRunsQuery.data ?? []) {
      const current = map.get(run.improvedResumeId);
      if (!current || run.createdAt > current.createdAt) map.set(run.improvedResumeId, run);
    }
    return map;
  }, [improvementRunsQuery.data]);
  const selectedResume = (resumesQuery.data ?? []).find((resume) => resume.id === reviewResumeId) ?? null;
  const matchesReviewSelection = (review: ResumeReview) =>
    review.resumeId === reviewResumeId &&
    review.reviewMode === reviewMode &&
    (review.jobId ?? "") === (reviewMode === "general" ? "" : reviewJobId);
  const latestSelectedReview = (reviewsQuery.data ?? [])
    .filter(matchesReviewSelection)
    .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))[0] ?? null;
  const selectedReview = activeReview && matchesReviewSelection(activeReview) ? activeReview : latestSelectedReview;
  useEffect(() => {
    setApprovedProposalIds(selectedReview?.recommendedChanges
      .filter((item) => item.safety === "safe" && item.safeToAutoApply && !item.confirmationRequired)
      .map((item) => item.id) ?? []);
  }, [selectedReview]);
  const selectedReviewIsStale = Boolean(
    selectedResume && selectedReview && selectedReview.generatedAt < selectedResume.updatedAt,
  );
  const selectedImprovementResult = useMemo<ResumeImprovementResult | null>(() => {
    if (improvementResult?.improvedResume.id === reviewResumeId) return improvementResult;
    if (!reviewResumeId) return null;
    const run = latestRunByResume.get(reviewResumeId);
    if (!run) return null;
    const sourceResume = (resumesQuery.data ?? []).find((resume) => resume.id === run.sourceResumeId);
    const improvedResume = (resumesQuery.data ?? []).find((resume) => resume.id === run.improvedResumeId);
    const originalReview = (reviewsQuery.data ?? []).find((review) => review.id === run.originalReviewId);
    const improvedReview = (reviewsQuery.data ?? []).find((review) => review.id === run.improvedReviewId);
    if (!sourceResume || !improvedResume || !originalReview || !improvedReview) return null;
    return { sourceResume, improvedResume, originalReview, improvedReview, run };
  }, [improvementResult, latestRunByResume, reviewResumeId, resumesQuery.data, reviewsQuery.data]);

  const beginResumeEdit = (resume: ResumeVersion) => {
    setOpenResumeId(resume.id);
    setEditingResumeId(resume.id);
    setEditingResume(structuredClone(resume.contentJson));
  };

  const updateEditingBullet = (
    sectionKind: "projects" | "experience",
    careerItemId: string,
    bulletId: string,
    text: string,
  ) => {
    setEditingResume((current) => {
      if (!current) return current;
      return {
        ...current,
        [sectionKind]: current[sectionKind].map((section) => section.careerItemId === careerItemId
          ? {
              ...section,
              bullets: section.bullets.map((bullet) => bullet.id === bulletId
                ? {
                    ...bullet,
                    text,
                    approved: false,
                    rejected: false,
                    isUserEdited: true,
                    generationSource: "user",
                    generationReason: "User edited after Resume Review.",
                  }
                : bullet),
            }
          : section),
      };
    });
  };

  if ([resumesQuery, jobsQuery, applicationsQuery, favoritesQuery, archivesQuery, reviewsQuery, improvementRunsQuery, profileQuery, factsQuery, itemsQuery, skillsQuery, recommendationsQuery].some((query) => query.isLoading)) {
    return <LoadingState label="Loading resume library..." />;
  }
  if (resumesQuery.isError) throw resumesQuery.error;
  if (jobsQuery.isError) throw jobsQuery.error;
  if (applicationsQuery.isError) throw applicationsQuery.error;
  if (reviewsQuery.isError) throw reviewsQuery.error;
  if (improvementRunsQuery.isError) throw improvementRunsQuery.error;
  if (profileQuery.isError) throw profileQuery.error;
  if (factsQuery.isError) throw factsQuery.error;
  if (itemsQuery.isError) throw itemsQuery.error;
  if (skillsQuery.isError) throw skillsQuery.error;

  const favoriteIds = new Set((favoritesQuery.data ?? []).map((favorite) => favorite.resumeVersionId));
  const archivedIds = new Set((archivesQuery.data ?? []).map((archive) => archive.resumeVersionId));
  const submittedIds = new Set((applicationsQuery.data ?? []).flatMap((application) => [application.resumeVersionId, application.submittedResumeVersionId].filter(Boolean)));
  const normalizedSearch = search.trim().toLowerCase();
  const resumes = (resumesQuery.data ?? []).filter((resume) => {
    if (requestedResumeId) return resume.id === requestedResumeId;
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
      {requestedResumeId ? <div role="status"><p>{resumes.length ? "Showing the exact linked résumé version." : "Cited résumé version is unavailable. No other version was selected."}</p><button className="button" onClick={() => { const next = new URLSearchParams(searchParams); next.delete("resumeId"); setSearchParams(next); }}>Show all versions</button></div> : null}
      {openResumeId && resumesQuery.data?.some(item => item.id === openResumeId) ? <CareerAISelection type="resume" id={openResumeId} label={resumesQuery.data.find(item => item.id === openResumeId)!.name} /> : null}
      <PageHeader
        eyebrow="Local versions"
        title="Resumes"
        actions={<><Link className="button" to="/profile?section=import&intake=1">Import existing résumé</Link><button className="button button-primary" onClick={() => setCreatingProfile(true)}>Create Master Résumé</button><Link className="button" to="/jobs">Tailor for job</Link></>}
        description="Your master resume and tailored versions, ready to review and reuse."
        meta={
          <>
            <Badge tone="blue">{resumesQuery.data?.length ?? 0} total</Badge>
            <Badge tone="amber">{favoriteIds.size} favorites</Badge>
            <Badge tone="emerald">{submittedIds.size} used in applications</Badge>
          </>
        }
      />
      <div className="page-body space-y-5">
        <section className="workspace-note" aria-label="Resume workflow"><h3>Import, create, or tailor</h3><p>Import existing résumé extracts local PDF/DOCX text for reviewed career records. It preserves your file, not its visual layout.</p><p>Create Master Résumé builds a general résumé from your approved profile without a job. Tailor for job uses a saved job and a chosen source résumé, with a before-and-after review before saving a child.</p></section>
        {creatingProfile ? <ProfileMasterCreator onClose={() => setCreatingProfile(false)} /> : null}
        {error ? <InlineError message={error} /> : null}
        <PageSection title="Find a resume" description="Search by company, role, skill, or bullet text. Generate recommendations against a saved job when you need a base version.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_minmax(220px,1fr)_auto]">
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

        <details className="surface-section resume-review-tools" open={reviewToolsOpen} onToggle={(event) => setReviewToolsOpen(event.currentTarget.open)}>
          <summary>Review and improve a resume</summary>
        <PageSection
          title="Resume Review"
          description="Score a complete resume, inspect evidence and submission risks, then apply only safe changes to a new child version."
          actions={selectedReview ? (
            <>
              <Badge tone={selectedReview.readyToSubmit ? "emerald" : "amber"} icon={selectedReview.readyToSubmit ? Check : ShieldAlert}>
                {selectedReview.readyToSubmit ? "ready to submit" : "review required"}
              </Badge>
              <Badge tone="blue" icon={Gauge}>{selectedReview.overallScore}/100</Badge>
            </>
          ) : undefined}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.2fr)_210px_minmax(220px,1fr)_auto]">
            <label className="text-sm font-semibold text-slate-700">
              Resume
              <select
                className="field mt-1"
                data-testid="review-resume-select"
                value={reviewResumeId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  const resume = (resumesQuery.data ?? []).find((item) => item.id === nextId);
                  setReviewResumeId(nextId);
                  setReviewJobId(reviewMode === "general" || resume?.kind === "master" ? "" : resume?.jobId ?? "");
                  setActiveReview(null);
                  setImprovementResult(null);
                }}
              >
                <option value="">Select resume</option>
                {(resumesQuery.data ?? []).filter((resume) => !archivedIds.has(resume.id)).map((resume) => (
                  <option key={resume.id} value={resume.id}>{resume.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Review mode
              <select
                className="field mt-1"
                data-testid="review-mode-select"
                value={reviewMode}
                onChange={(event) => {
                  const nextMode = event.target.value as ResumeReviewMode;
                  setReviewMode(nextMode);
                  setActiveReview(null);
                  setImprovementResult(null);
                  if (nextMode === "general") {
                    setReviewJobId("");
                  } else if (!reviewJobId) {
                    setReviewJobId(selectedResume?.kind === "master" ? "" : selectedResume?.jobId ?? "");
                  }
                }}
              >
                <option value="general">General</option>
                <option value="job_specific">Job-specific</option>
                <option value="pre_submission">Final pre-submission</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Target job {reviewMode === "general" ? "(not used)" : reviewMode === "job_specific" ? "(required)" : "(optional)"}
              <select
                className="field mt-1"
                data-testid="review-job-select"
                value={reviewJobId}
                disabled={reviewMode === "general"}
                onChange={(event) => setReviewJobId(event.target.value)}
              >
                <option value="">No target job</option>
                {(jobsQuery.data ?? []).map((job) => (
                  <option key={job.id} value={job.id}>
                    {[job.company, job.roleTitle].filter(Boolean).join(" - ") || "Saved job"}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-primary self-end"
              data-testid="review-resume-button"
              type="button"
              disabled={!reviewResumeId || runReview.isPending || (reviewMode === "job_specific" && !reviewJobId)}
              onClick={() => {
                setError("");
                runReview.mutate();
              }}
            >
              <FileSearch size={15} /> {runReview.isPending ? "Reviewing..." : "Review Resume"}
            </button>
          </div>
          {selectedReviewIsStale ? (
            <div className="mt-4">
              <AlertBanner tone="amber" title="Review is out of date">
                This resume changed after the scorecard was generated. Run Review Resume again before improving or approving it.
              </AlertBanner>
            </div>
          ) : null}
          {selectedReview ? (
            <ReviewSummary
              review={selectedReview}
              stale={selectedReviewIsStale}
              improving={improveReview.isPending}
              approvedProposalIds={approvedProposalIds}
              onProposalApprovalChange={(proposalId, approved) => setApprovedProposalIds((current) => approved
                ? [...new Set([...current, proposalId])]
                : current.filter((id) => id !== proposalId))}
              onImprove={() => {
                setError("");
                improveReview.mutate({ reviewId: selectedReview.id, proposalIds: approvedProposalIds });
              }}
            />
          ) : (
            <div className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-500">
              Select a resume and run a review to see factual, ATS, visual, clarity, impact, evidence, and role-fit scores.
            </div>
          )}
        </PageSection>

        </details>

        {selectedImprovementResult ? (
          <ImprovementSummary
            result={selectedImprovementResult}
            busy={approveReviewedResume.isPending || rejectReviewedResume.isPending || improveReview.isPending}
            canApprove={Boolean(
              selectedReview &&
              selectedReview.resumeId === selectedImprovementResult.improvedResume.id &&
              !selectedReviewIsStale &&
              selectedReview.readyToSubmit,
            )}
            onApprove={() => approveReviewedResume.mutate(selectedImprovementResult.improvedResume.id)}
            onReject={() => rejectReviewedResume.mutate(selectedImprovementResult.improvedResume.id, {
              onSuccess: () => {
                setOpenResumeId(selectedImprovementResult.sourceResume.id);
                setReviewResumeId(selectedImprovementResult.sourceResume.id);
                setActiveReview(selectedImprovementResult.originalReview);
                setApprovedProposalIds(selectedImprovementResult.originalReview.recommendedChanges.filter((item) => item.safety === "safe" && item.safeToAutoApply && !item.confirmationRequired).map((item) => item.id));
                setImprovementResult(null);
              },
            })}
            onEdit={() => beginResumeEdit(selectedImprovementResult.improvedResume)}
            onRestore={() => {
              void repository.setResumeArchived(selectedImprovementResult.improvedResume.id, true).then(() => {
                setOpenResumeId(selectedImprovementResult.sourceResume.id);
                setReviewResumeId(selectedImprovementResult.sourceResume.id);
                setActiveReview(selectedImprovementResult.originalReview);
                setApprovedProposalIds(selectedImprovementResult.originalReview.recommendedChanges.filter((item) => item.safety === "safe" && item.safeToAutoApply && !item.confirmationRequired).map((item) => item.id));
                setImprovementResult(null);
                return queryClient.invalidateQueries();
              }).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
            }}
            onAnotherPass={() => improveReview.mutate({ reviewId: selectedImprovementResult.improvedReview.id, proposalIds: approvedProposalIds })}
          />
        ) : null}

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
            body="Import an existing résumé or add career evidence first. Create a résumé from your approved profile, then tailor a child for a saved job."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {resumes.map((resume) => {
              const job = jobById.get(resume.jobId);
              const errors = resume.validationJson.filter((issue) => issue.severity === "error").length;
              const isFavorite = favoriteIds.has(resume.id);
              const isArchived = archivedIds.has(resume.id);
              const isSubmitted = submittedIds.has(resume.id);
              const latestReview = latestReviewByResume.get(resume.id);
              const latestRun = latestRunByResume.get(resume.id);
              const reviewIsStale = Boolean(latestReview && resume.status === "draft" && latestReview.generatedAt < resume.updatedAt);
              const isEditing = editingResumeId === resume.id && Boolean(editingResume);
              const displayedResume = isEditing && editingResume ? editingResume : resume.contentJson;
              const baseResume = resume.baseResumeVersionId
                ? (resumesQuery.data ?? []).find((item) => item.id === resume.baseResumeVersionId)
                : null;
              const includedBullets = [...displayedResume.projects, ...displayedResume.experience].flatMap((section) =>
                section.bullets.filter((bullet) => bullet.included).map((bullet) => ({ section: section.title, text: bullet.text, id: bullet.id })),
              );
              return (
                <article key={resume.id} className={openResumeId === resume.id ? "panel min-w-0 p-5 xl:col-span-2" : "panel min-w-0 p-5"}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-500">{job?.company || "Saved resume"}</p>
                      <h3 className="mt-1 truncate text-lg font-semibold text-slate-950">{job?.roleTitle || resume.name}</h3>
                      <p className="mt-1 text-sm text-slate-600">{resume.name}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Badge tone={resume.kind === "master" ? "blue" : resume.kind === "imported" ? "amber" : "slate"}>{resume.kind}</Badge>
                      <StatusBadge status={resume.status === "draft" ? "draft" : "ready"} />
                      {errors ? <Badge tone="red">{errors} validation errors</Badge> : <Badge tone="emerald">validation clear</Badge>}
                      {isSubmitted ? <Badge tone="emerald">used in application</Badge> : null}
                      {isFavorite ? <Badge tone="amber">favorite</Badge> : null}
                      {isArchived ? <Badge>archived</Badge> : null}
                      {latestReview ? (
                        <Badge tone={reviewIsStale ? "amber" : latestReview.readyToSubmit ? "emerald" : "blue"} icon={Gauge}>
                          {reviewIsStale ? "review stale" : `review ${latestReview.overallScore}`}
                        </Badge>
                      ) : null}
                      {latestRun ? (
                        <Badge tone={latestRun.pdfStatus === "rendered" ? "emerald" : latestRun.pdfStatus === "failed" ? "red" : "amber"}>
                          optimized | PDF {latestRun.pdfStatus.replace("_", " ")}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                    <div><p className="eyebrow">Created</p><p className="mt-1 text-slate-700">{new Date(resume.createdAt).toLocaleDateString()}</p></div>
                    <div><p className="eyebrow">Lineage</p><p className="mt-1 text-slate-700">{resume.kind === "master" ? "Master" : resume.parentResumeVersionId ? "Child variant" : "Root"}</p></div>
                    <div><p className="eyebrow">Applications</p><p className="mt-1 text-slate-700">{isSubmitted ? "Used" : "Not used"}</p></div>
                    <div><p className="eyebrow">Export</p><p className="mt-1 truncate text-slate-700">{resume.lastExportPath ? "PDF exported" : "Not exported"}</p></div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="button" type="button" onClick={() => setOpenResumeId((current) => current === resume.id ? "" : resume.id)}>
                      {openResumeId === resume.id ? "Hide resume" : "View resume"}
                    </button>
                    <details className="resume-more-actions"><summary>More options</summary><div className="action-row">
                    <button className="button" type="button" onClick={() => duplicateResume.mutate(resume.id)}>
                      <Copy size={14} aria-hidden="true" /> Duplicate
                    </button>
                    {resume.kind !== "master" ? (
                      <button className="button" type="button" onClick={() => markMaster.mutate(resume.id)}>
                        <FileCheck2 size={14} aria-hidden="true" /> Mark as master
                      </button>
                    ) : null}
                    <CareerAIButton selection={{ type: "resume", id: resume.id, label: resume.name }}>
                      <Bot size={14} aria-hidden="true" /> Ask Copilot
                    </CareerAIButton>
                    <button className={isFavorite ? "button border-amber-300 bg-amber-50 text-amber-800" : "button"} type="button" onClick={() => toggleFavorite.mutate({ id: resume.id, favorite: !isFavorite })}>
                      <Star size={14} aria-hidden="true" /> {isFavorite ? "Unfavorite" : "Favorite"}
                    </button>
                    <button className="button" type="button" onClick={() => setRegenerateId(resume.id)}>
                      <RefreshCcw size={14} aria-hidden="true" /> Regenerate
                    </button>
                    <button
                      className="button"
                      type="button"
                      onClick={() => {
                        setReviewToolsOpen(true);
                        setReviewResumeId(resume.id);
                        setReviewJobId(reviewMode === "general" || resume.kind === "master" ? "" : resume.jobId);
                        setActiveReview(null);
                        setImprovementResult(null);
                        setOpenResumeId(resume.id);
                      }}
                    >
                      <FileSearch size={14} aria-hidden="true" /> Review
                    </button>
                    {resume.kind !== "master" ? (
                      <button className="button" type="button" onClick={() => beginResumeEdit(resume)}>
                        <Pencil size={14} aria-hidden="true" /> Edit
                      </button>
                    ) : null}
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
                    </div></details>
                  </div>

                  {openResumeId === resume.id ? (
                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <div className="min-w-0 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="min-w-0 overflow-auto rounded-md border border-slate-200 bg-slate-100 p-3">
                          <Suspense fallback={<LoadingState label="Loading resume preview..." />}>
                            <ResumePreview
                              resume={displayedResume}
                              validationIssues={resume.validationJson}
                              pageCount={estimateResumePageCount(displayedResume)}
                            />
                          </Suspense>
                        </div>
                        <aside className="space-y-4 text-sm">
                          {resume.kind === "master" ? <MasterPdfPreview key={`${resume.id}:${resume.updatedAt}`} source={{ versionId: resume.id }} reviewed={true} /> : null}
                          <div className="rounded-md border border-slate-200 bg-white p-4">
                            <p className="font-semibold text-slate-950">Generation</p>
                            <p className="mt-1 text-slate-600">Kind: {resume.kind}</p>
                            <p className="mt-1 text-slate-600">{resume.generationProvider} | {resume.generationModel || "No model recorded"}</p>
                            <p className="text-slate-600">Prompt {resume.promptVersion || "legacy"}</p>
                            {resume.parentResumeVersionId ? <p className="mt-2 text-slate-600">Child of an earlier resume version</p> : null}
                            {resume.baseResumeVersionId ? <p className="text-slate-600">Base resume: {baseResume?.name ?? "Earlier resume"}</p> : null}
                            {resume.lastExportPath ? <p className="mt-2 break-all text-xs text-slate-500">{resume.lastExportPath}</p> : null}
                          </div>
                          {isEditing && editingResume ? (
                            <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-slate-950">Edit child resume</p>
                                  <p className="mt-1 text-xs leading-5 text-slate-600">Edits keep source citations attached, return the version to draft, and require a fresh review.</p>
                                </div>
                                <Badge tone="amber">unreviewed</Badge>
                              </div>
                              <label className="mt-4 block text-xs font-semibold text-slate-700">
                                Summary
                                <textarea
                                  className="field mt-1 min-h-20 bg-white"
                                  value={editingResume.summary.join("\n")}
                                  onChange={(event) => setEditingResume({
                                    ...editingResume,
                                    summary: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean),
                                  })}
                                />
                              </label>
                              <label className="mt-3 block text-xs font-semibold text-slate-700">
                                Skills
                                <textarea
                                  className="field mt-1 min-h-20 bg-white"
                                  value={editingResume.skills.join(", ")}
                                  onChange={(event) => setEditingResume({
                                    ...editingResume,
                                    skills: event.target.value.split(",").map((skill) => skill.trim()).filter(Boolean),
                                  })}
                                />
                              </label>
                              <div className="mt-4 max-h-[520px] space-y-3 overflow-auto pr-1">
                                {(["projects", "experience"] as const).flatMap((sectionKind) =>
                                  editingResume[sectionKind].flatMap((section) => section.bullets
                                    .filter((bullet) => bullet.included)
                                    .map((bullet) => (
                                      <label key={bullet.id} className="block text-xs font-semibold text-slate-700">
                                        <span className="flex items-center justify-between gap-2">
                                          <span>{section.title}</span>
                                          {section.locked || bullet.locked ? <Badge>locked</Badge> : null}
                                        </span>
                                        <textarea
                                          className="field mt-1 min-h-24 bg-white text-sm font-normal leading-5"
                                          data-testid="resume-bullet-editor"
                                          value={bullet.text}
                                          disabled={section.locked || bullet.locked}
                                          onChange={(event) => updateEditingBullet(sectionKind, section.careerItemId, bullet.id, event.target.value)}
                                        />
                                      </label>
                                    ))),
                                )}
                              </div>
                              <div className="mt-4 flex flex-wrap gap-2 border-t border-blue-200 pt-4">
                                <button className="button button-primary" type="button" disabled={saveEditedResume.isPending} onClick={() => saveEditedResume.mutate()}>
                                  <Check size={14} /> {saveEditedResume.isPending ? "Saving..." : "Save edits"}
                                </button>
                                <button className="button" type="button" disabled={saveEditedResume.isPending} onClick={() => {
                                  setEditingResumeId("");
                                  setEditingResume(null);
                                }}>
                                  <X size={14} /> Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-md border border-slate-200 bg-white p-4">
                              <p className="font-semibold text-slate-950">Included bullets</p>
                              <div className="mt-2 max-h-[520px] space-y-2 overflow-auto">
                                {includedBullets.map((bullet) => (
                                  <p key={bullet.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                                    <strong>{bullet.section}:</strong> {bullet.text}
                                  </p>
                                ))}
                                {!includedBullets.length ? <p className="text-slate-500">No included bullets.</p> : null}
                              </div>
                            </div>
                          )}
                        </aside>
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
