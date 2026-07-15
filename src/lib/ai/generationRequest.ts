import { ResumeGenerationRequestSchema } from "../../schemas/generation";
import type {
  ApprovedBulletVariant,
  CareerItem,
  EvidenceScore,
  Job,
  JobAnalysis,
  Profile,
  ResumeGenerationRequest,
  Skill,
  TailoredResume,
  TailoringControls,
} from "../../types/domain";
import { unique } from "../utils";

export function sectionOrderForPreset(
  preset: TailoringControls["sectionOrderPreset"],
): TailoredResume["sectionOrder"] {
  if (preset === "ai-full-stack") {
    return ["summary", "projects", "experience", "education", "skills"];
  }
  if (preset === "experience-first") {
    return ["summary", "experience", "projects", "education", "skills"];
  }
  return ["summary", "education", "experience", "projects", "skills"];
}

function matchesExcludedTag(score: EvidenceScore, excludedTags: string[]) {
  const excluded = new Set(excludedTags.map((tag) => tag.toLowerCase()));
  return [...score.fact.skillTags, ...score.fact.roleTags].some((tag) =>
    excluded.has(tag.toLowerCase()),
  );
}

export function buildResumeGenerationRequest({
  job,
  analysis,
  profile,
  items,
  evidence,
  skills,
  controls,
  approvedVariants = [],
}: {
  job: Job;
  analysis: JobAnalysis;
  profile: Profile;
  items: CareerItem[];
  evidence: EvidenceScore[];
  skills: Skill[];
  controls: TailoringControls;
  approvedVariants?: ApprovedBulletVariant[];
}): ResumeGenerationRequest {
  const requiredFactIds = new Set(controls.requiredFactIds);
  const excludedFactIds = new Set(controls.excludedFactIds);
  const selected = evidence.filter((score) => {
    if (!score.fact.enabled || !score.item.enabled || score.fact.evidenceStatus === "prohibited") return false;
    if (excludedFactIds.has(score.fact.id) || matchesExcludedTag(score, controls.excludedTags)) return false;
    return score.selected || requiredFactIds.has(score.fact.id);
  });
  const selectedFactIds = new Set(selected.map((score) => score.fact.id));
  const selectedItemIds = new Set(selected.map((score) => score.item.id));
  items
    .filter((item) => item.enabled && item.type === "education")
    .forEach((item) => selectedItemIds.add(item.id));

  const maximumSelectedProjects = controls.projectCount === "auto" ? 3 : controls.projectCount;
  const maximumBulletsPerItem = controls.bulletsPerProject === "auto" ? 2 : controls.bulletsPerProject;
  const targetEmphasisAreas = unique([
    ...controls.emphasisTags,
    ...(controls.targetRoleCategory ? [controls.targetRoleCategory] : []),
    ...analysis.requiredSkills.slice(0, 8),
  ]);

  const request: ResumeGenerationRequest = {
    targetJob: {
      company: job.company,
      roleTitle: job.roleTitle,
      jobDescription: job.rawDescription,
      analysis,
    },
    candidateProfile: {
      name: profile.fullName,
      headline: profile.headline,
      location: [profile.city, profile.region].filter(Boolean).join(", "),
      email: profile.email,
      phone: profile.phone,
      portfolioUrl: profile.portfolioUrl,
      linkedInUrl: profile.linkedInUrl,
      githubUrl: profile.githubUrl,
      workAuthorizationNote: profile.workAuthorizationNote.trim() || null,
    },
    selectedCareerItems: items
      .filter((item) => selectedItemIds.has(item.id) && item.enabled)
      .map((item) => ({
        careerItemId: item.id,
        type: item.type,
        title: item.title,
        organization: item.organization,
        location: item.location,
        startDate: item.startDate,
        endDate: item.endDate,
        isCurrent: item.isCurrent,
        url: item.url,
        repositoryUrl: item.repositoryUrl,
      })),
    selectedFacts: selected.map((score) => ({
      factId: score.fact.id,
      careerItemId: score.fact.careerItemId,
      statement: score.fact.statement,
      evidenceStatus: score.fact.evidenceStatus as Exclude<typeof score.fact.evidenceStatus, "prohibited">,
      skillTags: score.fact.skillTags,
      roleTags: score.fact.roleTags,
      metricTokens: score.fact.metricTokens,
      importance: score.fact.importance,
      relevanceScore: score.score,
      relevanceReason: score.reasons.join(" "),
    })),
    approvedSkills: skills
      .filter((skill) => skill.enabled)
      .map((skill) => ({ skillId: skill.id, name: skill.name, category: skill.category })),
    approvedVariants: approvedVariants.filter(
      (variant) =>
        selectedItemIds.has(variant.careerItemId) &&
        variant.sourceFactIds.length > 0 &&
        variant.sourceFactIds.every((factId) => selectedFactIds.has(factId)) &&
        (variant.roleCategories.length === 0 ||
          variant.roleCategories.some((role) => analysis.roleCategories.includes(role))),
    ),
    constraints: {
      sectionOrder: sectionOrderForPreset(controls.sectionOrderPreset),
      maximumSelectedProjects,
      maximumBulletsPerItem,
      summaryMode: controls.summaryMode,
      summaryPermitted: controls.summaryMode !== "never",
      onePageRequired: controls.strictOnePage,
      lockedCareerItemIds: controls.lockedCareerItemIds,
      lockedFactIds: controls.requiredFactIds,
      targetEmphasisAreas,
      deEmphasisAreas: unique([
        ...controls.excludedTags,
        "Unsupported claims",
        "Repeated evidence",
      ]),
      contentBudget: {
        maximumTotalBullets: Math.min(14, maximumSelectedProjects * maximumBulletsPerItem + 4),
        recommendedBulletWords: 28,
      },
    },
  };

  return ResumeGenerationRequestSchema.parse(request);
}
