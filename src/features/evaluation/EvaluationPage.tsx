import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, GitCompare, Play, Save, ShieldCheck } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, InlineError, LoadingState } from "../../components/States";
import { useRepository } from "../../lib/database/repositoryContext";
import { compareGenerationResults } from "../../lib/evaluation/comparison";
import { EVALUATION_FIXTURES } from "../../lib/evaluation/fixtures";
import { runEvaluationFixture, type EvaluationRunResult } from "../../lib/evaluation/runner";
import type { EvaluationMode } from "../../types/domain";

export function EvaluationPage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<EvaluationMode | "">("");
  const [error, setError] = useState("");
  const [runs, setRuns] = useState<EvaluationRunResult[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => repository.getProfile() });
  const items = useQuery({ queryKey: ["career-items"], queryFn: () => repository.listCareerItems() });
  const facts = useQuery({ queryKey: ["career-facts"], queryFn: () => repository.listCareerFacts() });
  const skills = useQuery({ queryKey: ["skills"], queryFn: () => repository.listSkills() });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => repository.getSettings() });
  const saved = useQuery({ queryKey: ["evaluation-summaries"], queryFn: () => repository.listEvaluationSummaries() });
  const comparedRuns = useMemo(
    () => selected.map((id) => runs.find((run) => run.summary.id === id)).filter(Boolean) as EvaluationRunResult[],
    [runs, selected],
  );
  const comparison = useMemo(() => {
    const [left, right] = comparedRuns;
    return left && right ? compareGenerationResults(left.summary, left.resume, right.summary, right.resume) : null;
  }, [comparedRuns]);

  if ([profile, items, facts, skills, settings, saved].some((query) => query.isLoading)) {
    return <LoadingState label="Loading evaluation fixtures..." />;
  }
  const loadedProfile = profile.data;
  if (!loadedProfile) {
    return (
      <div>
        <PageHeader eyebrow="Repeatable generation QA" title="Evaluation Lab" />
        <div className="p-8">
          <EmptyState
            title="Set up Career Memory first"
            body="Evaluation fixtures need a candidate profile, career items, facts, and skills. Load the sample profile or add career memory before running ranking, mock, or live OpenAI evaluations."
            action={<Link className="button button-primary" to="/career-memory">Open Career Memory</Link>}
          />
        </div>
      </div>
    );
  }

  const runSuite = async (mode: EvaluationMode) => {
    if (mode === "openai" && !window.confirm("Live evaluation makes multiple paid OpenAI API requests. Continue?")) return;
    setRunning(mode);
    setError("");
    try {
      const next: EvaluationRunResult[] = [];
      for (const fixture of EVALUATION_FIXTURES) {
        const result = await runEvaluationFixture({
          fixture,
          mode,
          profile: loadedProfile,
          items: items.data ?? [],
          facts: facts.data ?? [],
          skills: skills.data ?? [],
          settings: settings.data!,
        });
        await repository.saveEvaluationSummary(result.summary);
        next.push(result);
      }
      setRuns((current) => [...next, ...current]);
      await queryClient.invalidateQueries({ queryKey: ["evaluation-summaries"] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning("");
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Repeatable generation QA" title="Evaluation Lab" />
      <div className="space-y-5 p-8">
        {error ? <InlineError message={error} /> : null}
        <section className="panel flex flex-wrap items-center gap-3 p-5">
          <div className="mr-auto"><h3 className="text-lg font-semibold text-slate-950">Six role fixtures</h3><p className="mt-1 text-sm text-slate-600">Objective checks only. No invented ATS score and no automatic model winner.</p></div>
          <button className="button" type="button" disabled={Boolean(running)} onClick={() => void runSuite("ranking")}><ShieldCheck size={16} />{running === "ranking" ? "Running..." : "Ranking only"}</button>
          <button className="button button-primary" type="button" disabled={Boolean(running)} onClick={() => void runSuite("mock")}><Play size={16} />{running === "mock" ? "Running..." : "Mock suite"}</button>
          <button className="button" type="button" disabled={Boolean(running)} onClick={() => void runSuite("openai")}><Play size={16} />{running === "openai" ? "Running paid suite..." : "Live OpenAI suite"}</button>
        </section>

        <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 uppercase text-slate-500"><tr><th className="px-3 py-3">Compare</th><th className="px-3 py-3">Fixture</th><th className="px-3 py-3">Configuration</th><th className="px-3 py-3">Projects</th><th className="px-3 py-3">Skills</th><th className="px-3 py-3">Safety</th><th className="px-3 py-3">Fit / time</th><th className="px-3 py-3">Actions</th></tr></thead>
            <tbody>{runs.map((run) => {
              const metrics = run.summary.metrics;
              return <tr key={run.summary.id} className="border-b border-slate-100 align-top last:border-0">
                <td className="px-3 py-3"><input type="checkbox" aria-label={`Compare ${run.summary.fixtureName}`} checked={selected.includes(run.summary.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, run.summary.id].slice(-2) : current.filter((id) => id !== run.summary.id))} /></td>
                <td className="px-3 py-3"><p className="font-semibold text-slate-900">{run.summary.fixtureName}</p><p className="text-slate-500">{run.summary.mode}</p></td>
                <td className="px-3 py-3"><p>{run.summary.provider} | {run.summary.model}</p><p>{run.summary.roleProfileId}</p><p>{run.summary.templateId}</p></td>
                <td className="px-3 py-3"><p className="text-emerald-700">Expected {metrics.expectedProjectsSelected.length}</p><p className={metrics.unexpectedProjectsSelected.length ? "text-red-700" : "text-slate-500"}>Unexpected {metrics.unexpectedProjectsSelected.length}</p></td>
                <td className="px-3 py-3"><p>{metrics.requiredSkillsRepresented.length} represented</p><p className={metrics.missingRequiredSkills.length ? "text-amber-700" : "text-slate-500"}>{metrics.missingRequiredSkills.length} missing</p></td>
                <td className="px-3 py-3"><p className={metrics.unsupportedClaims ? "text-red-700" : "text-emerald-700"}>{metrics.unsupportedClaims} unsupported claims</p><p>{metrics.unsupportedNumbers} unsupported numbers</p><p>{metrics.duplicateBullets} duplicates</p></td>
                <td className="px-3 py-3"><p>{metrics.onePageSuccess ? "One page" : "Over one page"}</p><p>{metrics.durationMs} ms</p><p>{metrics.totalTokens ?? "-"} tokens</p></td>
                <td className="px-3 py-3"><div className="flex gap-2"><button className="icon-button" title="Mark preferred" type="button" onClick={async () => { await repository.markEvaluationPreferred(run.summary.id); await queryClient.invalidateQueries({ queryKey: ["evaluation-summaries"] }); }}><Check size={15} /></button><button className="icon-button" title="Save included bullets as approved variants" type="button" onClick={async () => { const fixture = EVALUATION_FIXTURES.find((item) => item.id === run.summary.fixtureId); for (const section of [...run.resume.projects, ...run.resume.experience]) for (const bullet of section.bullets.filter((item) => item.included)) await repository.saveApprovedBulletVariant({ careerItemId: section.careerItemId, sourceFactIds: bullet.sourceFactIds, text: bullet.text, roleCategories: fixture?.expectedRoleCategories ?? [], creationSource: bullet.generationSource }); }}><Save size={15} /></button></div></td>
              </tr>;
            })}</tbody>
          </table>
          {!runs.length ? <p className="p-8 text-center text-sm text-slate-500">Run ranking-only or mock evaluation to populate this session.</p> : null}
        </section>

        {comparison ? <section className="panel p-5">
          <div className="flex items-center gap-2"><GitCompare size={18} /><h3 className="text-lg font-semibold text-slate-950">Generation comparison</h3></div>
          <p className="mt-1 text-sm text-slate-500">Review objective differences and choose a preferred result yourself.</p>
          <div className="mt-4 grid grid-cols-2 gap-6">
            {comparedRuns.map((run, index) => {
              const metrics = run.summary.metrics;
              const bullets = [...run.resume.projects, ...run.resume.experience].flatMap((section) => section.bullets.filter((bullet) => bullet.included));
              return <div key={run.summary.id} className="space-y-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
                <div><p className="text-sm font-semibold text-slate-950">{index === 0 ? "Left" : "Right"}: {run.summary.fixtureName}</p><p>{run.summary.provider} | {run.summary.model}</p><p>{run.summary.roleProfileId} | {run.summary.templateId}</p><p>{Object.values(run.summary.promptVersions).join(" | ")}</p></div>
                <div><p className="font-semibold text-slate-800">Career items</p><p>{run.summary.selectedCareerItemIds.join(", ") || "None"}</p></div>
                <details><summary className="cursor-pointer font-semibold text-slate-800">Evidence facts ({run.summary.selectedFactIds.length})</summary><p className="mt-1 break-words">{run.summary.selectedFactIds.join(", ")}</p></details>
                <div><p className="font-semibold text-slate-800">Bullets ({bullets.length})</p>{bullets.map((bullet) => <p key={bullet.id} className="mt-1">{bullet.text}</p>)}</div>
                <div><p className="font-semibold text-slate-800">Validation</p><p>{run.summary.validationIssues.length ? run.summary.validationIssues.map((issue) => issue.message).join(" | ") : "No issues"}</p></div>
                <div><p className="font-semibold text-slate-800">Required skills represented</p><p>{metrics.requiredSkillsRepresented.join(", ") || "None"}</p></div>
                <p>{metrics.onePageSuccess ? "One page" : "Over one page"} | {metrics.totalTokens ?? "unreported"} tokens | {metrics.durationMs} ms</p>
              </div>;
            })}
          </div>
          <div className="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-600">
            <p>{comparison.semanticDifferences.length} semantic differences | {comparison.careerItemDifferences.length} career-item differences | {comparison.factDifferences.length} fact differences</p>
            <div className="mt-3 max-h-64 space-y-2 overflow-auto">
              {comparison.semanticDifferences.map((difference, index) => <div key={`${difference.category}-${index}`} className="border-b border-slate-100 pb-2 text-xs"><p className="font-semibold uppercase text-slate-700">{difference.category.replaceAll("_", " ")}</p>{difference.before ? <p>Left: {difference.before}</p> : null}{difference.after ? <p>Right: {difference.after}</p> : null}</div>)}
            </div>
          </div>
        </section> : null}

        <p className="text-xs text-slate-500">{saved.data?.length ?? 0} safe evaluation summaries are stored locally. Raw prompts, job text, API keys, and resume content are not stored in summaries.</p>
      </div>
    </div>
  );
}
