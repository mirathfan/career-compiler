import type { AppRepository } from "../database/repository";
import type { ResumeVersion } from "../../types/domain";
import { validateResumeClaims, hasBlockingValidationErrors, allResumeBullets } from "../resume/validation";
import { canonicalDigest } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
import { normalizeTailoredResume } from "../resume/normalize";

export async function saveReviewedTailoredChild(repository: AppRepository, base: ResumeVersion, input: Partial<ResumeVersion> & Pick<ResumeVersion, "jobId" | "contentJson">, reviewed: boolean) {
  if (!reviewed || allResumeBullets(input.contentJson).some(({ bullet }) => bullet.included && !bullet.approved)) throw new Error("Review the changes and accept or reject each included bullet before creating the child.");
  return repository.transaction(async repo => {
    const current = await repo.getResumeVersion(base.id);
    if (!current || await canonicalDigest(current) !== await canonicalDigest(base)) throw new Error("The source résumé changed. Generate and review a fresh draft.");
    if (!await repo.getJob(input.jobId)) throw new Error("The selected job is unavailable.");
    const [profile, facts, items, skills] = await Promise.all([repo.getProfile(), repo.listCareerFacts(), repo.listCareerItems(), repo.listSkills()]);
    if (!profile) throw new Error("Complete your profile before creating the child.");
    const contentJson = normalizeTailoredResume(input.contentJson);
    const issues = validateResumeClaims({ resume: contentJson, profile, facts, items, skills });
    if (hasBlockingValidationErrors(issues)) throw new Error("Career evidence changed or contains unsupported claims. Review validation before saving.");
    return repo.saveResumeVersion({ ...input, contentJson, id: undefined, kind: "tailored", parentResumeVersionId: base.id, baseResumeVersionId: base.id, validationJson: issues, status: "approved" });
  });
}
