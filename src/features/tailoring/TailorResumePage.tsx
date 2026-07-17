import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardPaste,
  FileDown,
  Lock,
  LockOpen,
  RefreshCcw,
  RotateCcw,
  Redo2,
  Save,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { PageHeader } from "../../components/PageHeader";
import { InlineError, LoadingState } from "../../components/States";
import { TagList } from "../../components/TagList";
import { Badge, PageSection, ProgressChecklist } from "../../components/ui";
import { JobInputSchema } from "../../schemas/forms";
import { buildResumeGenerationRequest } from "../../lib/ai/generationRequest";
import {
  generateEvidenceGroundedResume,
  deterministicFallback,
} from "../../lib/ai/generationPipeline";
import { createAIProvider } from "../../lib/ai/providerFactory";
import { AIProviderError } from "../../lib/ai/provider";
import { PROMPT_VERSION, PROMPT_VERSIONS } from "../../lib/ai/prompts";
import { useRepository } from "../../lib/database/repositoryContext";
import { defaultSettings } from "../../lib/database/seed";
import { scoreCareerFacts, splitEvidence } from "../../lib/tailoring/evidence";
import { controlsForRoleProfile, detectRoleProfile, ROLE_PROFILES } from "../../lib/tailoring/roleProfiles";
import { createResumePlanFromRequest } from "../../lib/tailoring/plan";
import {
  compactResumeWithGroundedShortening,
  estimateResumePageCount,
} from "../../lib/resume/compaction";
import { semanticResumeDiff } from "../../lib/resume/diff";
import { defaultResumeFilename } from "../../lib/resume/filename";
import { calculateResumeQuality } from "../../lib/resume/quality";
import {
  hasBlockingValidationErrors,
  missingRequiredContactFields,
  validateResumeClaims,
} from "../../lib/resume/validation";
import { applyTemplateOrdering } from "../../lib/resume/templateSettings";
import { parseClipboardJob } from "../../lib/jobs/clipboard";
import { useResumeEditorStore } from "../../stores/resumeEditorStore";
import type {
  AIRequestMetadata,
  CareerFact,
  CareerItem,
  EvidenceScore,
  Job,
  JobAnalysis,
  ResumeGenerationRequest,
  ResumePlan,
  ResumeQualityCheck,
  ResumeVersion,
  Skill,
  TailoringControls,
  ValidationIssue,
} from "../../types/domain";
import { createId, nowIso, parseCsv } from "../../lib/utils";
import { sampleJob } from "./sampleJob";

const ResumePreview = lazy(() =>
  import("./ResumePreview").then((module) => ({ default: module.ResumePreview })),
);

type JobFormValues = typeof sampleJob;
const emptyFacts: CareerFact[] = [];
const emptyItems: CareerItem[] = [];
const emptySkills: Skill[] = [];

function StepIndicator({ step }: { step: number }) {
  const stages = ["Job", "Base", "Evidence", "Generate", "Review", "Validate", "Preview", "Export"];
  return (
    <div className="flex max-w-full flex-wrap gap-2">
      {stages.map((label, index) => {
        const stageStep = index < 2 ? 1 : index < 3 ? 3 : index < 4 ? 3 : 4;
        const complete = step > stageStep;
        const active = step === stageStep;
        return (
        <div
          key={label}
          className={[
            "rounded border px-3 py-1 text-xs font-semibold",
            active
              ? "border-blue-300 bg-blue-50 text-blue-800"
              : complete
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-white text-slate-500",
          ].join(" ")}
        >
          {index + 1}. {label}
        </div>
      );})}
    </div>
  );
}

function EvidenceTable({
  evidence,
  overrides,
  controls,
  onToggle,
  onControls,
}: {
  evidence: EvidenceScore[];
  overrides: Record<string, boolean>;
  controls: TailoringControls;
  onToggle: (factId: string, included: boolean) => void;
  onControls: (controls: TailoringControls) => void;
}) {
  const toggleList = (key: "requiredFactIds" | "excludedFactIds", id: string, checked: boolean) => {
    const otherKey = key === "requiredFactIds" ? "excludedFactIds" : "requiredFactIds";
    onControls({
      ...controls,
      [key]: checked ? [...new Set([...controls[key], id])] : controls[key].filter((value) => value !== id),
      [otherKey]: checked ? controls[otherKey].filter((value) => value !== id) : controls[otherKey],
    });
  };
  return (
    <div className="space-y-2">
      {evidence.map((score) => {
        const blocked = Boolean(score.excludedReason && ["Disabled.", "Prohibited fact.", "Career item is missing."].includes(score.excludedReason));
        return (
          <div key={score.fact.id} className="rounded-md border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">{score.fact.statement}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {score.item.title} | score {score.score.toFixed(1)} | {score.fact.evidenceStatus}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={score.selected}
                  disabled={blocked}
                  onChange={(event) => onToggle(score.fact.id, event.target.checked)}
                />
                Include
              </label>
            </div>
            <div className="mt-2"><TagList tags={score.reasons} tone={score.selected ? "blue" : "slate"} /></div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={controls.requiredFactIds.includes(score.fact.id)}
                  disabled={blocked}
                  onChange={(event) => toggleList("requiredFactIds", score.fact.id, event.target.checked)}
                />
                Required fact
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={controls.excludedFactIds.includes(score.fact.id)}
                  onChange={(event) => toggleList("excludedFactIds", score.fact.id, event.target.checked)}
                />
                Exclude fact
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={controls.lockedCareerItemIds.includes(score.item.id)}
                  disabled={blocked}
                  onChange={(event) =>
                    onControls({
                      ...controls,
                      lockedCareerItemIds: event.target.checked
                        ? [...new Set([...controls.lockedCareerItemIds, score.item.id])]
                        : controls.lockedCareerItemIds.filter((id) => id !== score.item.id),
                    })
                  }
                />
                Lock item
              </label>
            </div>
            {!score.selected ? <p className="mt-2 text-xs text-slate-500">{score.excludedReason}</p> : null}
            {score.fact.id in overrides ? <p className="mt-2 text-xs font-semibold text-amber-700">Manual override applied.</p> : null}
          </div>
        );
      })}
    </div>
  );
}

function ControlsPanel({ controls, onChange }: { controls: TailoringControls; onChange: (value: TailoringControls) => void }) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-slate-700">
        Role profile
        <select
          className="field mt-1"
          value={controls.roleProfileId}
          onChange={(event) =>
            onChange(
              controlsForRoleProfile(
                event.target.value as TailoringControls["roleProfileId"],
                controls,
              ),
            )
          }
        >
          {Object.values(ROLE_PROFILES).map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Include summary
        <select className="field mt-1" value={controls.summaryMode} onChange={(event) => onChange({ ...controls, summaryMode: event.target.value as TailoringControls["summaryMode"] })}>
          <option value="auto">Auto</option><option value="always">Always</option><option value="never">Never</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm font-semibold text-slate-700">
          Projects
          <select className="field mt-1" value={controls.projectCount} onChange={(event) => onChange({ ...controls, projectCount: event.target.value === "auto" ? "auto" : Number(event.target.value) as 2 | 3 | 4 })}>
            <option value="auto">Auto</option><option value="2">2</option><option value="3">3</option><option value="4">4</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Bullets/item
          <select className="field mt-1" value={controls.bulletsPerProject} onChange={(event) => onChange({ ...controls, bulletsPerProject: event.target.value === "auto" ? "auto" : Number(event.target.value) as 1 | 2 | 3 })}>
            <option value="auto">Auto</option><option value="1">1</option><option value="2">2</option><option value="3">3</option>
          </select>
        </label>
      </div>
      <label className="block text-sm font-semibold text-slate-700">
        Section order preset
        <select className="field mt-1" value={controls.sectionOrderPreset} onChange={(event) => onChange({ ...controls, sectionOrderPreset: event.target.value as TailoringControls["sectionOrderPreset"] })}>
          <option value="mir-standard">Mir Standard</option>
          <option value="ai-full-stack">AI and Full-Stack</option>
          <option value="experience-first">Experience first</option>
        </select>
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Target role category
        <input className="field mt-1" value={controls.targetRoleCategory} onChange={(event) => onChange({ ...controls, targetRoleCategory: event.target.value })} />
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Emphasis tags
        <input className="field mt-1" value={controls.emphasisTags.join(", ")} onChange={(event) => onChange({ ...controls, emphasisTags: parseCsv(event.target.value) })} />
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Excluded tags
        <input className="field mt-1" value={controls.excludedTags.join(", ")} onChange={(event) => onChange({ ...controls, excludedTags: parseCsv(event.target.value) })} />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input type="checkbox" checked={controls.strictOnePage} onChange={(event) => onChange({ ...controls, strictOnePage: event.target.checked })} />
        Strict one-page mode
      </label>
    </div>
  );
}

function UsagePanel({ calls }: { calls: AIRequestMetadata[] }) {
  if (!calls.length) return null;
  return (
    <div className="panel p-4">
      <h4 className="font-semibold text-slate-950">Generation requests</h4>
      <div className="mt-3 space-y-2 text-xs text-slate-600">
        {calls.map((call, index) => (
          <div key={`${call.requestType}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 pb-2 last:border-0">
            <span>{call.provider} | {call.model} | {call.requestType} | {call.success ? "success" : call.errorCode}</span>
            <span>{call.durationMs} ms | {call.inputTokens ?? "-"} in | {call.outputTokens ?? "-"} out | {call.totalTokens ?? "-"} total</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QualityPanel({ checks }: { checks: ResumeQualityCheck[] }) {
  return (
    <div className="panel p-4">
      <h4 className="font-semibold text-slate-950">Resume quality checks</h4>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3">
        {checks.map((check) => (
          <div key={check.id} className="border-b border-slate-100 pb-2">
            <p className="text-sm font-semibold text-slate-800">{check.label}</p>
            <p className={check.status === "error" ? "text-xs text-red-700" : check.status === "warning" ? "text-xs text-amber-700" : "text-xs text-slate-500"}>{check.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TailorResumePage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [jobPersisted, setJobPersisted] = useState(false);
  const [applicationSaved, setApplicationSaved] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [savedResume, setSavedResume] = useState<ResumeVersion | null>(null);
  const [generationRequest, setGenerationRequest] = useState<ResumeGenerationRequest | null>(null);
  const [generationPlan, setGenerationPlan] = useState<ResumePlan | null>(null);
  const [calls, setCalls] = useState<AIRequestMetadata[]>([]);
  const [generationMetadata, setGenerationMetadata] = useState(defaultSettings.tailoringDefaults ? {
    calls: [] as AIRequestMetadata[], repairAttempted: false, repairSucceeded: false, deterministicFallbackUsed: false, compactionLog: [] as string[],
  } : null);
  const [controls, setControls] = useState<TailoringControls>(defaultSettings.tailoringDefaults);
  const [controlsLoaded, setControlsLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const {
    resume,
    deterministicBaseline,
    setReviewDraft,
    applyResume,
    updateBullet,
    moveBullet,
    undo,
    redo,
    history,
    future,
    dirty,
    markSaved,
    acceptBullet,
    rejectBullet,
    acceptAll,
    toggleBulletLock,
    toggleCareerItemLock,
    restoreDeterministicBullet,
    replaceBullet,
    replaceSection,
    approveWarning,
  } = useResumeEditorStore();

  const form = useForm<JobFormValues>({
    resolver: zodResolver(JobInputSchema),
    defaultValues: { company: "", roleTitle: "", sourceUrl: "", rawDescription: "" },
  });
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: () => repository.getProfile() });
  const itemsQuery = useQuery({ queryKey: ["career-items"], queryFn: () => repository.listCareerItems() });
  const factsQuery = useQuery({ queryKey: ["career-facts"], queryFn: () => repository.listCareerFacts() });
  const skillsQuery = useQuery({ queryKey: ["skills"], queryFn: () => repository.listSkills() });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => repository.getSettings() });

  useEffect(() => {
    if (settingsQuery.data && !controlsLoaded) {
      setControls(settingsQuery.data.tailoringDefaults);
      setControlsLoaded(true);
    }
  }, [settingsQuery.data, controlsLoaded]);

  useEffect(() => {
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeClose);
    return () => window.removeEventListener("beforeunload", warnBeforeClose);
  }, [dirty]);

  const analyzeMutation = useMutation({
    mutationFn: async (values: JobFormValues) => {
      setError("");
      const settings = await repository.getSettings();
      const result = await createAIProvider(settings.aiProvider).analyzeJob({
        ...values,
        modelName: settings.modelName,
      });
      const timestamp = nowIso();
      const analyzedJob: Job = {
        id: createId("job"),
        company: values.company || result.data.inferredCompany,
        roleTitle: values.roleTitle || result.data.inferredRoleTitle,
        sourceUrl: values.sourceUrl,
        rawDescription: values.rawDescription,
        analysisJson: result.data,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      return { analysis: result.data, analyzedJob, metadata: result.metadata };
    },
    onSuccess: ({ analysis: nextAnalysis, analyzedJob, metadata }) => {
      setAnalysis(nextAnalysis);
      setJob(analyzedJob);
      setJobPersisted(false);
      setApplicationSaved(false);
      setOverrides({});
      const detected = detectRoleProfile(nextAnalysis);
      setControls((current) => controlsForRoleProfile(detected, current));
      setCalls([metadata]);
      setStep(2);
    },
    onError: (caught) => {
      if (caught instanceof AIProviderError) setCalls((current) => [...current, caught.metadata]);
      setError(caught instanceof Error ? caught.message : String(caught));
    },
  });

  const facts = factsQuery.data ?? emptyFacts;
  const items = itemsQuery.data ?? emptyItems;
  const skills = skillsQuery.data ?? emptySkills;
  const profile = profileQuery.data ?? null;
  const settings = settingsQuery.data;
  const evidence = useMemo(
    () =>
      analysis
        ? splitEvidence(
            scoreCareerFacts(analysis, facts, items, ROLE_PROFILES[controls.roleProfileId]),
            overrides,
          )
        : [],
    [analysis, controls.roleProfileId, facts, items, overrides],
  );
  const selectedEvidence = evidence.filter((score) => score.selected && !controls.excludedFactIds.includes(score.fact.id));
  const validationIssues: ValidationIssue[] = resume && profile
    ? validateResumeClaims({ resume, facts, items, skills, profile, generationRequest: generationRequest ?? undefined })
    : [];
  const visibleValidationIssues = validationIssues.filter(
    (issue) => issue.severity === "error" || !resume?.approvedWarningCodes.includes(issue.code),
  );
  const missingContactFields = missingRequiredContactFields(profile);
  const hasBlockingIssues = hasBlockingValidationErrors(validationIssues);
  const hasUnapprovedIncludedBullets = resume
    ? [...resume.projects, ...resume.experience]
        .flatMap((section) => section.bullets)
        .some((bullet) => bullet.included && !bullet.approved)
    : false;
  const exportBlockReason = missingContactFields.length
    ? `Complete profile fields before export: ${missingContactFields.join(", ")}.`
    : hasBlockingIssues
      ? "Resolve blocking validation errors before exporting."
      : hasUnapprovedIncludedBullets
        ? "Accept or reject every included bullet before exporting."
        : "";
  const pageCount = resume ? estimateResumePageCount(resume) : 1;
  const diff = resume && deterministicBaseline ? semanticResumeDiff(deterministicBaseline, resume) : [];
  const quality = resume && analysis && profile
    ? calculateResumeQuality({ resume, analysis, evidence, validationIssues, profile, pageCount })
    : [];
  const exportReadiness = [
    {
      label: "Contact information complete",
      detail: missingContactFields.length ? `Missing: ${missingContactFields.join(", ")}` : "Required contact fields are present.",
      complete: missingContactFields.length === 0,
      warning: true,
    },
    {
      label: "All claims supported",
      detail: hasBlockingIssues ? "Resolve blocking validation errors." : "No blocking validation errors.",
      complete: !hasBlockingIssues,
      warning: true,
    },
    {
      label: "Generated bullets approved",
      detail: hasUnapprovedIncludedBullets ? "Accept or reject each included bullet." : "Every included bullet has been reviewed.",
      complete: !hasUnapprovedIncludedBullets,
      warning: true,
    },
    {
      label: "One-page estimate",
      detail: `${pageCount} estimated page${pageCount === 1 ? "" : "s"}. Export performs a real PDF page check.`,
      complete: pageCount === 1,
      warning: true,
    },
    {
      label: "PDF export ready",
      detail: exportBlockReason || "Ready to compile and export.",
      complete: Boolean(resume) && !exportBlockReason,
      warning: true,
    },
  ];

  const saveGeneratedVersion = async (
    nextResume: NonNullable<typeof resume>,
    issues: ValidationIssue[],
    baseline: NonNullable<typeof deterministicBaseline>,
    metadata: NonNullable<typeof generationMetadata>,
  ) => {
    if (!job || !settings || !analysis) throw new Error("Job context is unavailable.");
    const saved = await repository.saveResumeVersion({
      jobId: job.id,
      name: `${job.company || analysis.inferredCompany} - ${job.roleTitle || analysis.inferredRoleTitle}`,
      templateId: settings.defaultTemplateId,
      contentJson: nextResume,
      validationJson: issues,
      status: "draft",
      parentResumeVersionId: "",
      generationProvider: settings.aiProvider,
      generationModel: settings.modelName,
      promptVersion: PROMPT_VERSION,
      promptVersionsJson: PROMPT_VERSIONS,
      layoutProfileId: controls.roleProfileId,
      templateSettingsJson: settings.templateSettings,
      generationMetadataJson: metadata,
      deterministicBaselineJson: baseline,
    });
    setSavedResume(saved);
    markSaved();
    queryClient.invalidateQueries();
  };

  const saveJobAndContinue = async () => {
    if (!job) return;
    try {
      const saved = await repository.saveJob(job);
      setJob(saved);
      setJobPersisted(true);
      setStep(3);
      await queryClient.invalidateQueries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const generateResume = async () => {
    if (!analysis || !profile || !job || !settings || !jobPersisted) {
      setError("Seed or complete the profile before generating a resume.");
      return;
    }
    setError("");
    setGenerating(true);
    try {
      const variants = await repository.listApprovedBulletVariants({
        factIds: selectedEvidence.map((score) => score.fact.id),
        roleCategories: analysis.roleCategories,
      });
      const request = buildResumeGenerationRequest({
        job,
        analysis,
        profile,
        items,
        evidence,
        skills,
        controls,
        approvedVariants: variants,
      });
      setGenerationRequest(request);
      const generated = await generateEvidenceGroundedResume({
        provider: createAIProvider(settings.aiProvider),
        request,
        modelName: settings.modelName,
      });
      setGenerationPlan(generated.plan);
      setGenerationMetadata(generated.metadata);
      setCalls((current) => [...current, ...generated.metadata.calls]);
      setReviewDraft(generated.resume, generated.deterministicBaseline);
      await saveGeneratedVersion(
        generated.resume,
        generated.validationIssues,
        generated.deterministicBaseline,
        generated.metadata,
      );
      setStep(4);
    } catch (caught) {
      if (caught instanceof AIProviderError) setCalls((current) => [...current, caught.metadata]);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setGenerating(false);
    }
  };

  const activateFallback = async () => {
    if (!generationRequest || !profile || !job || !settings) return;
    const plan = createResumePlanFromRequest(generationRequest);
    const fallback = deterministicFallback(generationRequest, plan);
    const issues = validateResumeClaims({ resume: fallback, facts, items, skills, profile, generationRequest });
    const metadata = {
      calls,
      repairAttempted: false,
      repairSucceeded: false,
      deterministicFallbackUsed: true,
      compactionLog: [],
    };
    setGenerationPlan(plan);
    setGenerationMetadata(metadata);
    setReviewDraft(fallback, fallback);
    await saveGeneratedVersion(fallback, issues, fallback, metadata);
    setError("");
    setStep(4);
  };

  const persistCurrent = async (
    statusOverride?: ResumeVersion["status"],
    exportPath?: string,
    contentOverride?: NonNullable<typeof resume>,
  ) => {
    if (!resume || !job || !savedResume || !generationMetadata) return;
    const content = contentOverride ?? resume;
    const currentIssues = validateResumeClaims({
      resume: content,
      facts,
      items,
      skills,
      profile,
      generationRequest: generationRequest ?? undefined,
    });
    const allApproved = [...content.projects, ...content.experience]
      .flatMap((section) => section.bullets)
      .filter((bullet) => bullet.included)
      .every((bullet) => bullet.approved);
    const status = statusOverride ?? (!hasBlockingValidationErrors(currentIssues) && allApproved ? "approved" : "draft");
    const saved = await repository.saveResumeVersion({
      ...savedResume,
      contentJson: content,
      validationJson: currentIssues,
      status,
      lastExportPath: exportPath ?? savedResume.lastExportPath,
      generationMetadataJson: {
        ...generationMetadata,
        compactionLog: content.compactionActions,
      },
      deterministicBaselineJson: deterministicBaseline,
    });
    setSavedResume(saved);
    markSaved();
    queryClient.invalidateQueries();
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === "s" && step === 4) {
        event.preventDefault();
        void persistCurrent();
      } else if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (key === "z") {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  const regenerateContent = async (careerItemId: string, bulletId?: string) => {
    if (!generationRequest || !generationPlan || !settings || !resume || !profile) return;
    setError("");
    try {
      const result = await createAIProvider(settings.aiProvider).generateResume({
        request: generationRequest,
        plan: generationPlan,
        modelName: settings.modelName,
      });
      setCalls((current) => [...current, result.metadata]);
      const candidateSection = [...result.data.projects, ...result.data.experience].find(
        (section) => section.careerItemId === careerItemId,
      );
      if (!candidateSection) throw new Error("Regeneration omitted the selected section.");
      if (bulletId) {
        const currentBullet = [...resume.projects, ...resume.experience]
          .flatMap((section) => section.bullets)
          .find((bullet) => bullet.id === bulletId);
        const replacement = candidateSection.bullets.find(
          (bullet) => currentBullet && bullet.sourceFactIds.some((id) => currentBullet.sourceFactIds.includes(id)),
        );
        if (!replacement) throw new Error("Regeneration did not return a grounded replacement bullet.");
        replaceBullet(bulletId, { ...replacement, rejected: false, approved: false });
      } else {
        replaceSection(careerItemId, candidateSection);
      }
    } catch (caught) {
      if (caught instanceof AIProviderError) setCalls((current) => [...current, caught.metadata]);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const fitResume = async () => {
    if (!resume || !settings || !generationRequest || !generationPlan) return resume;
    const provider = createAIProvider(settings.aiProvider);
    const fitted = await compactResumeWithGroundedShortening(
      resume,
      settings.aiProvider === "openai"
        ? async (bullet) => {
            const result = await provider.shortenBullet({ request: generationRequest, bullet, modelName: settings.modelName });
            setCalls((current) => [...current, result.metadata]);
            return result.data;
          }
        : null,
    );
    const fittedIssues = validateResumeClaims({ resume: fitted, facts, items, skills, profile, generationRequest });
    if (hasBlockingValidationErrors(fittedIssues)) {
      throw new Error("Automatic fitting produced a validation error and was not applied.");
    }
    applyResume(fitted);
    setGenerationMetadata((current) => current ? { ...current, compactionLog: fitted.compactionActions } : current);
    return fitted;
  };

  const exportResume = async () => {
    if (!resume || !profile || !job || !settings) return;
    if (missingContactFields.length) {
      setError(`Complete the profile before export: ${missingContactFields.join(", ")}.`);
      return;
    }
    if (hasBlockingIssues) {
      setError("Resolve blocking validation errors before exporting.");
      return;
    }
    if (hasUnapprovedIncludedBullets) {
      setError("Accept or reject every included bullet before exporting.");
      return;
    }
    try {
      const fitted = await fitResume();
      if (!fitted) return;
      const exportContent = applyTemplateOrdering(fitted, settings.templateSettings);
      const { countPdfPages, renderResumePdfBytes } = await import("../../lib/resume/pdf");
      const bytes = await renderResumePdfBytes(exportContent, settings.templateSettings);
      const actualPages = await countPdfPages(bytes);
      if (actualPages !== 1) {
        setError("The rendered PDF is not one page. Shorten unlocked content before export.");
        return;
      }
      const filename = defaultResumeFilename(job.company, job.roleTitle);
      const path = await save({
        defaultPath: settings.defaultExportDirectory
          ? `${settings.defaultExportDirectory.replace(/\/$/, "")}/${filename}`
          : filename,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!path) return;
      await invoke("write_pdf_file", { path, bytes: Array.from(bytes) });
      await persistCurrent("exported", path, exportContent);
      setApplicationSaved(false);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "PDF rendering failed.");
    }
  };

  const saveApplicationRecord = async () => {
    if (!job || !savedResume) return;
    try {
      await repository.saveApplication({
        jobId: job.id,
        company: job.company,
        role: job.roleTitle,
        jobUrl: job.sourceUrl,
        resumeVersionId: savedResume.id,
        status: savedResume.lastExportPath ? "ready" : "preparing",
      });
      setApplicationSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  if (profileQuery.isLoading || itemsQuery.isLoading || factsQuery.isLoading || skillsQuery.isLoading || settingsQuery.isLoading) {
    return <LoadingState label="Loading tailoring workspace..." />;
  }
  if (profileQuery.isError) throw profileQuery.error;
  if (itemsQuery.isError) throw itemsQuery.error;
  if (factsQuery.isError) throw factsQuery.error;
  if (skillsQuery.isError) throw skillsQuery.error;
  if (settingsQuery.isError) throw settingsQuery.error;

  return (
    <div>
      <PageHeader
        eyebrow="Evidence-grounded workflow"
        title="Tailor Resume"
        description="Move from job description to reviewed, validated, one-page PDF without letting unsupported claims slip through."
        meta={
          <>
            <Badge tone={job ? "emerald" : "slate"}>{job ? "job analyzed" : "job not selected"}</Badge>
            <Badge tone={selectedEvidence.length ? "blue" : "slate"}>{selectedEvidence.length} evidence facts selected</Badge>
            <Badge tone={!exportBlockReason && resume ? "emerald" : "amber"}>{resume ? (exportBlockReason ? "export blocked" : "export ready") : "draft not generated"}</Badge>
          </>
        }
        actions={<StepIndicator step={step} />}
      />
      <div className="page-body space-y-5">
        {error ? (
          <div className="space-y-2">
            <InlineError message={error} />
            {step === 3 && generationRequest ? (
              <div className="flex flex-wrap gap-2">
                <button className="button" type="button" onClick={() => void generateResume()}><RefreshCcw size={15} />Retry</button>
                <button className="button" type="button" onClick={async () => { if (settings) { await repository.saveSettings({ ...settings, aiProvider: "mock" }); await settingsQuery.refetch(); setError(""); } }}>Switch to mock mode</button>
                <button className="button" type="button" onClick={() => void activateFallback()}>Use deterministic fallback</button>
                <button className="button" type="button" onClick={() => setStep(3)}>Return to evidence selection</button>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <form className="panel space-y-4 p-5" onSubmit={form.handleSubmit((values) => analyzeMutation.mutate(values))}>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm font-semibold text-slate-700">Company<input className="field mt-1" {...form.register("company")} /></label>
              <label className="text-sm font-semibold text-slate-700">Role title<input className="field mt-1" {...form.register("roleTitle")} /></label>
              <label className="text-sm font-semibold text-slate-700">Job URL<input className="field mt-1" {...form.register("sourceUrl")} /></label>
            </div>
            <label className="block text-sm font-semibold text-slate-700">Full job description<textarea className="field mt-1 min-h-72" {...form.register("rawDescription")} /></label>
            {form.formState.errors.rawDescription ? <p className="text-sm font-semibold text-red-700">{form.formState.errors.rawDescription.message}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button
                className="button"
                type="button"
                onClick={async () => {
                  if (dirty && !window.confirm("Replace the job form while a resume draft has unsaved edits?")) return;
                  try {
                    const text = await navigator.clipboard.readText();
                    const parsed = parseClipboardJob(text);
                    if (!parsed.rawDescription) throw new Error("The clipboard does not contain a job description.");
                    form.reset(parsed);
                    setError("");
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : "Could not read the clipboard.");
                  }
                }}
              >
                <ClipboardPaste size={15} aria-hidden="true" />
                Paste job from clipboard
              </button>
              <button
                className="button"
                type="button"
                onClick={() => {
                  if (dirty && !window.confirm("Replace the job form while a resume draft has unsaved edits?")) return;
                  form.reset(sampleJob);
                }}
              >
                Use sample job
              </button>
              <button className="button button-primary" type="submit" disabled={analyzeMutation.isPending}><Sparkles size={16} />Analyze job</button>
            </div>
            <p className="text-xs text-slate-500">Clipboard text stays in this draft until you explicitly save the analyzed job.</p>
          </form>
        ) : null}

        {step === 2 && analysis ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="panel p-5">
              <h3 className="text-lg font-semibold text-slate-950">Job analysis</h3>
              <p className="mt-2 text-sm leading-6 text-slate-700">{analysis.summary}</p>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div><p className="text-xs font-semibold uppercase text-slate-500">Required skills</p><div className="mt-2"><TagList tags={analysis.requiredSkills} tone="blue" /></div></div>
                <div><p className="text-xs font-semibold uppercase text-slate-500">Role categories</p><div className="mt-2"><TagList tags={analysis.roleCategories} /></div></div>
              </div>
            </section>
            <aside className="panel p-5">
              <p className="text-sm font-semibold text-slate-950">Provider</p>
              <p className="mt-1 text-sm text-slate-600">{settings?.aiProvider ?? "mock"} | {settings?.modelName}</p>
              <p className="mt-4 text-sm font-semibold text-slate-950">Detected role profile</p>
              <p className="mt-1 text-sm text-slate-600">{ROLE_PROFILES[controls.roleProfileId].name}</p>
              <div className="mt-3"><ControlsPanel controls={controls} onChange={setControls} /></div>
              <button
                className="button button-primary mt-5 w-full"
                type="button"
                disabled={jobPersisted}
                onClick={() => void saveJobAndContinue()}
              >
                <Save size={15} aria-hidden="true" />
                {jobPersisted ? "Job saved" : "Save job and score evidence"}
              </button>
            </aside>
          </div>
        ) : null}

        {step === 3 && analysis ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section><EvidenceTable evidence={evidence} overrides={overrides} controls={controls} onToggle={(factId, included) => setOverrides((current) => ({ ...current, [factId]: included }))} onControls={setControls} /></section>
            <aside className="panel h-fit p-5">
              <h3 className="text-lg font-semibold text-slate-950">Tailoring controls</h3>
              <div className="mt-4"><ControlsPanel controls={controls} onChange={setControls} /></div>
              <p className="mt-4 text-sm text-slate-600">{selectedEvidence.length} facts selected from {evidence.length} ranked facts.</p>
              <button className="button mt-3 w-full" type="button" onClick={() => setOverrides({})}>
                Use recommended evidence
              </button>
              <button className="button button-primary mt-5 w-full" type="button" onClick={() => void generateResume()} disabled={selectedEvidence.length === 0 || generating}>
                <Sparkles size={15} />{generating ? "Generating..." : "Generate tailored resume"}
              </button>
            </aside>
          </div>
        ) : null}

        {step === 4 && resume && profile && analysis ? (
          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_620px]">
            <section className="space-y-4">
              <div className="panel flex flex-wrap items-center gap-2 p-4">
                <div className="mr-auto">
                  <h3 className="text-lg font-semibold text-slate-950">Generation review</h3>
                  <p className="text-sm text-slate-500">
                    {savedResume ? `Saved as ${savedResume.name}` : "Draft not saved"}{dirty ? " | unsaved edits" : ""}
                  </p>
                </div>
                <button className="button" type="button" onClick={acceptAll}><Check size={15} />Accept all</button>
                <button className="button" type="button" onClick={undo} disabled={!history.length}><Undo2 size={15} />Undo</button>
                <button className="icon-button" type="button" title="Redo" onClick={redo} disabled={!future.length}><Redo2 size={15} aria-hidden="true" /></button>
                <button className="button" type="button" onClick={() => void fitResume()}>Fit one page</button>
                <button className="button" type="button" onClick={() => void persistCurrent()}><Save size={15} />Save draft</button>
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => void exportResume()}
                  disabled={Boolean(exportBlockReason)}
                  title={exportBlockReason || "Export PDF"}
                >
                  <FileDown size={15} />
                  Export PDF
                </button>
                <button className="button" type="button" onClick={() => void saveApplicationRecord()} disabled={applicationSaved}>
                  <Save size={15} aria-hidden="true" />
                  {applicationSaved ? "Application saved" : "Save application"}
                </button>
              </div>

              {visibleValidationIssues.length ? (
                <div className="panel p-4">
                  <h4 className="font-semibold text-slate-950">Validation</h4>
                  <div className="mt-3 space-y-2">
                    {visibleValidationIssues.map((issue, index) => (
                      <div key={`${issue.code}-${issue.bulletId ?? index}`} className={issue.severity === "error" ? "flex items-center gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" : "flex items-center gap-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"}>
                        <span className="mr-auto">{issue.message}</span>
                        {issue.canApprove ? <button className="button" type="button" onClick={() => approveWarning(issue.code)}>Approve warning</button> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div className="panel p-4 text-sm font-semibold text-emerald-700">No unapproved validation issues.</div>}

              <QualityPanel checks={quality} />
              <UsagePanel calls={calls} />

              <div className="panel p-4">
                <h4 className="font-semibold text-slate-950">Semantic diff from deterministic draft</h4>
                <p className="mt-1 text-sm text-slate-500">{diff.length} categorized changes</p>
                <div className="mt-3 max-h-72 space-y-3 overflow-auto">
                  {diff.map((entry, index) => (
                    <div key={`${entry.category}-${entry.careerItemId}-${index}`} className="border-b border-slate-100 pb-3 text-sm">
                      <p className="font-semibold uppercase text-slate-500">{entry.category.replace("_", " ")}</p>
                      {entry.before ? <p className="mt-1 text-red-700">Before: {entry.before}</p> : null}
                      {entry.after ? <p className="mt-1 text-emerald-700">After: {entry.after}</p> : null}
                    </div>
                  ))}
                  {!diff.length ? <p className="text-sm text-slate-500">No semantic changes from the deterministic draft.</p> : null}
                </div>
                {generationPlan?.omittedItems.length ? (
                  <div className="mt-4 border-t border-slate-200 pt-3 text-sm text-slate-600">
                    <p className="font-semibold text-slate-800">Items omitted</p>
                    {generationPlan.omittedItems.map((item) => <p key={item.careerItemId}>{items.find((entry) => entry.id === item.careerItemId)?.title ?? item.careerItemId}: {item.reason}</p>)}
                  </div>
                ) : null}
              </div>

              {[...resume.projects, ...resume.experience].map((section) => (
                <div key={section.careerItemId} className="panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><h4 className="font-semibold text-slate-950">{section.title}</h4><p className="text-xs text-slate-500">{section.organization}</p></div>
                    <div className="flex gap-2">
                      <button className="button" type="button" onClick={() => toggleCareerItemLock(section.careerItemId)}>{section.locked ? <Lock size={14} /> : <LockOpen size={14} />}{section.locked ? "Item locked" : "Lock item"}</button>
                      <button className="button" type="button" onClick={() => void regenerateContent(section.careerItemId)}><RefreshCcw size={14} />Regenerate section</button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-3">
                    {section.bullets.map((bullet) => {
                      const sourceFacts = bullet.sourceFactIds.map((id) => facts.find((fact) => fact.id === id)).filter((fact): fact is CareerFact => Boolean(fact));
                      return (
                        <div key={bullet.id} className={bullet.rejected ? "rounded-md border border-slate-200 bg-slate-50 p-3 opacity-70" : "rounded-md border border-slate-200 p-3"}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="mr-auto text-xs font-semibold text-slate-500">{bullet.generationSource} | {bullet.approved ? "approved" : bullet.rejected ? "rejected" : "pending review"}</span>
                            <button className="button" type="button" onClick={() => acceptBullet(bullet.id)}><Check size={14} />Accept</button>
                            <button className="button" type="button" onClick={() => rejectBullet(bullet.id)}><X size={14} />Reject</button>
                            <button className="button" type="button" onClick={() => void regenerateContent(section.careerItemId, bullet.id)}><RefreshCcw size={14} />Regenerate</button>
                            <button className="button" type="button" onClick={() => restoreDeterministicBullet(bullet.id)}><RotateCcw size={14} />Fallback</button>
                            <button className="button" type="button" onClick={() => toggleBulletLock(bullet.id)}>{bullet.locked ? <Lock size={14} /> : <LockOpen size={14} />}</button>
                            <button className="button" type="button" onClick={async () => {
                              await repository.saveApprovedBulletVariant({
                                careerItemId: section.careerItemId,
                                sourceFactIds: bullet.sourceFactIds,
                                text: bullet.text,
                                roleCategories: analysis.roleCategories,
                                skillTags: [...new Set(sourceFacts.flatMap((fact) => fact.skillTags))],
                                targetJobId: job?.id ?? "",
                                creationSource: bullet.generationSource,
                              });
                              acceptBullet(bullet.id);
                              queryClient.invalidateQueries({ queryKey: ["approved-variants"] });
                            }}>Save variant</button>
                          </div>
                          <textarea className="field mt-2 min-h-20" value={bullet.text} onChange={(event) => updateBullet(bullet.id, event.target.value)} />
                          <div className="mt-2 flex gap-1">
                            <button className="button" type="button" title="Move bullet up" onClick={() => moveBullet(bullet.id, -1)}><ArrowUp size={14} /></button>
                            <button className="button" type="button" title="Move bullet down" onClick={() => moveBullet(bullet.id, 1)}><ArrowDown size={14} /></button>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-500"><strong>Generation reason:</strong> {bullet.generationReason}</p>
                          <p className="text-xs leading-5 text-slate-500"><strong>Keywords addressed:</strong> {bullet.keywordsAddressed.join(", ") || "None"}</p>
                          <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            <p className="font-semibold text-slate-700">Exact source facts</p>
                            {sourceFacts.map((fact) => <p key={fact.id} className="mt-1">{fact.id}: {fact.statement}</p>)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
            <aside className="space-y-4 2xl:sticky 2xl:top-0 2xl:h-screen 2xl:overflow-auto">
              <PageSection title="Export readiness" description="Export remains disabled until every critical check passes.">
                <ProgressChecklist items={exportReadiness} />
                {exportBlockReason ? (
                  <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    {exportBlockReason}
                  </p>
                ) : null}
              </PageSection>
              <div className="panel bg-slate-100 p-4">
              <Suspense fallback={<LoadingState label="Loading resume preview..." />}>
                <ResumePreview resume={resume} validationIssues={visibleValidationIssues} pageCount={pageCount} />
              </Suspense>
              </div>
              {resume.compactionActions.length ? (
                <div className="mt-4 rounded border border-slate-200 bg-white p-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">Compaction log</p>
                  {resume.compactionActions.map((action) => <p key={action} className="mt-1">{action}</p>)}
                </div>
              ) : null}
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}
