import { z } from "zod";

export const JobAnalysisSchema = z.object({
  inferredCompany: z.string(),
  inferredRoleTitle: z.string(),
  seniority: z.string(),
  roleCategories: z.array(z.string()),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  responsibilities: z.array(z.string()),
  domainKeywords: z.array(z.string()),
  candidateSignals: z.array(z.string()),
  locationRequirements: z.array(z.string()),
  workAuthorizationLanguage: z.string(),
  summary: z.string(),
});

export type JobAnalysisInput = z.infer<typeof JobAnalysisSchema>;

export const jobAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "inferredCompany",
    "inferredRoleTitle",
    "seniority",
    "roleCategories",
    "requiredSkills",
    "preferredSkills",
    "responsibilities",
    "domainKeywords",
    "candidateSignals",
    "locationRequirements",
    "workAuthorizationLanguage",
    "summary",
  ],
  properties: {
    inferredCompany: { type: "string" },
    inferredRoleTitle: { type: "string" },
    seniority: { type: "string" },
    roleCategories: { type: "array", items: { type: "string" } },
    requiredSkills: { type: "array", items: { type: "string" } },
    preferredSkills: { type: "array", items: { type: "string" } },
    responsibilities: { type: "array", items: { type: "string" } },
    domainKeywords: { type: "array", items: { type: "string" } },
    candidateSignals: { type: "array", items: { type: "string" } },
    locationRequirements: { type: "array", items: { type: "string" } },
    workAuthorizationLanguage: { type: "string" },
    summary: { type: "string" },
  },
} as const;
