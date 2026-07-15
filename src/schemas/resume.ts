import { z } from "zod";

export const ResumeBulletSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  sourceFactIds: z.array(z.string()).min(1),
  relevanceScore: z.number(),
  isUserEdited: z.boolean(),
  included: z.boolean().default(true),
  locked: z.boolean().optional(),
  selectionReason: z.string(),
});

export const ResumePlanSchema = z.object({
  targetPositioning: z.string(),
  selectedCareerItemIds: z.array(z.string()),
  selectedFactIds: z.array(z.string()),
  sectionOrder: z.array(z.enum(["summary", "education", "experience", "projects", "skills"])),
  emphasisAreas: z.array(z.string()),
  deEmphasisAreas: z.array(z.string()),
  omittedItems: z.array(z.object({ careerItemId: z.string(), reason: z.string() })),
  skillSelection: z.array(z.string()),
  contentBudget: z.object({
    maxBullets: z.number().int().positive(),
    maxProjects: z.number().int().positive(),
    includeSummary: z.boolean(),
  }),
});

const itemSectionSchema = z.object({
  careerItemId: z.string(),
  title: z.string(),
  organization: z.string(),
  location: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  isCurrent: z.boolean(),
  bullets: z.array(ResumeBulletSchema),
});

export const TailoredResumeSchema = z.object({
  id: z.string(),
  header: z.object({
    fullName: z.string(),
    headline: z.string(),
    location: z.string(),
    email: z.string(),
    phone: z.string(),
    portfolioUrl: z.string(),
    linkedInUrl: z.string(),
    githubUrl: z.string(),
  }),
  summary: z.array(z.string()),
  education: z.array(
    z.object({
      careerItemId: z.string(),
      title: z.string(),
      organization: z.string(),
      location: z.string(),
      dateLabel: z.string(),
    }),
  ),
  experience: z.array(itemSectionSchema),
  projects: z.array(itemSectionSchema),
  skills: z.array(z.string()),
  sectionOrder: z.array(z.enum(["summary", "education", "experience", "projects", "skills"])),
  compactionActions: z.array(z.string()),
});
