import type { Job, JobSearchPreferences } from "../../types/domain";
import { classifyCitizenshipRequirement, classifySponsorship, hasSecurityClearanceRequirement } from "./classification";
import { detectSeniority, extractExperienceRequirement, normalizeLocation } from "./normalize";
import type { JobFilterDecision } from "./types";

function includesAny(text: string, terms: string[]) {
  const value = text.toLowerCase();
  return terms.some((term) => term.trim() && value.includes(term.trim().toLowerCase()));
}

export function filterJob(job: Job, preferences: JobSearchPreferences, now = new Date()): JobFilterDecision {
  const hardRejectReasons: string[] = [];
  const warnings: string[] = [];
  const matchedRules: string[] = [];
  const title = job.roleTitle.toLowerCase();
  const description = job.descriptionText || job.rawDescription;
  const searchable = `${job.roleTitle}\n${description}`;
  const company = job.company.toLowerCase();

  if (["applied", "rejected", "closed"].includes(job.status)) hardRejectReasons.push(`Job status is ${job.status}.`);
  if (preferences.excludedCompanies.some((item) => item.trim().toLowerCase() === company)) hardRejectReasons.push("Company is excluded.");
  if (includesAny(title, preferences.excludedTitleKeywords)) hardRejectReasons.push("Title contains an excluded keyword.");

  const missingRequired = preferences.requiredKeywords.filter((keyword) => !searchable.toLowerCase().includes(keyword.toLowerCase()));
  if (missingRequired.length) hardRejectReasons.push(`Missing required keywords: ${missingRequired.join(", ")}.`);
  if (preferences.includedKeywords.length && !includesAny(searchable, preferences.includedKeywords)) warnings.push("No preferred include keyword matched.");

  const seniority = detectSeniority(job.roleTitle);
  if (preferences.seniorityLevels.length && !preferences.seniorityLevels.includes(seniority)) hardRejectReasons.push(`Seniority ${seniority} is outside preferences.`);
  else matchedRules.push(`Seniority classified as ${seniority}.`);

  const requiredYears = extractExperienceRequirement(description);
  if (requiredYears !== null && preferences.maximumExperienceYears !== null && requiredYears > preferences.maximumExperienceYears) {
    hardRejectReasons.push(`Posting requires at least ${requiredYears} years of experience.`);
  } else if (requiredYears !== null) matchedRules.push(`Experience requirement detected: ${requiredYears} years.`);

  if (preferences.remotePreference !== "any" && job.workplaceType !== "unspecified" && job.workplaceType !== preferences.remotePreference) {
    hardRejectReasons.push(`Workplace type ${job.workplaceType} does not match ${preferences.remotePreference}.`);
  }
  if (preferences.preferredLocations.length && job.workplaceType !== "remote" && job.location && !preferences.preferredLocations.some((location) => job.normalizedLocation.includes(normalizeLocation(location)))) {
    hardRejectReasons.push("Location is outside preferred locations.");
  }
  if (preferences.employmentTypes.length && job.employmentType && !preferences.employmentTypes.some((type) => type.toLowerCase() === job.employmentType.toLowerCase())) {
    hardRejectReasons.push(`Employment type ${job.employmentType} is outside preferences.`);
  }

  if (job.postedAt) {
    const posted = new Date(job.postedAt);
    if (Number.isFinite(posted.getTime())) {
      const ageDays = Math.max(0, (now.getTime() - posted.getTime()) / 86_400_000);
      if (ageDays > preferences.maximumJobAgeDays) hardRejectReasons.push(`Posting is ${Math.floor(ageDays)} days old.`);
      else matchedRules.push(`Posting is ${Math.floor(ageDays)} days old.`);
    }
  }

  if (preferences.salaryMinimum !== null) {
    const comparableCurrency = !preferences.salaryCurrency || !job.salaryCurrency || preferences.salaryCurrency.toLowerCase() === job.salaryCurrency.toLowerCase();
    if (job.salaryMax !== null && comparableCurrency && job.salaryMax < preferences.salaryMinimum) hardRejectReasons.push("Published salary range is below the configured minimum.");
    else if (job.salaryMax === null) warnings.push("Salary was not published; the configured minimum could not be checked.");
    else if (!comparableCurrency) warnings.push("Published salary uses a different currency; verify compensation manually.");
  }

  const citizenship = classifyCitizenshipRequirement(description);
  if (citizenship === "required") {
    if (preferences.citizenshipRestrictionBehavior === "reject") hardRejectReasons.push("Posting explicitly requires citizenship.");
    else if (preferences.citizenshipRestrictionBehavior === "warn") warnings.push("Posting explicitly requires citizenship; verify eligibility manually.");
  } else if (citizenship === "unclear") warnings.push("Citizenship language is unclear; verify manually.");

  if (hasSecurityClearanceRequirement(description)) hardRejectReasons.push("Posting explicitly requires a security clearance.");

  const sponsorship = classifySponsorship(description);
  if (sponsorship === "explicitly_unavailable") {
    if (preferences.sponsorshipFilteringBehavior === "reject_unavailable") hardRejectReasons.push("Posting explicitly says sponsorship is unavailable.");
    else if (preferences.sponsorshipFilteringBehavior === "warn") warnings.push("Posting explicitly says sponsorship is unavailable.");
  } else if (sponsorship === "unclear") warnings.push("Sponsorship language is unclear; no availability was inferred.");

  return { eligible: hardRejectReasons.length === 0, hardRejectReasons, warnings, matchedRules };
}
