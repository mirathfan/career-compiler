import { z } from "zod";

export const resumeReviewCategoryIds = [
  "visual_quality",
  "ats_readability",
  "content_strength",
  "factual_safety",
  "role_fit",
  "technical_depth",
  "conciseness",
  "skills_quality",
] as const;

const categorySchema = z.enum(resumeReviewCategoryIds);

const findingSchema = z.object({
  category: categorySchema,
  severity: z.enum(["low", "medium", "high", "critical"]),
  message: z.string(),
  recommendation: z.string(),
  target: z.string(),
  evidenceIds: z.array(z.string()),
});

const proposalSchema = z.object({
  operation: z.enum([
    "shorten_summary",
    "categorize_skills",
    "rewrite_bullet",
    "remove_bullet",
    "consolidate_duplicate",
    "reorder_bullets",
    "section_order",
    "layout",
    "manual_review",
  ]),
  category: categorySchema,
  priority: z.enum(["low", "medium", "high", "critical"]),
  expectedScoreImpact: z.number().int().min(0).max(20),
  title: z.string(),
  reason: z.string(),
  target: z.string(),
  before: z.string(),
  after: z.string(),
  evidenceIds: z.array(z.string()),
  safeToAutoApply: z.boolean(),
  confirmationRequired: z.boolean(),
});

export const ResumeReviewAdvisorySchema = z.object({
  scores: z.object({
    visualQuality: z.number().int().min(0).max(100),
    atsReadability: z.number().int().min(0).max(100),
    contentStrength: z.number().int().min(0).max(100),
    factualSafety: z.number().int().min(0).max(100),
    roleFit: z.number().int().min(0).max(100),
    technicalDepth: z.number().int().min(0).max(100),
    conciseness: z.number().int().min(0).max(100),
    skillsQuality: z.number().int().min(0).max(100),
  }),
  rationales: z.object({
    visualQuality: z.string(),
    atsReadability: z.string(),
    contentStrength: z.string(),
    factualSafety: z.string(),
    roleFit: z.string(),
    technicalDepth: z.string(),
    conciseness: z.string(),
    skillsQuality: z.string(),
  }),
  strengths: z.array(findingSchema).max(8),
  weaknesses: z.array(findingSchema).max(12),
  proposals: z.array(proposalSchema).max(10),
  visualInspection: z.object({
    readableFont: z.boolean(),
    clippingDetected: z.boolean(),
    bottomPageCompression: z.boolean(),
    educationDatesAligned: z.boolean(),
    skillsDense: z.boolean(),
    bulletsOverThreeLines: z.number().int().min(0),
    notes: z.string(),
  }),
});

export type ResumeReviewAdvisory = z.infer<typeof ResumeReviewAdvisorySchema>;

const stringArray = { type: "array", items: { type: "string" } } as const;
const categoryEnum = { type: "string", enum: resumeReviewCategoryIds } as const;
const scoreProperties = {
  visualQuality: { type: "integer", minimum: 0, maximum: 100 },
  atsReadability: { type: "integer", minimum: 0, maximum: 100 },
  contentStrength: { type: "integer", minimum: 0, maximum: 100 },
  factualSafety: { type: "integer", minimum: 0, maximum: 100 },
  roleFit: { type: "integer", minimum: 0, maximum: 100 },
  technicalDepth: { type: "integer", minimum: 0, maximum: 100 },
  conciseness: { type: "integer", minimum: 0, maximum: 100 },
  skillsQuality: { type: "integer", minimum: 0, maximum: 100 },
} as const;
const rationaleProperties = Object.fromEntries(
  Object.keys(scoreProperties).map((key) => [key, { type: "string" }]),
);

const findingJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["category", "severity", "message", "recommendation", "target", "evidenceIds"],
  properties: {
    category: categoryEnum,
    severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
    message: { type: "string" },
    recommendation: { type: "string" },
    target: { type: "string" },
    evidenceIds: stringArray,
  },
} as const;

export const resumeReviewAdvisoryJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "rationales", "strengths", "weaknesses", "proposals", "visualInspection"],
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(scoreProperties),
      properties: scoreProperties,
    },
    rationales: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(rationaleProperties),
      properties: rationaleProperties,
    },
    strengths: { type: "array", maxItems: 8, items: findingJsonSchema },
    weaknesses: { type: "array", maxItems: 12, items: findingJsonSchema },
    proposals: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["operation", "category", "priority", "expectedScoreImpact", "title", "reason", "target", "before", "after", "evidenceIds", "safeToAutoApply", "confirmationRequired"],
        properties: {
          operation: { type: "string", enum: ["shorten_summary", "categorize_skills", "rewrite_bullet", "remove_bullet", "consolidate_duplicate", "reorder_bullets", "section_order", "layout", "manual_review"] },
          category: categoryEnum,
          priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
          expectedScoreImpact: { type: "integer", minimum: 0, maximum: 20 },
          title: { type: "string" },
          reason: { type: "string" },
          target: { type: "string" },
          before: { type: "string" },
          after: { type: "string" },
          evidenceIds: stringArray,
          safeToAutoApply: { type: "boolean" },
          confirmationRequired: { type: "boolean" },
        },
      },
    },
    visualInspection: {
      type: "object",
      additionalProperties: false,
      required: ["readableFont", "clippingDetected", "bottomPageCompression", "educationDatesAligned", "skillsDense", "bulletsOverThreeLines", "notes"],
      properties: {
        readableFont: { type: "boolean" },
        clippingDetected: { type: "boolean" },
        bottomPageCompression: { type: "boolean" },
        educationDatesAligned: { type: "boolean" },
        skillsDense: { type: "boolean" },
        bulletsOverThreeLines: { type: "integer", minimum: 0 },
        notes: { type: "string" },
      },
    },
  },
} as const;
