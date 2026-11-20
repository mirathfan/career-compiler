import { useState } from "react";
import { useRepository } from "../../lib/database/repositoryContext";
import type { MasterPdfSource } from "../../lib/resume/masterPdf";

export function MasterPdfPreview({ source, reviewed }: { source: MasterPdfSource; reviewed: boolean }) {
  const repo = useRepository();
  const [pdf, setPdf] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  return <section className="mt-4 space-y-3" aria-label="Master PDF preview">
    <button className="button" type="button" disabled={!reviewed || busy} onClick={async () => { setBusy(true); setPdf(""); setError(""); try { const { renderMasterPdf } = await import("../../lib/resume/masterPdf"); const result = await renderMasterPdf(repo, source, reviewed); setPdf(result.dataUrl); } catch (e) { setError(e instanceof Error ? e.message : "PDF generation failed."); } finally { setBusy(false); } }}>{busy ? "Rendering Master PDF…" : "Generate Master PDF preview"}</button>
    {error ? <p role="alert">{error}</p> : null}
    {pdf ? <><p>{"versionId" in source ? "PDF of this saved Master. No job association is required." : "PDF of the reviewed draft. This résumé has not been saved."}</p><iframe title="Master résumé PDF" src={pdf} className="h-[640px] w-full rounded-md border" /></> : null}
  </section>;
}
