import type { CareerFact, CareerItem, Profile, Skill, TailoredResume, ValidationIssue } from "../../types/domain";

const numberPattern = /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?/g;

function normalizeNumber(value: string) {
  return value.replace(/,/g, "").trim();
}

function allBullets(resume: TailoredResume) {
  return [...resume.projects, ...resume.experience].flatMap((section) => section.bullets);
}

export function extractNumericTokens(text: string) {
  return text.match(numberPattern)?.map(normalizeNumber) ?? [];
}

export function validateResumeClaims({
  resume,
  facts,
  items,
  skills,
  profile,
}: {
  resume: TailoredResume;
  facts: CareerFact[];
  items: CareerItem[];
  skills: Skill[];
  profile: Profile | null;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const skillNames = new Set(skills.filter((skill) => skill.enabled).map((skill) => skill.name));
  const allowedProfileText = profile
    ? [
        profile.fullName,
        profile.headline,
        profile.city,
        profile.region,
        profile.portfolioUrl,
        profile.githubUrl,
        profile.workAuthorizationNote,
      ].join(" ")
    : "";

  for (const bullet of allBullets(resume).filter((item) => item.included)) {
    if (bullet.sourceFactIds.length === 0) {
      issues.push({
        severity: "error",
        message: "Every generated bullet must cite at least one source fact.",
        bulletId: bullet.id,
        relatedFactIds: [],
      });
      continue;
    }

    const referencedFacts = bullet.sourceFactIds
      .map((id) => factById.get(id))
      .filter((fact): fact is CareerFact => Boolean(fact));

    for (const factId of bullet.sourceFactIds) {
      const fact = factById.get(factId);
      if (!fact) {
        issues.push({
          severity: "error",
          message: `Bullet references missing source fact ${factId}.`,
          bulletId: bullet.id,
          relatedFactIds: [factId],
        });
        continue;
      }
      if (!fact.enabled) {
        issues.push({
          severity: "error",
          message: "Bullet references a disabled fact.",
          bulletId: bullet.id,
          relatedFactIds: [fact.id],
        });
      }
      if (fact.evidenceStatus === "prohibited") {
        issues.push({
          severity: "error",
          message: "Bullet references a prohibited fact.",
          bulletId: bullet.id,
          relatedFactIds: [fact.id],
        });
      }
      if (fact.evidenceStatus === "needs_review") {
        issues.push({
          severity: "warning",
          message: "Bullet references a fact that needs review.",
          bulletId: bullet.id,
          relatedFactIds: [fact.id],
        });
      }
    }

    const supportText = [
      allowedProfileText,
      ...referencedFacts.map((fact) => fact.statement),
      ...referencedFacts.flatMap((fact) => fact.metricTokens),
      ...referencedFacts
        .map((fact) => itemById.get(fact.careerItemId))
        .filter((item): item is CareerItem => Boolean(item))
        .flatMap((item) => [item.title, item.organization, item.startDate, item.endDate]),
    ].join(" ");
    const supportedNumbers = new Set(extractNumericTokens(supportText));

    for (const token of extractNumericTokens(bullet.text)) {
      if (!supportedNumbers.has(token)) {
        issues.push({
          severity: token.endsWith("%") ? "error" : "warning",
          message: token.endsWith("%")
            ? `Unsupported percentage ${token} is not present in cited facts.`
            : `Numeric token ${token} is not present in cited facts.`,
          bulletId: bullet.id,
          relatedFactIds: bullet.sourceFactIds,
        });
      }
    }
  }

  for (const skill of resume.skills) {
    if (!skillNames.has(skill)) {
      issues.push({
        severity: "error",
        message: `Rendered skill "${skill}" does not exist in the enabled skill database.`,
        section: "skills",
        relatedFactIds: [],
      });
    }
  }

  for (const section of [...resume.projects, ...resume.experience]) {
    if (!itemById.has(section.careerItemId)) {
      issues.push({
        severity: "error",
        message: `Resume section "${section.title}" references a missing career item.`,
        section: section.title,
        relatedFactIds: [],
      });
    }
  }

  return issues;
}

export function hasBlockingValidationErrors(issues: ValidationIssue[]) {
  return issues.some((issue) => issue.severity === "error");
}
