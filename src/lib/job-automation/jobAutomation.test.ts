import { describe, expect, it } from "vitest";
import type { CareerFact, CareerItem, Job, JobSearchPreferences, Skill } from "../../types/domain";
import { validateJobMatchEvidence, JobMatchAnalysisSchema } from "../../schemas/jobMatchAnalysis";
import { answerVaultContextForAi, protectAnswerVaultEntry } from "./answerVault";
import { classifyCitizenshipRequirement, classifySponsorship } from "./classification";
import { descriptionSimilarity, findDuplicate, hasMaterialJobChange } from "./deduplication";
import { filterJob } from "./filtering";
import { extractExperienceRequirement, htmlToText, legacyJobAutomationFields, normalizeLocation, normalizeTitle, stableContentHash } from "./normalize";
import { defaultJobSearchPreferences } from "./preferences";
import { combineScores, scoreJob } from "./scoring";

const timestamp = "2026-08-06T00:00:00.000Z";
function job(overrides: Partial<Job> = {}): Job {
  const roleTitle = overrides.roleTitle ?? "Software Engineer";
  const rawDescription = overrides.rawDescription ?? "Build React and TypeScript products. 2+ years experience.";
  return { id: "job-1", company: "Example", roleTitle, sourceUrl: "https://jobs.example/job-1", rawDescription, analysisJson: null, ...legacyJobAutomationFields({ roleTitle, rawDescription, sourceUrl: "https://jobs.example/job-1", timestamp }), createdAt: timestamp, updatedAt: timestamp, ...overrides };
}
function preferences(overrides: Partial<JobSearchPreferences> = {}) { return defaultJobSearchPreferences({ targetRoleTitles: ["Software Engineer"], preferredSkills: ["React", "TypeScript", "Rust"], maximumExperienceYears: 3, seniorityLevels: ["mid"], ...overrides }); }

const project: CareerItem = { id: "project-1", type: "project", title: "Web app", organization: "", location: "", startDate: "2026", endDate: "", isCurrent: true, shortDescription: "", url: "", repositoryUrl: "", displayOrder: 1, enabled: true, createdAt: timestamp, updatedAt: timestamp };
const fact: CareerFact = { id: "fact-1", careerItemId: project.id, statement: "Built a React TypeScript app.", evidenceStatus: "verified", sourceNote: "", sourceType: "manually_verified", sourceReference: "", verificationDate: "", lastReviewedDate: "", notes: "", skillTags: ["React", "TypeScript"], roleTags: ["software engineer"], metricTokens: [], importance: 5, enabled: true, createdAt: timestamp, updatedAt: timestamp };
const skills: Skill[] = [{ id: "skill-react", name: "React", category: "Framework", proficiencyNote: "", enabled: true }, { id: "skill-ts", name: "TypeScript", category: "Language", proficiencyNote: "", enabled: true }];

describe("job automation deterministic logic", () => {
  it("normalizes text and produces stable content hashes", () => {
    expect(htmlToText("<p>Hello &amp; welcome</p><script>bad()</script><ul><li>One</li></ul>")).toBe("Hello & welcome\nOne");
    expect(normalizeTitle("Senior—Software Engineer")).toBe("senior software engineer");
    expect(normalizeLocation(" Remote within  Chicago, IL ")).toBe("remote chicago, il");
    expect(stableContentHash(" A  B ")).toBe(stableContentHash("a b"));
    expect(extractExperienceRequirement("Requires 3-5 years plus 2 yrs APIs")).toBe(3);
  });

  it("classifies sponsorship and citizenship only from explicit language", () => {
    expect(classifySponsorship("We cannot provide visa sponsorship.")).toBe("explicitly_unavailable");
    expect(classifySponsorship("We have a global team.")).toBe("not_mentioned");
    expect(classifyCitizenshipRequirement("Applicants must be U.S. citizens.")).toBe("required");
  });

  it("deduplicates using ordered strong signals and detects material changes", () => {
    const existing = job({ sourceId: "source-1", externalId: "external-1", contentHash: "hash-1" });
    const incoming = { ...existing, id: undefined, analysisJson: undefined, createdAt: undefined, updatedAt: undefined };
    const normalized = incoming as Parameters<typeof findDuplicate>[0];
    expect(findDuplicate(normalized, [existing]).reason).toBe("source_external_id");
    expect(hasMaterialJobChange(existing, { ...normalized, descriptionText: "Changed materially" })).toBe(true);
    const longDescription = Array.from({ length: 24 }, (_, index) => `word${index}`).join(" ");
    expect(descriptionSimilarity(longDescription, longDescription)).toBeGreaterThan(0.9);
  });

  it("filters hard rules before scoring", () => {
    const decision = filterJob(job({ rawDescription: "Must be a U.S. citizen. No visa sponsorship. Requires 7 years experience." }), preferences({ citizenshipRestrictionBehavior: "reject", sponsorshipFilteringBehavior: "reject_unavailable" }), new Date(timestamp));
    expect(decision.eligible).toBe(false);
    expect(decision.hardRejectReasons.join(" ")).toContain("citizenship");
    expect(decision.hardRejectReasons.join(" ")).toContain("sponsorship");
  });

  it("returns an explainable score out of 100 using Career Memory IDs", () => {
    const result = scoreJob(job({ postedAt: "2026-08-05T00:00:00.000Z" }), preferences(), { careerItems: [project], careerFacts: [fact], skills }, new Date(timestamp));
    expect(result.deterministicScore).toBeGreaterThan(60);
    expect(result.deterministicScore).toBeLessThanOrEqual(100);
    expect(result.matchedSkillIds).toEqual(["skill-react", "skill-ts"]);
    expect(result.matchedFactIds).toEqual(["fact-1"]);
    expect(combineScores(80, 90)).toBe(83);
  });

  it("validates structured AI output against supplied evidence IDs", () => {
    const analysis = JobMatchAnalysisSchema.parse({ score: 80, hardReject: false, hardRejectReasons: [], recommendedResumeProfile: "ai-engineer", matchedEvidenceIds: ["fact-1"], matchedSkillIds: ["skill-react"], matchedProjectIds: ["project-1"], matchedExperienceIds: [], missingRequirements: [], strengths: [], concerns: [], experienceCompatibility: "strong", locationCompatibility: "moderate", sponsorshipStatus: "not_mentioned", summary: "Grounded match." });
    expect(validateJobMatchEvidence(analysis, { evidenceIds: ["fact-1"], skillIds: ["skill-react"], projectIds: ["project-1"], experienceIds: [] }).valid).toBe(true);
    expect(validateJobMatchEvidence({ ...analysis, matchedEvidenceIds: ["invented"] }, { evidenceIds: ["fact-1"], skillIds: ["skill-react"], projectIds: ["project-1"], experienceIds: [] }).valid).toBe(false);
  });

  it("protects consequential answer-vault fields from automatic use", () => {
    const entry = protectAnswerVaultEntry({ id: "answer-1", key: "salary", value: "100000", category: "salary", verified: true, sensitive: false, requiresManualConfirmation: false, createdAt: timestamp, updatedAt: timestamp });
    expect(entry.sensitive).toBe(true);
    expect(entry.requiresManualConfirmation).toBe(true);
    expect(answerVaultContextForAi([entry])).toEqual([]);
    expect(answerVaultContextForAi([entry], ["salary"])).toHaveLength(1);
  });
});
