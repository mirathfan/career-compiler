/** Plain text only: private notes are not trusted evidence or executable markup. */
export function PrivateJobNote({ notes, onReview }: { notes?: string; onReview?: () => void }) {
  const hasNote = Boolean(notes?.trim());
  return <section aria-label="Private job note" className="min-w-0 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-800">
    <h3 className="text-sm font-semibold">Private job note</h3>
    <p className="text-xs text-slate-600">User-authored · Unverified · Not career evidence or an AI conclusion.</p>
    {hasNote ? <div role="region" aria-label="Saved private note text" tabIndex={0} className="max-h-48 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">{notes}</div> : <p className="text-sm text-slate-500">No private note saved.</p>}
    {onReview ? <button type="button" className="text-link text-sm" onClick={event => { event.currentTarget.focus(); onReview(); }}>Review a note change in Copilot</button> : null}
  </section>;
}
