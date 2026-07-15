import { z } from "zod";

export const JobInputSchema = z.object({
  company: z.string(),
  roleTitle: z.string(),
  sourceUrl: z.string(),
  rawDescription: z.string().min(20, "Paste the full job description before analysis."),
});

export const CareerItemFormSchema = z.object({
  type: z.enum(["project", "employment", "education"]),
  title: z.string().min(1, "Title is required."),
  organization: z.string().optional().default(""),
  location: z.string().optional().default(""),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  isCurrent: z.boolean().optional().default(false),
  shortDescription: z.string().optional().default(""),
  url: z.string().optional().default(""),
  repositoryUrl: z.string().optional().default(""),
  enabled: z.boolean().optional().default(true),
});

export const CareerFactFormSchema = z.object({
  statement: z.string().min(1, "Fact text is required."),
  evidenceStatus: z.enum(["user_provided", "verified", "needs_review", "prohibited"]),
  sourceNote: z.string().optional().default(""),
  skillTags: z.string().optional().default(""),
  roleTags: z.string().optional().default(""),
  metricTokens: z.string().optional().default(""),
  importance: z.coerce.number().int().min(1).max(5),
  enabled: z.boolean().optional().default(true),
});
