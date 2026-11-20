import { useId, useRef, useState } from "react";

/** Drafts stay local to this mounted record/conversation; only proposals are persisted. */
export function JobNoteComposer({ targetLabel, disabled, pendingNote, onPropose }: {
  targetLabel: string;
  disabled: boolean;
  pendingNote: boolean;
  onPropose: (text: string) => Promise<void>;
}) {
  const helpId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const invalid = !text.trim() || text.length > 4000;
  const close = () => { setOpen(false); setText(""); setError(""); trigger.current?.focus(); };
  const propose = async () => {
    if (invalid || disabled || pendingNote || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try { await onPropose(text); close(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not prepare the proposal. Your draft is retained."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <section aria-label="Guided job-note action" className="mb-3 min-w-0 rounded-md border border-slate-200 p-3">
    <button ref={trigger} type="button" className="text-link" aria-expanded={open} disabled={disabled || busy || pendingNote} onClick={() => setOpen(true)}>Propose a private note</button>
    {pendingNote ? <p className="mt-2 text-xs text-slate-600">Review or cancel the pending note change before proposing another.</p> : null}
    {open ? <div className="mt-3 space-y-3">
      <p className="text-sm [overflow-wrap:anywhere]"><strong>For:</strong> {targetLabel}</p>
      <p className="text-xs text-slate-600">Replaces this job’s private note. User-authored, unverified text. Preparing a proposal does not change the saved job.</p>
      <label className="block text-sm font-semibold">Replacement private note
        <textarea autoFocus className="field mt-2 min-h-24 w-full" value={text} disabled={busy || disabled} onChange={event => setText(event.target.value)} aria-describedby={helpId} />
      </label>
      <p id={helpId} className="text-xs text-slate-600">{text.length.toLocaleString()} / 4,000 characters. Enter a nonempty note; no text is generated for you.</p>
      {text.length > 4000 ? <p role="alert" className="text-sm text-red-700">Shorten the note to 4,000 characters or fewer.</p> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error} Your draft is retained.</p> : null}
      <div className="flex flex-wrap gap-2">
        <button className="button button-primary" type="button" disabled={invalid || disabled || busy || pendingNote} onClick={() => void propose()}>{busy ? "Preparing review…" : "Prepare note review"}</button>
        <button className="button" type="button" disabled={busy} onClick={close}>Discard note draft</button>
      </div>
    </div> : null}
  </section>;
}
