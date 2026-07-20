import type {
  AppRepository,
} from "../database/repository";
import type {
  CandidateClaim,
  CareerFact,
  CareerItem,
  Job,
  JobAnalysis,
  Profile,
  ResumeImprovementProposal,
  ResumeImprovementRun,
  ResumeReview,
  ResumeReviewFinding,
  ResumeReviewMode,
  ResumeTemplateSettings,
  ResumeVersion,
  SensitiveAnswer,
  Skill,
  TailoredResume,
  ValidationIssue,
} from "../../types/domain";
import { semanticResumeDiff } from "./diff";
import { estimateResumePageCount } from "./compaction";
import { normalizeTailoredResume } from "./normalize";
import { allResumeBullets, validateResumeClaims } from "./validation";
import { createId, nowIso, unique } from "../utils";

export interface ResumeReviewContext {
  resumeVersion: ResumeVersion;
  job?: Job | null;
  reviewMode: ResumeReviewMode;
  profile: Profile | null;
  facts: CareerFact[];
  items: CareerItem[];
  skills: Skill[];
  candidateClaims?: CandidateClaim[];
  sensitiveAnswers?: SensitiveAnswer[];
  provider: string;
  model: string;
  pdfPageCount?: number | null;
  pdfRenderError?: string;
  generatedAt?: string;
}

export interface ResumeImprovementResult {
  sourceResume: ResumeVersion;
  improvedResume: ResumeVersion;
  originalReview: ResumeReview;
  improvedReview: ResumeReview;
  run: ResumeImprovementRun;
}

export type RenderImprovedResumePdf = (
  resume: TailoredResume,
  templateSettings: ResumeTemplateSettings,
) => Promise<{ pageCount: number }>;

const strongVerbPattern =
  /^(built|implemented|created|designed|developed|shipped|led|owned|automated|optimized|improved|reduced|increased|launched|integrated|architected|validated|tested|deployed|delivered)\b/i;
const weakVerbPattern = /^(helped|worked|assisted|responsible|participated|contributed)\b/i;
const broadSoftwareTerms = [
  "TypeScript",
  "React",
  "JavaScript",
  "Python",
  "API",
  "SQLite",
  "PostgreSQL",
  "Testing",
  "Automation",
  "Frontend",
  "Backend",
  "Full-stack",
  "AI",
];

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function words(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

function containsTerm(text: string, term: string) {
  if (!term.trim()) return false;
  const normalizedText = ` ${text.toLowerCase()} `;
  const normalizedTerm = term.toLowerCase();
  if (/^[a-z0-9+#.]+$/.test(normalizedTerm)) {
    return new RegExp(`(^|[^a-z0-9+#.])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9+#.])`).test(text.toLowerCase());
  }
  return normalizedText.includes(normalizedTerm);
}

function resumeText(resume: TailoredResume) {
  return [
    resume.header.fullName,
    resume.header.headline,
    ...resume.summary,
    ...resume.skills,
    ...resume.projects.flatMap((section) => [section.title, section.organization, ...(section.technologies ?? [])]),
    ...resume.experience.flatMap((section) => [section.title, section.organization, ...(section.technologies ?? [])]),
    ...allResumeBullets(resume).filter(({ bullet }) => bullet.included).map(({ bullet }) => bullet.text),
  ].join(" ");
}

function represented(terms: string[], text: string) {
  return unique(terms).filter((term) => containsTerm(text, term));
}

function validUrl(value: string) {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function fallbackJobAnalysis(job: Job | null | undefined): JobAnalysis | null {
  if (!job) return null;
  if (job.analysisJson) return job.analysisJson;
  const text = job.rawDescription;
  const requiredSkills = broadSoftwareTerms.filter((term) => containsTerm(text, term));
  const lower = text.toLowerCase();
  return {
    inferredCompany: job.company,
    inferredRoleTitle: job.roleTitle,
    seniority: lower.includes("senior") ? "Senior" : lower.includes("new grad") ? "New graduate" : "",
    roleCategories: [
      lower.includes("full-stack") || lower.includes("full stack") ? "full-stack engineer" : "",
      lower.includes("frontend") ? "frontend engineer" : "",
      lower.includes("backend") ? "backend engineer" : "",
      lower.includes("ai") || lower.includes("llm") ? "AI engineer" : "",
    ].filter(Boolean),
    requiredSkills,
    preferredSkills: broadSoftwareTerms.filter((term) => !requiredSkills.includes(term) && containsTerm(text, term)),
    responsibilities: text
      .split(/[.\n]/)
      .map((line) => line.trim())
      .filter((line) => /\b(build|develop|own|implement|ship|test|design|support|collaborate)\b/i.test(line))
      .slice(0, 8),
    domainKeywords: broadSoftwareTerms.filter((term) => containsTerm(text, term)),
    candidateSignals: [],
    locationRequirements: [],
    workAuthorizationLanguage: lower.includes("authorization") ? "Job description mentions work authorization." : "",
    summary: "Derived local keyword analysis from the saved job description.",
  };
}

function flattenBullets(resume: TailoredResume) {
  return (["projects", "experience"] as const).flatMap((sectionKind) =>
    resume[sectionKind].flatMap((section) =>
      section.bullets.map((bullet, index) => ({
        sectionKind,
        section,
        bullet,
        index,
      })),
    ),
  );
}

function validationKey(issue: ValidationIssue) {
  return [issue.severity, issue.code, issue.bulletId ?? "", issue.section ?? "", issue.message].join("|");
}

function combinedValidationIssues(context: ResumeReviewContext) {
  const recomputed = validateResumeClaims({
    resume: context.resumeVersion.contentJson,
    facts: context.facts,
    items: context.items,
    skills: context.skills,
    profile: context.profile,
  });
  const byKey = new Map<string, ValidationIssue>();
  for (const issue of [...context.resumeVersion.validationJson, ...recomputed]) {
    byKey.set(validationKey(issue), issue);
  }
  return [...byKey.values()];
}

function finding(
  severity: ResumeReviewFinding["severity"],
  category: string,
  message: string,
  recommendation: string,
  options: Partial<Omit<ResumeReviewFinding, "id" | "severity" | "category" | "message" | "recommendation" | "relatedFactIds" | "blocking">> & {
    relatedFactIds?: string[];
    blocking?: boolean;
  } = {},
): ResumeReviewFinding {
  return {
    id: createId("review-finding"),
    severity,
    category,
    message,
    recommendation,
    bulletId: options.bulletId,
    section: options.section,
    relatedFactIds: options.relatedFactIds ?? [],
    blocking: Boolean(options.blocking),
  };
}

function proposal(
  kind: ResumeImprovementProposal["kind"],
  safety: ResumeImprovementProposal["safety"],
  title: string,
  rationale: string,
  before: string,
  after: string,
  options: Partial<Omit<ResumeImprovementProposal, "id" | "kind" | "safety" | "title" | "rationale" | "before" | "after" | "sourceFactIds" | "applied">> & {
    sourceFactIds?: string[];
  } = {},
): ResumeImprovementProposal {
  return {
    id: createId("improvement"),
    kind,
    safety,
    title,
    rationale,
    before,
    after,
    bulletId: options.bulletId,
    careerItemId: options.careerItemId,
    section: options.section,
    sourceFactIds: options.sourceFactIds ?? [],
    applied: false,
  };
}

function isBulletLocked(resume: TailoredResume, bulletId: string) {
  const entry = flattenBullets(resume).find(({ bullet }) => bullet.id === bulletId);
  return !entry || entry.bullet.locked || entry.section.locked;
}

function bulletById(resume: TailoredResume, bulletId: string) {
  return flattenBullets(resume).find(({ bullet }) => bullet.id === bulletId) ?? null;
}

function itemById(items: CareerItem[]) {
  return new Map(items.map((item) => [item.id, item]));
}

function factById(facts: CareerFact[]) {
  return new Map(facts.map((fact) => [fact.id, fact]));
}

function missingResumeContact(resume: TailoredResume) {
  const missing: string[] = [];
  if (!resume.header.fullName.trim()) missing.push("name");
  if (!resume.header.location.trim()) missing.push("location");
  if (!resume.header.email.trim() || !resume.header.email.includes("@")) missing.push("email");
  if (!resume.header.phone.trim()) missing.push("phone");
  return missing;
}

function categoryScore(id: string, label: string, score: number, weight: number, rationale: string) {
  return { id, label, score: clampScore(score), weight, rationale };
}

function responsibilityCoverage(analysis: JobAnalysis | null, contextText: string, facts: CareerFact[]) {
  if (!analysis?.responsibilities.length) return { matched: [] as string[], total: 0 };
  const factText = facts.map((fact) => fact.statement).join(" ");
  const matched = analysis.responsibilities.filter((responsibility) => {
    const terms = words(responsibility).filter((word) => word.length > 4);
    return terms.some((word) => containsTerm(contextText, word) || containsTerm(factText, word));
  });
  return { matched, total: analysis.responsibilities.length };
}

function metricsRatio(resume: TailoredResume) {
  const included = allResumeBullets(resume).filter(({ bullet }) => bullet.included);
  if (!included.length) return 0;
  return included.filter(({ bullet }) => /\d/.test(bullet.text)).length / included.length;
}

function strongVerbRatio(resume: TailoredResume) {
  const included = allResumeBullets(resume).filter(({ bullet }) => bullet.included);
  if (!included.length) return 0;
  return included.filter(({ bullet }) => strongVerbPattern.test(bullet.text)).length / included.length;
}

function averageBulletWords(resume: TailoredResume) {
  const included = allResumeBullets(resume).filter(({ bullet }) => bullet.included);
  if (!included.length) return 0;
  return included.reduce((total, { bullet }) => total + words(bullet.text).length, 0) / included.length;
}

function riskFromIssues(validationIssues: ValidationIssue[], criticalIssues: ResumeReviewFinding[]) {
  const errorCount = validationIssues.filter((issue) => issue.severity === "error").length;
  const warningCount = validationIssues.filter((issue) => issue.severity === "warning").length;
  if (criticalIssues.some((issue) => issue.blocking) || errorCount >= 2) return "critical" as const;
  if (errorCount === 1 || warningCount >= 4) return "high" as const;
  if (warningCount > 0) return "medium" as const;
  return "low" as const;
}

function addValidationFindings(
  resume: TailoredResume,
  validationIssues: ValidationIssue[],
  weaknesses: ResumeReviewFinding[],
  criticalIssues: ResumeReviewFinding[],
  recommendedChanges: ResumeImprovementProposal[],
) {
  const factualErrorCodes = new Set([
    "missing_source_fact",
    "unselected_source_fact",
    "source_item_mismatch",
    "disabled_source_fact",
    "prohibited_source_fact",
    "unsupported_number",
    "unsupported_percentage",
    "unsupported_technology",
    "invented_skill",
    "invented_career_item",
    "disabled_career_item",
    "career_item_mutation",
    "date_mutation",
    "locked_item_removed",
    "locked_fact_removed",
  ]);
  const removableCodes = new Set([
    "missing_source_fact",
    "unselected_source_fact",
    "source_item_mismatch",
    "disabled_source_fact",
    "prohibited_source_fact",
    "unsupported_number",
    "unsupported_percentage",
    "unsupported_technology",
    "duplicate_bullet",
  ]);

  for (const issue of validationIssues) {
    const target = issue.severity === "error" && factualErrorCodes.has(issue.code)
      ? criticalIssues
      : weaknesses;
    target.push(
      finding(
        issue.severity === "error" ? "critical" : "medium",
        issue.code.startsWith("unsupported") || factualErrorCodes.has(issue.code) ? "Factual accuracy" : "Resume quality",
        issue.message,
        issue.canApprove ? "Approve only if you have manually verified the underlying fact." : "Resolve this before submission.",
        {
          bulletId: issue.bulletId,
          section: issue.section,
          relatedFactIds: issue.relatedFactIds,
          blocking: issue.severity === "error",
        },
      ),
    );

    if (issue.bulletId && removableCodes.has(issue.code)) {
      const entry = bulletById(resume, issue.bulletId);
      if (!entry) continue;
      recommendedChanges.push(
        proposal(
          "remove_bullet",
          isBulletLocked(resume, issue.bulletId) ? "blocked" : "safe",
          issue.code === "duplicate_bullet" ? "Remove duplicate bullet" : "Remove risky unsupported bullet",
          issue.message,
          entry.bullet.text,
          "Excluded from the improved child resume.",
          {
            bulletId: entry.bullet.id,
            careerItemId: entry.section.careerItemId,
            section: entry.section.title,
            sourceFactIds: entry.bullet.sourceFactIds,
          },
        ),
      );
    }
  }
}

function addClassificationFindings(
  resume: TailoredResume,
  items: CareerItem[],
  reviewMode: ResumeReviewMode,
  weaknesses: ResumeReviewFinding[],
  criticalIssues: ResumeReviewFinding[],
) {
  const itemsById = itemById(items);
  const add = (
    severity: ResumeReviewFinding["severity"],
    section: string,
    message: string,
    blocking: boolean,
  ) => {
    const target = blocking ? criticalIssues : weaknesses;
    target.push(
      finding(severity, "Factual accuracy", message, "Move the item to the correct section or correct Career Memory first.", {
        section,
        blocking,
      }),
    );
  };
  for (const project of resume.projects) {
    const item = itemsById.get(project.careerItemId);
    if (item && item.type !== "project") {
      add(reviewMode === "pre_submission" ? "critical" : "high", project.title, `${project.title} is listed as a project but Career Memory classifies it as ${item.type}.`, reviewMode === "pre_submission");
    }
  }
  for (const experience of resume.experience) {
    const item = itemsById.get(experience.careerItemId);
    if (item && item.type !== "employment") {
      add(reviewMode === "pre_submission" ? "critical" : "high", experience.title, `${experience.title} is listed as experience but Career Memory classifies it as ${item.type}.`, reviewMode === "pre_submission");
    }
  }
}

function addVisualAndAtsFindings({
  resume,
  analysis,
  pageCount,
  pdfRenderError,
  reviewMode,
  weaknesses,
  criticalIssues,
  recommendedChanges,
}: {
  resume: TailoredResume;
  analysis: JobAnalysis | null;
  pageCount: number;
  pdfRenderError?: string;
  reviewMode: ResumeReviewMode;
  weaknesses: ResumeReviewFinding[];
  criticalIssues: ResumeReviewFinding[];
  recommendedChanges: ResumeImprovementProposal[];
}) {
  const missingContact = missingResumeContact(resume);
  if (missingContact.length) {
    const target = reviewMode === "pre_submission" ? criticalIssues : weaknesses;
    target.push(
      finding(
        reviewMode === "pre_submission" ? "critical" : "high",
        "ATS",
        `Missing required contact fields: ${missingContact.join(", ")}.`,
        "Complete the resume header before export or submission.",
        { blocking: reviewMode === "pre_submission" },
      ),
    );
  }
  const invalidLinks = [resume.header.portfolioUrl, resume.header.linkedInUrl, resume.header.githubUrl].filter((link) => !validUrl(link));
  if (invalidLinks.length) {
    weaknesses.push(
      finding("medium", "ATS", `${invalidLinks.length} profile link is not a valid HTTP(S) URL.`, "Fix or remove the invalid link before submission."),
    );
  }
  if (pageCount !== 1) {
    const target = reviewMode === "pre_submission" ? criticalIssues : weaknesses;
    target.push(
      finding(
        reviewMode === "pre_submission" ? "critical" : "high",
        "Visual layout",
        `Resume is ${pageCount} pages; CareerCompiler expects a one-page resume.`,
        "Apply safe fitting changes, then render the PDF again.",
        { blocking: reviewMode === "pre_submission" },
      ),
    );
    if (resume.summary.length) {
      recommendedChanges.push(
        proposal("remove_summary", "safe", "Remove summary to recover space", "Summary removal does not add or alter factual claims.", resume.summary.join(" "), "", {
          section: "summary",
        }),
      );
    }
    if (!resume.layout.condensedSkills || resume.layout.spacingScale > 0.9 || resume.layout.bodyFontSize > 9.25) {
      recommendedChanges.push(
        proposal(
          "condense_layout",
          "safe",
          "Condense approved layout settings",
          "Uses existing template settings within approved readability limits.",
          `font ${resume.layout.bodyFontSize}, spacing ${resume.layout.spacingScale}, condensed skills ${resume.layout.condensedSkills}`,
          "Condensed skills, slightly tighter spacing, and readable font floor.",
          { section: "layout" },
        ),
      );
    }
  }
  if (pdfRenderError) {
    const target = reviewMode === "pre_submission" ? criticalIssues : weaknesses;
    target.push(
      finding(
        reviewMode === "pre_submission" ? "critical" : "high",
        "Visual layout",
        `PDF rendering failed: ${pdfRenderError}`,
        "Fix the renderer issue before treating the resume as ready.",
        { blocking: reviewMode === "pre_submission" },
      ),
    );
  }
  if (resume.layout.bodyFontSize < 9.25 || resume.layout.spacingScale < 0.82) {
    weaknesses.push(
      finding("medium", "Visual layout", "Layout is near the lower readability limit.", "Prefer content cuts over further shrinking."),
    );
  }
  if (analysis && resume.sectionOrder.includes("skills") && resume.sectionOrder.indexOf("skills") > resume.sectionOrder.indexOf("projects")) {
    recommendedChanges.push(
      proposal(
        "section_order",
        "safe",
        "Move skills before project detail",
        "Job-specific scans often benefit from earlier keyword visibility.",
        resume.sectionOrder.join(" > "),
        unique(["summary", "skills", "projects", "experience", "education"].filter((section) => resume.sectionOrder.includes(section as TailoredResume["sectionOrder"][number]))).join(" > "),
        { section: "resume" },
      ),
    );
  }
}

function addRoleFitFindings({
  resume,
  analysis,
  facts,
  skills,
  reviewMode,
  weaknesses,
  strengths,
  recommendedChanges,
}: {
  resume: TailoredResume;
  analysis: JobAnalysis | null;
  facts: CareerFact[];
  skills: Skill[];
  reviewMode: ResumeReviewMode;
  weaknesses: ResumeReviewFinding[];
  strengths: ResumeReviewFinding[];
  recommendedChanges: ResumeImprovementProposal[];
}) {
  const text = resumeText(resume);
  const activeAnalysis = analysis ?? null;
  if (!activeAnalysis) {
    const broadHits = represented(broadSoftwareTerms, text);
    if (broadHits.length >= 5) {
      strengths.push(finding("info", "Role fit", "Resume presents a broad software-engineering skill base.", "Keep the strongest project evidence visible."));
    } else {
      weaknesses.push(
        finding("medium", "Role fit", "Resume has limited broad software-engineering keyword coverage.", "Review skills and project bullets against the target role before submission."),
      );
    }
    return;
  }

  const required = represented(activeAnalysis.requiredSkills, text);
  const preferred = represented(activeAnalysis.preferredSkills, text);
  const missingRequired = activeAnalysis.requiredSkills.filter((skill) => !required.includes(skill));
  if (missingRequired.length) {
    weaknesses.push(
      finding(
        reviewMode === "pre_submission" ? "high" : "medium",
        "Role fit",
        `${missingRequired.length} required skill${missingRequired.length === 1 ? "" : "s"} not visible: ${missingRequired.slice(0, 5).join(", ")}.`,
        "Only add missing skills when they already exist as approved skills or cited facts.",
      ),
    );
    const approvedSkillNames = new Set(skills.filter((skill) => skill.enabled).map((skill) => skill.name));
    for (const missing of missingRequired.filter((skill) => approvedSkillNames.has(skill)).slice(0, 3)) {
      recommendedChanges.push(
        proposal(
          "manual_review",
          "needs_review",
          `Consider adding approved skill: ${missing}`,
          "The skill exists in Career Memory but should be confirmed by the user before changing the resume skill list.",
          resume.skills.join(" | "),
          `${resume.skills.join(" | ")} | ${missing}`,
          { section: "skills" },
        ),
      );
    }
  } else if (activeAnalysis.requiredSkills.length) {
    strengths.push(
      finding("info", "Role fit", "All required skills from the saved job analysis are visible.", "Keep this alignment through final edits."),
    );
  }
  if (preferred.length) {
    strengths.push(
      finding("info", "Role fit", `${preferred.length} preferred skill${preferred.length === 1 ? "" : "s"} represented.`, "This helps the resume feel tailored without inventing claims."),
    );
  }
  const responsibility = responsibilityCoverage(activeAnalysis, text, facts);
  if (responsibility.total && responsibility.matched.length === 0) {
    weaknesses.push(
      finding("medium", "Role fit", "Job responsibilities are not clearly supported by the selected evidence.", "Choose project bullets that directly map to the role responsibilities."),
    );
  }
}

function addStyleFindings(
  resume: TailoredResume,
  weaknesses: ResumeReviewFinding[],
  strengths: ResumeReviewFinding[],
  recommendedChanges: ResumeImprovementProposal[],
) {
  const included = flattenBullets(resume).filter(({ bullet }) => bullet.included);
  const weak = included.filter(({ bullet }) => weakVerbPattern.test(bullet.text));
  const long = included.filter(({ bullet }) => words(bullet.text).length > 32);
  const quantified = included.filter(({ bullet }) => /\d/.test(bullet.text));
  if (weak.length) {
    weaknesses.push(
      finding("medium", "Clarity", `${weak.length} included bullet${weak.length === 1 ? "" : "s"} start with weak ownership language.`, "Rewrite manually using only the same cited facts."),
    );
    for (const entry of weak.slice(0, 3)) {
      recommendedChanges.push(
        proposal(
          "manual_review",
          "needs_review",
          "Rewrite weak opener with same facts",
          "Opening verb changes can alter ownership, so this requires user review.",
          entry.bullet.text,
          "Manual rewrite required.",
          {
            bulletId: entry.bullet.id,
            careerItemId: entry.section.careerItemId,
            section: entry.section.title,
            sourceFactIds: entry.bullet.sourceFactIds,
          },
        ),
      );
    }
  }
  if (long.length) {
    weaknesses.push(
      finding("medium", "Clarity", `${long.length} bullet${long.length === 1 ? "" : "s"} exceed the 32-word recommendation.`, "Shorten with the same cited facts or remove lower-value bullets."),
    );
  }
  if (quantified.length) {
    strengths.push(
      finding("info", "Impact", `${quantified.length} included bullet${quantified.length === 1 ? "" : "s"} include supported numeric evidence.`, "Keep metrics only when validation confirms support."),
    );
  } else {
    weaknesses.push(
      finding("low", "Impact", "No included bullets contain numeric evidence.", "Use existing metric-bearing facts when they are relevant and verified."),
    );
  }
  const needsReorder = resume.projects.concat(resume.experience).some((section) => {
    const bullets = section.bullets.filter((bullet) => bullet.included);
    return bullets.some((bullet, index) => index > 0 && bullet.relevanceScore > bullets[index - 1].relevanceScore + 5);
  });
  if (needsReorder) {
    recommendedChanges.push(
      proposal(
        "reorder_bullets",
        "safe",
        "Put strongest supported bullets first",
        "Reordering preserves all facts and only changes scan order.",
        "Current bullet order",
        "Higher relevance, metric-bearing bullets first",
        { section: "projects and experience" },
      ),
    );
  }
}

function addLowestValueRemovalForOverflow(
  resume: TailoredResume,
  pageCount: number,
  recommendedChanges: ResumeImprovementProposal[],
) {
  if (pageCount <= 1) return;
  const candidate = flattenBullets(resume)
    .filter(({ bullet, section }) => bullet.included && !bullet.locked && !section.locked)
    .sort((left, right) => {
      const leftMetric = /\d/.test(left.bullet.text) ? 1 : 0;
      const rightMetric = /\d/.test(right.bullet.text) ? 1 : 0;
      return leftMetric - rightMetric || left.bullet.relevanceScore - right.bullet.relevanceScore;
    })[0];
  if (!candidate) return;
  recommendedChanges.push(
    proposal(
      "remove_bullet",
      "safe",
      "Remove lowest-value unlocked bullet for one-page fit",
      "This removes content without adding or altering factual claims.",
      candidate.bullet.text,
      "Excluded from the improved child resume.",
      {
        bulletId: candidate.bullet.id,
        careerItemId: candidate.section.careerItemId,
        section: candidate.section.title,
        sourceFactIds: candidate.bullet.sourceFactIds,
      },
    ),
  );
}

function addPreSubmissionFindings({
  context,
  pageCount,
  criticalIssues,
}: {
  context: ResumeReviewContext;
  pageCount: number;
  criticalIssues: ResumeReviewFinding[];
}) {
  if (context.reviewMode !== "pre_submission") return;
  const unresolvedClaims = (context.candidateClaims ?? []).filter((claim) => claim.verificationStatus === "conflicting");
  const unresolvedSensitive = (context.sensitiveAnswers ?? []).filter(
    (answer) => answer.verificationStatus === "conflicting" || answer.requiresReview,
  );
  if (unresolvedClaims.length) {
    criticalIssues.push(
      finding(
        "critical",
        "Factual accuracy",
        `${unresolvedClaims.length} candidate profile claim${unresolvedClaims.length === 1 ? "" : "s"} have unresolved conflicts.`,
        "Resolve conflicting Candidate Brain facts before final submission.",
        { blocking: true },
      ),
    );
  }
  if (unresolvedSensitive.length) {
    criticalIssues.push(
      finding(
        "critical",
        "Factual accuracy",
        `${unresolvedSensitive.length} sensitive answer${unresolvedSensitive.length === 1 ? "" : "s"} require review or conflict resolution.`,
        "Resolve sensitive factual conflicts before final submission.",
        { blocking: true },
      ),
    );
  }
  if (pageCount !== 1) {
    // Visual finding may already exist; this keeps pre-submission explicitly blocked even with actual PDF count.
    if (!criticalIssues.some((issue) => issue.category === "Visual layout" && issue.message.includes("pages"))) {
      criticalIssues.push(
        finding("critical", "Visual layout", `Rendered page count is ${pageCount}.`, "Final submission requires exactly one readable page.", {
          blocking: true,
        }),
      );
    }
  }
}

function dedupeProposals(proposals: ResumeImprovementProposal[]) {
  const seen = new Set<string>();
  return proposals.filter((item) => {
    const key = [item.kind, item.bulletId ?? "", item.section ?? "", item.before, item.after].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildResumeReview(context: ResumeReviewContext): ResumeReview {
  const resume = context.resumeVersion.contentJson;
  const analysis = context.reviewMode === "general" ? null : fallbackJobAnalysis(context.job);
  const validationIssues = combinedValidationIssues(context);
  const pageCount = context.pdfPageCount ?? estimateResumePageCount(resume);
  const strengths: ResumeReviewFinding[] = [];
  const weaknesses: ResumeReviewFinding[] = [];
  const criticalIssues: ResumeReviewFinding[] = [];
  const recommendedChanges: ResumeImprovementProposal[] = [];
  const text = resumeText(resume);
  const factsById = factById(context.facts);
  const includedBullets = allResumeBullets(resume).filter(({ bullet }) => bullet.included);
  const citedFactIds = unique(includedBullets.flatMap(({ bullet }) => bullet.sourceFactIds));
  const missingCitations = includedBullets.filter(({ bullet }) => bullet.sourceFactIds.length === 0).length;
  const needsReviewFacts = citedFactIds
    .map((id) => factsById.get(id))
    .filter((fact): fact is CareerFact => Boolean(fact && fact.evidenceStatus === "needs_review"));
  const requiredSkills = analysis ? represented(analysis.requiredSkills, text) : represented(broadSoftwareTerms, text);
  const preferredSkills = analysis ? represented(analysis.preferredSkills, text) : [];
  const responsibility = responsibilityCoverage(analysis, text, context.facts.filter((fact) => citedFactIds.includes(fact.id)));
  const validationErrors = validationIssues.filter((issue) => issue.severity === "error");
  const validationWarnings = validationIssues.filter((issue) => issue.severity === "warning");
  const avgWords = averageBulletWords(resume);
  const metricShare = metricsRatio(resume);
  const verbShare = strongVerbRatio(resume);

  addValidationFindings(resume, validationIssues, weaknesses, criticalIssues, recommendedChanges);
  addClassificationFindings(resume, context.items, context.reviewMode, weaknesses, criticalIssues);
  addVisualAndAtsFindings({
    resume,
    analysis,
    pageCount,
    pdfRenderError: context.pdfRenderError,
    reviewMode: context.reviewMode,
    weaknesses,
    criticalIssues,
    recommendedChanges,
  });
  addRoleFitFindings({
    resume,
    analysis,
    facts: context.facts.filter((fact) => citedFactIds.includes(fact.id)),
    skills: context.skills,
    reviewMode: context.reviewMode,
    weaknesses,
    strengths,
    recommendedChanges,
  });
  addStyleFindings(resume, weaknesses, strengths, recommendedChanges);
  addLowestValueRemovalForOverflow(resume, pageCount, recommendedChanges);
  addPreSubmissionFindings({ context, pageCount, criticalIssues });

  if (!validationErrors.length) {
    strengths.push(finding("info", "Factual accuracy", "No blocking validation errors were found.", "Continue to validate after every edit."));
  }
  if (pageCount === 1) {
    strengths.push(finding("info", "Visual layout", "Resume currently fits one page.", "Still review density and readability before submission."));
  }
  if (includedBullets.length && missingCitations === 0) {
    strengths.push(finding("info", "Evidence", "Every included project and experience bullet has source fact citations.", "Keep source facts attached during edits."));
  }

  const factualScore = 100 - validationErrors.length * 28 - validationWarnings.length * 7 - needsReviewFacts.length * 5 - missingCitations * 18;
  const evidenceScore = includedBullets.length
    ? 100 - missingCitations * 25 - needsReviewFacts.length * 7
    : 30;
  const impactScore = 42 + metricShare * 34 + verbShare * 24;
  const clarityScore = 100
    - validationIssues.filter((issue) => ["long_bullet", "vague_bullet", "repeated_action_phrase", "duplicate_bullet"].includes(issue.code)).length * 10
    - Math.max(0, avgWords - 24) * 1.5;
  const visualScore = pageCount === 1
    ? 88 - (resume.layout.bodyFontSize < 9.25 ? 10 : 0) - (resume.layout.spacingScale < 0.85 ? 8 : 0)
    : 55 - (pageCount - 1) * 28;
  const atsScore = analysis
    ? 45
      + (analysis.requiredSkills.length ? (requiredSkills.length / analysis.requiredSkills.length) * 35 : 25)
      + (analysis.preferredSkills.length ? (preferredSkills.length / analysis.preferredSkills.length) * 10 : 5)
      + (missingResumeContact(resume).length ? 0 : 10)
    : 55 + Math.min(30, requiredSkills.length * 4) + (missingResumeContact(resume).length ? 0 : 15);
  const roleScore = analysis
    ? 35
      + (analysis.requiredSkills.length ? (requiredSkills.length / analysis.requiredSkills.length) * 32 : 20)
      + (responsibility.total ? (responsibility.matched.length / responsibility.total) * 23 : 10)
      + Math.min(10, preferredSkills.length * 2)
    : 60 + Math.min(25, resume.projects.length * 5 + resume.experience.length * 5);
  const preSubmissionScore = context.reviewMode === "pre_submission"
    ? 100 - criticalIssues.filter((issue) => issue.blocking).length * 35 - weaknesses.filter((issue) => issue.severity === "high").length * 12
    : 100;

  const categoryScores = [
    categoryScore("factual_accuracy", "Factual accuracy", factualScore, context.reviewMode === "pre_submission" ? 1.7 : 1.4, `${validationErrors.length} errors and ${validationWarnings.length} warnings.`),
    categoryScore("evidence", "Evidence grounding", evidenceScore, 1.1, `${citedFactIds.length} cited source facts across ${includedBullets.length} included bullets.`),
    categoryScore("impact", "Impact", impactScore, 0.9, `${Math.round(metricShare * 100)}% metric-bearing bullets and ${Math.round(verbShare * 100)}% strong openers.`),
    categoryScore("clarity", "Clarity", clarityScore, 0.9, `Average included bullet length is ${avgWords.toFixed(1)} words.`),
    categoryScore("ats", analysis ? "ATS and keyword coverage" : "General ATS readiness", atsScore, context.reviewMode === "general" ? 0.9 : 1.1, analysis ? `${requiredSkills.length} of ${analysis.requiredSkills.length} required skills visible.` : `${requiredSkills.length} broad software terms visible.`),
    categoryScore("role_fit", analysis ? "Role fit" : "Software-engineering fit", roleScore, context.reviewMode === "general" ? 0.8 : 1.3, analysis ? `${responsibility.matched.length} of ${responsibility.total} responsibilities represented.` : `${resume.projects.length + resume.experience.length} career sections represented.`),
    categoryScore("visual", "Visual presentation", visualScore, 0.9, `Page count signal: ${pageCount}.`),
  ];
  if (context.reviewMode === "pre_submission") {
    categoryScores.push(
      categoryScore("pre_submission", "Pre-submission gates", preSubmissionScore, 1.4, `${criticalIssues.filter((issue) => issue.blocking).length} blocking final-review issue(s).`),
    );
  }

  const totalWeight = categoryScores.reduce((total, score) => total + score.weight, 0);
  let overallScore = categoryScores.reduce((total, score) => total + score.score * score.weight, 0) / totalWeight;
  const factualRiskLevel = riskFromIssues(validationIssues, criticalIssues);
  if (factualRiskLevel === "critical") overallScore = Math.min(overallScore, 49);
  else if (factualRiskLevel === "high") overallScore = Math.min(overallScore, 69);
  if (context.reviewMode === "pre_submission" && criticalIssues.some((issue) => issue.blocking)) {
    overallScore = Math.min(overallScore, 59);
  }
  const readyToSubmit =
    pageCount === 1 &&
    missingResumeContact(resume).length === 0 &&
    !context.pdfRenderError &&
    overallScore >= 75 &&
    (factualRiskLevel === "low" || factualRiskLevel === "medium") &&
    !criticalIssues.some((issue) => issue.blocking);

  return {
    id: createId("resume-review"),
    resumeId: context.resumeVersion.id,
    jobId: context.job?.id,
    reviewMode: context.reviewMode,
    overallScore: clampScore(overallScore),
    categoryScores,
    strengths,
    weaknesses,
    criticalIssues,
    recommendedChanges: dedupeProposals(recommendedChanges),
    factualRiskLevel,
    readyToSubmit,
    generatedAt: context.generatedAt ?? nowIso(),
    provider: context.provider,
    model: context.model,
  };
}

function findBulletTarget(resume: TailoredResume, bulletId: string) {
  for (const sectionKind of ["projects", "experience"] as const) {
    for (const section of resume[sectionKind]) {
      const bullet = section.bullets.find((candidate) => candidate.id === bulletId);
      if (bullet) return { sectionKind, section, bullet };
    }
  }
  return null;
}

function applySectionOrder(resume: TailoredResume, proposal: ResumeImprovementProposal) {
  const desired = proposal.after
    .split(">")
    .map((section) => section.trim())
    .filter((section): section is TailoredResume["sectionOrder"][number] =>
      ["summary", "skills", "projects", "experience", "education"].includes(section),
    );
  if (desired.length) resume.sectionOrder = desired;
}

function reorderBullets(resume: TailoredResume, facts: CareerFact[]) {
  const factsById = factById(facts);
  const scoreBullet = (bullet: TailoredResume["projects"][number]["bullets"][number]) => {
    const hasMetricText = /\d/.test(bullet.text) ? 8 : 0;
    const factImportance = bullet.sourceFactIds.reduce((total, id) => total + (factsById.get(id)?.importance ?? 0), 0);
    return bullet.relevanceScore + hasMetricText + factImportance;
  };
  for (const section of [...resume.projects, ...resume.experience]) {
    if (section.locked) continue;
    section.bullets.sort((left, right) => {
      if (left.locked || right.locked) return 0;
      if (left.included !== right.included) return left.included ? -1 : 1;
      return scoreBullet(right) - scoreBullet(left);
    });
  }
}

export function applySafeResumeImprovements({
  resume,
  proposals,
  facts,
}: {
  resume: TailoredResume;
  proposals: ResumeImprovementProposal[];
  facts: CareerFact[];
}) {
  const next = normalizeTailoredResume(structuredClone(resume));
  next.id = createId("tailored-resume");
  const appliedProposalIds: string[] = [];
  const skippedProposalIds: string[] = [];

  for (const proposalItem of proposals) {
    if (proposalItem.safety !== "safe") {
      skippedProposalIds.push(proposalItem.id);
      continue;
    }
    if (proposalItem.kind === "remove_bullet" && proposalItem.bulletId) {
      const target = findBulletTarget(next, proposalItem.bulletId);
      if (!target || target.bullet.locked || target.section.locked) {
        skippedProposalIds.push(proposalItem.id);
        continue;
      }
      target.bullet.included = false;
      target.bullet.rejected = true;
      target.bullet.approved = false;
      target.bullet.generationReason = `${target.bullet.generationReason} Auto-improvement excluded this bullet: ${proposalItem.rationale}`;
      appliedProposalIds.push(proposalItem.id);
      continue;
    }
    if (proposalItem.kind === "remove_summary") {
      if (!next.summary.length) {
        skippedProposalIds.push(proposalItem.id);
        continue;
      }
      next.summary = [];
      next.compactionActions.push("Resume Review removed summary for focus and fit.");
      appliedProposalIds.push(proposalItem.id);
      continue;
    }
    if (proposalItem.kind === "condense_layout") {
      next.layout.condensedSkills = true;
      if (next.layout.spacingScale > 0.9) next.layout.spacingScale = 0.9;
      if (estimateResumePageCount(next) > 1 && next.layout.bodyFontSize > 9.25) {
        next.layout.bodyFontSize = Math.max(9.25, Number((next.layout.bodyFontSize - 0.25).toFixed(2)));
      }
      next.compactionActions.push("Resume Review condensed layout within approved limits.");
      appliedProposalIds.push(proposalItem.id);
      continue;
    }
    if (proposalItem.kind === "reorder_bullets") {
      reorderBullets(next, facts);
      appliedProposalIds.push(proposalItem.id);
      continue;
    }
    if (proposalItem.kind === "section_order") {
      applySectionOrder(next, proposalItem);
      appliedProposalIds.push(proposalItem.id);
      continue;
    }
    skippedProposalIds.push(proposalItem.id);
  }

  next.approvedWarningCodes = [];
  return { resume: next, appliedProposalIds: unique(appliedProposalIds), skippedProposalIds: unique(skippedProposalIds) };
}

async function reviewContextForRepository({
  repository,
  resumeVersion,
  jobId,
  reviewMode,
  pdfPageCount,
  pdfRenderError,
}: {
  repository: AppRepository;
  resumeVersion: ResumeVersion;
  jobId?: string;
  reviewMode: ResumeReviewMode;
  pdfPageCount?: number | null;
  pdfRenderError?: string;
}): Promise<ResumeReviewContext> {
  const [job, profile, facts, items, skills, candidateClaims, sensitiveAnswers, settings] = await Promise.all([
    reviewMode === "general" || !jobId ? Promise.resolve(null) : repository.getJob(jobId),
    repository.getProfile(),
    repository.listCareerFacts(),
    repository.listCareerItems(),
    repository.listSkills(),
    repository.listCandidateClaims(),
    repository.listSensitiveAnswers(),
    repository.getSettings(),
  ]);
  return {
    resumeVersion,
    job,
    reviewMode,
    profile,
    facts,
    items,
    skills,
    candidateClaims,
    sensitiveAnswers,
    provider: `local-${settings.aiProvider}`,
    model: `resume-review-v1${settings.modelName ? ` / ${settings.modelName}` : ""}`,
    pdfPageCount,
    pdfRenderError,
  };
}

export async function reviewResumeVersion({
  repository,
  resumeVersionId,
  jobId,
  reviewMode,
  pdfPageCount,
  pdfRenderError,
}: {
  repository: AppRepository;
  resumeVersionId: string;
  jobId?: string;
  reviewMode: ResumeReviewMode;
  pdfPageCount?: number | null;
  pdfRenderError?: string;
}) {
  const resumeVersion = await repository.getResumeVersion(resumeVersionId);
  if (!resumeVersion) throw new Error("The selected resume version no longer exists.");
  if (reviewMode === "job_specific" && !jobId) {
    throw new Error("A saved job is required for a job-specific review.");
  }
  const context = await reviewContextForRepository({
    repository,
    resumeVersion,
    jobId,
    reviewMode,
    pdfPageCount,
    pdfRenderError,
  });
  const review = buildResumeReview(context);
  return repository.saveResumeReview(review);
}

export async function improveResumeFromReview({
  repository,
  reviewId,
  renderPdf,
}: {
  repository: AppRepository;
  reviewId: string;
  renderPdf?: RenderImprovedResumePdf;
}): Promise<ResumeImprovementResult> {
  const originalReview = await repository.getResumeReview(reviewId);
  if (!originalReview) throw new Error("The selected resume review no longer exists.");
  const sourceResume = await repository.getResumeVersion(originalReview.resumeId);
  if (!sourceResume) throw new Error("The reviewed resume no longer exists.");
  if (sourceResume.status === "draft" && originalReview.generatedAt < sourceResume.updatedAt) {
    throw new Error("The resume changed after this review. Run a fresh review before improving it.");
  }

  const [profile, facts, items, skills] = await Promise.all([
    repository.getProfile(),
    repository.listCareerFacts(),
    repository.listCareerItems(),
    repository.listSkills(),
  ]);
  const safe = applySafeResumeImprovements({
    resume: sourceResume.contentJson,
    proposals: originalReview.recommendedChanges,
    facts,
  });
  const validationJson = validateResumeClaims({
    resume: safe.resume,
    facts,
    items,
    skills,
    profile,
  });
  const improvedResume = await repository.saveResumeVersion({
    jobId: originalReview.jobId ?? sourceResume.jobId,
    name: `${sourceResume.name} - optimized`,
    kind: "tailored",
    templateId: sourceResume.templateId,
    contentJson: safe.resume,
    validationJson,
    status: "draft",
    lastExportPath: "",
    parentResumeVersionId: sourceResume.id,
    baseResumeVersionId: sourceResume.kind === "master" ? sourceResume.id : sourceResume.baseResumeVersionId || sourceResume.id,
    generationProvider: "deterministic",
    generationModel: "resume-review-optimizer-v1",
    promptVersion: "resume-review-optimizer-v1",
    promptVersionsJson: sourceResume.promptVersionsJson,
    layoutProfileId: sourceResume.layoutProfileId,
    templateSettingsJson: sourceResume.templateSettingsJson,
    generationMetadataJson: {
      calls: [],
      repairAttempted: false,
      repairSucceeded: false,
      deterministicFallbackUsed: true,
      compactionLog: safe.resume.compactionActions,
    },
    deterministicBaselineJson: sourceResume.contentJson,
  });

  let pdfStatus: ResumeImprovementRun["pdfStatus"] = "not_rendered";
  let pdfPageCount: number | null = null;
  let pdfError = "";
  if (renderPdf) {
    try {
      const rendered = await renderPdf(improvedResume.contentJson, improvedResume.templateSettingsJson);
      pdfStatus = "rendered";
      pdfPageCount = rendered.pageCount;
    } catch (caught) {
      pdfStatus = "failed";
      pdfError = caught instanceof Error ? caught.message : String(caught);
    }
  }

  const context = await reviewContextForRepository({
    repository,
    resumeVersion: improvedResume,
    jobId: originalReview.jobId,
    reviewMode: originalReview.reviewMode,
    pdfPageCount,
    pdfRenderError: pdfError,
  });
  const improvedReview = await repository.saveResumeReview(buildResumeReview(context));
  const diff = semanticResumeDiff(sourceResume.contentJson, improvedResume.contentJson);
  const run: ResumeImprovementRun = await repository.saveResumeImprovementRun({
    id: createId("resume-improvement-run"),
    sourceResumeId: sourceResume.id,
    improvedResumeId: improvedResume.id,
    jobId: originalReview.jobId,
    reviewMode: originalReview.reviewMode,
    originalReviewId: originalReview.id,
    improvedReviewId: improvedReview.id,
    appliedProposalIds: safe.appliedProposalIds,
    skippedProposalIds: safe.skippedProposalIds,
    diff,
    pdfStatus,
    pdfPageCount,
    pdfError,
    createdAt: nowIso(),
  });

  return {
    sourceResume,
    improvedResume,
    originalReview,
    improvedReview,
    run,
  };
}
