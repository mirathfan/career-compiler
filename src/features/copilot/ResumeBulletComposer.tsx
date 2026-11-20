import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRepository } from "../../lib/database/repositoryContext";
import { editableResumeBullets, proposeLocalResumeBullet } from "../../lib/copilot/resumeBulletActions";
import type { CareerCopilotMessage } from "../../types/domain";
import { WorkspaceReadReview } from "./WorkspaceReadReview";

export function ResumeBulletComposer({ jobId, threadId, messages, onComplete }: { jobId: string; threadId?: string; messages: CareerCopilotMessage[]; onComplete: (id: string) => void }) {
  const repo = useRepository(); const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState(""); const [bulletId, setBulletId] = useState(""); const [evidenceId, setEvidenceId] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const data = useQuery({ queryKey: ["resume-bullet-choices", jobId, threadId], enabled: open, queryFn: async () => ({ versions: await repo.listResumeVersions(), facts: await repo.listCareerFacts(), archives: await repo.listResumeArchives() }) });
  const source = data.data?.versions.find(v => v.id === sourceId);
  const bullets = source ? editableResumeBullets(source) : [];
  const selected = bullets.find(b => b.bullet.id === bulletId);
  const target = sourceId && bulletId ? { sourceId, bulletId } : undefined;
  return <>
    <section className="min-w-0 border-b border-slate-200 p-4 text-sm" aria-label="Single résumé bullet preparation">
      <button className="button" aria-expanded={open} onClick={() => setOpen(!open)}>Review one résumé bullet</button>
      {open ? <div className="mt-3 min-w-0 space-y-3">
        <p>Select an exact source and bullet. A reviewed revision creates a draft child; it never replaces a Master or submitted version.</p>
        {data.isLoading ? <p role="status">Loading local résumé choices…</p> : null}
        {data.error ? <p role="alert">Could not load local résumé choices.</p> : null}
        <label className="block">Source résumé version<select aria-label="Source résumé version" className="field w-full" value={sourceId} disabled={busy} onChange={e => { setSourceId(e.target.value); setBulletId(""); setEvidenceId(""); }}><option value="">Choose an exact version</option>{data.data?.versions.filter(v => !data.data.archives.some(a => a.resumeVersionId === v.id)).map(v => <option value={v.id} key={v.id}>{v.name} [{v.id}]</option>)}</select></label>
        <label className="block">Target bullet<select aria-label="Target bullet" className="field w-full" value={bulletId} disabled={busy || !source} onChange={e => { setBulletId(e.target.value); setEvidenceId(""); }}><option value="">Choose one bullet</option>{bullets.map((b,i) => <option key={`${b.bullet.id}:${i}`} value={b.bullet.id} disabled={b.bullet.locked || b.section.locked || !b.bullet.included}>{b.section.title}: {b.bullet.text}</option>)}</select></label>
        {selected ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">Current bullet: {selected.bullet.text}</p> : null}
        <label className="block">Verified evidence for local draft<select aria-label="Verified evidence for local draft" className="field w-full" value={evidenceId} disabled={busy || !selected} onChange={e => setEvidenceId(e.target.value)}><option value="">Choose supported wording</option>{data.data?.facts.filter(f => f.enabled && f.evidenceStatus === "verified" && f.careerItemId === selected?.section.careerItemId).map(f => <option value={f.id} key={f.id}>{f.statement}</option>)}</select></label>
        <p className="text-xs">This release copies verified wording exactly. Text preview only; PDF rendering occurs separately in the résumé library. For a model suggestion, choose this target, then enable the bullet option under the existing outbound review below.</p>
        {error ? <p role="alert">{error}</p> : null}
        <button className="button" disabled={busy || !target || !evidenceId} onClick={async () => { if (!target) return; setBusy(true); setError(""); try { onComplete(await proposeLocalResumeBullet(repo, jobId, target, evidenceId, threadId)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>{busy ? "Preparing…" : "Prepare local evidence draft"}</button>
      </div> : null}
    </section>
    <WorkspaceReadReview jobId={jobId} threadId={threadId} messages={messages} resumeTarget={target} onComplete={onComplete}/>
  </>;
}
