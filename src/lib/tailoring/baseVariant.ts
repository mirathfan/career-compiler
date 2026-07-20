import type { ResumeBullet, ResumeCareerItemSection, TailoredResume } from "../../types/domain";
import { createId, unique } from "../utils";

type SectionKind = "projects" | "experience";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function factKey(sourceFactIds: string[]) {
  return [...sourceFactIds].sort().join("|");
}

function isReviewableProposal(bullet: ResumeBullet) {
  return bullet.included && bullet.sourceFactIds.length > 0 && !bullet.rejected;
}

function approvedBaseBullet(bullet: ResumeBullet): ResumeBullet {
  return {
    ...clone(bullet),
    approved: bullet.included && !bullet.rejected ? true : bullet.approved,
  };
}

function pendingProposalBullet(
  bullet: ResumeBullet,
  reason: string,
): ResumeBullet {
  return {
    ...clone(bullet),
    id: createId("bullet"),
    included: true,
    approved: false,
    rejected: false,
    locked: false,
    generationSource: bullet.generationSource === "user" ? "ai" : bullet.generationSource,
    generationReason: reason,
    selectionReason: reason,
  };
}

function mergeProposalIntoBaseBullet(
  baseBullet: ResumeBullet,
  proposal: ResumeBullet,
): ResumeBullet {
  const changed = baseBullet.text.trim() !== proposal.text.trim();
  if (!changed) {
    return {
      ...clone(baseBullet),
      relevanceScore: Math.max(baseBullet.relevanceScore, proposal.relevanceScore),
      keywordsAddressed: unique([...baseBullet.keywordsAddressed, ...proposal.keywordsAddressed]),
      approved: true,
      rejected: false,
    };
  }
  return {
    ...clone(baseBullet),
    text: proposal.text,
    relevanceScore: Math.max(baseBullet.relevanceScore, proposal.relevanceScore),
    isUserEdited: false,
    included: true,
    approved: false,
    rejected: false,
    generationSource: "ai",
    generationReason: proposal.generationReason || "AI proposed a controlled rewrite for this job.",
    keywordsAddressed: unique([...baseBullet.keywordsAddressed, ...proposal.keywordsAddressed]),
    selectionReason: proposal.selectionReason || "Matched source facts already present in the base resume.",
  };
}

function findSection(
  resume: TailoredResume,
  sectionKind: SectionKind,
  careerItemId: string,
) {
  return resume[sectionKind].find((section) => section.careerItemId === careerItemId);
}

function createAddedSection(section: ResumeCareerItemSection) {
  const next = clone(section);
  next.locked = false;
  next.bullets = next.bullets
    .filter(isReviewableProposal)
    .map((bullet) => pendingProposalBullet(bullet, "AI proposed adding this evidence from Career Memory."));
  return next;
}

export interface ControlledVariantResult {
  variant: TailoredResume;
  changedBulletIds: string[];
  addedBulletIds: string[];
}

export function createControlledResumeVariantFromBase({
  base,
  proposed,
}: {
  base: TailoredResume;
  proposed: TailoredResume;
}): ControlledVariantResult {
  const variant = clone(base);
  variant.id = createId("tailored-resume");
  variant.compactionActions = [];
  variant.approvedWarningCodes = [];

  for (const sectionKind of ["projects", "experience"] as const) {
    variant[sectionKind] = variant[sectionKind].map((section) => ({
      ...clone(section),
      bullets: section.bullets.map(approvedBaseBullet),
    }));
  }

  const changedBulletIds: string[] = [];
  const addedBulletIds: string[] = [];

  for (const sectionKind of ["projects", "experience"] as const) {
    for (const proposalSection of proposed[sectionKind]) {
      const baseSection = findSection(variant, sectionKind, proposalSection.careerItemId);
      if (!baseSection) {
        const addedSection = createAddedSection(proposalSection);
        if (addedSection.bullets.length > 0) {
          addedBulletIds.push(...addedSection.bullets.map((bullet) => bullet.id));
          variant[sectionKind].push(addedSection);
        }
        continue;
      }
      if (baseSection.locked) continue;
      baseSection.url = baseSection.url || proposalSection.url;
      baseSection.repositoryUrl = baseSection.repositoryUrl || proposalSection.repositoryUrl;
      baseSection.technologies = baseSection.technologies?.length
        ? baseSection.technologies
        : proposalSection.technologies;

      const baseBulletByFacts = new Map(
        baseSection.bullets
          .filter((bullet) => bullet.sourceFactIds.length > 0)
          .map((bullet, index) => [factKey(bullet.sourceFactIds), { bullet, index }]),
      );

      for (const proposalBullet of proposalSection.bullets.filter(isReviewableProposal)) {
        const key = factKey(proposalBullet.sourceFactIds);
        const current = baseBulletByFacts.get(key);
        if (!current) {
          const added = pendingProposalBullet(
            proposalBullet,
            "AI proposed adding this evidence from Career Memory.",
          );
          baseSection.bullets.push(added);
          baseBulletByFacts.set(key, { bullet: added, index: baseSection.bullets.length - 1 });
          addedBulletIds.push(added.id);
          continue;
        }
        if (current.bullet.locked) continue;
        const replacement = mergeProposalIntoBaseBullet(current.bullet, proposalBullet);
        baseSection.bullets[current.index] = replacement;
        baseBulletByFacts.set(key, { bullet: replacement, index: current.index });
        if (!replacement.approved) changedBulletIds.push(replacement.id);
      }
    }
  }

  return { variant, changedBulletIds, addedBulletIds };
}
