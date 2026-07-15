import type {
  EvidenceScore,
  JobAnalysis,
  ResumeGenerationRequest,
  ResumePlan,
  Skill,
  TailoringControls,
} from "../../types/domain";
import { unique } from "../utils";
import { sectionOrderForPreset } from "../ai/generationRequest";

export function createResumePlan(
  analysis: JobAnalysis,
  evidence: EvidenceScore[],
  skills: Skill[],
  controls?: TailoringControls,
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
    sectionOrder: controls
      ? sectionOrderForPreset(controls.sectionOrderPreset)
      : ["summary", "projects", "experience", "education", "skills"],
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
      maxProjects: controls?.projectCount === "auto" || !controls ? 3 : controls.projectCount,
      includeSummary: controls?.summaryMode !== "never",
      maxBulletsPerItem:
        controls?.bulletsPerProject === "auto" || !controls ? 2 : controls.bulletsPerProject,
    },
  };
}

export function createResumePlanFromRequest(request: ResumeGenerationRequest): ResumePlan {
  const facts = [...request.selectedFacts].sort((a, b) => b.relevanceScore - a.relevanceScore);
  const projectScores = new Map<string, number>();
  for (const fact of facts) {
    const item = request.selectedCareerItems.find(
      (candidate) => candidate.careerItemId === fact.careerItemId,
    );
    if (item?.type === "project") {
      projectScores.set(
        fact.careerItemId,
        Math.max(projectScores.get(fact.careerItemId) ?? 0, fact.relevanceScore),
      );
    }
  }
  const projectIds = new Set(
    [...projectScores]
      .sort((left, right) => right[1] - left[1])
      .slice(0, request.constraints.maximumSelectedProjects)
      .map(([careerItemId]) => careerItemId),
  );
  const selectedFacts = facts.filter((fact) => {
    const item = request.selectedCareerItems.find((candidate) => candidate.careerItemId === fact.careerItemId);
    return item?.type !== "project" || projectIds.has(fact.careerItemId);
  });
  const selectedCareerItemIds = unique(selectedFacts.map((fact) => fact.careerItemId));
  const selectedItemSet = new Set(selectedCareerItemIds);

  return {
    targetPositioning: request.targetJob.analysis.summary,
    selectedCareerItemIds,
    selectedFactIds: selectedFacts.map((fact) => fact.factId),
    sectionOrder: request.constraints.sectionOrder,
    emphasisAreas: request.constraints.targetEmphasisAreas,
    deEmphasisAreas: request.constraints.deEmphasisAreas,
    omittedItems: request.selectedCareerItems
      .filter((item) => item.type !== "education" && !selectedItemSet.has(item.careerItemId))
      .map((item) => ({ careerItemId: item.careerItemId, reason: "Lower relevance within the content budget." })),
    skillSelection: request.approvedSkills
      .filter((skill) =>
        request.targetJob.analysis.requiredSkills
          .concat(request.targetJob.analysis.preferredSkills)
          .some((name) => name.toLowerCase() === skill.name.toLowerCase()),
      )
      .map((skill) => skill.name),
    contentBudget: {
      maxBullets: request.constraints.contentBudget.maximumTotalBullets,
      maxProjects: request.constraints.maximumSelectedProjects,
      includeSummary: request.constraints.summaryMode === "always",
      maxBulletsPerItem: request.constraints.maximumBulletsPerItem,
    },
  };
}
