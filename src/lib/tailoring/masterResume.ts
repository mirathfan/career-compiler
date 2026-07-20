import type {
  CareerFact,
  CareerItem,
  Profile,
  ResumeBullet,
  ResumeCareerItemSection,
  ResumeTemplateSettings,
  Skill,
  TailoredResume,
} from "../../types/domain";
import { createId, formatDateRange, unique } from "../utils";

function sectionOrder(settings: ResumeTemplateSettings): TailoredResume["sectionOrder"] {
  const content: TailoredResume["sectionOrder"] =
    settings.projectsExperienceOrdering === "experience-first"
      ? ["experience", "projects"]
      : ["projects", "experience"];
  return ["summary", ...content, "education", "skills"];
}

function factWeight(fact: CareerFact) {
  const statusWeight = fact.evidenceStatus === "verified" ? 8 : fact.evidenceStatus === "user_provided" ? 4 : 0;
  const sourceWeight = fact.sourceType === "resume" || fact.sourceType === "manually_verified" ? 4 : 0;
  return statusWeight + sourceWeight + fact.importance * 2 + fact.metricTokens.length;
}

function bulletFromFact(fact: CareerFact): ResumeBullet {
  const reason = "Included from explicitly selected profile data for the starter master resume.";
  return {
    id: createId("bullet"),
    text: fact.statement.replace(/^User-reported /, ""),
    sourceFactIds: [fact.id],
    relevanceScore: factWeight(fact),
    isUserEdited: false,
    included: true,
    locked: false,
    approved: true,
    rejected: false,
    generationSource: "deterministic",
    generationReason: reason,
    keywordsAddressed: unique([...fact.skillTags, ...fact.roleTags]).slice(0, 8),
    selectionReason: reason,
  };
}

function sectionForItem(
  item: CareerItem,
  facts: CareerFact[],
  maxBullets: number,
): ResumeCareerItemSection | null {
  const bullets = facts
    .filter((fact) => fact.careerItemId === item.id && fact.enabled && fact.evidenceStatus !== "prohibited")
    .filter((fact) => fact.evidenceStatus !== "needs_review")
    .sort((left, right) => factWeight(right) - factWeight(left))
    .slice(0, maxBullets)
    .map(bulletFromFact);
  if (!bullets.length) return null;
  return {
    careerItemId: item.id,
    title: item.title,
    organization: item.organization,
    location: item.location,
    startDate: item.startDate,
    endDate: item.endDate,
    isCurrent: item.isCurrent,
    url: item.url,
    repositoryUrl: item.repositoryUrl,
    locked: false,
    bullets,
  };
}

export function createMasterResumeFromProfile({
  profile,
  items,
  facts,
  skills,
  settings,
}: {
  profile: Profile;
  items: CareerItem[];
  facts: CareerFact[];
  skills: Skill[];
  settings: ResumeTemplateSettings;
}): TailoredResume {
  const enabledItems = [...items]
    .filter((item) => item.enabled)
    .sort((left, right) => left.displayOrder - right.displayOrder || left.title.localeCompare(right.title));
  const experience = enabledItems
    .filter((item) => item.type === "employment")
    .map((item) => sectionForItem(item, facts, 3))
    .filter((section): section is ResumeCareerItemSection => Boolean(section));
  const projects = enabledItems
    .filter((item) => item.type === "project")
    .map((item) => sectionForItem(item, facts, settings.defaultBulletsPerProject))
    .filter((section): section is ResumeCareerItemSection => Boolean(section))
    .slice(0, settings.maximumProjectCount);
  const education = enabledItems
    .filter((item) => item.type === "education")
    .map((item) => ({
      careerItemId: item.id,
      title: item.title,
      organization: item.organization,
      location: item.location,
      dateLabel: formatDateRange(item.startDate, item.endDate, item.isCurrent),
    }));

  return {
    id: createId("master-resume"),
    header: {
      fullName: profile.fullName,
      headline: profile.headline,
      location: [profile.city, profile.region].filter(Boolean).join(", "),
      email: profile.email,
      phone: profile.phone,
      portfolioUrl: profile.portfolioUrl,
      linkedInUrl: profile.linkedInUrl,
      githubUrl: profile.githubUrl,
      workAuthorizationNote: profile.workAuthorizationNote,
    },
    summary: profile.headline && settings.summaryAllowed ? [profile.headline] : [],
    experience,
    projects,
    education,
    skills: unique(skills.filter((skill) => skill.enabled).map((skill) => skill.name)).slice(0, 36),
    sectionOrder: sectionOrder(settings),
    compactionActions: [],
    layout: {
      bodyFontSize: settings.bodyFontSize,
      spacingScale: 1,
      condensedSkills: skills.filter((skill) => skill.enabled).length > 24,
    },
    approvedWarningCodes: [],
  };
}
