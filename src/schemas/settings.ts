import { z } from "zod";
import { APPROVED_RESUME_FONTS } from "../lib/resume/templateSettings";

export const ResumeTemplateSettingsSchema = z.object({
  fontFamily: z.enum(APPROVED_RESUME_FONTS),
  bodyFontSize: z.number().min(9).max(11),
  headerFontSize: z.number().min(15).max(22),
  sectionHeadingSize: z.number().min(9).max(13),
  marginInches: z.number().min(0.45).max(0.8),
  sectionSpacing: z.number().min(3).max(10),
  bulletSpacing: z.number().min(0).max(5),
  dateAlignment: z.enum(["right", "inline"]),
  urlDisplay: z.enum(["visible", "labels"]),
  educationOrdering: z.enum(["graduate-first", "chronological"]),
  projectsExperienceOrdering: z.enum(["projects-first", "experience-first"]),
  summaryAllowed: z.boolean(),
  maximumProjectCount: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  defaultBulletsPerProject: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
