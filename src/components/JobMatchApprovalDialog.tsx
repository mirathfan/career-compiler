import { isIsolatedRuntime, setAcceptanceAIResponse, type AcceptanceAIResponse } from "../lib/acceptance/runtime";
import { useEffect, useRef, useState } from "react";
import type { BatchReview } from "../lib/job-automation/batchReview";
import { batchApprovalText } from "../lib/job-automation/aiBatch";

export function JobMatchApprovalDialog({ review, onDecision }: { review: BatchReview; onDecision: (approved: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scenario, setScenario] = useState<AcceptanceAIResponse>("valid");
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => { element?.close(); }; }, []);
  return <dialog ref={dialog} aria-labelledby="analysis-review-title" onCancel={event => { event.preventDefault(); onDecision(false); }} className="m-auto max-h-[85vh] w-[min(48rem,90vw)] overflow-auto rounded-xl border border-slate-300 bg-white p-6 shadow-xl backdrop:bg-slate-950/40">
    <h2 id="analysis-review-title" className="text-xl font-bold">Review AI match analysis</h2>
    <p className="mt-3 whitespace-pre-line text-sm">{batchApprovalText(review.preview)}</p>
    <p className="mt-3 text-sm">Approval applies to this reviewed job and evidence snapshot. Changes require a fresh review. Analysis does not approve an application package.</p>
    {review.jobs.map(({ job, evidencePacket, preferences }) => <section key={job.id} className="my-4 rounded border p-3">
      <h3 className="font-semibold">{job.company} · {job.roleTitle}</h3>
      <p className="text-sm">{job.location} · {job.workplaceType} · {job.employmentType}</p>
      <details><summary>Job fields proposed for analysis</summary><pre className="whitespace-pre-wrap text-xs">{JSON.stringify({ description: job.descriptionText, department: job.department, salaryMin: job.salaryMin, salaryMax: job.salaryMax, salaryCurrency: job.salaryCurrency, salaryInterval: job.salaryInterval, postedAt: job.postedAt, applicationUrl: job.applicationUrl }, null, 2)}</pre></details>
      <details><summary>Analysis preferences</summary><pre className="whitespace-pre-wrap text-xs">{JSON.stringify({ targetRoleTitles: preferences.targetRoleTitles, preferredLocations: preferences.preferredLocations, remotePreference: preferences.remotePreference, preferredSkills: preferences.preferredSkills, maximumExperienceYears: preferences.maximumExperienceYears, seniorityLevels: preferences.seniorityLevels, salaryMinimum: preferences.salaryMinimum, salaryCurrency: preferences.salaryCurrency, citizenshipRestrictionBehavior: preferences.citizenshipRestrictionBehavior, sponsorshipFilteringBehavior: preferences.sponsorshipFilteringBehavior }, null, 2)}</pre></details>
      <details open><summary>Allowlisted evidence ({evidencePacket.items.length})</summary><ul className="mt-2 space-y-2 text-sm">{evidencePacket.items.map(item => <li key={item.id}><strong>{item.id}</strong> ({item.category}): {item.text}</li>)}</ul></details>
    </section>)}
    {isIsolatedRuntime() ? <label className="my-3 block text-sm">Acceptance-only mock response<select className="field" value={scenario} onChange={event => setScenario(event.target.value as AcceptanceAIResponse)}><option value="valid">Valid response</option><option value="invalid_evidence_then_repair">Invalid evidence then repair</option><option value="permanent_invalid">Invalid evidence after repair</option><option value="response_error">Provider response error</option></select></label> : null}
    <div className="flex gap-3"><button autoFocus className="button" onClick={() => onDecision(false)}>Cancel analysis</button><button className="button button-primary" onClick={() => { if (isIsolatedRuntime()) setAcceptanceAIResponse(scenario); onDecision(true); }}>Approve {review.preview.providerMode === "mock" ? "mock" : "paid"} analysis</button></div>
  </dialog>;
}
