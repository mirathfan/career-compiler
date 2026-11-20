import { CareerImportProposal } from "../../schemas/careerImport";
import type {
  AIProviderMode,
  CareerFact,
  CareerImportCareerFactValue,
  CareerImportCareerItemValue,
  CareerImportChange,
  CareerImportProposal as CareerImportProposalType,
  CareerImportRecord,
  CareerImportSkillValue,
  CareerImportSourceType,
  CareerImportTargetType,
  CareerImportUserDecision,
  CareerItem,
  Profile,
  Skill,
} from "../../types/domain";
import { PROMPT_VERSIONS } from "../ai/prompts";
import { extractNumericTokens } from "../resume/validation";
import { createId, nowIso, unique } from "../utils";
import { containsPromptInjectionText } from "./evidenceImport";

export const CAREER_IMPORT_PACKAGE_SCHEMA_VERSION = 1;

export interface CareerImportContext {
  profile: Profile | null;
  careerItems: CareerItem[];
  careerFacts: CareerFact[];
  skills: Skill[];
}

export interface CareerImportPackage {
  schemaVersion: number;
  exportedAt: string;
  proposal: CareerImportProposalType;
}

const allowedDatePattern =
  /^$|^(?:Present|Current|Ongoing)$|^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}$|^\d{4}$|^\d{4}-\d{2}$|^\d{4}-\d{2}-\d{2}$/i;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeWords(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function normalizeImportKey(value: string) {
  return normalizeWords(value).join("");
}

function normalizedUrl(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\/(?:www\.)?/, "").replace(/\/$/, "");
}

function isValidUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function containsProbableSecret(text: string) {
  return /\bsk-[A-Za-z0-9_-]{8,}|\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*["']?[A-Za-z0-9_.:/+=-]{8,}/i.test(text);
}

function containsExecutableInstruction(text: string) {
  return /(?:rm\s+-rf|curl\s+.+\|\s*(?:sh|bash)|eval\s*\(|<script\b|osascript\s+-e|powershell\s+-enc)/i.test(text);
}

function safeJson(value: unknown) {
  return JSON.stringify(value);
}

export function safeSourceHash(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function jaccard(left: string, right: string) {
  const leftWords = new Set(normalizeWords(left).filter((word) => word.length > 2));
  const rightWords = new Set(normalizeWords(right).filter((word) => word.length > 2));
  if (!leftWords.size || !rightWords.size) return 0;
  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size;
  return intersection / union;
}

export function classifyCareerImportInput(text: string): CareerImportSourceType {
  const trimmed = text.trim();
  if (/^\{[\s\S]*\}$/.test(trimmed) && /"schemaVersion"|"CareerImportProposal"|"proposal"/.test(trimmed)) {
    return "structured_package";
  }
  if (/\b(?:commit|implemented|tests?|lint|type-?check|build|bundle|package|framework|architecture)\b/i.test(text)) {
    return "project_completion_report";
  }
  if (/\b(?:education|degree|university|college|gpa|graduat)/i.test(text)) {
    return "resume_text";
  }
  if (/\b(?:experience|employment|company|resume|skills|projects)\b/i.test(text)) {
    return "resume_text";
  }
  return "paste_anything";
}

function issueStatus(issues: string[], conflicts: string[], duplicates: string[]) {
  if (issues.some((issue) => issue.startsWith("error:"))) return "invalid" as const;
  if (conflicts.length) return "conflict" as const;
  if (issues.length || duplicates.length) return "warning" as const;
  return "valid" as const;
}

function withIssue(issues: string[], message: string) {
  if (!issues.includes(message)) issues.push(message);
}

function allChanges(proposal: CareerImportProposalType) {
  return [
    ...proposal.profileChanges,
    ...proposal.careerItemChanges,
    ...proposal.careerFactChanges,
    ...proposal.skillChanges,
    ...proposal.relationshipChanges,
  ];
}

function duplicateCareerItems(value: CareerImportCareerItemValue, context: CareerImportContext) {
  const titleKey = normalizeImportKey(value.title);
  const orgKey = normalizeImportKey(value.organization ?? "");
  const urls = [value.url ?? "", value.repositoryUrl ?? ""].filter(Boolean).map(normalizedUrl);
  return context.careerItems
    .filter((item) => {
      const itemTitleKey = normalizeImportKey(item.title);
      const itemOrgKey = normalizeImportKey(item.organization);
      const itemUrls = [item.url, item.repositoryUrl].filter(Boolean).map(normalizedUrl);
      const nameMatch = itemTitleKey === titleKey || jaccard(item.title, value.title) >= 0.72;
      const orgMatch = orgKey && itemOrgKey ? itemOrgKey === orgKey : true;
      const urlMatch = urls.some((url) => itemUrls.includes(url));
      return urlMatch || (nameMatch && orgMatch);
    })
    .map((item) => item.id);
}

function duplicateSkills(value: CareerImportSkillValue, context: CareerImportContext) {
  const key = normalizeImportKey(value.name);
  return context.skills.filter((skill) => normalizeImportKey(skill.name) === key).map((skill) => skill.id);
}

function duplicateFacts(value: CareerImportCareerFactValue, context: CareerImportContext) {
  return context.careerFacts
    .filter((fact) => jaccard(fact.statement, value.statement) >= 0.82)
    .map((fact) => fact.id);
}

function dateConflicts(value: CareerImportCareerItemValue, ids: string[], context: CareerImportContext) {
  return ids.flatMap((id) => {
    const existing = context.careerItems.find((item) => item.id === id);
    if (!existing) return [];
    const conflicts: string[] = [];
    if ((value.startDate ?? "") && existing.startDate && existing.startDate !== value.startDate) {
      conflicts.push(`Different start date for ${existing.title}: existing ${existing.startDate}, proposed ${value.startDate}.`);
    }
    if ((value.endDate ?? "") && existing.endDate && existing.endDate !== value.endDate) {
      conflicts.push(`Different end date for ${existing.title}: existing ${existing.endDate}, proposed ${value.endDate}.`);
    }
    if ((value.organization ?? "") && existing.organization && existing.organization !== value.organization) {
      conflicts.push(`Different organization for ${existing.title}: existing ${existing.organization}, proposed ${value.organization}.`);
    }
    return conflicts;
  });
}

function metricConflicts(value: CareerImportCareerFactValue, ids: string[], context: CareerImportContext) {
  const proposed = new Set(value.metricTokens);
  return ids.flatMap((id) => {
    const existing = context.careerFacts.find((fact) => fact.id === id);
    if (!existing) return [];
    const existingMetrics = new Set(existing.metricTokens);
    if (
      proposed.size &&
      existingMetrics.size &&
      [...proposed].some((token) => !existingMetrics.has(token)) &&
      [...existingMetrics].some((token) => !proposed.has(token))
    ) {
      return [`Different metric tokens for similar fact: existing ${existing.metricTokens.join(", ")}, proposed ${value.metricTokens.join(", ")}.`];
    }
    return [];
  });
}

function skillConflicts(value: CareerImportSkillValue, ids: string[], context: CareerImportContext) {
  return ids.flatMap((id) => {
    const existing = context.skills.find((skill) => skill.id === id);
    if (!existing || !existing.category || !value.category || existing.category === value.category) return [];
    return [`Different category for ${existing.name}: existing ${existing.category}, proposed ${value.category}.`];
  });
}

function findReferencedCareerItemId(
  value: CareerImportCareerFactValue,
  proposal: CareerImportProposalType,
  context: CareerImportContext,
) {
  if (value.careerItemId && context.careerItems.some((item) => item.id === value.careerItemId)) {
    return value.careerItemId;
  }
  const titleKey = normalizeImportKey(value.careerItemTitle ?? "");
  const existing = context.careerItems.find((item) => normalizeImportKey(item.title) === titleKey);
  if (existing) return existing.id;
  const proposed = proposal.careerItemChanges.find(
    (change) =>
      change.userDecision !== "rejected" &&
      change.proposedValue.title &&
      normalizeImportKey(change.proposedValue.title) === titleKey,
  );
  return proposed?.proposalId ?? "";
}

function validateBase(change: CareerImportChange, issues: string[]) {
  if (!change.proposalId.trim()) withIssue(issues, "error: Proposal is missing an ID.");
  if (change.confidence < 0 || change.confidence > 1) withIssue(issues, "error: Confidence must be 0 through 1.");
  if (!change.reason.trim()) withIssue(issues, "warning: Proposal has no extraction reason.");
  const text = `${change.sourceExcerpt}\n${safeJson(change.proposedValue)}`;
  if (containsProbableSecret(text)) withIssue(issues, "error: Proposal contains a probable secret or API key.");
  if (containsPromptInjectionText(text)) withIssue(issues, "error: Proposal contains prompt-injection text.");
  if (containsExecutableInstruction(text)) withIssue(issues, "error: Proposal contains executable instructions.");
}

function validateProfileChange(
  change: CareerImportProposalType["profileChanges"][number],
  context: CareerImportContext,
) {
  const issues = [...change.validationIssues];
  const conflicts = [...change.conflictDetails];
  validateBase(change, issues);
  const existing = context.profile;
  if (existing) {
    const fields: Array<keyof typeof change.proposedValue> = [
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
    ];
    for (const field of fields) {
      const proposed = String(change.proposedValue[field] ?? "").trim();
      const current = String(existing[field] ?? "").trim();
      if (proposed && current && proposed !== current) {
        conflicts.push(`Different profile ${field}: existing ${current}, proposed ${proposed}.`);
      }
    }
  }
  if (change.proposedValue.email && !change.proposedValue.email.includes("@")) {
    withIssue(issues, "error: Email is not valid.");
  }
  for (const field of ["portfolioUrl", "linkedInUrl", "githubUrl"] as const) {
    if (!isValidUrl(change.proposedValue[field] ?? "")) withIssue(issues, `error: ${field} must be a valid URL.`);
  }
  return { issues, conflicts, duplicates: [] };
}

function validateCareerItemChange(
  change: CareerImportProposalType["careerItemChanges"][number],
  context: CareerImportContext,
) {
  const issues = [...change.validationIssues];
  const duplicates = unique([...change.duplicateCandidates, ...duplicateCareerItems(change.proposedValue, context)]);
  const conflicts = unique([...change.conflictDetails, ...dateConflicts(change.proposedValue, duplicates, context)]);
  validateBase(change, issues);
  if (!change.proposedValue.title.trim()) withIssue(issues, "error: Career item title is required.");
  if (!allowedDatePattern.test(change.proposedValue.startDate ?? "")) withIssue(issues, "error: Start date uses an unsupported format.");
  if (!allowedDatePattern.test(change.proposedValue.endDate ?? "")) withIssue(issues, "error: End date uses an unsupported format.");
  for (const field of ["url", "repositoryUrl"] as const) {
    if (!isValidUrl(change.proposedValue[field] ?? "")) withIssue(issues, `error: ${field} must be a valid URL.`);
  }
  return { issues, conflicts, duplicates };
}

function validateCareerFactChange(
  change: CareerImportProposalType["careerFactChanges"][number],
  proposal: CareerImportProposalType,
  context: CareerImportContext,
) {
  const issues = [...change.validationIssues];
  const duplicates = unique([...change.duplicateCandidates, ...duplicateFacts(change.proposedValue, context)]);
  const conflicts = unique([...change.conflictDetails, ...metricConflicts(change.proposedValue, duplicates, context)]);
  validateBase(change, issues);
  if (!change.proposedValue.statement.trim()) withIssue(issues, "error: Career fact statement is blank.");
  if (
    change.proposedValue.enabled &&
    change.proposedValue.evidenceStatus === "prohibited"
  ) {
    withIssue(issues, "error: Prohibited claims cannot be enabled.");
  }
  const exactTokens = new Set(extractNumericTokens(change.proposedValue.statement));
  for (const token of change.proposedValue.metricTokens) {
    if (!exactTokens.has(token)) withIssue(issues, `error: Metric token ${token} does not appear exactly in the fact.`);
  }
  if (!findReferencedCareerItemId(change.proposedValue, proposal, context)) {
    withIssue(issues, "error: Career fact must reference an existing or newly proposed career item.");
  }
  return { issues, conflicts, duplicates };
}

function validateSkillChange(
  change: CareerImportProposalType["skillChanges"][number],
  context: CareerImportContext,
) {
  const issues = [...change.validationIssues];
  const duplicates = unique([...change.duplicateCandidates, ...duplicateSkills(change.proposedValue, context)]);
  const conflicts = unique([...change.conflictDetails, ...skillConflicts(change.proposedValue, duplicates, context)]);
  validateBase(change, issues);
  if (!change.proposedValue.name.trim()) withIssue(issues, "error: Skill name is required.");
  if (!change.proposedValue.category.trim()) withIssue(issues, "error: Skill category is required.");
  return { issues, conflicts, duplicates };
}

function validateRelationshipChange(change: CareerImportProposalType["relationshipChanges"][number]) {
  const issues = [...change.validationIssues];
  validateBase(change, issues);
  if (!change.proposedValue.fromReference.trim() || !change.proposedValue.toReference.trim()) {
    withIssue(issues, "error: Relationship endpoints are required.");
  }
  return { issues, conflicts: [...change.conflictDetails], duplicates: [...change.duplicateCandidates] };
}

function replaceChange<T extends CareerImportChange>(
  change: T,
  result: { issues: string[]; conflicts: string[]; duplicates: string[] },
): T {
  return {
    ...change,
    validationIssues: unique(result.issues),
    conflictDetails: unique(result.conflicts),
    duplicateCandidates: unique(result.duplicates),
    validationStatus: issueStatus(result.issues, result.conflicts, result.duplicates),
  };
}

export function prepareCareerImportProposal(
  rawProposal: CareerImportProposalType,
  context: CareerImportContext,
): CareerImportProposalType {
  const proposal = CareerImportProposal.parse(rawProposal) as CareerImportProposalType;
  const seen = new Set<string>();
  const duplicateProposalIds: string[] = [];
  for (const change of allChanges(proposal)) {
    if (seen.has(change.proposalId)) duplicateProposalIds.push(change.proposalId);
    seen.add(change.proposalId);
  }
  const withDuplicateProposalIssue = <T extends CareerImportChange>(change: T): T =>
    duplicateProposalIds.includes(change.proposalId)
      ? { ...change, validationIssues: unique([...change.validationIssues, "error: Duplicate proposal ID."]) }
      : change;

  const next: CareerImportProposalType = {
    ...proposal,
    profileChanges: proposal.profileChanges.map((change) =>
      replaceChange(withDuplicateProposalIssue(change), validateProfileChange(withDuplicateProposalIssue(change), context)),
    ),
    careerItemChanges: proposal.careerItemChanges.map((change) =>
      replaceChange(withDuplicateProposalIssue(change), validateCareerItemChange(withDuplicateProposalIssue(change), context)),
    ),
    careerFactChanges: proposal.careerFactChanges.map((change) =>
      replaceChange(
        withDuplicateProposalIssue(change),
        validateCareerFactChange(withDuplicateProposalIssue(change), proposal, context),
      ),
    ),
    skillChanges: proposal.skillChanges.map((change) =>
      replaceChange(withDuplicateProposalIssue(change), validateSkillChange(withDuplicateProposalIssue(change), context)),
    ),
    relationshipChanges: proposal.relationshipChanges.map((change) =>
      replaceChange(withDuplicateProposalIssue(change), validateRelationshipChange(withDuplicateProposalIssue(change))),
    ),
  };
  return {
    ...next,
    warnings: unique([
      ...next.warnings,
      ...(duplicateProposalIds.length ? ["Duplicate proposal IDs were found and blocked."] : []),
    ]),
  };
}

export function assertCareerImportReadyToSave(proposal: CareerImportProposalType) {
  const pending = allChanges(proposal).filter((change) => change.userDecision === "pending");
  if (pending.length) {
    throw new Error("Every proposal must be approved, merged, edited, or rejected before saving.");
  }
  const invalid = allChanges(proposal).filter(
    (change) => change.userDecision !== "rejected" && change.validationStatus === "invalid",
  );
  if (invalid.length) {
    throw new Error("Invalid import proposals must be rejected or edited before saving.");
  }
  const unresolvedConflicts = allChanges(proposal).filter(
    (change) =>
      change.userDecision !== "rejected" &&
      change.validationStatus === "conflict" &&
      change.userDecision !== "merge",
  );
  if (unresolvedConflicts.length) {
    throw new Error("Conflicting proposals must be resolved with an explicit merge decision or rejected.");
  }
}

export function decisionIsAccepted(decision: CareerImportUserDecision) {
  return decision === "approved" || decision === "edited" || decision === "merge";
}

function changeBase<T>(
  target: CareerImportTargetType,
  proposedValue: T,
  sourceExcerpt: string,
  reason: string,
): Omit<CareerImportChange<T>, "targetType"> & { targetType: CareerImportTargetType } {
  return {
    proposalId: createId("proposal"),
    operation: "add",
    targetType: target,
    existingRecordId: "",
    confidence: 0.74,
    reason,
    sourceExcerpt: sourceExcerpt.slice(0, 600),
    validationStatus: "pending",
    validationIssues: [],
    duplicateCandidates: [],
    conflictDetails: [],
    userDecision: "pending",
    proposedValue,
    existingValue: null,
  };
}

function proposalShell(
  sourceType: CareerImportSourceType,
  sourceTitle: string,
  sourceReference: string,
  provider: AIProviderMode | "package" | "deterministic" = "deterministic",
  model = "",
): CareerImportProposalType {
  return {
    importId: createId("career-import"),
    sourceType,
    sourceTitle,
    sourceReference,
    profileChanges: [],
    careerItemChanges: [],
    careerFactChanges: [],
    skillChanges: [],
    relationshipChanges: [],
    warnings: [],
    unresolvedQuestions: [],
    extractionMetadata: {
      provider,
      model,
      promptVersion: PROMPT_VERSIONS.careerIntake,
      classifiedAs: sourceType,
      createdAt: nowIso(),
    },
  };
}

function skill(name: string, category: string): CareerImportChange<CareerImportSkillValue> {
  return {
    ...changeBase("skill", { name, category, proficiencyNote: "", enabled: true }, name, "Skill named in source material."),
    targetType: "skill",
  };
}

function fact(
  statement: string,
  itemTitle: string,
  sourceType: CareerImportCareerFactValue["sourceType"],
  sourceReference: string,
  skillTags: string[] = [],
  roleTags: string[] = [],
): CareerImportChange<CareerImportCareerFactValue> {
  return {
    ...changeBase(
      "career_fact",
      {
        statement,
        careerItemId: "",
        careerItemTitle: itemTitle,
        evidenceStatus: "needs_review",
        sourceType,
        sourceReference,
        skillTags,
        roleTags,
        metricTokens: extractNumericTokens(statement),
        importance: 4,
        enabled: true,
      },
      statement,
      "Specific candidate claim extracted from source material.",
    ),
    targetType: "career_fact",
  };
}

function project(
  title: string,
  shortDescription: string,
  sourceExcerpt: string,
): CareerImportChange<CareerImportCareerItemValue> {
  return {
    ...changeBase(
      "career_item",
      {
        type: "project",
        title,
        organization: "Independent project",
        location: "",
        startDate: "",
        endDate: "",
        isCurrent: false,
        shortDescription,
        url: "",
        repositoryUrl: "",
        enabled: true,
      },
      sourceExcerpt,
      "Project described in source material.",
    ),
    targetType: "career_item",
  };
}

export function createDeterministicCareerImportProposal(
  input: {
    text: string;
    sourceType?: CareerImportSourceType;
    sourceTitle?: string;
    sourceReference?: string;
    provider?: AIProviderMode | "deterministic";
    model?: string;
  },
): CareerImportProposalType {
  const sourceType = input.sourceType ?? classifyCareerImportInput(input.text);
  const proposal = proposalShell(
    sourceType,
    input.sourceTitle || sourceType.replaceAll("_", " "),
    input.sourceReference || safeSourceHash(input.text),
    input.provider ?? "deterministic",
    input.model ?? "",
  );
  if (containsProbableSecret(input.text)) {
    proposal.warnings.push("Source text contains a probable secret. Remove it before importing.");
  }
  if (containsPromptInjectionText(input.text)) {
    proposal.warnings.push("Source text contains prompt-like instructions and must be reviewed carefully.");
  }

  const text = input.text;
  const titleMatch =
    text.match(/Project title:\s*(.+)/i)?.[1] ??
    text.match(/^#\s*(.+)$/m)?.[1] ??
    text.match(/\b(CareerCompiler(?:\s*[-—]\s*[^.\n]+)?)/i)?.[1] ??
    "";
  if (titleMatch) {
    proposal.careerItemChanges.push(
      project(
        titleMatch.trim(),
        text.match(/Short description:\s*([\s\S]*?)(?:\n\n|Project facts:|$)/i)?.[1]?.trim() ||
          "Project imported from career intake source.",
        titleMatch,
      ),
    );
  }
  const bulletFacts = [...text.matchAll(/^\s*(?:[-*]|\d+\.)\s+(.{20,220})$/gm)]
    .map((match) => match[1].trim())
    .filter((line) => !containsPromptInjectionText(line))
    .slice(0, 24);
  for (const statement of bulletFacts) {
    proposal.careerFactChanges.push(
      fact(
        statement.replace(/\s+$/g, "").replace(/[;:]$/, "."),
        titleMatch || "Imported career item",
        sourceType === "project_completion_report" ? "build_output" : sourceType === "resume_text" ? "resume" : "user_statement",
        input.sourceReference || proposal.sourceReference,
      ),
    );
  }
  const skillsBlock = text.match(/Skill tags?:\s*([\s\S]*?)(?:\n\n|Role tags?:|Metric tokens?:|$)/i)?.[1];
  const skillNames = (skillsBlock ?? "")
    .split(/\r?\n|,/)
    .map((value) => value.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 40);
  for (const name of skillNames) proposal.skillChanges.push(skill(name, "Imported"));
  if (!proposal.careerItemChanges.length && !proposal.careerFactChanges.length && !proposal.skillChanges.length) {
    proposal.unresolvedQuestions.push("No clear career item, fact, or skill could be extracted deterministically.");
  }
  return proposal;
}

export function createCareerMemoryExportProposal(
  context: CareerImportContext,
  careerItemIds?: string[],
): CareerImportProposalType {
  const selectedIds = careerItemIds?.length ? new Set(careerItemIds) : null;
  const selectedItems = context.careerItems.filter((item) => !selectedIds || selectedIds.has(item.id));
  const selectedItemIds = new Set(selectedItems.map((item) => item.id));
  const selectedFacts = context.careerFacts.filter((factItem) => selectedItemIds.has(factItem.careerItemId));
  const tagNames = new Set(selectedFacts.flatMap((factItem) => factItem.skillTags.map(normalizeImportKey)));
  const selectedSkills = context.skills.filter(
    (skillItem) => !tagNames.size || tagNames.has(normalizeImportKey(skillItem.name)),
  );
  const proposal = proposalShell(
    "structured_package",
    selectedItems.length === 1 ? selectedItems[0].title : "CareerCompiler career memory package",
    `careercompiler-package:${nowIso()}`,
    "package",
    "",
  );
  if (context.profile) {
    proposal.profileChanges.push({
      ...changeBase(
        "profile",
        {
          fullName: context.profile.fullName,
          headline: context.profile.headline,
          city: context.profile.city,
          region: context.profile.region,
          email: context.profile.email,
          phone: context.profile.phone,
          portfolioUrl: context.profile.portfolioUrl,
          linkedInUrl: context.profile.linkedInUrl,
          githubUrl: context.profile.githubUrl,
          workAuthorizationNote: context.profile.workAuthorizationNote,
        },
        "Exported CareerCompiler profile fields.",
        "Profile selected for portable package export.",
      ),
      targetType: "profile",
    });
  }
  for (const item of selectedItems) {
    proposal.careerItemChanges.push({
      ...changeBase(
        "career_item",
        {
          type: item.type,
          title: item.title,
          organization: item.organization,
          location: item.location,
          startDate: item.startDate,
          endDate: item.endDate,
          isCurrent: item.isCurrent,
          shortDescription: item.shortDescription,
          url: item.url,
          repositoryUrl: item.repositoryUrl,
          enabled: item.enabled,
        },
        item.title,
        "Career item selected for portable package export.",
      ),
      proposalId: `export-item-${item.id}`,
      targetType: "career_item",
    });
  }
  for (const factItem of selectedFacts) {
    const item = selectedItems.find((candidate) => candidate.id === factItem.careerItemId);
    proposal.careerFactChanges.push({
      ...changeBase(
        "career_fact",
        {
          statement: factItem.statement,
          careerItemId: `export-item-${factItem.careerItemId}`,
          careerItemTitle: item?.title ?? "",
          evidenceStatus: factItem.evidenceStatus,
          sourceType: factItem.sourceType,
          sourceReference: factItem.sourceReference,
          skillTags: factItem.skillTags,
          roleTags: factItem.roleTags,
          metricTokens: factItem.metricTokens,
          importance: factItem.importance,
          enabled: factItem.enabled,
        },
        factItem.statement,
        "Career fact selected for portable package export.",
      ),
      proposalId: `export-fact-${factItem.id}`,
      targetType: "career_fact",
    });
  }
  for (const skillItem of selectedSkills) {
    proposal.skillChanges.push({
      ...changeBase(
        "skill",
        {
          name: skillItem.name,
          category: skillItem.category,
          proficiencyNote: skillItem.proficiencyNote,
          enabled: skillItem.enabled,
        },
        skillItem.name,
        "Skill selected for portable package export.",
      ),
      proposalId: `export-skill-${skillItem.id}`,
      targetType: "skill",
    });
  }
  return proposal;
}

export function parseCareerImportPackageText(text: string): CareerImportPackage {
  if (text.length > 10_000_000) throw new Error("Import package exceeds the 10 MB limit.");
  if (containsProbableSecret(text)) throw new Error("Import package contains a probable secret or API key.");
  const parsed = JSON.parse(text) as unknown;
  const envelope = parsed && typeof parsed === "object" && "proposal" in parsed
    ? (parsed as CareerImportPackage)
    : {
        schemaVersion: CAREER_IMPORT_PACKAGE_SCHEMA_VERSION,
        exportedAt: nowIso(),
        proposal: parsed as CareerImportProposalType,
      };
  if (envelope.schemaVersion !== CAREER_IMPORT_PACKAGE_SCHEMA_VERSION) {
    throw new Error(`Unsupported CareerCompiler import package schema ${envelope.schemaVersion}.`);
  }
  return {
    schemaVersion: CAREER_IMPORT_PACKAGE_SCHEMA_VERSION,
    exportedAt: envelope.exportedAt || nowIso(),
    proposal: CareerImportProposal.parse(envelope.proposal) as CareerImportProposalType,
  };
}

export function serializeCareerImportPackage(proposal: CareerImportProposalType) {
  const envelope: CareerImportPackage = {
    schemaVersion: CAREER_IMPORT_PACKAGE_SCHEMA_VERSION,
    exportedAt: nowIso(),
    proposal: clone(proposal),
  };
  const text = JSON.stringify(envelope, null, 2);
  if (containsProbableSecret(text)) throw new Error("Package export was blocked because it contained a secret.");
  return text;
}

export function summarizeImportDecisions(proposal: CareerImportProposalType) {
  const changes = allChanges(proposal);
  return {
    approved: changes.filter((change) => decisionIsAccepted(change.userDecision)).length,
    rejected: changes.filter((change) => change.userDecision === "rejected").length,
    merged: changes.filter((change) => change.userDecision === "merge").length,
    pending: changes.filter((change) => change.userDecision === "pending").length,
    invalid: changes.filter((change) => change.validationStatus === "invalid").length,
    conflicts: changes.filter((change) => change.validationStatus === "conflict").length,
    total: changes.length,
  };
}

export function createImportRecord(
  proposal: CareerImportProposalType,
  snapshot: CareerImportRecord["undoSnapshotJson"],
  recordsCreated: string[],
  recordsUpdated: string[],
): CareerImportRecord {
  const summary = summarizeImportDecisions(proposal);
  return {
    id: proposal.importId,
    sourceType: proposal.sourceType,
    sourceTitle: proposal.sourceTitle,
    sourceReference: proposal.sourceReference,
    createdAt: nowIso(),
    approvedCount: summary.approved,
    rejectedCount: summary.rejected,
    mergedCount: summary.merged,
    recordsCreated,
    recordsUpdated,
    safeSourceHash: safeSourceHash(`${proposal.sourceType}:${proposal.sourceTitle}:${proposal.sourceReference}`),
    provider: proposal.extractionMetadata.provider,
    model: proposal.extractionMetadata.model,
    promptVersion: proposal.extractionMetadata.promptVersion,
    undoSnapshotJson: snapshot,
    undoneAt: "",
  };
}
