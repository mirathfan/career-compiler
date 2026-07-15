import type {
  CareerFact,
  CareerItem,
  EvidenceScore,
  JobAnalysis,
  Profile,
  ResumeBullet,
  ResumeCareerItemSection,
  ResumePlan,
  Skill,
  TailoredResume,
} from "../../types/domain";
import { createId, formatDateRange, unique } from "../utils";

function conciseBullet(statement: string) {
  return statement.replace(/^User-reported /, "").replace(/\.$/, ".");
}

function sectionForItem(
  item: CareerItem,
  bullets: ResumeBullet[],
): ResumeCareerItemSection {
  return {
    careerItemId: item.id,
    title: item.title,
    organization: item.organization,
    location: item.location,
    startDate: item.startDate,
    endDate: item.endDate,
    isCurrent: item.isCurrent,
    bullets,
  };
}

export function generateTailoredResume({
  profile,
  items,
  facts,
  skills,
  analysis,
  plan,
  evidence,
}: {
  profile: Profile;
  items: CareerItem[];
  facts: CareerFact[];
  skills: Skill[];
  analysis: JobAnalysis;
  plan: ResumePlan;
  evidence: EvidenceScore[];
}): TailoredResume {
  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const scoreByFactId = new Map(evidence.map((score) => [score.fact.id, score]));
  const selectedFacts = plan.selectedFactIds
    .map((id) => factById.get(id))
    .filter((fact): fact is CareerFact => Boolean(fact));

  const bulletsByItem = new Map<string, ResumeBullet[]>();
  for (const fact of selectedFacts.slice(0, plan.contentBudget.maxBullets)) {
    const score = scoreByFactId.get(fact.id);
    const bullet: ResumeBullet = {
      id: createId("bullet"),
      text: conciseBullet(fact.statement),
      sourceFactIds: [fact.id],
      relevanceScore: score?.score ?? fact.importance,
      isUserEdited: false,
      included: true,
      selectionReason: score?.reasons.join(" ") ?? "Selected by deterministic evidence scoring.",
    };
    bulletsByItem.set(fact.careerItemId, [...(bulletsByItem.get(fact.careerItemId) ?? []), bullet]);
  }

  const sections = [...bulletsByItem.entries()]
    .map(([itemId, bullets]) => {
      const item = itemById.get(itemId);
      return item ? sectionForItem(item, bullets) : null;
    })
    .filter((section): section is ResumeCareerItemSection => Boolean(section));

  const projects = sections
    .filter((section) => itemById.get(section.careerItemId)?.type === "project")
    .slice(0, plan.contentBudget.maxProjects);
  const experience = sections.filter(
    (section) => itemById.get(section.careerItemId)?.type === "employment",
  );

  const education = items
    .filter((item) => item.enabled && item.type === "education")
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((item) => ({
      careerItemId: item.id,
      title: item.title,
      organization: item.organization,
      location: item.location,
      dateLabel: formatDateRange(item.startDate, item.endDate, item.isCurrent),
    }));

  const availableSkills = new Set(skills.filter((skill) => skill.enabled).map((skill) => skill.name));
  const selectedSkills = unique(plan.skillSelection.filter((skill) => availableSkills.has(skill))).slice(0, 24);

  return {
    id: createId("tailored-resume"),
    header: {
      fullName: profile.fullName,
      headline: profile.headline,
      location: [profile.city, profile.region].filter(Boolean).join(", "),
      email: profile.email,
      phone: profile.phone,
      portfolioUrl: profile.portfolioUrl,
      linkedInUrl: profile.linkedInUrl,
      githubUrl: profile.githubUrl,
    },
    summary: plan.contentBudget.includeSummary
      ? [
          analysis.summary ||
            "Full-stack and AI software engineer with product-oriented project experience.",
          `Emphasis: ${plan.emphasisAreas.slice(0, 4).join(", ")}.`,
        ]
      : [],
    education,
    experience,
    projects,
    skills: selectedSkills,
    sectionOrder: plan.sectionOrder,
    compactionActions: [],
  };
}
