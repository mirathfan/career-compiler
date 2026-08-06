import type { Job, JobMatch, JobSearchPreferences } from "../../types/domain";
import { detectSeniority, extractExperienceRequirement, normalizeTitle } from "./normalize";
import type { CareerMatchContext } from "./types";

const SKILL_ALIASES: Record<string, string[]> = {
  javascript: ["js", "ecmascript"],
  typescript: ["ts"],
  postgresql: ["postgres"],
  "react native": ["react-native"],
  "node.js": ["node", "nodejs"],
  "machine learning": ["ml"],
  "artificial intelligence": ["ai"],
};

function containsTerm(text: string, term: string) {
  const candidates = [term, ...(SKILL_ALIASES[term.toLowerCase()] ?? [])];
  return candidates.some((candidate) => {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
  });
}

function clamp(value: number, maximum: number) {
  return Math.max(0, Math.min(maximum, value));
}

export function combineScores(deterministicScore: number, aiScore: number | null, deterministicWeight = 0.7) {
  if (aiScore === null) return Math.round(clamp(deterministicScore, 100));
  const weight = clamp(deterministicWeight, 1);
  return Math.round(clamp(deterministicScore * weight + aiScore * (1 - weight), 100));
}

export function scoreJob(job: Job, preferences: JobSearchPreferences, career: CareerMatchContext, now = new Date()): Pick<JobMatch,
  "deterministicScore" | "combinedScore" | "scoreBreakdown" | "scoreReasons" | "matchedSkillIds" | "matchedProjectIds" | "matchedFactIds" | "missingRequirements" | "experienceCompatibility" | "locationCompatibility"> {
  const text = `${job.roleTitle}\n${job.descriptionText || job.rawDescription}`;
  const normalizedJobTitle = normalizeTitle(job.roleTitle);
  const targetMatches = preferences.targetRoleTitles.filter((role) => {
    const normalized = normalizeTitle(role);
    return normalized && (normalizedJobTitle.includes(normalized) || normalized.includes(normalizedJobTitle));
  });
  const titleOverlap = Math.max(0, ...preferences.targetRoleTitles.map((role) => {
    const targetTokens = new Set(normalizeTitle(role).split(" ").filter(Boolean));
    const jobTokens = new Set(normalizedJobTitle.split(" ").filter(Boolean));
    const matched = [...targetTokens].filter((token) => jobTokens.has(token)).length;
    return targetTokens.size ? matched / targetTokens.size : 0;
  }));
  const preferredSeniority = preferences.seniorityLevels;
  const seniority = detectSeniority(job.roleTitle);
  const seniorityFit = !preferredSeniority.length || preferredSeniority.includes(seniority) ? 1 : 0.25;
  const titleScore = clamp((targetMatches.length ? 1 : titleOverlap) * 20 + seniorityFit * 5, 25);

  const enabledSkills = career.skills.filter((skill) => skill.enabled);
  const matchedSkills = enabledSkills.filter((skill) => containsTerm(text, skill.name));
  const preferredSkills = preferences.preferredSkills.length ? preferences.preferredSkills : enabledSkills.map((skill) => skill.name);
  const preferredMatched = preferredSkills.filter((skill) => containsTerm(text, skill));
  const skillScore = clamp(preferredSkills.length ? preferredMatched.length / Math.min(preferredSkills.length, 8) * 25 : 12.5, 25);

  const requiredYears = extractExperienceRequirement(job.descriptionText || job.rawDescription);
  const maximumYears = preferences.maximumExperienceYears;
  const experienceCompatibility = requiredYears === null || maximumYears === null
    ? "unclear"
    : requiredYears <= maximumYears
      ? "strong"
      : requiredYears <= maximumYears + 2 ? "weak" : "incompatible";
  const experienceScore = requiredYears === null || maximumYears === null ? 12 : experienceCompatibility === "strong" ? 20 : experienceCompatibility === "weak" ? 8 : 0;

  const locationText = `${job.location} ${job.normalizedLocation}`.toLowerCase();
  const preferredLocationMatch = preferences.preferredLocations.some((location) => locationText.includes(location.toLowerCase()));
  const workplaceMatch = preferences.remotePreference === "any" || job.workplaceType === preferences.remotePreference;
  const locationScore = preferences.preferredLocations.length
    ? (preferredLocationMatch ? 6 : 0) + (workplaceMatch ? 4 : 0)
    : workplaceMatch ? 10 : 4;
  const locationCompatibility = locationScore >= 8 ? "strong" : locationScore >= 4 ? "moderate" : "incompatible";

  const enabledFacts = career.careerFacts.filter((fact) => fact.enabled && fact.evidenceStatus !== "prohibited");
  const matchedFacts = enabledFacts.filter((fact) => [...fact.skillTags, ...fact.roleTags].some((tag) => containsTerm(text, tag)));
  const itemById = new Map(career.careerItems.map((item) => [item.id, item]));
  const projectIds = [...new Set(matchedFacts.map((fact) => itemById.get(fact.careerItemId)).filter((item) => item?.type === "project").map((item) => item?.id as string))];
  const projectScore = clamp(projectIds.length * 3 + Math.min(matchedFacts.length, 4), 10);

  let recencyScore = 5;
  if (job.postedAt) {
    const ageDays = Math.max(0, (now.getTime() - new Date(job.postedAt).getTime()) / 86_400_000);
    if (Number.isFinite(ageDays)) recencyScore = clamp(10 - ageDays / Math.max(preferences.maximumJobAgeDays, 1) * 10, 10);
  }

  const scoreBreakdown = {
    title: Math.round(titleScore),
    skills: Math.round(skillScore),
    experience: Math.round(experienceScore),
    location: Math.round(locationScore),
    projects: Math.round(projectScore),
    recency: Math.round(recencyScore),
  };
  const deterministicScore = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
  const missingRequirements = preferences.preferredSkills.filter((skill) => !containsTerm(text, skill));
  const scoreReasons = [
    `${matchedSkills.length} Career Memory skill${matchedSkills.length === 1 ? "" : "s"} matched.`,
    `${matchedFacts.length} verified or user-provided evidence fact${matchedFacts.length === 1 ? "" : "s"} aligned.`,
    `Role seniority classified as ${seniority}.`,
  ];
  return {
    deterministicScore,
    combinedScore: deterministicScore,
    scoreBreakdown,
    scoreReasons,
    matchedSkillIds: matchedSkills.map((skill) => skill.id),
    matchedProjectIds: projectIds,
    matchedFactIds: matchedFacts.map((fact) => fact.id),
    missingRequirements,
    experienceCompatibility,
    locationCompatibility,
  };
}
