import type {
  ResumeBullet,
  ResumeCareerItemSection,
  ResumeGenerationRequest,
  ResumeGenerationSource,
  ResumePlan,
  TailoredResume,
} from "../../types/domain";
import { createId, formatDateRange, unique } from "../utils";

function tailoredText(factId: string, statement: string) {
  const known: Record<string, string> = {
    "project-forge-fact-01":
      "Built an end-to-end fitness application with Expo React Native and a FastAPI, PostgreSQL, Alembic, and Docker backend.",
    "project-forge-fact-07":
      "Made set creation idempotent with client mutation IDs and database uniqueness constraints.",
    "project-forge-fact-08":
      "Added resilient offline workout logging with queueing, retries, reconciliation, and explicit sync states.",
    "project-aura-fact-01":
      "Built a mobile AI personal stylist with Expo React Native, TypeScript, Firebase, OpenAI, and iOS Vision.",
    "project-aura-fact-02":
      "Owned the product from initial implementation through TestFlight beta distribution.",
    "project-aura-fact-05":
      "Built an offline evaluation harness to gate AI changes before release.",
    "project-client-bookstore-fact-01":
      "Delivered a production bookstore platform for a real client using React, Vite, and Supabase.",
    "project-client-bookstore-fact-03":
      "Designed Supabase tables, storage, authentication, and row-level security policies.",
    "project-client-bookstore-fact-05":
      "Adapted the application as real client requirements changed.",
  };
  return known[factId] ?? statement.replace(/^User-reported current validation included /, "Validated ");
}

function keywordsForFact(request: ResumeGenerationRequest, factText: string, skillTags: string[]) {
  const source = [factText, ...skillTags].join(" ").toLowerCase();
  return unique([
    ...request.targetJob.analysis.requiredSkills,
    ...request.targetJob.analysis.preferredSkills,
    ...request.constraints.targetEmphasisAreas,
  ])
    .filter((keyword) => source.includes(keyword.toLowerCase()))
    .slice(0, 6);
}

export function generateResumeFromAllowedEvidence(
  request: ResumeGenerationRequest,
  plan: ResumePlan,
  generationSource: ResumeGenerationSource,
): TailoredResume {
  const itemById = new Map(request.selectedCareerItems.map((item) => [item.careerItemId, item]));
  const factById = new Map(request.selectedFacts.map((fact) => [fact.factId, fact]));
  const plannedItemOrder = new Map(
    plan.selectedCareerItemIds.map((careerItemId, index) => [careerItemId, index]),
  );
  const allowedSkillNames = new Set(request.approvedSkills.map((skill) => skill.name));
  const usedFacts = new Set<string>();
  const bulletsByItem = new Map<string, ResumeBullet[]>();

  for (const variant of request.approvedVariants) {
    if (!variant.sourceFactIds.every((factId) => factById.has(factId)) || usedFacts.size >= plan.contentBudget.maxBullets) {
      continue;
    }
    const score = Math.max(...variant.sourceFactIds.map((factId) => factById.get(factId)?.relevanceScore ?? 0));
    const bullet: ResumeBullet = {
      id: createId("bullet"),
      text: variant.text,
      sourceFactIds: variant.sourceFactIds,
      relevanceScore: score,
      isUserEdited: variant.creationSource === "user",
      included: true,
      locked: false,
      approved: true,
      rejected: false,
      generationSource: variant.creationSource,
      generationReason: "Reused a previously approved variant relevant to this role.",
      keywordsAddressed: unique(variant.skillTags),
      selectionReason: "Approved variant matched selected facts and role categories.",
    };
    bulletsByItem.set(variant.careerItemId, [...(bulletsByItem.get(variant.careerItemId) ?? []), bullet]);
    variant.sourceFactIds.forEach((factId) => usedFacts.add(factId));
  }

  const orderedFacts = plan.selectedFactIds
    .map((factId) => factById.get(factId))
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));

  for (const fact of orderedFacts) {
    if (usedFacts.has(fact.factId)) continue;
    const current = bulletsByItem.get(fact.careerItemId) ?? [];
    if (
      current.length >= plan.contentBudget.maxBulletsPerItem ||
      [...bulletsByItem.values()].flat().length >= plan.contentBudget.maxBullets
    ) {
      continue;
    }
    const reason = fact.relevanceReason || "Selected by deterministic relevance scoring.";
    current.push({
      id: createId("bullet"),
      text: generationSource === "ai" ? tailoredText(fact.factId, fact.statement) : fact.statement,
      sourceFactIds: [fact.factId],
      relevanceScore: fact.relevanceScore,
      isUserEdited: false,
      included: true,
      locked: request.constraints.lockedFactIds.includes(fact.factId),
      approved: false,
      rejected: false,
      generationSource,
      generationReason: reason,
      keywordsAddressed: keywordsForFact(request, fact.statement, fact.skillTags),
      selectionReason: reason,
    });
    bulletsByItem.set(fact.careerItemId, current);
    usedFacts.add(fact.factId);
  }

  const sections: ResumeCareerItemSection[] = [...bulletsByItem.entries()]
    .map(([
      careerItemId,
      bullets,
    ]): ResumeCareerItemSection | null => {
      const item = itemById.get(careerItemId);
      if (!item || item.type === "education") return null;
      return {
        careerItemId,
        title: item.title,
        organization: item.organization,
        location: item.location,
        startDate: item.startDate,
        endDate: item.endDate,
        isCurrent: item.isCurrent,
        url: item.url,
        repositoryUrl: item.repositoryUrl,
        locked: request.constraints.lockedCareerItemIds.includes(careerItemId),
        bullets,
      };
    })
    .filter((section): section is ResumeCareerItemSection => Boolean(section));

  const projects = sections
    .filter((section) => itemById.get(section.careerItemId)?.type === "project")
    .sort(
      (a, b) =>
        (plannedItemOrder.get(a.careerItemId) ?? Number.MAX_SAFE_INTEGER) -
        (plannedItemOrder.get(b.careerItemId) ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, plan.contentBudget.maxProjects);
  const experience = sections.filter(
    (section) => itemById.get(section.careerItemId)?.type === "employment",
  );
  const selectedSkills = unique(
    plan.skillSelection
      .filter((skill) => allowedSkillNames.has(skill))
      .concat(
        request.approvedSkills
          .filter((skill) =>
            request.targetJob.analysis.requiredSkills.some(
              (required) => required.toLowerCase() === skill.name.toLowerCase(),
            ),
          )
          .map((skill) => skill.name),
      ),
  ).slice(0, 24);

  return {
    id: createId("tailored-resume"),
    header: {
      fullName: request.candidateProfile.name,
      headline: request.candidateProfile.headline,
      location: request.candidateProfile.location,
      email: request.candidateProfile.email,
      phone: request.candidateProfile.phone,
      portfolioUrl: request.candidateProfile.portfolioUrl,
      linkedInUrl: request.candidateProfile.linkedInUrl,
      githubUrl: request.candidateProfile.githubUrl,
      workAuthorizationNote: request.candidateProfile.workAuthorizationNote ?? "",
    },
    summary: plan.contentBudget.includeSummary && request.constraints.summaryPermitted
      ? [
          `Full-stack software engineer focused on ${request.constraints.targetEmphasisAreas
            .slice(0, 4)
            .join(", ")}.`,
        ]
      : [],
    education: request.selectedCareerItems
      .filter((item) => item.type === "education")
      .map((item) => ({
        careerItemId: item.careerItemId,
        title: item.title,
        organization: item.organization,
        location: item.location,
        dateLabel: formatDateRange(item.startDate, item.endDate, item.isCurrent),
      })),
    experience,
    projects,
    skills: selectedSkills,
    sectionOrder: plan.sectionOrder,
    compactionActions: [],
    layout: { bodyFontSize: 9.5, spacingScale: 1, condensedSkills: false },
    approvedWarningCodes: [],
  };
}
