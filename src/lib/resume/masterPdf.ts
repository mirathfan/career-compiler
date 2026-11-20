import type { AppRepository } from "../database/repository";
import { canonicalDigest } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
import { validateProfileMasterPreview, type ProfileMasterDraft } from "../tailoring/profileMaster";
import { allResumeBullets, hasBlockingValidationErrors, missingRequiredContactFields, validateResumeClaims } from "./validation";
import { countPdfPages, pdfBytesToDataUrl, renderResumePdfBytes } from "./pdf";

export type MasterPdfSource = { draft: ProfileMasterDraft } | { versionId: string };
export async function renderMasterPdf(repo: AppRepository, source: MasterPdfSource, reviewed: boolean) {
  if (!reviewed) throw new Error("Review the Master before rendering its PDF.");
  const read = async () => {
    if ("draft" in source) {
      await validateProfileMasterPreview(repo, source.draft, reviewed);
      return { content: source.draft.resume, settings: source.draft.templateSettings };
    }
    const version = await repo.getResumeVersion(source.versionId);
    if (!version || version.kind !== "master") throw new Error("The selected Master is unavailable.");
    if (version.status === "draft") throw new Error("Review and approve this Master before rendering.");
    return { content: version.contentJson, settings: version.templateSettingsJson };
  };
  const validate = async (content: Awaited<ReturnType<typeof read>>["content"]) => {
    const [profile, facts, items, skills] = await Promise.all([repo.getProfile(), repo.listCareerFacts(), repo.listCareerItems(), repo.listSkills()]);
    if (!profile || missingRequiredContactFields(profile).length) throw new Error("Complete the profile contact fields before generating the PDF.");
    if (allResumeBullets(content).some(({bullet}) => bullet.included && (!bullet.approved || bullet.rejected))) throw new Error("Review all included Master bullets before rendering.");
    if (hasBlockingValidationErrors(validateResumeClaims({resume: content,profile,facts,items,skills}))) throw new Error("Master evidence changed or contains unsupported claims. Review it before rendering.");
  };
  const initial = await read();await validate(initial.content);
  const bytes = await renderResumePdfBytes(initial.content, initial.settings);
  if (await countPdfPages(bytes) !== 1) throw new Error("The rendered Master is not one page. Review and shorten its content before exporting.");
  const current = await read();await validate(current.content);
  if (await canonicalDigest(current) !== await canonicalDigest(initial)) throw new Error("The Master changed while rendering. Generate a fresh PDF preview.");
  return { dataUrl: pdfBytesToDataUrl(bytes), pageCount: 1, versionId: "versionId" in source ? source.versionId : null };
}
