import { useEffect, useRef, useState } from "react";
import type { ExtractedResume } from "../../lib/import/resumeDocument";

export function ResumeFileInput({ onExtracted, disabled }: { onExtracted: (value: ExtractedResume) => void; disabled: boolean }) {
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => () => controller.current?.abort(), []);
  return <section className="surface-section" aria-label="Import existing résumé">
    <h3>Import existing résumé</h3>
    <p>Choose a text-based PDF or DOCX, up to 10 MB. Extraction stays on this Mac. Review text and proposed records before saving. Your original file and Master are unchanged; document layout is not imported.</p>
    <label className="block mt-3">Select PDF or DOCX<input className="field" type="file" accept=".pdf,.docx" disabled={disabled || busy} onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      const active = new AbortController(); controller.current = active; setBusy(true); setError("");
      try {
        const { extractResumeDocument } = await import("../../lib/import/resumeDocument");
        const result = await extractResumeDocument(file, active.signal);
        if (!active.signal.aborted) onExtracted(result);
      } catch (error) { if (!active.signal.aborted) setError(error instanceof Error ? error.message : "Document extraction failed."); }
      finally { if (controller.current === active) { controller.current = null; setBusy(false); } }
    }} /></label>
    {busy ? <p role="status">Extracting local text… <button className="button" onClick={() => controller.current?.abort()}>Cancel extraction</button></p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
