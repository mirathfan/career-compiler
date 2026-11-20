import type { AppRepository } from "../database/repository";
import { canonicalDigest } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
import { createMasterResumeFromProfile } from "./masterResume";
import { validateResumeClaims, hasBlockingValidationErrors } from "../resume/validation";
import { normalizeTailoredResume } from "../resume/normalize";

async function inputs(repo: AppRepository) {
  const [profile, items, facts, skills, settings] = await Promise.all([repo.getProfile(), repo.listCareerItems(), repo.listCareerFacts(), repo.listSkills(), repo.getSettings()]);
  if (!profile) throw new Error("Complete your profile first.");
  return { profile, items, facts, skills, settings: settings.templateSettings, templateId: settings.defaultTemplateId };
}
export async function prepareProfileMaster(repo: AppRepository) {
  const source = await inputs(repo), resume = normalizeTailoredResume(createMasterResumeFromProfile(source));
  if (!resume.projects.length && !resume.experience.length) throw new Error("Review project or work evidence before creating a résumé. Imported claims start as needs review.");
  const issues = validateResumeClaims({ ...source, resume });
  if (hasBlockingValidationErrors(issues)) throw new Error("Resolve unsupported profile claims before creating a résumé.");
  const preview = { resume, templateSettings: source.settings, templateId: source.templateId };
  return { ...preview, issues, sourceDigest: await canonicalDigest(source), previewDigest: await canonicalDigest(preview) };
}
export type ProfileMasterDraft = Awaited<ReturnType<typeof prepareProfileMaster>>;

export async function validateProfileMasterPreview(repo: AppRepository, draft: ProfileMasterDraft, reviewed: boolean) {
  if (!reviewed) throw new Error("Review the profile résumé before saving or rendering.");
  const source = await inputs(repo);
  if (await canonicalDigest({ resume: draft.resume, templateSettings: draft.templateSettings, templateId: draft.templateId }) !== draft.previewDigest) throw new Error("Preview changed. Prepare and review a fresh résumé.");
  if (await canonicalDigest(source) !== draft.sourceDigest) throw new Error("Profile evidence changed. Prepare a fresh preview.");
  const issues = validateResumeClaims({ ...source, resume: draft.resume });
  if (hasBlockingValidationErrors(issues)) throw new Error("Resolve unsupported profile claims before creating a résumé.");
  return issues;
}
export async function saveProfileMaster(repo: AppRepository, draft: ProfileMasterDraft, reviewed: boolean) {
  return repo.transaction(async tx => {
    const issues = await validateProfileMasterPreview(tx, draft, reviewed);
    if (!await tx.supportsStandaloneMaster()) throw new Error("Standalone Master saving requires the approved database update. You can review and preview the PDF without a job.");
    return tx.saveResumeVersion({ jobId: "", name: "Master Resume", kind: "master", contentJson: draft.resume, validationJson: issues, templateId: draft.templateId, templateSettingsJson: draft.templateSettings, status: "approved", parentResumeVersionId: "", baseResumeVersionId: "" });
  });
}
