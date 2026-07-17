import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, CheckCircle2, Database, FileText, Globe, ListChecks, LockKeyhole, Sparkles } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, LoadingState } from "../../components/States";
import { AlertBanner, Badge, PageSection, ProgressChecklist, StatCard } from "../../components/ui";
import { useRepository } from "../../lib/database/repositoryContext";

const setupSteps = [
  {
    label: "Import or create candidate profile",
    detail: "Add the profile, projects, education, skills, and source facts CareerCompiler may use.",
    to: "/career-memory?intake=1",
    action: "Start intake",
    icon: Database,
  },
  {
    label: "Confirm sensitive application answers",
    detail: "Lock work authorization, sponsorship, salary, availability, travel, and voluntary answers before reuse.",
    to: "/candidate-brain?tab=sensitive",
    action: "Review sensitive answers",
    icon: LockKeyhole,
  },
  {
    label: "Add or import a resume",
    detail: "Generate a first grounded version or keep a known-good base resume for future tailoring.",
    to: "/tailor",
    action: "Prepare resume",
    icon: FileText,
  },
  {
    label: "Connect browser extension",
    detail: "Pair the local desktop app with the browser extension when you are ready to fill forms.",
    to: "/browser-extension",
    action: "Open setup",
    icon: Globe,
  },
  {
    label: "Add first job",
    detail: "Paste a job description or use the extension to capture the role.",
    to: "/tailor",
    action: "Add job",
    icon: Sparkles,
  },
  {
    label: "Prepare first application",
    detail: "Review generated answers and keep final submission manual.",
    to: "/applications",
    action: "Open applications",
    icon: ListChecks,
  },
];

export function DashboardPage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const metrics = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => repository.getDashboardMetrics(),
  });
  const seed = useMutation({
    mutationFn: () => repository.seedSampleData(),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  if (metrics.isLoading) return <LoadingState label="Loading dashboard..." />;
  if (metrics.isError) throw metrics.error;

  const data = metrics.data ?? {
    careerFacts: 0,
    factsNeedingReview: 0,
    savedJobs: 0,
    resumeVersions: 0,
    recentResumes: [],
  };
  const firstRun = data.careerFacts === 0;
  const setupChecklist = setupSteps.map((step, index) => ({
    label: step.label,
    detail: step.detail,
    complete:
      index === 0
        ? data.careerFacts > 0
        : index === 2
          ? data.resumeVersions > 0
          : index === 4
            ? data.savedJobs > 0
            : false,
    warning: index === 1 || index === 3 || index === 5,
  }));
  const nextAction = data.factsNeedingReview
    ? {
        title: "Review evidence before generating resumes",
        body: `${data.factsNeedingReview} career facts need review. Clear these before relying on them in applications.`,
        to: "/career-memory",
        label: "Open review queue",
      }
    : data.savedJobs === 0
      ? {
          title: "Add a job to tailor against",
          body: "Paste a job description so CareerCompiler can score evidence and prepare a grounded resume.",
          to: "/tailor",
          label: "Add job",
        }
      : data.resumeVersions === 0
        ? {
            title: "Generate your first tailored resume",
            body: "Use a saved job and reviewed evidence to create a draft with source-backed bullets.",
            to: "/tailor",
            label: "Start tailoring",
          }
        : {
            title: "Review applications ready for action",
            body: "Keep submissions manual while CareerCompiler helps track answers, resumes, and next steps.",
            to: "/applications",
            label: "Open applications",
          };

  return (
    <div>
      <PageHeader
        eyebrow="Home"
        title="Today in CareerCompiler"
        description="A calm view of what is ready, what needs review, and the safest next step in your job-search workflow."
        actions={
          <Link to="/tailor" className="button button-primary">
            <Sparkles size={16} aria-hidden="true" />
            Start tailoring
          </Link>
        }
      />
      <div className="page-body space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Career facts" value={data.careerFacts} icon={Database} detail="Evidence available for grounded resumes" />
          <StatCard label="Needs review" value={data.factsNeedingReview} icon={ListChecks} tone={data.factsNeedingReview ? "amber" : "emerald"} detail="Facts blocked from confident reuse" />
          <StatCard label="Saved jobs" value={data.savedJobs} icon={FileText} detail="Roles available for tailoring" />
          <StatCard label="Resume versions" value={data.resumeVersions} icon={BookOpenCheck} detail="Drafts, approvals, and exports" />
        </div>

        {firstRun ? (
          <>
            <PageSection
              title="Set up your local career workspace"
              description="CareerCompiler works best after you add reviewed source material and lock sensitive application answers. Nothing is submitted automatically."
              actions={
                <Link to="/career-memory?intake=1" className="button button-primary">
                  <Sparkles size={15} aria-hidden="true" />
                  Start guided intake
                </Link>
              }
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="grid gap-3 md:grid-cols-2">
                  {setupSteps.map((step, index) => {
                    const Icon = step.icon;
                    return (
                      <div key={step.label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start gap-3">
                          <div className="grid size-9 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-blue-800">
                            <Icon aria-hidden="true" size={17} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={index === 0 ? "blue" : "slate"}>{index + 1}</Badge>
                              <h4 className="font-semibold text-slate-950">{step.label}</h4>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{step.detail}</p>
                            <Link className="button mt-3" to={step.to}>
                              {step.action}
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-4">
                  <AlertBanner tone="blue" title="Your data stays local by default">
                    OpenAI and browser-extension actions are explicit. Clipboard jobs remain drafts until you save them.
                  </AlertBanner>
                  <details open className="panel-muted p-4 text-sm text-slate-600">
                    <summary className="cursor-pointer font-semibold text-slate-800">Development sample data</summary>
                    <p className="mt-2 leading-6">
                      Use sanitized sample records for testing layouts and workflows. This is not the recommended first step for a real profile.
                    </p>
                    <button className="button mt-3" type="button" onClick={() => seed.mutate()} disabled={seed.isPending}>
                      Run safe seed
                    </button>
                  </details>
                </div>
              </div>
            </PageSection>
            <EmptyState
              title="No career evidence has been saved yet"
              body="Start with guided intake or add a project, employment record, education item, and a few source-backed facts."
            />
          </>
        ) : (
          <>
            <PageSection
              title={nextAction.title}
              description={nextAction.body}
              actions={<Link className="button button-primary" to={nextAction.to}>{nextAction.label}</Link>}
            >
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge tone="emerald" icon={CheckCircle2}>profile active</Badge>
                    <Badge tone={data.factsNeedingReview ? "amber" : "emerald"}>
                      {data.factsNeedingReview ? `${data.factsNeedingReview} review items` : "evidence review clear"}
                    </Badge>
                  </div>
                  <p className="max-w-3xl text-sm leading-6 text-slate-600">
                    Keep the daily loop tight: review evidence, tailor for one job, approve generated bullets, then use Applications to track manual submission and follow-up.
                  </p>
                </div>
                <ProgressChecklist items={setupChecklist} />
              </div>
            </PageSection>

            <PageSection
              title="Recently generated resumes"
              description="Drafts stay local until you export. Use the library to compare, duplicate, or reuse a version as a base."
              actions={<Link className="button" to="/library">Open library</Link>}
            >
              {data.recentResumes.length === 0 ? (
                <p className="text-sm text-slate-600">No resume versions have been generated yet.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {data.recentResumes.map((resume) => (
                    <div key={resume.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-950">{resume.name}</p>
                          <p className="mt-1 text-slate-500">{new Date(resume.createdAt).toLocaleString()}</p>
                        </div>
                        <Badge tone={resume.status === "draft" ? "amber" : "emerald"}>{resume.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PageSection>
          </>
        )}
      </div>
    </div>
  );
}
