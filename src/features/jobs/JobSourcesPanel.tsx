import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCcw, CheckCircle2 } from "lucide-react";
import { useRepository } from "../../lib/database/repositoryContext";
import { runJobAutomation } from "../../lib/job-automation/runner";
import { InlineError, LoadingState } from "../../components/States";
import { JobRadarPage } from "../job-radar/JobRadarPage";
import { parseCareerBoard } from "../../lib/jobs/sources";

export function JobSourcesPanel() {
  const repo = useRepository();
  const client = useQueryClient();
  const [company, setCompany] = useState("");
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const sources = useQuery({ queryKey: ["job-sources"], queryFn: () => repo.listJobSources() });
  const add = useMutation({ mutationFn: async () => {
    const board = parseCareerBoard(url);
    if (!company.trim()) throw new Error("Add a company name.");
    if (sources.data?.some((source) => source.sourceType === board.sourceType && source.sourceIdentifier.toLowerCase() === board.sourceIdentifier.toLowerCase())) throw new Error("This company board is already in your sources.");
    return repo.saveJobSource({ ...board, name: company.trim(), companyName: company.trim() });
  }, onSuccess: () => { setUrl(""); setCompany(""); setMessage("Company added. Search when you’re ready."); client.invalidateQueries({ queryKey: ["job-sources"] }); } });
  const search = useMutation({ mutationFn: () => runJobAutomation(repo), onSuccess: (run) => { setMessage(run.summary.message); client.invalidateQueries(); } });
  if (sources.isLoading) return <LoadingState label="Loading your companies…" />;
  if (sources.isError) throw sources.error;
  return <div className="sources-layout"><section className="surface-section"><span className="section-kicker">Your job collection</span><h2>Follow companies you care about</h2><p className="muted-copy">CareerCompiler reads the public career boards you choose. Add a Greenhouse, Lever, or Ashby board, then search for roles.</p>
    <form className="source-form" onSubmit={(event) => { event.preventDefault(); add.mutate(); }}><label>Company<input className="field" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Company name" required /></label><label>Career board URL<input className="field" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://jobs.ashbyhq.com/company" required /></label><button className="button button-primary" type="submit" disabled={add.isPending}><Plus size={15} aria-hidden="true" />{add.isPending ? "Adding…" : "Add company"}</button></form>
    {add.error || search.error ? <InlineError message={(add.error ?? search.error)!.message} /> : null}
    <div className="company-source-list">{sources.data?.map((source) => <div key={source.id}><span className="company-avatar" aria-hidden="true">{source.companyName.slice(0, 1)}</span><div><strong>{source.companyName}</strong><p>{source.sourceType} · {source.enabled ? "Included in search" : "Paused"}</p>{source.lastError ? <p className="warning-copy">Last search could not reach this board. See advanced source settings.</p> : null}</div>{source.lastSuccessAt ? <CheckCircle2 size={16} aria-label="Previously fetched successfully" className="success-copy" /> : null}</div>)}</div>
    <div className="action-row"><button className="button button-primary" type="button" disabled={search.isPending || !sources.data?.some((source) => source.enabled)} onClick={() => search.mutate()}><RefreshCcw size={15} aria-hidden="true" />{search.isPending ? "Checking career boards…" : "Find jobs from these companies"}</button><span className="field-hint">This search makes no paid AI requests.</span></div>
    {message ? <p role="status" className="inline-notice">{message}</p> : null}
  </section><details className="surface-section"><summary>Advanced source and matching settings</summary><div className="embedded-workspace"><JobRadarPage embedded /></div></details></div>;
}
