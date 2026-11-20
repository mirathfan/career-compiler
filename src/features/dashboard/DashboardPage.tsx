import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bot, Database, FileText, Globe, ListChecks, LockKeyhole, Sparkles } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState } from "../../components/States";
import { Badge, PageSection } from "../../components/ui";
import { useRepository } from "../../lib/database/repositoryContext";
import { loadDashboardReadiness } from "../../lib/dashboard/readiness";
import { jobLink, loadWorkspaceSummary, localDay } from "../../lib/dashboard/workspace";
import { ActivityList } from "../activity/ActivityList";

const setupSteps = [
  {
    label: "Import or create candidate profile",
    detail: "Add the profile, projects, education, skills, and source facts CareerCompiler may use.",
    to: "/career-memory?intake=1",
    action: "Start guided intake",
    icon: Database,
  },
  {
    label: "Lock saved sensitive answers",
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
  const today = localDay();
  const summary = useQuery({ queryKey: ["dashboard", "workspace", today], queryFn: () => loadWorkspaceSummary(repository, today) });
  const readiness = useQuery({ queryKey: ["dashboard-readiness"], queryFn: () => loadDashboardReadiness(repository), refetchOnWindowFocus: true });
  const seed = useMutation({ mutationFn: () => repository.seedSampleData(), onSuccess: () => queryClient.invalidateQueries() });
  if (summary.isLoading) return <LoadingState label="Opening your workspace…" />;
  if (summary.isError) throw summary.error;
  if (!summary.data) return null;
  const data = summary.data;
  const firstRun = data.metrics.careerFacts === 0;
  const counts = [
    { label: "Draft applications", value: data.draftApplications, to: "/applications", detail: "Preparing · ready to continue" },
    { label: "Follow-ups due", value: data.dueFollowUps, to: "/applications?followUps=due", detail: `${data.upcomingFollowUps} upcoming · your saved dates` },
    { label: "Saved jobs", value: data.savedJobs.length, to: "/jobs?view=saved", detail: "Saved or in preparation" },
    { label: "Draft resumes", value: data.draftResumes, to: "/library", detail: "Unarchived drafts to review" },
  ];
  return <div className="home-page">
    <PageHeader eyebrow="Home" title="Your Workspace" description="Pick up where you left off. Your opportunities, applications, and evidence, together."
      actions={<Link className="button button-primary" to="/jobs">Explore jobs <ArrowRight size={15} aria-hidden="true" /></Link>} />
    <div className="page-body space-y-5">
      <div className="workspace-summary" aria-label="Workspace summary">{counts.map(count => <Link className="workspace-stat" key={count.label} to={count.to} aria-label={`${count.label}: ${count.value}. ${count.detail}`}>
        <span>{count.label}</span><strong>{count.value}</strong><small>{count.detail}</small>
      </Link>)}</div>
      {firstRun ? <section className="home-welcome" aria-labelledby="welcome-title">
        <div><span className="section-kicker">Start with your experience</span><h2 id="welcome-title">Make this workspace yours.</h2><p>Add your profile and review the evidence your resumes can use. You can explore jobs along the way.</p></div>
        <Link className="button button-primary" to={setupSteps[0].to}>Start guided intake <ArrowRight size={15} aria-hidden="true" /></Link>
      </section> : null}
      <div className="home-columns">
        <div className="space-y-5">
          <PageSection title="Next actions" description="Saved follow-up dates first, then application drafts, resume drafts, and evidence reviews.">
            {data.actions.length ? <ol className="workspace-record-list">{data.actions.slice(0, 6).map(action => <li key={action.id}><Link className="workspace-action" to={action.to}>
              <span className="min-w-0"><span className="block font-semibold">{action.title}</span><span className="workspace-record-detail block">{action.detail}</span></span><ArrowRight size={16} aria-hidden="true" />
            </Link></li>)}</ol> : <p className="workspace-empty">Nothing waiting on a recorded review or follow-up. Save an opportunity or add evidence when you are ready.</p>}
            {data.actions.length > 6 ? <p className="workspace-record-detail mt-3">Showing the first 6 of {data.actions.length} actions. Open Applications, Résumés, or Profile for the full queues.</p> : null}
          </PageSection>
          <PageSection title="Opportunities you're considering" description="Your saved roles, with direct access to each job workspace." actions={<Link className="text-link" to="/jobs?view=saved">All saved jobs <ArrowRight size={14} aria-hidden="true" /></Link>}>
            {data.savedJobs.length ? <ul className="workspace-record-list">{data.savedJobs.slice(0, 4).map(job => <li key={job.id}><Link className="workspace-action" to={jobLink(job.id)}>
              <span className="min-w-0"><span className="block font-semibold">{job.roleTitle || "Role not recorded"}</span><span className="workspace-record-detail block">{job.company || "Company not recorded"}{job.location ? ` · ${job.location}` : ""}</span></span><ArrowRight size={16} aria-hidden="true" />
            </Link></li>)}</ul> : <p className="workspace-empty">No saved opportunities yet. Save a role from Jobs to keep it here.</p>}
          </PageSection>
        </div>
        <div className="space-y-5">
          <section className="home-copilot panel p-5" aria-labelledby="home-ai-title">
            <Bot size={22} aria-hidden="true" /><h2 id="home-ai-title">Career AI</h2><p className="workspace-record-detail">Open Career Copilot to ask about saved records, inspect citations, and review proposed changes.</p>
            <Link className="button mt-4" to="/copilot">Open Career Copilot <ArrowRight size={15} aria-hidden="true" /></Link>
            <p className="workspace-record-date mt-3">Your existing conversations are there when you need them.</p>
          </section>
          <PageSection title="Recent activity" actions={<Link className="text-link" to="/activity">View all</Link>}><ActivityList events={data.activity.slice(0, 4)} /></PageSection>
        </div>
      </div>
      <details className="panel p-5"><summary className="cursor-pointer text-sm font-semibold">{firstRun ? "Later setup steps" : "Workspace setup & tools"}</summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2">{setupSteps.slice(firstRun ? 1 : 0).map((step, index) => {
          const stepIndex = index + (firstRun ? 1 : 0);
          const status = stepIndex === 1 ? readiness.data?.[0] : stepIndex === 3 ? readiness.data?.[1] : stepIndex === 5 ? readiness.data?.[2] : undefined;
          const Icon = step.icon;
          return <Link key={step.label} className="workflow-card" to={step.to}><Icon size={18} aria-hidden="true" /><span className="min-w-0"><span className="block font-semibold">{stepIndex === 0 ? "Add career evidence" : stepIndex === 3 && !firstRun ? "Connect your browser" : step.action}</span><span className="workspace-record-detail block">{step.detail}</span>{status ? <Badge tone={status.warning ? "amber" : "slate"}>{status.statusLabel}</Badge> : null}</span></Link>;
        })}</div>
      </details>
      <details className="panel-muted p-4 text-sm"><summary className="cursor-pointer font-semibold">Development sample data</summary><p className="workspace-record-detail mt-2">Add sanitized sample records for development. For your own workspace, start with guided intake.</p><button className="button mt-3" onClick={() => seed.mutate()} disabled={seed.isPending}>Run safe seed</button>{seed.isError ? <p role="alert">Sample data could not be added.</p> : null}</details>
    </div>
  </div>;
}
