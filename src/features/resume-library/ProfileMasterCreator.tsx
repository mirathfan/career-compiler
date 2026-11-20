import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepository } from "../../lib/database/repositoryContext";
import { prepareProfileMaster, saveProfileMaster, type ProfileMasterDraft } from "../../lib/tailoring/profileMaster";
import { ResumePreview } from "../tailoring/ResumePreview";
import { estimateResumePageCount } from "../../lib/resume/compaction";
import { MasterPdfPreview } from "./MasterPdfPreview";

export function ProfileMasterCreator({ onClose }: { onClose: () => void }) {
  const repo = useRepository(), query = useQueryClient();
  const storage = useQuery({ queryKey: ["standalone-master-storage"], queryFn: () => repo.supportsStandaloneMaster() });
  const [draft, setDraft] = useState<ProfileMasterDraft | null>(null);
  const [savedId, setSavedId] = useState("");
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <section className="surface-section" aria-label="Create Master Résumé">
    <h3>Create Master Résumé</h3>
    <p>Build a general résumé from your approved career profile. No job is needed. This saves a new Master and preserves every existing version. Choose a job later to create a tailored child.</p>
    {storage.isError ? <p role="alert">Could not check résumé storage. Please reopen this view.</p> : storage.data === false ? <p role="status">Saving a standalone Master is waiting for an approved database update. You can prepare, review and preview its PDF now; no job or résumé will be created.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <div className="action-row">
      {!savedId ? <button className="button button-primary" disabled={busy} onClick={async () => { setBusy(true); setError(""); setReviewed(false); setDraft(null); try { setDraft(await prepareProfileMaster(repo)); } catch (e) { setError(e instanceof Error ? e.message : "Preview failed."); } finally { setBusy(false); } }}>Preview profile résumé</button> : null}
      <button className="button" disabled={busy} onClick={onClose}>{savedId ? "Close Master preview" : "Cancel creation"}</button>
    </div>
    {draft ? <>
      <ResumePreview resume={draft.resume} validationIssues={draft.issues} pageCount={estimateResumePageCount(draft.resume)} />
      {!savedId ? <><label><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} /> I reviewed this new Master résumé.</label><button className="button button-primary" disabled={!reviewed || busy || storage.data !== true} onClick={async () => { setBusy(true); setError(""); try { const saved = await saveProfileMaster(repo, draft, reviewed); setSavedId(saved.id); await query.invalidateQueries(); } catch (e) { setError(e instanceof Error ? e.message : "Save failed."); } finally { setBusy(false); } }}>Save new Master</button></> : <p role="status">Master saved without a job. Existing Masters are unchanged.</p>}
      <MasterPdfPreview key={savedId || draft.previewDigest} source={savedId ? { versionId: savedId } : { draft }} reviewed={reviewed} />
    </> : null}
  </section>;
}
