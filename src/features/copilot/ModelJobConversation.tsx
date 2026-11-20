import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useRepository } from "../../lib/database/repositoryContext";
import { discardModelJobReview, reviewModelNoteProposal, reviewModelJobQuestion, sendReviewedModelJobQuestion, type ModelJobReview, type ModelJobTurn } from "../../lib/copilot/modelConversation";
import { JOB_CONVERSATION_INSTRUCTIONS } from "../../lib/copilot/modelContract";

export function ModelJobConversation({ jobId, label, onProposal }: { jobId: string; label: string; onProposal?: (threadId: string) => void }) {
  const repo = useRepository();
  const [open, setOpen] = useState(false);
  const [allowNoteProposal, setAllowNoteProposal] = useState(false);
  const [reviewedSuggestions, setReviewedSuggestions] = useState<ModelJobTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<ModelJobTurn[]>([]);
  const [review, setReview] = useState<ModelJobReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef<AbortController | null>(null);
  const reviewed = useRef<ModelJobReview | null>(null);
  useEffect(() => () => { operation.current?.abort(); if (reviewed.current) discardModelJobReview(reviewed.current); }, []);
  const clearReview = () => { if (reviewed.current) discardModelJobReview(reviewed.current); reviewed.current = null; setReview(null); };
  const stop = () => { operation.current?.abort(); clearReview(); setBusy(false); };
  const prepare = async () => {
    if (busy) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError(""); clearReview();
    try {
      const next = await reviewModelJobQuestion(repo, jobId, question, history, allowNoteProposal);
      if (controller.signal.aborted) { discardModelJobReview(next); return; }
      reviewed.current = next; setReview(next);
    } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not prepare context."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const send = async () => {
    if (!review || busy) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError("");
    const selected = review; setReview(null); reviewed.current = null;
    try {
      const turn = await sendReviewedModelJobQuestion(repo, selected, true, controller.signal);
      if (!controller.signal.aborted) { setHistory(previous => [...previous, turn]); setQuestion(""); }
    } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "AI request failed."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const reviewSuggestion = async (turn: ModelJobTurn) => {
    if (busy) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError("");
    try {
      const result = await reviewModelNoteProposal(repo, turn);
      if (!controller.signal.aborted) { setReviewedSuggestions(previous => [...previous, turn]); onProposal?.(result.thread.id); }
    } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not prepare note review."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <section aria-label="Selected-job AI conversation" className="min-w-0 border-b border-slate-200 p-4">
    {!open ? <button type="button" className="button" onClick={() => setOpen(true)}>Ask AI about this job</button> : <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-sm font-semibold">AI Q&A · {label}</h3><button className="text-link" type="button" onClick={() => { stop(); setOpen(false); setHistory([]); setQuestion(""); setError(""); setAllowNoteProposal(false); setReviewedSuggestions([]); }}>End AI conversation</button></div>
      <p className="text-xs text-slate-600">Read-only, selected-job evidence answers. A model can select quoted saved fields or report missing evidence; it cannot edit saved data or invent career claims. With your opt-in it may suggest a private note copied exactly from your question; review and separate acceptance are still required. Private notes and career facts are excluded. Each send needs review. This conversation is temporary; at most the last three turns are included.</p>
      {history.map((turn, index) => <article key={index} className="min-w-0 space-y-2 rounded-md bg-slate-50 p-3 text-sm">
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]"><strong>You:</strong> {turn.question}</p>
        <p className="text-xs text-slate-600">{turn.provider === "mock" ? "Offline mock demo · fixed field echo, no model reasoning" : `OpenAI · ${turn.model} · quoted evidence, not independent verification`}</p>
        {turn.answer.insufficient ? <p>{turn.answer.noteProposal ? "Note suggestion only; no factual job answer provided." : "The selected job does not provide enough evidence to answer this question."}</p> : turn.answer.quotes.map((quote, i) => <blockquote key={i} className="whitespace-pre-wrap border-l-2 border-blue-300 pl-3 [overflow-wrap:anywhere]">{quote.quote}<div><Link className="text-link text-xs" to={`/jobs?jobId=${encodeURIComponent(turn.jobId)}`}>Source: selected job · {quote.field}</Link></div></blockquote>)}
        {turn.answer.noteProposal ? <section aria-label="Model note suggestion" className="space-y-2 border-t border-slate-200 pt-2">
          <p className="font-semibold">Suggested private note · {label}</p><p className="text-xs">Exact text from your question. User-authored and unverified. This suggestion alone does not save the job.</p>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{turn.answer.noteProposal.text}</p>
          <button type="button" className="button" disabled={busy || reviewedSuggestions.includes(turn) || !onProposal} onClick={() => void reviewSuggestion(turn)}>{reviewedSuggestions.includes(turn) ? "Proposal opened in Review changes" : "Review suggested note"}</button>
        </section> : null}
      </article>)}
      <label className="block text-sm font-semibold">Question for AI
        <textarea className="field mt-1 min-h-20 w-full" value={question} disabled={busy} onChange={event => { clearReview(); setQuestion(event.target.value); }} />
      </label>
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={allowNoteProposal} disabled={busy} onChange={event => { clearReview(); setAllowNoteProposal(event.target.checked); }} />Allow a private-note suggestion copied from this question. Existing private notes are never sent.</label>
      <p className="text-xs text-slate-500">Up to 2,000 characters. Any text you type here is included in the reviewed request.</p>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {busy ? <div><p role="status">Processing the reviewed question…</p><button className="button" type="button" onClick={() => { stop(); setError("Stopped waiting. An already-sent request cannot be recalled and may incur charges."); }}>Stop waiting</button></div> : null}
      {!review ? <button type="button" className="button" disabled={busy || !question.trim() || question.length > 2000} onClick={() => void prepare()}>Review AI request</button> : <section aria-label="AI transmission review" className="space-y-3 rounded-md border border-amber-300 p-3">
        <p className="text-sm font-semibold">{review.provider === "openai" ? "OpenAI · paid external request" : "Offline mock · no network, no model reasoning"} · {review.model}</p>
        <p className="text-xs">One request, no automatic repair. Shared daily AI reservations: {review.dailyUsed}/{review.dailyLimit}. Reservations are not refunded; they are not dollar estimates. Uses the existing AI analysis settings and daily cap. OpenAI mode requires the configured Keychain credential.</p>
        <p className="text-xs">Exact selected data, question and recent conversation sent below. Job description is limited to 12,000 characters. A generated budget attempt ID is added for accounting.</p>
        <pre tabIndex={0} aria-label="Exact outbound AI context" className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs [overflow-wrap:anywhere]">{JSON.stringify(review.request, null, 2)}</pre>
        <details><summary className="cursor-pointer text-xs">Model instructions</summary><p className="whitespace-pre-wrap text-xs">{JOB_CONVERSATION_INSTRUCTIONS}</p></details>
        <div className="flex flex-wrap gap-2"><button type="button" className="button button-primary" disabled={busy} onClick={() => void send()}>{review.provider === "openai" ? "Approve one paid OpenAI request" : "Run reviewed mock request"}</button><button type="button" className="button" onClick={clearReview}>Cancel AI request</button></div>
      </section>}
    </div>}
  </section>;
}
