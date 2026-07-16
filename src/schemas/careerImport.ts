import { z } from "zod";

const sourceType = z.enum([
  "paste_anything",
  "structured_package",
  "guided_interview",
  "project_completion_report",
  "resume_text",
]);
const operation = z.enum(["add", "update", "merge", "skip"]);
const targetType = z.enum(["profile", "career_item", "career_fact", "skill", "relationship"]);
const validationStatus = z.enum(["pending", "valid", "warning", "conflict", "invalid"]);
const userDecision = z.enum(["pending", "approved", "edited", "merge", "rejected"]);
const careerItemType = z.enum(["project", "employment", "education"]);
const evidenceStatus = z.enum(["user_provided", "verified", "needs_review", "prohibited"]);
const careerFactSourceType = z.enum([
  "user_statement",
  "repository",
  "readme",
  "test_result",
  "build_output",
  "deployment_result",
  "resume",
  "manually_verified",
]);

const stringArray = z.array(z.string());

export const CareerImportProfileValue = z
  .object({
    fullName: z.string(),
    headline: z.string(),
    city: z.string(),
    region: z.string(),
    email: z.string(),
    phone: z.string(),
    portfolioUrl: z.string(),
    linkedInUrl: z.string(),
    githubUrl: z.string(),
    workAuthorizationNote: z.string(),
  })
  .strict();

export const CareerImportCareerItemValue = z
  .object({
    type: careerItemType,
    title: z.string(),
    organization: z.string(),
    location: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    isCurrent: z.boolean(),
    shortDescription: z.string(),
    url: z.string(),
    repositoryUrl: z.string(),
    enabled: z.boolean(),
  })
  .strict();

export const CareerImportCareerFactValue = z
  .object({
    statement: z.string(),
    careerItemId: z.string(),
    careerItemTitle: z.string(),
    evidenceStatus,
    sourceType: careerFactSourceType,
    sourceReference: z.string(),
    skillTags: stringArray,
    roleTags: stringArray,
    metricTokens: stringArray,
    importance: z.number().int().min(1).max(5),
    enabled: z.boolean(),
  })
  .strict();

export const CareerImportSkillValue = z
  .object({
    name: z.string(),
    category: z.string(),
    proficiencyNote: z.string(),
    enabled: z.boolean(),
  })
  .strict();

export const CareerImportRelationshipValue = z
  .object({
    fromType: targetType,
    fromReference: z.string(),
    toType: targetType,
    toReference: z.string(),
    relationshipType: z.string(),
  })
  .strict();

const changeBase = {
  proposalId: z.string(),
  operation,
  existingRecordId: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  sourceExcerpt: z.string(),
  validationStatus,
  validationIssues: stringArray,
  duplicateCandidates: stringArray,
  conflictDetails: stringArray,
  userDecision,
  existingValue: z.record(z.string(), z.unknown()).nullable(),
};

export const CareerImportProfileChange = z
  .object({
    ...changeBase,
    targetType: z.literal("profile"),
    proposedValue: CareerImportProfileValue,
  })
  .strict();

export const CareerImportCareerItemChange = z
  .object({
    ...changeBase,
    targetType: z.literal("career_item"),
    proposedValue: CareerImportCareerItemValue,
  })
  .strict();

export const CareerImportCareerFactChange = z
  .object({
    ...changeBase,
    targetType: z.literal("career_fact"),
    proposedValue: CareerImportCareerFactValue,
  })
  .strict();

export const CareerImportSkillChange = z
  .object({
    ...changeBase,
    targetType: z.literal("skill"),
    proposedValue: CareerImportSkillValue,
  })
  .strict();

export const CareerImportRelationshipChange = z
  .object({
    ...changeBase,
    targetType: z.literal("relationship"),
    proposedValue: CareerImportRelationshipValue,
  })
  .strict();

export const CareerImportProposal = z
  .object({
    importId: z.string(),
    sourceType,
    sourceTitle: z.string(),
    sourceReference: z.string(),
    profileChanges: z.array(CareerImportProfileChange),
    careerItemChanges: z.array(CareerImportCareerItemChange),
    careerFactChanges: z.array(CareerImportCareerFactChange),
    skillChanges: z.array(CareerImportSkillChange),
    relationshipChanges: z.array(CareerImportRelationshipChange),
    warnings: stringArray,
    unresolvedQuestions: stringArray,
    extractionMetadata: z
      .object({
        provider: z.enum(["mock", "openai", "package", "deterministic"]),
        model: z.string(),
        promptVersion: z.string(),
        classifiedAs: sourceType,
        createdAt: z.string(),
      })
      .strict(),
  })
  .strict();

export const CareerImportProposalSchema = CareerImportProposal;
export type CareerImportProposalData = z.infer<typeof CareerImportProposal>;

const jsonStringArray = { type: "array", items: { type: "string" } } as const;
const changeBaseJsonSchema = {
  operation: { type: "string", enum: ["add", "update", "merge", "skip"] },
  existingRecordId: { type: "string" },
  confidence: { type: "number", minimum: 0, maximum: 1 },
  reason: { type: "string" },
  sourceExcerpt: { type: "string" },
  validationStatus: {
    type: "string",
    enum: ["pending", "valid", "warning", "conflict", "invalid"],
  },
  validationIssues: jsonStringArray,
  duplicateCandidates: jsonStringArray,
  conflictDetails: jsonStringArray,
  userDecision: { type: "string", enum: ["pending", "approved", "edited", "merge", "rejected"] },
  existingValue: {
    anyOf: [
      { type: "object", additionalProperties: true },
      { type: "null" },
    ],
  },
} as const;

function changeSchema(target: string, proposedValue: unknown) {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "proposalId",
      "operation",
      "targetType",
      "existingRecordId",
      "confidence",
      "reason",
      "sourceExcerpt",
      "validationStatus",
      "validationIssues",
      "duplicateCandidates",
      "conflictDetails",
      "userDecision",
      "proposedValue",
      "existingValue",
    ],
    properties: {
      proposalId: { type: "string" },
      targetType: { type: "string", enum: [target] },
      ...changeBaseJsonSchema,
      proposedValue,
    },
  } as const;
}

const profileValueJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "fullName",
    "headline",
    "city",
    "region",
    "email",
    "phone",
    "portfolioUrl",
    "linkedInUrl",
    "githubUrl",
    "workAuthorizationNote",
  ],
  properties: {
    fullName: { type: "string" },
    headline: { type: "string" },
    city: { type: "string" },
    region: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    portfolioUrl: { type: "string" },
    linkedInUrl: { type: "string" },
    githubUrl: { type: "string" },
    workAuthorizationNote: { type: "string" },
  },
} as const;

const careerItemValueJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "type",
    "title",
    "organization",
    "location",
    "startDate",
    "endDate",
    "isCurrent",
    "shortDescription",
    "url",
    "repositoryUrl",
    "enabled",
  ],
  properties: {
    type: { type: "string", enum: ["project", "employment", "education"] },
    title: { type: "string" },
    organization: { type: "string" },
    location: { type: "string" },
    startDate: { type: "string" },
    endDate: { type: "string" },
    isCurrent: { type: "boolean" },
    shortDescription: { type: "string" },
    url: { type: "string" },
    repositoryUrl: { type: "string" },
    enabled: { type: "boolean" },
  },
} as const;

const careerFactValueJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "statement",
    "careerItemId",
    "careerItemTitle",
    "evidenceStatus",
    "sourceType",
    "sourceReference",
    "skillTags",
    "roleTags",
    "metricTokens",
    "importance",
    "enabled",
  ],
  properties: {
    statement: { type: "string" },
    careerItemId: { type: "string" },
    careerItemTitle: { type: "string" },
    evidenceStatus: {
      type: "string",
      enum: ["user_provided", "verified", "needs_review", "prohibited"],
    },
    sourceType: {
      type: "string",
      enum: [
        "user_statement",
        "repository",
        "readme",
        "test_result",
        "build_output",
        "deployment_result",
        "resume",
        "manually_verified",
      ],
    },
    sourceReference: { type: "string" },
    skillTags: jsonStringArray,
    roleTags: jsonStringArray,
    metricTokens: jsonStringArray,
    importance: { type: "integer", minimum: 1, maximum: 5 },
    enabled: { type: "boolean" },
  },
} as const;

const skillValueJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "category", "proficiencyNote", "enabled"],
  properties: {
    name: { type: "string" },
    category: { type: "string" },
    proficiencyNote: { type: "string" },
    enabled: { type: "boolean" },
  },
} as const;

const relationshipValueJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["fromType", "fromReference", "toType", "toReference", "relationshipType"],
  properties: {
    fromType: { type: "string", enum: ["profile", "career_item", "career_fact", "skill", "relationship"] },
    fromReference: { type: "string" },
    toType: { type: "string", enum: ["profile", "career_item", "career_fact", "skill", "relationship"] },
    toReference: { type: "string" },
    relationshipType: { type: "string" },
  },
} as const;

export const careerImportProposalJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "importId",
    "sourceType",
    "sourceTitle",
    "sourceReference",
    "profileChanges",
    "careerItemChanges",
    "careerFactChanges",
    "skillChanges",
    "relationshipChanges",
    "warnings",
    "unresolvedQuestions",
    "extractionMetadata",
  ],
  properties: {
    importId: { type: "string" },
    sourceType: {
      type: "string",
      enum: [
        "paste_anything",
        "structured_package",
        "guided_interview",
        "project_completion_report",
        "resume_text",
      ],
    },
    sourceTitle: { type: "string" },
    sourceReference: { type: "string" },
    profileChanges: { type: "array", items: changeSchema("profile", profileValueJsonSchema) },
    careerItemChanges: { type: "array", items: changeSchema("career_item", careerItemValueJsonSchema) },
    careerFactChanges: { type: "array", items: changeSchema("career_fact", careerFactValueJsonSchema) },
    skillChanges: { type: "array", items: changeSchema("skill", skillValueJsonSchema) },
    relationshipChanges: { type: "array", items: changeSchema("relationship", relationshipValueJsonSchema) },
    warnings: jsonStringArray,
    unresolvedQuestions: jsonStringArray,
    extractionMetadata: {
      type: "object",
      additionalProperties: false,
      required: ["provider", "model", "promptVersion", "classifiedAs", "createdAt"],
      properties: {
        provider: { type: "string", enum: ["mock", "openai", "package", "deterministic"] },
        model: { type: "string" },
        promptVersion: { type: "string" },
        classifiedAs: {
          type: "string",
          enum: [
            "paste_anything",
            "structured_package",
            "guided_interview",
            "project_completion_report",
            "resume_text",
          ],
        },
        createdAt: { type: "string" },
      },
    },
  },
} as const;
