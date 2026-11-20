import type { JobMatchAnalysis } from "../../schemas/jobMatchAnalysis";
import { classifySponsorship } from "./classification";
import type { JobMatchEvidencePacket, JobMatchModelRequest, JobMatchValidationIssue } from "./aiTypes";

function issue(code: string, severity: JobMatchValidationIssue["severity"], message: string, path?: string, evidenceId?: string): JobMatchValidationIssue {
  return { code, severity, message, ...(path ? { path } : {}), ...(evidenceId ? { evidenceId } : {}) };
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.%]+/g, " ").replace(/\s+/g, " ").trim();
}

function numericTokens(value: string) {
  return [...value.matchAll(/(?<![a-z])\d[\d,]*(?:\.\d+)?%?/gi)].map((match) => match[0].replaceAll(",", ""));
}

function outputText(analysis: JobMatchAnalysis) {
  return [
    ...analysis.hardRejectReasons,
    ...analysis.requiredQualifications,
    ...analysis.preferredQualifications,
    ...analysis.missingRequirements,
    ...analysis.strengths,
    ...analysis.concerns,
    analysis.summary,
  ].join(" ");
}

function validateIds(field: string, ids: string[], allowlist: string[], issues: JobMatchValidationIssue[]) {
  const allowed = new Set(allowlist);
  for (const id of ids) if (!allowed.has(id)) issues.push(issue("id_not_allowlisted", "error", `${field} references an ID that was not supplied.`, field, id));
}

function significantTerms(value: string) {
  const stop = new Set(["and", "the", "with", "for", "from", "that", "this", "role", "job", "experience", "skills", "preferred", "required", "relevant", "additional", "described", "supplied", "posting"]);
  return new Set((normalized(value).match(/[a-z][a-z0-9+#.]{2,}/g) ?? []).filter((term) => !stop.has(term)));
}

export function validateJobMatchAnalysis(input: {
  analysis: JobMatchAnalysis;
  request: JobMatchModelRequest;
  evidencePacket: JobMatchEvidencePacket;
}): JobMatchValidationIssue[] {
  const { analysis, request, evidencePacket } = input;
  const issues: JobMatchValidationIssue[] = [];
  validateIds("matchedEvidenceIds", analysis.matchedEvidenceIds, evidencePacket.suppliedIds.evidenceIds, issues);
  validateIds("matchedSkillIds", analysis.matchedSkillIds, evidencePacket.suppliedIds.skillIds, issues);
  validateIds("matchedProjectIds", analysis.matchedProjectIds, evidencePacket.suppliedIds.projectIds, issues);
  validateIds("matchedExperienceIds", analysis.matchedExperienceIds, evidencePacket.suppliedIds.experienceIds, issues);

  if (analysis.recommendedResumeProfile !== null && !evidencePacket.suppliedIds.resumeProfileIds.includes(analysis.recommendedResumeProfile)) {
    issues.push(issue("resume_profile_not_allowlisted", "error", "The recommended resume profile was not supplied.", "recommendedResumeProfile", analysis.recommendedResumeProfile));
  }
  if (analysis.hardReject && analysis.hardRejectReasons.length === 0) {
    issues.push(issue("hard_reject_reason_missing", "error", "A hard reject requires at least one structured reason.", "hardRejectReasons"));
  }
  if (!request.deterministic.filter.eligible && !analysis.hardReject) {
    issues.push(issue("deterministic_reject_removed", "error", "AI analysis cannot remove a deterministic hard reject.", "hardReject"));
  }
  const required = new Set(analysis.requiredQualifications.map(normalized).filter(Boolean));
  for (const preferred of analysis.preferredQualifications) {
    if (required.has(normalized(preferred))) issues.push(issue("qualification_classification_merged", "error", "The same qualification cannot be both required and preferred.", "preferredQualifications"));
  }

  const allowedNumbers = new Set([
    ...numericTokens(request.job.descriptionText),
    ...evidencePacket.items.flatMap((item) => item.numericClaims.flatMap(numericTokens)),
  ]);
  for (const token of numericTokens(outputText(analysis))) {
    if (!allowedNumbers.has(token)) issues.push(issue("unsupported_numeric_claim", "error", `Numeric claim ${token} is not present in the job or supplied evidence.`, "summary"));
  }

  const deterministicSponsorship = classifySponsorship(request.job.descriptionText);
  if (["explicitly_available", "explicitly_unavailable"].includes(analysis.sponsorshipStatus) && analysis.sponsorshipStatus !== deterministicSponsorship) {
    issues.push(issue("unsupported_sponsorship_classification", "error", "Explicit sponsorship classification is not supported by the job description.", "sponsorshipStatus"));
  }
  if (deterministicSponsorship === "not_mentioned" && analysis.sponsorshipStatus !== "not_mentioned") {
    issues.push(issue("sponsorship_not_mentioned", "error", "Missing sponsorship language must remain not_mentioned.", "sponsorshipStatus"));
  }

  const jobTerms = significantTerms(request.job.descriptionText);
  for (const [path, qualifications] of [["requiredQualifications", analysis.requiredQualifications], ["preferredQualifications", analysis.preferredQualifications]] as const) {
    for (const qualification of qualifications) {
      const overlap = [...significantTerms(qualification)].some((term) => jobTerms.has(term));
      if (!overlap) issues.push(issue("qualification_not_traceable", "warning", "Qualification wording could not be directly traced to job-description terms; review it.", path));
    }
  }

  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(outputText(analysis))) {
    issues.push(issue("sensitive_contact_data_returned", "error", "AI analysis must not contain email addresses.", "summary"));
  }
  return issues;
}

export function hasJobMatchValidationErrors(issues: JobMatchValidationIssue[]) {
  return issues.some((item) => item.severity === "error");
}
