import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { ArrowDown, ArrowUp, FileDown, Sparkles, Undo2 } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { PageHeader } from "../../components/PageHeader";
import { InlineError, LoadingState } from "../../components/States";
import { TagList } from "../../components/TagList";
import { JobInputSchema } from "../../schemas/forms";
import { createAIProvider } from "../../lib/ai/providerFactory";
import { useRepository } from "../../lib/database/RepositoryProvider";
import { scoreCareerFacts, splitEvidence } from "../../lib/tailoring/evidence";
import { createResumePlan } from "../../lib/tailoring/plan";
import { generateTailoredResume } from "../../lib/tailoring/generateResume";
import { compactResumeForOnePage, estimateResumePageCount } from "../../lib/resume/compaction";
import { countPdfPages, renderResumePdfBytes } from "../../lib/resume/pdf";
import { defaultResumeFilename } from "../../lib/resume/filename";
import { hasBlockingValidationErrors, validateResumeClaims } from "../../lib/resume/validation";
import { useResumeEditorStore } from "../../stores/resumeEditorStore";
import type {
  CareerFact,
  CareerItem,
  EvidenceScore,
  Job,
  JobAnalysis,
  ResumeVersion,
  Skill,
} from "../../types/domain";
import { sampleJob } from "./sampleJob";
import { ResumePreview } from "./ResumePreview";

type JobFormValues = typeof sampleJob;
const emptyFacts: CareerFact[] = [];
const emptyItems: CareerItem[] = [];
const emptySkills: Skill[] = [];

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex gap-2">
      {["Job input", "Analysis", "Evidence", "Resume"].map((label, index) => (
        <div
          key={label}
          className={[
            "rounded border px-3 py-1 text-xs font-semibold",
            step === index + 1
              ? "border-blue-300 bg-blue-50 text-blue-800"
              : "border-slate-200 bg-white text-slate-500",
          ].join(" ")}
        >
          {index + 1}. {label}
        </div>
      ))}
    </div>
  );
}

function EvidenceTable({
  evidence,
  overrides,
  onToggle,
}: {
  evidence: EvidenceScore[];
  overrides: Record<string, boolean>;
  onToggle: (factId: string, included: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      {evidence.map((score) => (
        <div key={score.fact.id} className="rounded-md border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-950">{score.fact.statement}</p>
              <p className="mt-1 text-xs text-slate-500">
                {score.item.title} | score {score.score.toFixed(1)}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={score.selected}
                onChange={(event) => onToggle(score.fact.id, event.target.checked)}
              />
              Include
            </label>
          </div>
          <div className="mt-2">
            <TagList tags={score.reasons} tone={score.selected ? "blue" : "slate"} />
          </div>
          {!score.selected ? <p className="mt-2 text-xs text-slate-500">{score.excludedReason}</p> : null}
          {score.fact.id in overrides ? (
            <p className="mt-2 text-xs font-semibold text-amber-700">Manual override applied.</p>
          ) : null}
        </div>
      ))}
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
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [savedResume, setSavedResume] = useState<ResumeVersion | null>(null);
  const { resume, setResume, updateBullet, toggleBullet, moveBullet, undo, history } =
    useResumeEditorStore();

  const form = useForm<JobFormValues>({
    resolver: zodResolver(JobInputSchema),
    defaultValues: { company: "", roleTitle: "", sourceUrl: "", rawDescription: "" },
  });

  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: () => repository.getProfile() });
  const itemsQuery = useQuery({ queryKey: ["career-items"], queryFn: () => repository.listCareerItems() });
  const factsQuery = useQuery({ queryKey: ["career-facts"], queryFn: () => repository.listCareerFacts() });
  const skillsQuery = useQuery({ queryKey: ["skills"], queryFn: () => repository.listSkills() });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => repository.getSettings() });

  const analyzeMutation = useMutation({
    mutationFn: async (values: JobFormValues) => {
      setError("");
      const settings = await repository.getSettings();
      const provider = createAIProvider(settings.aiProvider);
      const nextAnalysis = await provider.analyzeJob({ ...values, modelName: settings.modelName });
      const savedJob = await repository.saveJob({
        company: values.company || nextAnalysis.inferredCompany,
        roleTitle: values.roleTitle || nextAnalysis.inferredRoleTitle,
        sourceUrl: values.sourceUrl,
        rawDescription: values.rawDescription,
        analysisJson: nextAnalysis,
      });
      return { nextAnalysis, savedJob };
    },
    onSuccess: ({ nextAnalysis, savedJob }) => {
      setAnalysis(nextAnalysis);
      setJob(savedJob);
      setStep(2);
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (caught) => {
      console.error("Job analysis failed", caught);
      setError(caught instanceof Error ? caught.message : String(caught));
    },
  });

  const facts = factsQuery.data ?? emptyFacts;
  const items = itemsQuery.data ?? emptyItems;
  const skills = skillsQuery.data ?? emptySkills;
  const profile = profileQuery.data ?? null;
  const settings = settingsQuery.data;

  const evidence = useMemo(() => {
    if (!analysis) return [];
    return splitEvidence(scoreCareerFacts(analysis, facts, items), overrides);
  }, [analysis, facts, items, overrides]);

  const selectedEvidence = evidence.filter((score) => score.selected);
  const validationIssues =
    resume && profile
      ? validateResumeClaims({ resume, facts, items, skills, profile })
      : [];
  const pageCount = resume ? estimateResumePageCount(resume) : 1;

  const generateResume = async () => {
    if (!analysis || !profile || !job) {
      setError("Seed or complete the profile before generating a resume.");
      return;
    }
    const plan = createResumePlan(analysis, evidence, skills);
    const nextResume = generateTailoredResume({
      profile,
      items,
      facts,
      skills,
      analysis,
      plan,
      evidence,
    });
    setResume(nextResume);
    const issues = validateResumeClaims({ resume: nextResume, facts, items, skills, profile });
    const saved = await repository.saveResumeVersion({
      jobId: job.id,
      name: `${job.company || analysis.inferredCompany} - ${job.roleTitle || analysis.inferredRoleTitle}`,
      templateId: settings?.defaultTemplateId ?? "ats-one-page",
      contentJson: nextResume,
      validationJson: issues,
      status: hasBlockingValidationErrors(issues) ? "draft" : "approved",
    });
    setSavedResume(saved);
    setStep(4);
    queryClient.invalidateQueries();
  };

  const exportResume = async () => {
    if (!resume || !profile || !job) return;
    const issues = validateResumeClaims({ resume, facts, items, skills, profile });
    if (hasBlockingValidationErrors(issues)) {
      setError("Resolve validation errors before exporting.");
      return;
    }
    const compacted = compactResumeForOnePage(resume);
    const bytes = await renderResumePdfBytes(compacted);
    const actualPages = await countPdfPages(bytes);
    if (actualPages !== 1) {
      setError("PDF still exceeds one page after deterministic compaction. Edit content before export.");
      return;
    }
    const path = await save({
      defaultPath: defaultResumeFilename(
        job.company || (analysis?.inferredCompany ?? ""),
        job.roleTitle || (analysis?.inferredRoleTitle ?? ""),
      ),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!path) return;
    await invoke("write_pdf_file", { path, bytes: Array.from(bytes) });
    const next = await repository.saveResumeVersion({
      id: savedResume?.id,
      jobId: job.id,
      name: savedResume?.name ?? `${job.company} - ${job.roleTitle}`,
      templateId: savedResume?.templateId ?? "ats-one-page",
      contentJson: compacted,
      validationJson: issues,
      status: "exported",
      lastExportPath: path,
    });
    setSavedResume(next);
    setResume(compacted);
    queryClient.invalidateQueries();
  };

  if (
    profileQuery.isLoading ||
    itemsQuery.isLoading ||
    factsQuery.isLoading ||
    skillsQuery.isLoading ||
    settingsQuery.isLoading
  ) {
    return <LoadingState label="Loading tailoring workspace..." />;
  }
  if (profileQuery.isError) throw profileQuery.error;
  if (itemsQuery.isError) throw itemsQuery.error;
  if (factsQuery.isError) throw factsQuery.error;
  if (skillsQuery.isError) throw skillsQuery.error;
  if (settingsQuery.isError) throw settingsQuery.error;

  return (
    <div>
      <PageHeader eyebrow="Evidence-grounded workflow" title="Tailor Resume" actions={<StepIndicator step={step} />} />
      <div className="space-y-5 p-8">
        {error ? <InlineError message={error} /> : null}

        {step === 1 ? (
          <form className="panel space-y-4 p-5" onSubmit={form.handleSubmit((values) => analyzeMutation.mutate(values))}>
            <div className="grid grid-cols-3 gap-3">
              <label className="text-sm font-semibold text-slate-700">
                Company
                <input className="field mt-1" {...form.register("company")} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Role title
                <input className="field mt-1" {...form.register("roleTitle")} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Job URL
                <input className="field mt-1" {...form.register("sourceUrl")} />
              </label>
            </div>
            <label className="block text-sm font-semibold text-slate-700">
              Full job description
              <textarea className="field mt-1 min-h-72" {...form.register("rawDescription")} />
            </label>
            {form.formState.errors.rawDescription ? (
              <p className="text-sm font-semibold text-red-700">
                {form.formState.errors.rawDescription.message}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button className="button" type="button" onClick={() => form.reset(sampleJob)}>
                Use sample job
              </button>
              <button className="button button-primary" type="submit" disabled={analyzeMutation.isPending}>
                <Sparkles size={16} aria-hidden="true" />
                Analyze job
              </button>
            </div>
          </form>
        ) : null}

        {step === 2 && analysis ? (
          <div className="grid grid-cols-[1fr_320px] gap-5">
            <section className="panel p-5">
              <h3 className="text-lg font-semibold text-slate-950">Job analysis</h3>
              <p className="mt-2 text-sm leading-6 text-slate-700">{analysis.summary}</p>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Required skills
                  </p>
                  <div className="mt-2">
                    <TagList tags={analysis.requiredSkills} tone="blue" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Role categories
                  </p>
                  <div className="mt-2">
                    <TagList tags={analysis.roleCategories} />
                  </div>
                </div>
              </div>
            </section>
            <aside className="panel p-5">
              <p className="text-sm font-semibold text-slate-950">Provider</p>
              <p className="mt-1 text-sm text-slate-600">
                {settings?.aiProvider ?? "mock"} | {settings?.modelName}
              </p>
              <button className="button button-primary mt-5 w-full" type="button" onClick={() => setStep(3)}>
                Score evidence
              </button>
            </aside>
          </div>
        ) : null}

        {step === 3 && analysis ? (
          <div className="grid grid-cols-[1fr_320px] gap-5">
            <section>
              <EvidenceTable
                evidence={evidence}
                overrides={overrides}
                onToggle={(factId, included) => setOverrides((current) => ({ ...current, [factId]: included }))}
              />
            </section>
            <aside className="panel h-fit p-5">
              <h3 className="text-lg font-semibold text-slate-950">Resume plan</h3>
              <p className="mt-2 text-sm text-slate-600">
                {selectedEvidence.length} facts selected from {evidence.length} eligible facts.
              </p>
              <button
                className="button button-primary mt-5 w-full"
                type="button"
                onClick={() => void generateResume()}
                disabled={selectedEvidence.length === 0}
              >
                Generate resume
              </button>
            </aside>
          </div>
        ) : null}

        {step === 4 && resume ? (
          <div className="grid grid-cols-[minmax(0,1fr)_740px] gap-5">
            <section className="space-y-4">
              <div className="panel flex items-center justify-between p-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">Resume editor</h3>
                  <p className="text-sm text-slate-500">
                    {savedResume ? `Saved as ${savedResume.name}` : "Draft not saved yet"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="button" type="button" onClick={undo} disabled={history.length === 0}>
                    <Undo2 size={15} aria-hidden="true" />
                    Undo
                  </button>
                  <button className="button button-primary" type="button" onClick={() => void exportResume()}>
                    <FileDown size={15} aria-hidden="true" />
                    Export PDF
                  </button>
                </div>
              </div>
              {validationIssues.length ? (
                <div className="panel p-4">
                  <h4 className="font-semibold text-slate-950">Validation issues</h4>
                  <div className="mt-3 space-y-2">
                    {validationIssues.map((issue, index) => (
                      <div
                        key={`${issue.message}-${index}`}
                        className={[
                          "rounded border px-3 py-2 text-sm",
                          issue.severity === "error"
                            ? "border-red-200 bg-red-50 text-red-800"
                            : "border-amber-200 bg-amber-50 text-amber-800",
                        ].join(" ")}
                      >
                        {issue.message}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {[...resume.projects, ...resume.experience].map((section) => (
                <div key={section.careerItemId} className="panel p-4">
                  <h4 className="font-semibold text-slate-950">{section.title}</h4>
                  <div className="mt-3 space-y-3">
                    {section.bullets.map((bullet) => (
                      <div key={bullet.id} className="rounded-md border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={bullet.included}
                              onChange={() => toggleBullet(bullet.id)}
                            />
                            Included
                          </label>
                          <div className="flex gap-1">
                            <button className="button" type="button" onClick={() => moveBullet(bullet.id, -1)}>
                              <ArrowUp size={14} aria-hidden="true" />
                            </button>
                            <button className="button" type="button" onClick={() => moveBullet(bullet.id, 1)}>
                              <ArrowDown size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <textarea
                          className="field mt-2 min-h-20"
                          value={bullet.text}
                          onChange={(event) => updateBullet(bullet.id, event.target.value)}
                        />
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          Source facts: {bullet.sourceFactIds.join(", ")}. {bullet.selectionReason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
            <aside className="sticky top-0 h-screen overflow-auto border-l border-slate-200 bg-slate-100 p-5">
              <ResumePreview resume={resume} validationIssues={validationIssues} pageCount={pageCount} />
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}
