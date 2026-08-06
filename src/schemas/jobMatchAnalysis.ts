import { z } from "zod";

const CompatibilitySchema = z.enum(["strong", "moderate", "weak", "incompatible", "unclear"]);

export const JobMatchAnalysisSchema = z.object({
  score: z.number().min(0).max(100),
  hardReject: z.boolean(),
  hardRejectReasons: z.array(z.string()),
  recommendedResumeProfile: z.string(),
  matchedEvidenceIds: z.array(z.string()),
  matchedSkillIds: z.array(z.string()),
  matchedProjectIds: z.array(z.string()),
  matchedExperienceIds: z.array(z.string()),
  missingRequirements: z.array(z.string()),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  experienceCompatibility: CompatibilitySchema,
  locationCompatibility: CompatibilitySchema,
  sponsorshipStatus: z.enum(["explicitly_available", "explicitly_unavailable", "not_mentioned", "unclear"]),
  summary: z.string(),
});

export type JobMatchAnalysis = z.infer<typeof JobMatchAnalysisSchema>;

export const jobMatchAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "score", "hardReject", "hardRejectReasons", "recommendedResumeProfile", "matchedEvidenceIds",
    "matchedSkillIds", "matchedProjectIds", "matchedExperienceIds", "missingRequirements", "strengths",
    "concerns", "experienceCompatibility", "locationCompatibility", "sponsorshipStatus", "summary",
  ],
  properties: {
    score: { type: "number", minimum: 0, maximum: 100 },
    hardReject: { type: "boolean" },
    hardRejectReasons: { type: "array", items: { type: "string" } },
    recommendedResumeProfile: { type: "string" },
    matchedEvidenceIds: { type: "array", items: { type: "string" } },
    matchedSkillIds: { type: "array", items: { type: "string" } },
    matchedProjectIds: { type: "array", items: { type: "string" } },
    matchedExperienceIds: { type: "array", items: { type: "string" } },
    missingRequirements: { type: "array", items: { type: "string" } },
    strengths: { type: "array", items: { type: "string" } },
    concerns: { type: "array", items: { type: "string" } },
    experienceCompatibility: { type: "string", enum: CompatibilitySchema.options },
    locationCompatibility: { type: "string", enum: CompatibilitySchema.options },
    sponsorshipStatus: { type: "string", enum: ["explicitly_available", "explicitly_unavailable", "not_mentioned", "unclear"] },
    summary: { type: "string" },
  },
} as const;

export function validateJobMatchEvidence(
  analysis: JobMatchAnalysis,
  allowed: { evidenceIds: string[]; skillIds: string[]; projectIds: string[]; experienceIds: string[] },
) {
  const checks: Array<[string, string[], Set<string>]> = [
    ["matchedEvidenceIds", analysis.matchedEvidenceIds, new Set(allowed.evidenceIds)],
    ["matchedSkillIds", analysis.matchedSkillIds, new Set(allowed.skillIds)],
    ["matchedProjectIds", analysis.matchedProjectIds, new Set(allowed.projectIds)],
    ["matchedExperienceIds", analysis.matchedExperienceIds, new Set(allowed.experienceIds)],
  ];
  const errors = checks.flatMap(([field, ids, allowlist]) => ids.filter((id) => !allowlist.has(id)).map((id) => `${field} contains non-allowlisted ID ${id}.`));
  return { valid: errors.length === 0, errors };
}
