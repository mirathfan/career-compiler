import type {
  GenerationMetadata,
  ResumeBullet,
  TailoredResume,
  ValidationIssue,
} from "../../types/domain";

export const emptyGenerationMetadata: GenerationMetadata = {
  calls: [],
  repairAttempted: false,
  repairSucceeded: false,
  deterministicFallbackUsed: false,
  compactionLog: [],
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeBullet(value: unknown): ResumeBullet {
  const bullet = asRecord(value);
  const selectionReason = String(bullet.selectionReason ?? bullet.generationReason ?? "Legacy resume content.");
  return {
    id: String(bullet.id ?? "legacy-bullet"),
    text: String(bullet.text ?? ""),
    sourceFactIds: Array.isArray(bullet.sourceFactIds) ? bullet.sourceFactIds.map(String) : [],
    relevanceScore: Number(bullet.relevanceScore ?? 0),
    isUserEdited: Boolean(bullet.isUserEdited),
    included: bullet.included === undefined ? true : Boolean(bullet.included),
    locked: Boolean(bullet.locked),
    approved: Boolean(bullet.approved),
    rejected: Boolean(bullet.rejected),
    generationSource: bullet.generationSource === "ai" || bullet.generationSource === "user"
      ? bullet.generationSource
      : bullet.isUserEdited
        ? "user"
        : "deterministic",
    generationReason: String(bullet.generationReason ?? selectionReason),
    keywordsAddressed: Array.isArray(bullet.keywordsAddressed) ? bullet.keywordsAddressed.map(String) : [],
    selectionReason,
  };
}

export function normalizeTailoredResume(value: unknown): TailoredResume {
  const resume = asRecord(value);
  const header = asRecord(resume.header);
  const normalizeSections = (input: unknown) =>
    (Array.isArray(input) ? input : []).map((sectionValue) => {
      const section = asRecord(sectionValue);
      return {
        careerItemId: String(section.careerItemId ?? ""),
        title: String(section.title ?? ""),
        organization: String(section.organization ?? ""),
        location: String(section.location ?? ""),
        startDate: String(section.startDate ?? ""),
        endDate: String(section.endDate ?? ""),
        isCurrent: Boolean(section.isCurrent),
        technologies: Array.isArray(section.technologies) ? section.technologies.map(String) : undefined,
        url: section.url ? String(section.url) : undefined,
        repositoryUrl: section.repositoryUrl ? String(section.repositoryUrl) : undefined,
        locked: Boolean(section.locked),
        bullets: (Array.isArray(section.bullets) ? section.bullets : []).map(normalizeBullet),
      };
    });
  const layout = asRecord(resume.layout);

  return {
    id: String(resume.id ?? "legacy-resume"),
    header: {
      fullName: String(header.fullName ?? ""),
      headline: String(header.headline ?? ""),
      location: String(header.location ?? ""),
      email: String(header.email ?? ""),
      phone: String(header.phone ?? ""),
      portfolioUrl: String(header.portfolioUrl ?? ""),
      linkedInUrl: String(header.linkedInUrl ?? ""),
      githubUrl: String(header.githubUrl ?? ""),
      workAuthorizationNote: String(header.workAuthorizationNote ?? ""),
    },
    summary: Array.isArray(resume.summary) ? resume.summary.map(String) : [],
    education: (Array.isArray(resume.education) ? resume.education : []).map((entryValue) => {
      const entry = asRecord(entryValue);
      return {
        careerItemId: String(entry.careerItemId ?? ""),
        title: String(entry.title ?? ""),
        organization: String(entry.organization ?? ""),
        location: String(entry.location ?? ""),
        dateLabel: String(entry.dateLabel ?? ""),
      };
    }),
    experience: normalizeSections(resume.experience),
    projects: normalizeSections(resume.projects),
    skills: Array.isArray(resume.skills) ? resume.skills.map(String) : [],
    skillGroups: Array.isArray(resume.skillGroups)
      ? resume.skillGroups.map((groupValue) => {
          const group = asRecord(groupValue);
          return {
            id: String(group.id ?? ""),
            name: String(group.name ?? ""),
            skills: Array.isArray(group.skills) ? group.skills.map(String) : [],
          };
        }).filter((group) => group.name && group.skills.length)
      : undefined,
    sectionOrder: Array.isArray(resume.sectionOrder)
      ? (resume.sectionOrder as TailoredResume["sectionOrder"])
      : ["summary", "projects", "experience", "education", "skills"],
    compactionActions: Array.isArray(resume.compactionActions) ? resume.compactionActions.map(String) : [],
    layout: {
      bodyFontSize: Math.max(9, Number(layout.bodyFontSize ?? 9.5)),
      spacingScale: Math.max(0.8, Math.min(1, Number(layout.spacingScale ?? 1))),
      condensedSkills: Boolean(layout.condensedSkills),
    },
    approvedWarningCodes: Array.isArray(resume.approvedWarningCodes)
      ? resume.approvedWarningCodes.map(String)
      : [],
  };
}

export function normalizeValidationIssues(value: unknown): ValidationIssue[] {
  return (Array.isArray(value) ? value : []).map((issueValue) => {
    const issue = asRecord(issueValue);
    const severity = issue.severity === "warning" ? "warning" : "error";
    return {
      severity,
      code: String(issue.code ?? "legacy_validation_issue"),
      message: String(issue.message ?? "Unknown validation issue."),
      bulletId: issue.bulletId ? String(issue.bulletId) : undefined,
      section: issue.section ? String(issue.section) : undefined,
      relatedFactIds: Array.isArray(issue.relatedFactIds) ? issue.relatedFactIds.map(String) : [],
      canApprove: issue.canApprove === undefined ? severity === "warning" : Boolean(issue.canApprove),
    };
  });
}

export function normalizeGenerationMetadata(value: unknown): GenerationMetadata {
  const metadata = asRecord(value);
  return {
    calls: Array.isArray(metadata.calls) ? (metadata.calls as GenerationMetadata["calls"]) : [],
    repairAttempted: Boolean(metadata.repairAttempted),
    repairSucceeded: Boolean(metadata.repairSucceeded),
    deterministicFallbackUsed: Boolean(metadata.deterministicFallbackUsed),
    compactionLog: Array.isArray(metadata.compactionLog) ? metadata.compactionLog.map(String) : [],
  };
}
