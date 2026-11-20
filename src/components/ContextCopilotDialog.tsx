import { lazy, Suspense, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { LoadingState } from "./States";

const CareerCopilotPage = lazy(() => import("../features/copilot/CareerCopilotPage").then((module) => ({ default: module.CareerCopilotPage })));

export function ContextCopilotDialog({ jobId, company, open, onClose }: { jobId: string; company: string; open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) { previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.current?.showModal(); }
    else { dialog.current?.close(); previousFocus.current?.focus(); }
  }, [open]);
  return <dialog ref={dialog} className="context-copilot-dialog" aria-labelledby="context-copilot-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="copilot-dialog-header"><div><span className="section-kicker">Career Copilot</span><h2 id="context-copilot-title">Ask about {company || "this job"}</h2><p>Scoped to this job and its saved records. Changes require your confirmation.</p></div><button className="icon-button" type="button" aria-label="Close job assistant" onClick={onClose}><X size={16} aria-hidden="true" /></button></div>
    <Suspense fallback={<LoadingState label="Opening job assistant…" />}><CareerCopilotPage key={jobId} embedded contextType="job" recordId={jobId} /></Suspense>
  </dialog>;
}
