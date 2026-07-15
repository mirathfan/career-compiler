import { z } from "zod";
import { JobAnalysisSchema } from "./jobAnalysis";

const stringArray = z.array(z.string());

export const ResumeGenerationRequestSchema = z.object({
  targetJob: z.object({
    company: z.string(),
    roleTitle: z.string(),
    jobDescription: z.string().min(1),
    analysis: JobAnalysisSchema,
  }),
  candidateProfile: z.object({
    name: z.string(),
    headline: z.string(),
    location: z.string(),
    email: z.string(),
    phone: z.string(),
    portfolioUrl: z.string(),
    linkedInUrl: z.string(),
    githubUrl: z.string(),
    workAuthorizationNote: z.string().nullable(),
  }),
  selectedCareerItems: z.array(
    z.object({
      careerItemId: z.string(),
      type: z.enum(["project", "employment", "education"]),
      title: z.string(),
      organization: z.string(),
      location: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      isCurrent: z.boolean(),
      url: z.string(),
      repositoryUrl: z.string(),
    }),
  ),
  selectedFacts: z.array(
    z.object({
      factId: z.string(),
      careerItemId: z.string(),
      statement: z.string(),
      evidenceStatus: z.enum(["user_provided", "verified", "needs_review"]),
      skillTags: stringArray,
      roleTags: stringArray,
      metricTokens: stringArray,
      importance: z.number().int().min(1).max(5),
      relevanceScore: z.number(),
      relevanceReason: z.string(),
    }),
  ),
  approvedSkills: z.array(
    z.object({ skillId: z.string(), name: z.string(), category: z.string() }),
  ),
  approvedVariants: z.array(
    z.object({
      id: z.string(),
      careerItemId: z.string(),
      sourceFactIds: stringArray,
      text: z.string(),
      roleCategories: stringArray,
      skillTags: stringArray,
      targetJobId: z.string(),
      creationSource: z.enum(["ai", "deterministic", "user"]),
      approvedAt: z.string(),
      createdAt: z.string(),
    }),
  ),
  constraints: z.object({
    sectionOrder: z.array(z.enum(["summary", "education", "experience", "projects", "skills"])),
    maximumSelectedProjects: z.number().int().positive(),
    maximumBulletsPerItem: z.number().int().positive(),
    summaryMode: z.enum(["auto", "always", "never"]),
    summaryPermitted: z.boolean(),
    onePageRequired: z.boolean(),
    lockedCareerItemIds: stringArray,
    lockedFactIds: stringArray,
    targetEmphasisAreas: stringArray,
    deEmphasisAreas: stringArray,
    contentBudget: z.object({
      maximumTotalBullets: z.number().int().positive(),
      recommendedBulletWords: z.number().int().positive(),
    }),
  }),
});
