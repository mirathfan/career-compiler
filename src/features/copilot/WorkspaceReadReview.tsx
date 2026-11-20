import type { ResumeBulletTarget } from "../../lib/copilot/resumeBulletContract";
import { noIntelligence, type IntelligenceConsent } from "../../lib/copilot/workspaceIntelligence";
import { IntelligenceResponse } from "./IntelligenceResponse";
import { useEffect, useRef, useState } from "react";
import { useRepository } from "../../lib/database/repositoryContext";
import type { CareerCopilotMessage } from "../../types/domain";
import { Grants, ReadTool, readChoices, toolLabels, type ReadGrant } from "../../lib/copilot/workspaceReads";
import { discardWorkspaceReview, reviewWorkspaceQuestion, sendWorkspaceReview, type WorkspaceReview } from "../../lib/copilot/workspaceConversation";

// Request review only. Responses use the existing persisted conversation and citations.
export function WorkspaceReadReview({ jobId, threadId, messages, resumeTarget, onComplete }: { jobId: string; threadId?: string; messages: CareerCopilotMessage[]; resumeTarget?: ResumeBulletTarget; onComplete: (id: string) => void }) {
  const repo = useRepository();
  const [open, setOpen] = useState(false); const [question, setQuestion] = useState("");
  const [consent, setConsent] = useState<IntelligenceConsent>({ ...noIntelligence });
  const [focusJobId, setFocusJobId] = useState("");
  const [allowBulletProposal, setAllowBulletProposal] = useState(false);
  const [allowSkillProposal, setAllowSkillProposal] = useState(false);
  const [synthesize, setSynthesize] = useState(false);
  const [localReports, setLocalReports] = useState<unknown[]>([]);
  const [grants, setGrants] = useState<ReadGrant[]>([]);
  const [choices, setChoices] = useState<Partial<Record<ReadTool, Awaited<ReturnType<typeof readChoices>> & { offset: number }>>>({});
  const [review, setReview] = useState<WorkspaceReview | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null); const reviewed = useRef<WorkspaceReview | null>(null);
  const clear = () => { if (reviewed.current) discardWorkspaceReview(reviewed.current); reviewed.current = null; setReview(null); setLocalReports([]); };
  const stop = () => { request.current?.abort(); clear(); setBusy(false); };
  useEffect(() => () => { request.current?.abort(); if (reviewed.current) discardWorkspaceReview(reviewed.current); }, []);
  useEffect(() => { request.current?.abort(); if (reviewed.current) discardWorkspaceReview(reviewed.current); reviewed.current = null; setReview(null); setBusy(false); setAllowBulletProposal(false); }, [resumeTarget?.sourceId, resumeTarget?.bulletId]);
  const work = async (fn: (signal: AbortSignal) => Promise<void>) => {
    if (busy) return; const controller = new AbortController(); request.current = controller; setBusy(true); setError("");
    try { await fn(controller.signal); } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Workspace request failed."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const load = (tool: ReadTool, offset = 0) => void work(async signal => { const result = await readChoices(repo, tool, offset, consent.jobFit); if (!signal.aborted) setChoices(prev => ({ ...prev, [tool]: { ...result, offset } })); });
  const prior = [...messages].reverse().map(m => m.structuredContentJson.workspaceRead).find(v => typeof v === "object" && v !== null) as { grants?: unknown } | undefined;
  const restored = Grants.safeParse(prior?.grants);
  return <section aria-label="Connected workspace request" className="min-w-0 border-b border-slate-200 p-4 text-sm">
    <button className="button" type="button" aria-expanded={open} onClick={() => { if (open) { stop(); setChoices({}); setGrants([]); setConsent({ ...noIntelligence }); setFocusJobId(""); setSynthesize(false); setAllowSkillProposal(false); setAllowBulletProposal(false); } setOpen(!open); }}>Read across selected records</button>
    {open ? <div className="mt-3 min-w-0 space-y-3">
      <p>Read-only evidence selection. New model scopes are off until you choose records. Nothing is sent by browsing. Two separately reviewed requests use the existing shared AI budget; no automatic retries. This workflow remains attached to this conversation’s saved job.</p>
      <p className="text-xs">Included: saved job fields, verified career statements/project titles, application dates/status/links, résumé metadata/lineage. Excluded: contact details, private notes, paths, résumé text, unverified facts and direct write execution. Profile-skill and bullet suggestions require their separate option and change approval. Metadata alone cannot establish résumé coverage or rank job fit. Optional comparison scopes below permit derived summaries, never full résumé text.</p>
      {restored.success ? <button type="button" className="button" disabled={busy} onClick={() => { clear(); setGrants(restored.data); }}>Reuse previously reviewed record selection</button> : null}
      <fieldset disabled={busy} className="space-y-2"><legend className="font-semibold">Optional comparison permissions</legend>
        <label className="flex gap-2"><input type="checkbox" checked={allowSkillProposal} onChange={e => { clear(); setAllowSkillProposal(e.target.checked); setAllowBulletProposal(false); }} />Allow one evidence-backed profile-skill proposal</label>
        <p className="text-xs">Use “Add &lt;skill&gt; to my profile” and select verified evidence. The model receives only the selected evidence, never your profile or skill list. Local validation creates a proposal; a separate Accept change action is required.</p>
        <label className="flex gap-2"><input type="checkbox" checked={allowBulletProposal} disabled={!resumeTarget} onChange={e => { clear(); setAllowBulletProposal(e.target.checked); setAllowSkillProposal(false); }} />Allow one evidence-backed résumé bullet proposal</label>
        <p className="text-xs">Select the exact source and bullet above and ask to improve that bullet. The target and original résumé text stay local; the model selects wording from the verified evidence you authorize below. Acceptance of the resulting change is separate.</p>
        <label className="flex gap-2"><input type="checkbox" checked={synthesize} onChange={e => { clear(); setSynthesize(e.target.checked); }} />Compose a grounded conversational explanation</label>
        <p className="text-xs">The model combines locally checked statements, uncertainty and suggested next steps. Unsupported factual wording is rejected. No additional records are authorized by this option.</p>
        <label className="flex gap-2"><input type="checkbox" checked={consent.jobFit} onChange={e => { clear(); setConsent(e.target.checked ? { ...consent, jobFit: true } : { ...noIntelligence }); }} />Use selected job and verified evidence details for deterministic fit summaries</label>
        <p className="text-xs">Reads selected facts’ tags and their parent item types/dates locally. Only bounded results and references may leave the app, after review. No independent skill or full profile export.</p>
        <label className="flex gap-2"><input type="checkbox" disabled={!consent.jobFit} checked={consent.careerContext} onChange={e => { clear(); setConsent({ ...consent, careerContext: e.target.checked }); }} />Use saved career preferences and reviewed eligibility for comparisons</label>
        <p className="text-xs">Explicitly permits local reviewed eligibility claims and confirmed preferences. Derived conclusions may disclose those constraints; inspect the next review.</p>
        <label className="flex gap-2"><input type="checkbox" disabled={!consent.jobFit} checked={consent.resumeEvidence} onChange={e => { clear(); setConsent({ ...consent, resumeEvidence: e.target.checked, resumeResponsibilities: e.target.checked ? consent.resumeResponsibilities : false }); }} />Compare selected résumé bullet evidence locally; share coverage summaries only</label>
        <p className="text-xs">Select the résumé versions AND their verified source facts. Missing permission/evidence cannot be treated as absence from the complete résumé.</p>
        <label className="flex gap-2"><input type="checkbox" disabled={!consent.resumeEvidence} checked={Boolean(consent.resumeResponsibilities)} onChange={e => { clear(); setConsent({ ...consent, resumeResponsibilities: e.target.checked }); }} />Include local responsibility overlap summaries</label>
        <p className="text-xs">Adds requirement excerpts and verified fact references, after review. Text overlap is a lead for review, not complete coverage or eligibility.</p>
      </fieldset>
      <fieldset disabled={busy} className="space-y-2"><legend className="font-semibold">Authorize categories and specific records</legend>
        {ReadTool.options.map(tool => <div key={tool}>
          <label className="flex items-start gap-2"><input type="checkbox" checked={Boolean(choices[tool]) || grants.some(g => g.tool === tool)} onChange={e => { clear(); if (e.target.checked) load(tool); else { setChoices(prev => ({ ...prev, [tool]: undefined })); setGrants(prev => prev.filter(g => g.tool !== tool)); } }} />{toolLabels[tool]}</label>
          {choices[tool] ? <div className="ml-3 max-h-48 space-y-1 overflow-auto">
            {!choices[tool]!.records.length ? <p>No eligible saved records.</p> : choices[tool]!.records.map(row => <label key={row.id} className="flex items-start gap-2 [overflow-wrap:anywhere]"><input type="checkbox" checked={grants.some(g => g.tool === tool && g.id === row.id)} onChange={e => { clear(); setGrants(prev => e.target.checked ? [...prev, { tool, id: row.id }] : prev.filter(g => g.tool !== tool || g.id !== row.id)); }} />{row.label || row.id}</label>)}
            {choices[tool]!.offset > 0 ? <button type="button" className="text-link mr-3" onClick={() => load(tool, choices[tool]!.offset - 20)}>Previous {toolLabels[tool]}</button> : null}
            {choices[tool]!.more ? <button type="button" className="text-link" onClick={() => load(tool, choices[tool]!.offset + 20)}>More {toolLabels[tool]}</button> : null}
          </div> : null}
        </div>)}
      </fieldset>
      {consent.jobFit ? <label className="block">Follow-up job<select aria-label="Follow-up job" className="field w-full" disabled={busy} value={focusJobId} onChange={e => { clear(); setFocusJobId(e.target.value); }}><option value="">Resolve an explicit reference, or compare selected jobs</option>{grants.filter(g => g.tool === "get_job").map(g => <option value={g.id} key={g.id}>{choices.get_job?.records.find(r => r.id === g.id)?.label ?? g.id}</option>)}</select></label> : null}
      <p>{grants.length}/10 selected · maximum five per category. With the same jobs selected, “the second job” uses the last comparison’s displayed order. A new selection uses picker order.</p>
      <label className="block">Question about selected records<textarea aria-label="Connected workspace question" className="field mt-1 w-full" disabled={busy} maxLength={2000} value={question} onChange={e => { clear(); setQuestion(e.target.value); }} /></label>
      <p className="text-xs">Anything typed in the question is part of the reviewed outbound request. Previously saved answers are snapshots, not current-record guarantees.</p>
      {error ? <p role="alert" className="text-red-700">{error}</p> : null}
      {error && localReports.length ? <details><summary>Review local results — no model explanation was saved</summary><p>Previously reviewed snapshot. Refresh the request before relying on current records.</p>{localReports.map((value,index) => <IntelligenceResponse key={index} value={value}/>)}</details> : null}
      {busy ? <p role="status">Processing this reviewed request… <button type="button" className="button" onClick={() => { stop(); setError("Stopped waiting. A sent provider request cannot be recalled and may incur charges."); }}>Cancel request</button></p> : null}
      {!review ? <button type="button" className="button" disabled={busy || !question.trim() || !grants.length} onClick={() => void work(async signal => { const next = await reviewWorkspaceQuestion(repo, jobId, question, grants, threadId, { consent, focusJobId: focusJobId || undefined, responseStyle: synthesize ? "synthesis" : "evidence", allowProfileSkillProposal: allowSkillProposal, ...(allowBulletProposal ? { resumeBulletTarget: resumeTarget } : {}) }); if (signal.aborted) { discardWorkspaceReview(next); return; } reviewed.current = next; setReview(next); })}>Review tool-selection request</button> : <section aria-label="Connected outbound review" className="min-w-0 space-y-2 rounded border border-amber-300 p-3">
        <p className="font-semibold">{review.provider === "openai" ? "Paid OpenAI request" : "Offline mock · fixed selection, no reasoning"} · {review.request.phase === "plan" ? "Choose permitted read tools" : "Answer from reviewed records"}</p>
        <p>{review.dailyUsed}/{review.dailyLimit} shared reservations used. This approval permits one request. {review.request.phase === "plan" ? "Only the ordered catalog, question and budget anchor are sent. Retrieved fields require a second approval." : "Only the exact records below are sent. An enabled suggestion still requires separate change review."}</p>
        <pre tabIndex={0} aria-label="Exact connected outbound context" className="max-h-64 overflow-auto whitespace-pre-wrap text-xs [overflow-wrap:anywhere]">{JSON.stringify(review.request, null, 2)}</pre>
        <button type="button" className="button button-primary" disabled={busy} onClick={() => void work(async signal => { const current = review; reviewed.current = null; setReview(null); const result = await sendWorkspaceReview(repo, current, true, signal); if (signal.aborted) { if ("review" in result) discardWorkspaceReview(result.review); return; } if ("review" in result) { reviewed.current = result.review; setReview(result.review); setLocalReports(result.review.request.records.flatMap(r => r.intelligence ? [r.intelligence] : [])); } else { setQuestion(""); onComplete(result.threadId); } })}>{review.provider === "openai" ? "Approve one paid request" : "Run reviewed workspace mock"}</button>
        <button className="button" type="button" disabled={busy} onClick={clear}>Cancel review</button>
      </section>}
    </div> : null}
  </section>;
}
