import { IntelligenceReport } from "../../lib/copilot/workspaceIntelligence";

export function IntelligenceResponse({ value }: { value: unknown }) {
  const parsed = IntelligenceReport.safeParse(value);
  if (!parsed.success) return <p role="alert">This saved comparison is unavailable. Review fresh records.</p>;
  const result = parsed.data;
  return <section aria-label="Deterministic career comparison" className="mt-3 min-w-0 space-y-3 [overflow-wrap:anywhere]">
    <p className="font-semibold">Computed locally from permitted evidence</p>
    {result.kind === "jobs" ? <>
      <p className="text-xs">{result.ordering}</p>
      <ol className="space-y-4">{result.jobs.map(job => <li key={job.id}>
        <h3 className="font-semibold">{job.rank}. {job.label}</h3>
        <p>Existing fit score: {job.score ?? "insufficient evidence"} · Preference priority: {job.priority ?? "unknown"}</p>
        <p>Eligibility: {job.eligibility}. {job.sponsorship}</p>
        <p>{job.application}</p><p>{job.recommendation}</p>
        <details><summary className="cursor-pointer font-semibold">Evidence, gaps and confidence</summary>
          <p>{job.confidence}</p><p>{job.freshness}</p>
          {job.duplicateOf ? <p>Possible duplicate of selected job {job.duplicateOf}; identities have not been merged.</p> : null}
          <ul>{job.reasons.map(reason => <li key={reason.id} className="mt-2"><strong>{reason.dimension} · {reason.status}</strong>: {reason.text}</li>)}</ul>
          {job.preferenceReasons.map(reason => <p key={reason}>{reason}</p>)}
        </details>
      </li>)}</ol>
    </> : <>
      <h3 className="font-semibold">Existing versions for {result.jobLabel}</h3>
      <p>{result.conclusion}</p>
      {result.versions.length ? result.versions.map(version => <details key={version.id} open={version.id === result.recommendedId}>
        <summary className="cursor-pointer font-semibold">{version.id === result.recommendedId ? "Recommended: " : "Alternative: "}{version.label}</summary>
        <p>Exact version: {version.id} · {version.kind}</p>
        <p>{version.supportedBullets} validated included bullets; {version.excludedBullets} excluded; {version.validationErrors} validation errors.</p>
        <p>Supported requirements: {version.matches.join("; ") || "None established"}</p>
        <p>Missing coverage: {version.gaps.join("; ") || "No gap in the supported technical rules; other requirements still need review"}</p>
        {version.responsibilities ? <div><p>{version.comparisonLimit}</p><ul>{version.responsibilities.map((r,i) => <li key={i}>{r.requirement}: {r.status === "related_evidence" ? "Related verified evidence; full coverage needs review" : "Not established in permitted evidence"}</li>)}</ul></div> : null}
        <p>{version.submitted ? "This exact version is recorded as submitted in the selected applications." : "Submission was not established from the selected application records."}</p>
        <p>Parent: {version.parentId || "none"} · Base: {version.baseId || "none"}. No version was changed.</p>
      </details>) : <p>No résumé versions were authorized.</p>}
    </>}
  </section>;
}
