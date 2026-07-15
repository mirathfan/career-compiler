import type {
  EvidenceScore,
  JobAnalysis,
  Profile,
  ResumeQualityCheck,
  TailoredResume,
  ValidationIssue,
} from "../../types/domain";

function resumeText(resume: TailoredResume) {
  return [
    ...resume.summary,
    ...resume.skills,
    ...[...resume.projects, ...resume.experience].flatMap((section) =>
      section.bullets.filter((bullet) => bullet.included).map((bullet) => bullet.text),
    ),
  ].join(" ").toLowerCase();
}

function represented(terms: string[], text: string) {
  return terms.filter((term) => text.includes(term.toLowerCase()));
}

function validUrl(value: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function calculateResumeQuality({
  resume,
  analysis,
  evidence,
  validationIssues,
  profile,
  pageCount,
}: {
  resume: TailoredResume;
  analysis: JobAnalysis;
  evidence: EvidenceScore[];
  validationIssues: ValidationIssue[];
  profile: Profile;
  pageCount: number;
}): ResumeQualityCheck[] {
  const text = resumeText(resume);
  const required = represented(analysis.requiredSkills, text);
  const preferred = represented(analysis.preferredSkills, text);
  const usedFactIds = new Set(
    [...resume.projects, ...resume.experience].flatMap((section) =>
      section.bullets.filter((bullet) => bullet.included).flatMap((bullet) => bullet.sourceFactIds),
    ),
  );
  const supportedResponsibilities = analysis.responsibilities.filter((responsibility) => {
    const words = responsibility.toLowerCase().split(/\W+/).filter((word) => word.length > 4);
    return evidence
      .filter((score) => usedFactIds.has(score.fact.id))
      .some((score) => words.some((word) => score.fact.statement.toLowerCase().includes(word)));
  });
  const unsupported = validationIssues.filter((item) =>
    [
      "unsupported_number",
      "unsupported_percentage",
      "unsupported_technology",
      "invented_skill",
      "invented_career_item",
    ].includes(item.code),
  );
  const duplicates = validationIssues.filter((item) => item.code === "duplicate_bullet");
  const longBullets = validationIssues.filter((item) => item.code === "long_bullet");
  const weakOpeners = [...resume.projects, ...resume.experience]
    .flatMap((section) => section.bullets)
    .filter((bullet) => bullet.included && /^(helped|worked|assisted|responsible)\b/i.test(bullet.text));
  const unusedHighRelevance = evidence.filter(
    (score) => score.selected && score.score >= 20 && !usedFactIds.has(score.fact.id),
  );
  const availableMetricsUnused = evidence.filter(
    (score) => score.selected && score.fact.metricTokens.length > 0 && !usedFactIds.has(score.fact.id),
  );
  const contactValues = [profile.fullName, profile.email, profile.phone, profile.city, profile.region];
  const completeContacts = contactValues.filter(Boolean).length;
  const savedLinks = [profile.portfolioUrl, profile.linkedInUrl, profile.githubUrl].filter(Boolean);
  const brokenLinks = savedLinks.filter((link) => !validUrl(link));

  return [
    {
      id: "required-skills",
      label: "Required skills represented",
      detail: `${required.length} of ${analysis.requiredSkills.length} required skills represented`,
      status: required.length === analysis.requiredSkills.length ? "pass" : "warning",
      count: required.length,
    },
    {
      id: "preferred-skills",
      label: "Preferred skills represented",
      detail: `${preferred.length} of ${analysis.preferredSkills.length} preferred skills represented`,
      status: "info",
      count: preferred.length,
    },
    {
      id: "responsibilities",
      label: "Responsibilities supported",
      detail: `${supportedResponsibilities.length} of ${analysis.responsibilities.length} responsibilities have supporting evidence`,
      status: supportedResponsibilities.length ? "pass" : "warning",
      count: supportedResponsibilities.length,
    },
    {
      id: "unsupported-claims",
      label: "Unsupported claims",
      detail: unsupported.length ? `${unsupported.length} unsupported claims require correction` : "No unsupported claims found",
      status: unsupported.length ? "error" : "pass",
      count: unsupported.length,
    },
    {
      id: "duplicates",
      label: "Duplicate bullets",
      detail: duplicates.length ? `${duplicates.length} duplicate or near-duplicate bullets found` : "No duplicate bullets found",
      status: duplicates.length ? "warning" : "pass",
      count: duplicates.length,
    },
    {
      id: "long-bullets",
      label: "Excessive bullet length",
      detail: longBullets.length ? `${longBullets.length} bullets exceed the recommended length` : "All bullets meet the recommended length",
      status: longBullets.length ? "warning" : "pass",
      count: longBullets.length,
    },
    {
      id: "weak-openers",
      label: "Weak opening verbs",
      detail: weakOpeners.length ? `${weakOpeners.length} bullets use weak opening phrases` : "No weak opening phrases found",
      status: weakOpeners.length ? "warning" : "pass",
      count: weakOpeners.length,
    },
    {
      id: "metrics",
      label: "Available metrics",
      detail: availableMetricsUnused.length
        ? `${availableMetricsUnused.length} selected facts with metrics are unused`
        : "No selected metric-bearing facts are unused",
      status: availableMetricsUnused.length ? "info" : "pass",
      count: availableMetricsUnused.length,
    },
    {
      id: "unused-evidence",
      label: "Unused high-relevance facts",
      detail: `${unusedHighRelevance.length} selected high-relevance facts are unused`,
      status: unusedHighRelevance.length ? "info" : "pass",
      count: unusedHighRelevance.length,
    },
    {
      id: "one-page",
      label: "One-page fit",
      detail: pageCount === 1 ? "Resume fits one page" : `Resume currently estimates ${pageCount} pages`,
      status: pageCount === 1 ? "pass" : "error",
      count: pageCount,
    },
    {
      id: "contact",
      label: "Contact completeness",
      detail: `${completeContacts} of ${contactValues.length} core contact fields are complete`,
      status: completeContacts === contactValues.length ? "pass" : "warning",
      count: completeContacts,
    },
    {
      id: "links",
      label: "Saved links",
      detail: brokenLinks.length ? `${brokenLinks.length} saved links are invalid` : `${savedLinks.length} valid saved links`,
      status: brokenLinks.length ? "error" : savedLinks.length ? "pass" : "warning",
      count: brokenLinks.length,
    },
  ];
}
