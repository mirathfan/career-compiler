import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, FileText, ListChecks, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, LoadingState } from "../../components/States";
import { useRepository } from "../../lib/database/RepositoryProvider";

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <Icon size={18} className="text-slate-400" aria-hidden="true" />
      </div>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

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

  return (
    <div>
      <PageHeader
        eyebrow="Local overview"
        title="Dashboard"
        actions={
          <Link to="/tailor" className="button button-primary">
            <Sparkles size={16} aria-hidden="true" />
            Tailor new resume
          </Link>
        }
      />
      <div className="space-y-6 p-8">
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Career facts" value={data.careerFacts} icon={Database} />
          <StatCard label="Needs review" value={data.factsNeedingReview} icon={ListChecks} />
          <StatCard label="Saved jobs" value={data.savedJobs} icon={FileText} />
          <StatCard label="Resume versions" value={data.resumeVersions} icon={Sparkles} />
        </div>

        {data.careerFacts === 0 ? (
          <EmptyState
            title="No career memory yet"
            body="Seed Mir's editable profile, projects, facts, and skills to start compiling evidence-grounded resumes."
            action={
              <button className="button button-primary" type="button" onClick={() => seed.mutate()}>
                Run safe seed
              </button>
            }
          />
        ) : null}

        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-950">Recently generated resumes</h3>
            <Link className="text-sm font-semibold text-blue-700" to="/library">
              Open library
            </Link>
          </div>
          {data.recentResumes.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">No resume versions have been generated yet.</p>
          ) : (
            <div className="mt-4 divide-y divide-slate-200">
              {data.recentResumes.map((resume) => (
                <div key={resume.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-semibold text-slate-950">{resume.name}</p>
                    <p className="text-slate-500">{new Date(resume.createdAt).toLocaleString()}</p>
                  </div>
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                    {resume.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
