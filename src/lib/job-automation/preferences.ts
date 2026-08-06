import type { JobSearchPreferences } from "../../types/domain";
import { nowIso } from "../utils";

export function defaultJobSearchPreferences(existing?: Partial<JobSearchPreferences> | null): JobSearchPreferences {
  const now = nowIso();
  const bounded = (value: number | undefined, fallback: number, minimum: number, maximum: number) =>
    Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.round(value as number))) : fallback;
  return {
    id: existing?.id ?? "job-search-preferences-default",
    automationEnabled: existing?.automationEnabled ?? false,
    targetRoleTitles: existing?.targetRoleTitles ?? [],
    preferredLocations: existing?.preferredLocations ?? [],
    remotePreference: existing?.remotePreference ?? "any",
    maximumJobAgeDays: bounded(existing?.maximumJobAgeDays, 30, 1, 365),
    minimumMatchScore: bounded(existing?.minimumMatchScore, 70, 0, 100),
    excludedCompanies: existing?.excludedCompanies ?? [],
    excludedTitleKeywords: existing?.excludedTitleKeywords ?? [],
    includedKeywords: existing?.includedKeywords ?? [],
    requiredKeywords: existing?.requiredKeywords ?? [],
    preferredSkills: existing?.preferredSkills ?? [],
    maximumExperienceYears: existing?.maximumExperienceYears === null || existing?.maximumExperienceYears === undefined ? null : bounded(existing.maximumExperienceYears, 0, 0, 40),
    seniorityLevels: existing?.seniorityLevels ?? [],
    employmentTypes: existing?.employmentTypes ?? [],
    salaryMinimum: existing?.salaryMinimum === null || existing?.salaryMinimum === undefined || !Number.isFinite(existing.salaryMinimum) ? null : Math.max(0, existing.salaryMinimum),
    salaryCurrency: existing?.salaryCurrency ?? "USD",
    citizenshipRestrictionBehavior: existing?.citizenshipRestrictionBehavior ?? "warn",
    sponsorshipFilteringBehavior: existing?.sponsorshipFilteringBehavior ?? "warn",
    maximumJobsAnalyzedPerRun: bounded(existing?.maximumJobsAnalyzedPerRun, 25, 1, 200),
    maximumResumesGeneratedPerRun: bounded(existing?.maximumResumesGeneratedPerRun, 3, 0, 25),
    pollingIntervalHours: bounded(existing?.pollingIntervalHours, 24, 1, 720),
    resumeGenerationMode: existing?.resumeGenerationMode ?? "manual",
    resumeGenerationThreshold: bounded(existing?.resumeGenerationThreshold, 85, 0, 100),
    requireApprovalBeforeAi: existing?.requireApprovalBeforeAi ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: existing?.updatedAt ?? now,
  };
}
