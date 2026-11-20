import { broadSoftwareTerms, words, containsTerm, fallbackJobAnalysis, responsibilityCoverage } from "./coverage";
import type { AppRepository } from "../database/repository";
import type {
  AIRequestMetadata,
  AIProviderMode,
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
import type { ResumeReviewAdvisory } from "../../schemas/resumeReview";
import { createAIProvider } from "../ai/providerFactory";
import { AIProviderError } from "../ai/provider";
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
  providerMode?: AIProviderMode;
  configuredModel?: string;
  model: string;
  pdfPageCount?: number | null;
  pdfRenderError?: string;
  pdfVisualReviewed?: boolean;
  advisory?: ResumeReviewAdvisory;
  requestMetadata?: AIRequestMetadata[];
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
) => Promise<{ pageCount: number; pdfDataUrl?: string; pdfPath?: string }>;

const strongVerbPattern =
  /^(built|implemented|created|designed|developed|shipped|led|owned|automated|optimized|improved|reduced|increased|launched|integrated|architected|validated|tested|deployed|delivered)\b/i;
const weakVerbPattern = /^(helped|worked|assisted|responsible|participated|contributed)\b/i;
function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
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
  const textWords = new Set(words(text));
  const stopWords = new Set(["and", "for", "the", "with", "from", "into", "experience", "systems", "system"]);
  return unique(terms).filter((term) => {
    if (containsTerm(text, term)) return true;
    const meaningful = words(term).filter((word) => word.length > 2 && !stopWords.has(word));
    if (!meaningful.length) return false;
    const matches = meaningful.filter((word) => textWords.has(word)).length;
    return matches / meaningful.length >= 0.6;
  });
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
    category: options.category ?? "Resume quality",
    priority: options.priority ?? (safety === "safe" ? "medium" : "high"),
    expectedScoreImpact: options.expectedScoreImpact ?? 2,
    evidence: options.evidence ?? (options.sourceFactIds?.length ? options.sourceFactIds : ["Deterministic local review"]),
    safeToAutoApply: options.safeToAutoApply ?? safety === "safe",
    confirmationRequired: options.confirmationRequired ?? safety !== "safe",
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

function normalizedSkillKey(value: string) {
  return value.toLowerCase().replace(/\bapis\b/g, "api").replace(/[^a-z0-9+#.]+/g, "").trim();
}

function skillGroupName(category: string) {
  const value = category.toLowerCase();
  if (value.includes("frontend") || value.includes("mobile")) return "Frontend & Mobile";
  if (value.includes("backend") || value.includes("data")) return "Backend & Data";
  if (value.includes("ai") || value.includes("ml")) return "AI / ML";
  if (value.includes("cloud") || value.includes("tool") || value.includes("infrastructure")) return "Cloud & Tools";
  if (value.includes("language")) return "Languages";
  if (value.includes("core") || value.includes("computer science")) return "Core CS";
  return "Additional";
}

function categorizedSkillGroups(resume: TailoredResume, skills: Skill[]) {
  const recordByName = new Map(skills.filter((skill) => skill.enabled).map((skill) => [skill.name, skill]));
  const groups = new Map<string, string[]>();
  for (const name of resume.skills) {
    const record = recordByName.get(name);
    if (!record) continue;
    const group = skillGroupName(record.category);
    groups.set(group, [...(groups.get(group) ?? []), name]);
  }
  const order = ["Languages", "Frontend & Mobile", "Backend & Data", "AI / ML", "Cloud & Tools", "Core CS", "Additional"];
  return order.flatMap((name) => {
    const values = groups.get(name) ?? [];
    return values.length ? [{ id: `skills-${normalizedSkillKey(name)}`, name, skills: values }] : [];
  });
}

function duplicateCareerPairs(resume: TailoredResume) {
  const pairs: Array<{ experience: TailoredResume["experience"][number]; project: TailoredResume["projects"][number] }> = [];
  for (const experience of resume.experience) {
    for (const project of resume.projects) {
      const experienceTokens = new Set(words(`${experience.title} ${experience.organization}`).filter((word) => word.length >= 4));
      const projectTokens = words(`${project.title} ${project.organization}`).filter((word) => word.length >= 4);
      const sharedIdentity = projectTokens.some((word) => experienceTokens.has(word));
      const sameDates = experience.startDate === project.startDate && experience.endDate === project.endDate && experience.isCurrent === project.isCurrent;
      if (sharedIdentity && sameDates) pairs.push({ experience, project });
    }
  }
  return pairs;
}

function addContentStructureFindings({
  context,
  analysis,
  weaknesses,
  strengths,
  criticalIssues,
  recommendedChanges,
}: {
  context: ResumeReviewContext;
  analysis: JobAnalysis | null;
  weaknesses: ResumeReviewFinding[];
  strengths: ResumeReviewFinding[];
  criticalIssues: ResumeReviewFinding[];
  recommendedChanges: ResumeImprovementProposal[];
}) {
  const resume = context.resumeVersion.contentJson;
  const summary = resume.summary.join(" ");
  const summaryWords = words(summary).length;
  if (summaryWords > 45) {
    weaknesses.push(finding("medium", "Content strength", `Summary is ${summaryWords} words and repeats detail shown below.`, "Shorten it or remove it from the job-specific child version."));
    const shorter = summary.split(/(?<=[.!?])\s+/)[0] ?? "";
    recommendedChanges.push(
      proposal("shorten_summary", "needs_review", "Review a shorter summary", "A rewritten summary can subtly change positioning, so the user must approve the exact wording.", summary, shorter, {
        section: "summary",
        category: "Content strength",
        priority: "medium",
        expectedScoreImpact: 3,
        evidence: ["Existing summary text only"],
        confirmationRequired: true,
      }),
      proposal("remove_summary", "safe", "Remove the long summary from the child", "Removal adds no claim and recovers space for a clearer one-page layout.", summary, "", {
        section: "summary",
        category: "Conciseness",
        priority: "high",
        expectedScoreImpact: 5,
        evidence: ["Deterministic word count", "No factual text is added or altered"],
      }),
    );
  }

  const normalizedSkills = resume.skills.map(normalizedSkillKey);
  const duplicateSkills = normalizedSkills.length - new Set(normalizedSkills).size;
  const coursework = resume.skills.filter((skill) => /data structures|algorithms|operating systems|computer networks|coursework/i.test(skill));
  if (!resume.skillGroups?.length) {
    weaknesses.push(finding("medium", "Skills quality", `${resume.skills.length} skills are presented as a dense flat keyword list.`, "Group verified skills into short ATS-readable categories."));
    const groups = categorizedSkillGroups(resume, context.skills);
    recommendedChanges.push(
      proposal("categorize_skills", "safe", "Categorize the verified skill list", "Every rendered token remains an enabled Candidate Brain skill; only presentation changes.", resume.skills.join(" | "), groups.map((group) => `${group.name}: ${group.skills.join(", ")}`).join(" | "), {
        section: "skills",
        category: "Skills quality",
        priority: "high",
        expectedScoreImpact: 6,
        evidence: groups.flatMap((group) => group.skills),
      }),
    );
  } else {
    strengths.push(finding("info", "Skills quality", "Skills are grouped into readable categories.", "Keep every displayed skill tied to an enabled skill record."));
    if (resume.skills.length > 24) {
      weaknesses.push(finding("low", "Skills quality", `${resume.skills.length} verified skills remain dense even after categorization.`, "Remove or de-emphasize skills only with explicit approval."));
    }
  }
  if (duplicateSkills) {
    weaknesses.push(finding("medium", "Skills quality", `${duplicateSkills} duplicate or alias skill entries were detected.`, "Keep one approved spelling for each skill."));
  }
  if (coursework.length) {
    weaknesses.push(finding("low", "Skills quality", `${coursework.length} coursework-like topics occupy the skills section.`, "Keep them only when the target job values programming fundamentals."));
  }
  if (analysis) {
    const visible = resumeText(resume);
    const relevant = resume.skills.filter((skill) => represented([...analysis.requiredSkills, ...analysis.preferredSkills, ...analysis.domainKeywords], `${visible} ${skill}`).length);
    if (relevant.length < Math.min(8, resume.skills.length)) {
      weaknesses.push(finding("low", "Skills quality", "Several skills have weak direct relevance to the selected job.", "De-emphasize them only with explicit user approval."));
    }
  }

  for (const pair of duplicateCareerPairs(resume)) {
    weaknesses.push(finding("high", "Content strength", `${pair.experience.title} and ${pair.project.title} appear to describe the same initiative over the same dates.`, "Confirm whether both sections are necessary; consolidate only with explicit approval.", {
      section: pair.project.title,
    }));
    recommendedChanges.push(
      proposal("consolidate_duplicate", "needs_review", "Confirm duplicated experience and project coverage", "Removing or merging a project changes career classification and requires user confirmation.", `${pair.experience.title} in Experience; ${pair.project.title} in Projects`, "Pending user decision", {
        careerItemId: pair.project.careerItemId,
        section: pair.project.title,
        category: "Content strength",
        priority: "high",
        expectedScoreImpact: 6,
        evidence: [pair.experience.careerItemId, pair.project.careerItemId, "Matching date range"],
        confirmationRequired: true,
      }),
    );
  }

  const verifiedClaims = (context.candidateClaims ?? []).filter((claim) => ["verified", "user_confirmed"].includes(claim.verificationStatus));
  for (const experience of resume.experience.filter((entry) => /\b(founder|co-founder|owner|director|head|lead|manager)\b/i.test(entry.title))) {
    const identity = `${experience.title} ${experience.organization}`.toLowerCase();
    const verified = verifiedClaims.some((claim) => {
      const value = JSON.stringify(claim.value).toLowerCase();
      return words(identity).filter((word) => word.length >= 4).some((word) => value.includes(word));
    });
    if (verified) continue;
    const blocking = context.reviewMode === "pre_submission";
    const target = blocking ? criticalIssues : weaknesses;
    target.push(finding(blocking ? "critical" : "high", "Factual safety", `Leadership title and employment classification for ${experience.title} are not independently confirmed in Candidate Brain.`, "Confirm the organization, title, employment classification, and dates before final submission.", {
      section: experience.title,
      blocking,
    }));
    recommendedChanges.push(
      proposal("manual_review", "needs_review", "Confirm leadership and employment classification", "CareerCompiler will not silently alter a leadership title or employment classification.", `${experience.title} | ${experience.organization} | ${experience.startDate} - ${experience.isCurrent ? "Present" : experience.endDate}`, "Pending user confirmation", {
        careerItemId: experience.careerItemId,
        section: experience.title,
        category: "Factual safety",
        priority: "critical",
        expectedScoreImpact: 0,
        evidence: [experience.careerItemId, "No verified Candidate Brain leadership claim"],
        confirmationRequired: true,
      }),
    );
  }

  if (resume.layout.bodyFontSize < 9.25 && summaryWords > 45) {
    recommendedChanges.push(
      proposal("improve_readability", "safe", "Raise the child resume to the readability floor", "After removing the long summary, increase approved body font and spacing settings and validate the rendered page count again.", `font ${resume.layout.bodyFontSize}, spacing ${resume.layout.spacingScale}`, "font 9.25, spacing 0.9", {
        section: "layout",
        category: "Visual quality",
        priority: "high",
        expectedScoreImpact: 7,
        evidence: ["Approved template bounds", "Actual PDF will be rendered and rechecked"],
      }),
    );
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

const advisoryCategoryLabels: Record<string, string> = {
  visual_quality: "Visual quality",
  ats_readability: "ATS readability",
  content_strength: "Content strength",
  factual_safety: "Factual safety",
  role_fit: "Role fit",
  technical_depth: "Technical depth",
  conciseness: "Conciseness",
  skills_quality: "Skills quality",
};

function addAdvisoryFindings(context: ResumeReviewContext, strengths: ResumeReviewFinding[], weaknesses: ResumeReviewFinding[], criticalIssues: ResumeReviewFinding[], recommendedChanges: ResumeImprovementProposal[]) {
  const advisory = context.advisory;
  if (!advisory) return;
  const factIds = new Set(context.facts.map((fact) => fact.id));
  const mapFinding = (item: ResumeReviewAdvisory["strengths"][number]) => finding(
    item.severity,
    advisoryCategoryLabels[item.category] ?? item.category,
    item.message,
    item.recommendation,
    {
      section: item.target || undefined,
      relatedFactIds: item.evidenceIds.filter((id) => factIds.has(id)),
      blocking: false,
    },
  );
  strengths.push(...advisory.strengths.map(mapFinding));
  for (const item of advisory.weaknesses) {
    const mapped = mapFinding(item);
    if (item.severity === "critical") criticalIssues.push(mapped);
    else weaknesses.push(mapped);
  }

  if (advisory.visualInspection.clippingDetected || !advisory.visualInspection.readableFont) {
    const blocking = context.reviewMode === "pre_submission";
    const target = blocking ? criticalIssues : weaknesses;
    target.push(finding(blocking ? "critical" : "high", "Visual quality", advisory.visualInspection.notes || "Rendered PDF has a readability problem.", "Correct the layout and rerender the PDF before approval.", { blocking }));
  }
  if (advisory.visualInspection.bottomPageCompression) {
    weaknesses.push(finding("medium", "Visual quality", "The rendered PDF is compressed near the bottom of the page.", "Remove lower-value content before reducing font size or margins further."));
  }
  if (!advisory.visualInspection.educationDatesAligned) {
    weaknesses.push(finding("medium", "Visual quality", "Education dates are not cleanly aligned in the rendered PDF.", "Adjust content density and rerender; do not change the dates."));
  }
  if (advisory.visualInspection.bulletsOverThreeLines) {
    weaknesses.push(finding("medium", "Conciseness", `${advisory.visualInspection.bulletsOverThreeLines} bullet${advisory.visualInspection.bulletsOverThreeLines === 1 ? "" : "s"} render beyond three lines.`, "Shorten only with the same cited facts and explicit wording approval."));
  }

  const operationMap: Record<ResumeReviewAdvisory["proposals"][number]["operation"], ResumeImprovementProposal["kind"]> = {
    shorten_summary: "shorten_summary",
    categorize_skills: "categorize_skills",
    rewrite_bullet: "manual_review",
    remove_bullet: "remove_bullet",
    consolidate_duplicate: "consolidate_duplicate",
    reorder_bullets: "reorder_bullets",
    section_order: "section_order",
    layout: "manual_review",
    manual_review: "manual_review",
  };
  for (const item of advisory.proposals) {
    recommendedChanges.push(proposal(
      operationMap[item.operation],
      "needs_review",
      item.title,
      item.reason,
      item.before,
      item.after,
      {
        section: item.target || undefined,
        sourceFactIds: item.evidenceIds.filter((id) => factIds.has(id)),
        category: advisoryCategoryLabels[item.category] ?? item.category,
        priority: item.priority,
        expectedScoreImpact: item.expectedScoreImpact,
        evidence: item.evidenceIds.length ? item.evidenceIds : ["OpenAI PDF review"],
        safeToAutoApply: false,
        confirmationRequired: true,
      },
    ));
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
  addContentStructureFindings({
    context,
    analysis,
    weaknesses,
    strengths,
    criticalIssues,
    recommendedChanges,
  });
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
  addAdvisoryFindings(context, strengths, weaknesses, criticalIssues, recommendedChanges);

  if (!validationErrors.length) {
    strengths.push(finding("info", "Factual accuracy", "No blocking validation errors were found.", "Continue to validate after every edit."));
  }
  if (pageCount === 1) {
    strengths.push(finding("info", "Visual layout", "Resume currently fits one page.", "Still review density and readability before submission."));
  }
  if (includedBullets.length && missingCitations === 0) {
    strengths.push(finding("info", "Evidence", "Every included project and experience bullet has source fact citations.", "Keep source facts attached during edits."));
  }

  const summaryWords = words(resume.summary.join(" ")).length;
  const longBullets = includedBullets.filter(({ bullet }) => words(bullet.text).length > 32).length;
  const featureLists = includedBullets.filter(({ bullet }) => /:\s|(?:,.*){3,}/.test(bullet.text)).length;
  const technicallyDetailed = includedBullets.filter(({ bullet }) =>
    bullet.sourceFactIds.some((id) => (factsById.get(id)?.skillTags.length ?? 0) >= 2),
  ).length;
  const duplicatePairs = duplicateCareerPairs(resume).length;
  const normalizedSkills = resume.skills.map(normalizedSkillKey);
  const duplicateSkills = normalizedSkills.length - new Set(normalizedSkills).size;
  const courseworkSkills = resume.skills.filter((skill) => /data structures|algorithms|operating systems|computer networks|coursework/i.test(skill)).length;
  const groupedSkills = Boolean(resume.skillGroups?.length);

  const factualScore = 100 - validationErrors.length * 28 - validationWarnings.length * 7 - needsReviewFacts.length * 5 - missingCitations * 18;
  const contentScore = 50 + metricShare * 18 + verbShare * 22
    - duplicatePairs * 8
    - featureLists * 2
    - (summaryWords > 45 ? 7 : 0);
  const concisenessScore = 96
    - longBullets * 10
    - Math.max(0, avgWords - 22) * 2
    - Math.max(0, summaryWords - 35) * 0.35
    - featureLists * 2;
  const technicalDepthScore = 48
    + (includedBullets.length ? (technicallyDetailed / includedBullets.length) * 38 : 0)
    + Math.min(12, metricShare * 20)
    - featureLists;
  const skillsScore = 88
    - (resume.skills.length > 24 ? 12 : 0)
    - duplicateSkills * 8
    - courseworkSkills * 2
    + (groupedSkills ? 9 : 0);
  const visualScore = pageCount === 1
    ? 92
      - (resume.layout.bodyFontSize < 9.25 ? 10 : 0)
      - (resume.layout.spacingScale < 0.85 ? 7 : 0)
      - (!groupedSkills && resume.skills.length > 24 ? 7 : 0)
      - (summaryWords > 45 ? 4 : 0)
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
  const advisory = context.advisory;
  const blend = (local: number, model: number | undefined, localWeight = 0.65) =>
    model === undefined ? local : local * localWeight + model * (1 - localWeight);
  const rationale = (local: string, model: string | undefined) => model ? `${local} PDF review: ${model}` : local;
  const categoryScores = [
    categoryScore("visual_quality", "Visual quality", blend(visualScore, advisory?.scores.visualQuality, 0.6), 1, rationale(`Rendered page count ${pageCount}; body font ${resume.layout.bodyFontSize}pt.`, advisory?.rationales.visualQuality)),
    categoryScore("ats_readability", "ATS readability", blend(atsScore, advisory?.scores.atsReadability), 1.1, rationale(analysis ? `${requiredSkills.length} of ${analysis.requiredSkills.length} requirement phrases represented.` : `${requiredSkills.length} broad software terms represented.`, advisory?.rationales.atsReadability)),
    categoryScore("content_strength", "Content strength", blend(contentScore, advisory?.scores.contentStrength, 0.6), 1, rationale(`${Math.round(metricShare * 100)}% metric-bearing bullets; ${duplicatePairs} likely duplicate initiative pair(s).`, advisory?.rationales.contentStrength)),
    categoryScore("factual_safety", "Factual safety", factualScore, context.reviewMode === "pre_submission" ? 1.6 : 1.3, `${validationErrors.length} errors, ${validationWarnings.length} warnings, ${citedFactIds.length} cited facts. Local validation is authoritative.`),
    categoryScore("role_fit", "Role fit", blend(roleScore, advisory?.scores.roleFit), context.reviewMode === "general" ? 0.9 : 1.3, rationale(analysis ? `${responsibility.matched.length} of ${responsibility.total} responsibilities represented.` : "Broad software-engineering fit.", advisory?.rationales.roleFit)),
    categoryScore("technical_depth", "Technical depth", blend(technicalDepthScore, advisory?.scores.technicalDepth, 0.6), 1, rationale(`${technicallyDetailed} of ${includedBullets.length} bullets cite multi-skill technical evidence.`, advisory?.rationales.technicalDepth)),
    categoryScore("conciseness", "Conciseness", blend(concisenessScore, advisory?.scores.conciseness, 0.6), 1, rationale(`${longBullets} long bullets; ${summaryWords}-word summary.`, advisory?.rationales.conciseness)),
    categoryScore("skills_quality", "Skills quality", blend(skillsScore, advisory?.scores.skillsQuality, 0.6), 1, rationale(`${resume.skills.length} verified skill tokens; ${groupedSkills ? "categorized" : "flat"} presentation.`, advisory?.rationales.skillsQuality)),
  ];

  const totalWeight = categoryScores.reduce((total, score) => total + score.weight, 0);
  let overallScore = categoryScores.reduce((total, score) => total + score.score * score.weight, 0) / totalWeight;
  const factualRiskLevel = riskFromIssues(validationIssues, criticalIssues);
  if (factualRiskLevel === "critical") overallScore = Math.min(overallScore, 49);
  else if (factualRiskLevel === "high") overallScore = Math.min(overallScore, 69);
  if (context.reviewMode === "pre_submission" && criticalIssues.some((issue) => issue.blocking)) {
    overallScore = Math.min(overallScore, 59);
  }
  const unresolvedFactualConflict = [...weaknesses, ...criticalIssues].some((issue) =>
    ["Factual accuracy", "Factual safety"].includes(issue.category) &&
    ["high", "critical"].includes(issue.severity),
  );
  const readyToSubmit =
    pageCount === 1 &&
    missingResumeContact(resume).length === 0 &&
    !context.pdfRenderError &&
    overallScore >= 75 &&
    (factualRiskLevel === "low" || factualRiskLevel === "medium") &&
    !unresolvedFactualConflict &&
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
    reviewSource: context.advisory ? "hybrid" : "deterministic",
    pdfPageCount: pageCount,
    pdfVisualReviewed: Boolean(context.pdfVisualReviewed && context.advisory),
    requestMetadata: context.requestMetadata ?? [],
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
  skills = [],
  templateSettings,
  approvedProposalIds,
}: {
  resume: TailoredResume;
  proposals: ResumeImprovementProposal[];
  facts: CareerFact[];
  skills?: Skill[];
  templateSettings: ResumeTemplateSettings;
  approvedProposalIds: string[];
}) {
  const next = normalizeTailoredResume(structuredClone(resume));
  const nextTemplateSettings = structuredClone(templateSettings);
  next.id = createId("tailored-resume");
  const appliedProposalIds: string[] = [];
  const skippedProposalIds: string[] = [];
  const approved = new Set(approvedProposalIds);

  for (const proposalItem of proposals) {
    if (
      proposalItem.safety !== "safe" ||
      !proposalItem.safeToAutoApply ||
      proposalItem.confirmationRequired ||
      !approved.has(proposalItem.id)
    ) {
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
    if (proposalItem.kind === "categorize_skills") {
      const groups = categorizedSkillGroups(next, skills);
      const flattened = groups.flatMap((group) => group.skills);
      const groupedSkills = flattened.map(normalizedSkillKey).sort();
      const originalSkills = next.skills.map(normalizedSkillKey).sort();
      if (!groups.length || groupedSkills.join("|") !== originalSkills.join("|")) {
        skippedProposalIds.push(proposalItem.id);
        continue;
      }
      next.skillGroups = groups;
      next.compactionActions.push("Resume Review categorized the existing verified skill list.");
      appliedProposalIds.push(proposalItem.id);
      continue;
    }
    if (proposalItem.kind === "improve_readability") {
      next.layout.bodyFontSize = Math.max(9.25, next.layout.bodyFontSize);
      next.layout.spacingScale = Math.max(0.9, next.layout.spacingScale);
      nextTemplateSettings.bodyFontSize = Math.max(9.25, nextTemplateSettings.bodyFontSize);
      next.compactionActions.push("Resume Review raised body font and spacing to the approved readability floor.");
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
  return {
    resume: next,
    templateSettings: nextTemplateSettings,
    appliedProposalIds: unique(appliedProposalIds),
    skippedProposalIds: unique(skippedProposalIds),
  };
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
    provider: "local-deterministic",
    providerMode: settings.aiProvider,
    configuredModel: settings.modelName,
    model: "resume-review-v2",
    pdfPageCount,
    pdfRenderError,
  };
}

function aiReviewContext(context: ResumeReviewContext, deterministicReview: ResumeReview) {
  const resume = context.resumeVersion.contentJson;
  const citedFactIds = new Set(
    allResumeBullets(resume)
      .filter(({ bullet }) => bullet.included)
      .flatMap(({ bullet }) => bullet.sourceFactIds),
  );
  return {
    resume: {
      headline: resume.header.headline,
      contactPresence: {
        name: Boolean(resume.header.fullName),
        location: Boolean(resume.header.location),
        email: Boolean(resume.header.email),
        phone: Boolean(resume.header.phone),
        portfolio: Boolean(resume.header.portfolioUrl),
        linkedIn: Boolean(resume.header.linkedInUrl),
        github: Boolean(resume.header.githubUrl),
      },
      summary: resume.summary,
      skills: resume.skills,
      skillGroups: resume.skillGroups ?? [],
      layout: resume.layout,
      sectionOrder: resume.sectionOrder,
      experience: resume.experience.map((section) => ({
        careerItemId: section.careerItemId,
        title: section.title,
        organization: section.organization,
        startDate: section.startDate,
        endDate: section.endDate,
        isCurrent: section.isCurrent,
        bullets: section.bullets.filter((bullet) => bullet.included).map((bullet) => ({
          id: bullet.id,
          text: bullet.text,
          sourceFactIds: bullet.sourceFactIds,
        })),
      })),
      projects: resume.projects.map((section) => ({
        careerItemId: section.careerItemId,
        title: section.title,
        organization: section.organization,
        startDate: section.startDate,
        endDate: section.endDate,
        isCurrent: section.isCurrent,
        bullets: section.bullets.filter((bullet) => bullet.included).map((bullet) => ({
          id: bullet.id,
          text: bullet.text,
          sourceFactIds: bullet.sourceFactIds,
        })),
      })),
      education: resume.education,
    },
    targetJob: context.job ? {
      company: context.job.company,
      roleTitle: context.job.roleTitle,
      description: context.job.rawDescription,
      analysis: fallbackJobAnalysis(context.job),
    } : null,
    evidence: context.facts.filter((fact) => citedFactIds.has(fact.id)).map((fact) => ({
      id: fact.id,
      careerItemId: fact.careerItemId,
      statement: fact.statement,
      evidenceStatus: fact.evidenceStatus,
      metricTokens: fact.metricTokens,
      skillTags: fact.skillTags,
    })),
    careerItems: context.items
      .filter((item) => [...resume.experience, ...resume.projects, ...resume.education].some((section) => section.careerItemId === item.id))
      .map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        organization: item.organization,
        startDate: item.startDate,
        endDate: item.endDate,
        isCurrent: item.isCurrent,
      })),
    approvedSkills: context.skills.filter((skill) => skill.enabled).map((skill) => ({
      id: skill.id,
      name: skill.name,
      category: skill.category,
      proficiencyNote: skill.proficiencyNote,
    })),
    verifiedCandidateClaims: (context.candidateClaims ?? []).filter((claim) => ["verified", "user_confirmed"].includes(claim.verificationStatus)),
    deterministicReview: {
      scores: deterministicReview.categoryScores,
      strengths: deterministicReview.strengths,
      weaknesses: deterministicReview.weaknesses,
      criticalIssues: deterministicReview.criticalIssues,
      factualRiskLevel: deterministicReview.factualRiskLevel,
      pdfPageCount: deterministicReview.pdfPageCount,
    },
  };
}

async function addProviderAdvisory(context: ResumeReviewContext, pdfDataUrl: string) {
  if (context.providerMode !== "openai" || !pdfDataUrl) return context;
  const provider = createAIProvider("openai");
  const deterministicReview = buildResumeReview(context);
  const requestMetadata: AIRequestMetadata[] = [];
  const call = () => provider.reviewResume({
    reviewMode: context.reviewMode,
    reviewContext: aiReviewContext(context, deterministicReview),
    pdfDataUrl,
    modelName: context.configuredModel || "gpt-5.6",
  });
  try {
    const result = await call();
    requestMetadata.push(result.metadata);
    return {
      ...context,
      advisory: result.data,
      requestMetadata,
      provider: "hybrid-openai",
      model: result.metadata.model,
      pdfVisualReviewed: true,
    };
  } catch (caught) {
    if (caught instanceof AIProviderError) {
      requestMetadata.push(caught.metadata);
      if (["structured_response_rejected", "schema_rejection"].includes(caught.metadata.errorCode)) {
        try {
          const repaired = await call();
          requestMetadata.push(repaired.metadata);
          return {
            ...context,
            advisory: repaired.data,
            requestMetadata,
            provider: "hybrid-openai",
            model: repaired.metadata.model,
            pdfVisualReviewed: true,
          };
        } catch (repairCaught) {
          if (repairCaught instanceof AIProviderError) requestMetadata.push(repairCaught.metadata);
        }
      }
    }
    return {
      ...context,
      requestMetadata,
      provider: "deterministic-fallback",
      pdfVisualReviewed: false,
    };
  }
}

export async function reviewResumeVersion({
  repository,
  resumeVersionId,
  jobId,
  reviewMode,
  pdfPageCount,
  pdfRenderError,
  pdfDataUrl = "",
}: {
  repository: AppRepository;
  resumeVersionId: string;
  jobId?: string;
  reviewMode: ResumeReviewMode;
  pdfPageCount?: number | null;
  pdfRenderError?: string;
  pdfDataUrl?: string;
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
  const enrichedContext = await addProviderAdvisory(context, pdfDataUrl);
  const review = buildResumeReview(enrichedContext);
  return repository.saveResumeReview(review);
}

export async function improveResumeFromReview({
  repository,
  reviewId,
  renderPdf,
  approvedProposalIds,
}: {
  repository: AppRepository;
  reviewId: string;
  renderPdf?: RenderImprovedResumePdf;
  approvedProposalIds: string[];
}): Promise<ResumeImprovementResult> {
  const originalReview = await repository.getResumeReview(reviewId);
  if (!originalReview) throw new Error("The selected resume review no longer exists.");
  const sourceResume = await repository.getResumeVersion(originalReview.resumeId);
  if (!sourceResume) throw new Error("The reviewed resume no longer exists.");
  if (originalReview.generatedAt < sourceResume.updatedAt) {
    throw new Error("The resume changed after this review. Run a fresh review before improving it.");
  }

  const existingRuns = await repository.listResumeImprovementRuns();
  const parentRun = existingRuns.find((run) => run.improvedResumeId === sourceResume.id);
  const passNumber = (parentRun?.passNumber ?? 0) + 1;
  if (passNumber > 2) {
    throw new Error("Resume Optimizer stops after two automatic passes. Continue with manual editing and a fresh review.");
  }
  if (parentRun) {
    const parentOriginalReview = await repository.getResumeReview(parentRun.originalReviewId);
    if (parentOriginalReview && originalReview.overallScore - parentOriginalReview.overallScore < 2) {
      throw new Error("The previous optimizer pass produced negligible improvement. Continue with manual editing instead.");
    }
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
    skills,
    templateSettings: sourceResume.templateSettingsJson,
    approvedProposalIds,
  });
  if (!safe.appliedProposalIds.length) {
    throw new Error("Select at least one factually safe proposal before creating an improved child resume.");
  }
  const validationJson = validateResumeClaims({
    resume: safe.resume,
    facts,
    items,
    skills,
    profile,
  });
  let improvedResume = await repository.saveResumeVersion({
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
    generationModel: "resume-review-optimizer-v2",
    promptVersion: "resume-review-optimizer-v2",
    promptVersionsJson: sourceResume.promptVersionsJson,
    layoutProfileId: sourceResume.layoutProfileId,
    templateSettingsJson: safe.templateSettings,
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
  let pdfDataUrl = "";
  let pdfPath = "";
  if (renderPdf) {
    try {
      const rendered = await renderPdf(improvedResume.contentJson, improvedResume.templateSettingsJson);
      pdfStatus = "rendered";
      pdfPageCount = rendered.pageCount;
      pdfDataUrl = rendered.pdfDataUrl ?? "";
      pdfPath = rendered.pdfPath ?? "";
      if (pdfPath) {
        improvedResume = await repository.saveResumeVersion({
          ...improvedResume,
          lastExportPath: pdfPath,
        });
      }
    } catch (caught) {
      pdfStatus = "failed";
      pdfError = caught instanceof Error ? caught.message : String(caught);
    }
  }

  const improvedReview = await reviewResumeVersion({
    repository,
    resumeVersionId: improvedResume.id,
    jobId: originalReview.jobId,
    reviewMode: originalReview.reviewMode,
    pdfPageCount,
    pdfRenderError: pdfError,
    pdfDataUrl,
  });
  const diff = semanticResumeDiff(sourceResume.contentJson, improvedResume.contentJson);
  const approved = new Set(approvedProposalIds);
  const rejectedProposalIds = originalReview.recommendedChanges
    .filter((item) => item.safety === "safe" && !approved.has(item.id))
    .map((item) => item.id);
  const scoreDelta = improvedReview.overallScore - originalReview.overallScore;
  const hasFurtherSafeChanges = improvedReview.recommendedChanges.some((item) => item.safety === "safe" && item.safeToAutoApply && !item.confirmationRequired);
  const stopReason: ResumeImprovementRun["stopReason"] = passNumber >= 2
    ? "maximum_passes"
    : scoreDelta < 2
      ? "negligible_improvement"
      : hasFurtherSafeChanges
        ? ""
        : "no_safe_changes";
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
    rejectedProposalIds,
    diff,
    pdfStatus,
    pdfPageCount,
    pdfError,
    pdfPath,
    passNumber,
    stopReason,
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
