import { useQuery } from "@tanstack/react-query";
import { useRepository } from "../../lib/database/repositoryContext";
import { preparationView } from "../../lib/copilot/preparationWorkflow";
import { stepTitles } from "../../lib/copilot/preparationContract";
import { IntelligenceResponse } from "./IntelligenceResponse";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { verifiedCitationHref } from "../../lib/copilot/citationNavigation";
function PreparationRecordLink({ kind, id }: {
    kind: "profile" | "resume" | "application";
    id: string;
}) {
    const repo = useRepository(), navigate = useNavigate();
    const [error, setError] = useState("");
    const href = kind === "profile" ? "/profile" : `/${kind === "resume" ? "library?resumeId" : "applications?applicationId"}=${encodeURIComponent(id)}`;
    return <span><Link to={href} className="text-blue-700 underline" onClick={async (e) => {
            e.preventDefault();
            setError("");
            try {
                if (kind === "profile") {
                    if ((await repo.getProfile())?.id !== id)
                        throw new Error("The profile target changed.");
                    navigate(href);
                }
                else
                    navigate(await verifiedCitationHref(repo, { id: `${kind}:${id}:`, entityType: kind, entityId: id, label: id, detail: "Preparation target", parentEntityId: "", parentEntityType: "" }));
            }
            catch (e) {
                setError(e instanceof Error ? e.message : "Target unavailable.");
            }
        }}>Open {kind === "resume" ? "source résumé" : kind}</Link>{error ? <span role="alert">{error}</span> : null}</span>;
}
export function PreparationPlanView({ threadId, planId, busy, onSay, onReview }: {
    threadId: string;
    planId: string;
    busy: boolean;
    onSay: (text: string) => void;
    onReview: (id: string) => void;
}) {
    const repo = useRepository();
    const query = useQuery({ queryKey: ["preparation-view", threadId, planId], queryFn: () => preparationView(repo, threadId, planId) });
    if (query.isLoading)
        return <p role="status" className="p-3 text-sm">Checking preparation suggestions…</p>;
    if (query.error || !query.data)
        return <p role="alert" className="p-3 text-sm">Preparation plan unavailable. Refresh the conversation.</p>;
    const { plan, rows } = query.data;
    const commands = { profile: "Review profile suggestion.", resume: "Review résumé suggestion.", application: plan.application?.instruction ?? "" };
    return <section aria-label="Career preparation plan" className="min-w-0 space-y-3 border-t border-slate-200 p-4 text-sm [overflow-wrap:anywhere]">
    <p className="font-semibold">Preparing: {plan.jobLabel}</p>
    <p className="text-xs">Local evidence snapshot from plan creation. Pending reviews revalidate current records. Accept each exact proposal separately.</p>
    {plan.fit.kind === "jobs" ? plan.fit.jobs.map(j => <p key={j.id}>Eligibility: {j.eligibility} · {j.sponsorship || "Sponsorship not established"}</p>) : null}
    <details><summary>Inspect fit, version ranking and evidence</summary><IntelligenceResponse value={plan.fit}/><IntelligenceResponse value={plan.comparison}/></details>
    <ol className="space-y-3">{rows.map(row => <li key={row.key} aria-label={`${stepTitles[row.key]} preparation`} className="rounded border border-slate-200 p-3">
      <div className="flex flex-wrap justify-between gap-2"><strong>{stepTitles[row.key]}</strong><span role="status">{row.status}</span></div>
      <p>{row.key === "profile" ? plan.profile ? `${plan.profile.suggestion.skillName} · Profile ${plan.profile.binding.profileId}` : "No supported missing skill" : row.key === "resume" ? plan.resume ? `${plan.resume.label} [${plan.resume.target.sourceId}] · ${plan.resume.section}` : "No unique supported bullet" : plan.application ? `${plan.application.label} [${plan.application.id}]` : "No exact application selected"}</p>
      <p className="mt-1 text-xs">{row.detail}</p>
      {row.key === "profile" && plan.profile ? <PreparationRecordLink kind="profile" id={plan.profile.binding.profileId}/> : row.key === "resume" && plan.resume ? <PreparationRecordLink kind="resume" id={plan.resume.target.sourceId}/> : row.key === "application" && plan.application ? <PreparationRecordLink kind="application" id={plan.application.id}/> : null}
      {row.key === "application" && plan.application?.instruction ? <p className="mt-1">{plan.application.instruction}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {row.actionId && row.status === "Pending approval" ? <button className="button" disabled={busy} onClick={() => onReview(row.actionId!)}>Review exact proposal</button> : null}
        {["Suggested", "Rejected"].includes(row.status) && commands[row.key] ? <button className="button" disabled={busy} onClick={() => onSay(commands[row.key])}>{row.status === "Rejected" ? "Prepare fresh review" : "Review suggestion"}</button> : null}
        {["Suggested", "Pending approval", "Stale / conflicted", "Needs information"].includes(row.status) ? <button className="button" disabled={busy} onClick={() => onSay(`Skip ${row.key} suggestion.`)}>Skip {stepTitles[row.key].toLowerCase()}</button> : null}
      </div>
    </li>)}</ol>
    <p className="text-xs">Accepted operations remain independent. Use Accepted changes for each domain’s reviewed undo; résumé reversal archives an unchanged, unused child without deleting it.</p>
    <button className="button" disabled={busy} onClick={() => onSay("Cancel preparation plan.")}>Cancel remaining plan items</button>
  </section>;
}
