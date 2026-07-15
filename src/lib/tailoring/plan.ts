import type { EvidenceScore, JobAnalysis, ResumePlan, Skill } from "../../types/domain";
import { unique } from "../utils";

export function createResumePlan(
  analysis: JobAnalysis,
  evidence: EvidenceScore[],
  skills: Skill[],
): ResumePlan {
  const selected = evidence
    .filter((score) => score.selected)
    .sort((a, b) => b.score - a.score)
    .slice(0, 14);
  const selectedCareerItemIds = unique(selected.map((score) => score.item.id));
  const selectedFactIds = selected.map((score) => score.fact.id);
  const selectedSkillNames = skills
    .filter((skill) => skill.enabled)
    .filter((skill) =>
      [...analysis.requiredSkills, ...analysis.preferredSkills, ...analysis.domainKeywords].some(
        (term) => skill.name.toLowerCase() === term.toLowerCase(),
      ),
    )
    .map((skill) => skill.name);

  const fallbackSkills = skills
    .filter((skill) => skill.enabled)
    .slice(0, 18)
    .map((skill) => skill.name);

  return {
    targetPositioning:
      analysis.summary ||
      `Position Mir Athfan Ali as a ${analysis.roleCategories.slice(0, 2).join(" and ")}.`,
    selectedCareerItemIds,
    selectedFactIds,
    sectionOrder: ["summary", "projects", "experience", "education", "skills"],
    emphasisAreas: unique([
      ...analysis.requiredSkills.slice(0, 6),
      ...analysis.roleCategories.slice(0, 3),
    ]),
    deEmphasisAreas: ["Claims without source facts", "Unsupported percentages", "Unverified dates"],
    omittedItems: evidence
      .filter((score) => !score.selected)
      .map((score) => ({ careerItemId: score.item.id, reason: score.excludedReason }))
      .filter(
        (item, index, array) =>
          array.findIndex((candidate) => candidate.careerItemId === item.careerItemId) === index,
      ),
    skillSelection: selectedSkillNames.length ? unique(selectedSkillNames) : fallbackSkills,
    contentBudget: {
      maxBullets: 12,
      maxProjects: 4,
      includeSummary: true,
    },
  };
}
