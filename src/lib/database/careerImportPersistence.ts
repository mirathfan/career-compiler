import type {
  CareerFact,
  CareerImportCareerFactValue,
  CareerImportCareerItemValue,
  CareerImportProposal,
  CareerImportRecord,
  CareerImportSkillValue,
  CareerItem,
  Profile,
  Skill,
} from "../../types/domain";
import {
  assertCareerImportReadyToSave,
  createImportRecord,
  decisionIsAccepted,
  normalizeImportKey,
  prepareCareerImportProposal,
  type CareerImportContext,
} from "../import/careerIntake";
import { createId, nowIso, unique } from "../utils";

export interface CareerImportApplyState {
  profile: Profile | null;
  careerItems: CareerItem[];
  careerFacts: CareerFact[];
  skills: Skill[];
}

export interface CareerImportApplyResult extends CareerImportApplyState {
  proposal: CareerImportProposal;
  record: CareerImportRecord;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nonEmpty(next: string | undefined, current: string) {
  return next?.trim() ? next : current;
}

function acceptedExistingId(change: { userDecision: string; existingRecordId: string; duplicateCandidates: string[] }) {
  if (change.existingRecordId) return change.existingRecordId;
  if (change.userDecision === "merge") return change.duplicateCandidates[0] ?? "";
  return "";
}

function nextDisplayOrder(items: CareerItem[]) {
  return Math.max(0, ...items.map((item) => item.displayOrder)) + 10;
}

function mergeCareerItem(existing: CareerItem, proposed: CareerImportCareerItemValue): CareerItem {
  return {
    ...existing,
    type: proposed.type,
    title: nonEmpty(proposed.title, existing.title),
    organization: nonEmpty(proposed.organization, existing.organization),
    location: nonEmpty(proposed.location, existing.location),
    startDate: nonEmpty(proposed.startDate, existing.startDate),
    endDate: nonEmpty(proposed.endDate, existing.endDate),
    isCurrent: proposed.isCurrent ?? existing.isCurrent,
    shortDescription: nonEmpty(proposed.shortDescription, existing.shortDescription),
    url: nonEmpty(proposed.url, existing.url),
    repositoryUrl: nonEmpty(proposed.repositoryUrl, existing.repositoryUrl),
    enabled: proposed.enabled ?? existing.enabled,
    updatedAt: nowIso(),
  };
}

function newCareerItem(proposed: CareerImportCareerItemValue, items: CareerItem[]): CareerItem {
  const now = nowIso();
  return {
    id: createId("career-item"),
    type: proposed.type,
    title: proposed.title,
    organization: proposed.organization ?? "",
    location: proposed.location ?? "",
    startDate: proposed.startDate ?? "",
    endDate: proposed.endDate ?? "",
    isCurrent: proposed.isCurrent ?? false,
    shortDescription: proposed.shortDescription ?? "",
    url: proposed.url ?? "",
    repositoryUrl: proposed.repositoryUrl ?? "",
    displayOrder: nextDisplayOrder(items),
    enabled: proposed.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  };
}

function mergeSkill(existing: Skill, proposed: CareerImportSkillValue): Skill {
  return {
    ...existing,
    name: nonEmpty(proposed.name, existing.name),
    category: nonEmpty(proposed.category, existing.category),
    proficiencyNote: nonEmpty(proposed.proficiencyNote, existing.proficiencyNote),
    enabled: proposed.enabled ?? existing.enabled,
  };
}

function newSkill(proposed: CareerImportSkillValue): Skill {
  return {
    id: createId("skill"),
    name: proposed.name,
    category: proposed.category,
    proficiencyNote: proposed.proficiencyNote ?? "",
    enabled: proposed.enabled ?? true,
  };
}

function mergeFact(existing: CareerFact, proposed: CareerImportCareerFactValue, careerItemId: string): CareerFact {
  return {
    ...existing,
    careerItemId,
    statement: nonEmpty(proposed.statement, existing.statement),
    evidenceStatus: proposed.evidenceStatus,
    sourceNote: nonEmpty(proposed.sourceReference, existing.sourceNote),
    sourceType: proposed.sourceType,
    sourceReference: nonEmpty(proposed.sourceReference, existing.sourceReference),
    skillTags: proposed.skillTags.length ? proposed.skillTags : existing.skillTags,
    roleTags: proposed.roleTags.length ? proposed.roleTags : existing.roleTags,
    metricTokens: proposed.metricTokens,
    importance: proposed.importance,
    enabled: proposed.enabled,
    updatedAt: nowIso(),
  };
}

function newFact(proposed: CareerImportCareerFactValue, careerItemId: string): CareerFact {
  const now = nowIso();
  return {
    id: createId("career-fact"),
    careerItemId,
    statement: proposed.statement,
    evidenceStatus: proposed.evidenceStatus,
    sourceNote: proposed.sourceReference ? `Imported from ${proposed.sourceReference}.` : "Imported through Smart Career Intake.",
    sourceType: proposed.sourceType,
    sourceReference: proposed.sourceReference,
    verificationDate: "",
    lastReviewedDate: "",
    notes: "Imported through Smart Career Intake; approved by user before save.",
    skillTags: proposed.skillTags,
    roleTags: proposed.roleTags,
    metricTokens: proposed.metricTokens,
    importance: proposed.importance,
    enabled: proposed.enabled,
    createdAt: now,
    updatedAt: now,
  };
}

function resolveCareerItemId(
  proposed: CareerImportCareerFactValue,
  items: CareerItem[],
  itemIdByProposalId: Map<string, string>,
) {
  if (proposed.careerItemId && items.some((item) => item.id === proposed.careerItemId)) {
    return proposed.careerItemId;
  }
  if (proposed.careerItemId && itemIdByProposalId.has(proposed.careerItemId)) {
    return itemIdByProposalId.get(proposed.careerItemId) ?? "";
  }
  const titleKey = normalizeImportKey(proposed.careerItemTitle ?? "");
  return items.find((item) => normalizeImportKey(item.title) === titleKey)?.id ?? "";
}

export function applyCareerImportToState(
  state: CareerImportApplyState,
  rawProposal: CareerImportProposal,
): CareerImportApplyResult {
  const snapshot = clone(state);
  const context: CareerImportContext = clone(state);
  const proposal = prepareCareerImportProposal(rawProposal, context);
  assertCareerImportReadyToSave(proposal);

  let profile = clone(state.profile);
  let careerItems = clone(state.careerItems);
  let careerFacts = clone(state.careerFacts);
  let skills = clone(state.skills);
  const recordsCreated: string[] = [];
  const recordsUpdated: string[] = [];
  const itemIdByProposalId = new Map<string, string>();

  for (const change of proposal.profileChanges.filter((item) => decisionIsAccepted(item.userDecision))) {
    const now = nowIso();
    const current: Profile = profile ?? {
      id: "profile-imported",
      fullName: "",
      headline: "",
      city: "",
      region: "",
      email: "",
      phone: "",
      portfolioUrl: "",
      linkedInUrl: "",
      githubUrl: "",
      workAuthorizationNote: "",
      updatedAt: now,
    };
    profile = {
      ...current,
      fullName: nonEmpty(change.proposedValue.fullName, current.fullName),
      headline: nonEmpty(change.proposedValue.headline, current.headline),
      city: nonEmpty(change.proposedValue.city, current.city),
      region: nonEmpty(change.proposedValue.region, current.region),
      email: nonEmpty(change.proposedValue.email, current.email),
      phone: nonEmpty(change.proposedValue.phone, current.phone),
      portfolioUrl: nonEmpty(change.proposedValue.portfolioUrl, current.portfolioUrl),
      linkedInUrl: nonEmpty(change.proposedValue.linkedInUrl, current.linkedInUrl),
      githubUrl: nonEmpty(change.proposedValue.githubUrl, current.githubUrl),
      workAuthorizationNote: nonEmpty(change.proposedValue.workAuthorizationNote, current.workAuthorizationNote),
      updatedAt: now,
    };
    recordsUpdated.push(`profile:${profile.id}`);
  }

  for (const change of proposal.careerItemChanges.filter((item) => decisionIsAccepted(item.userDecision))) {
    const existingId = acceptedExistingId(change);
    const existing = careerItems.find((item) => item.id === existingId);
    if (existing) {
      const updated = mergeCareerItem(existing, change.proposedValue);
      careerItems = careerItems.map((item) => (item.id === existing.id ? updated : item));
      itemIdByProposalId.set(change.proposalId, updated.id);
      recordsUpdated.push(`career_items:${updated.id}`);
    } else {
      const created = newCareerItem(change.proposedValue, careerItems);
      careerItems = [...careerItems, created];
      itemIdByProposalId.set(change.proposalId, created.id);
      recordsCreated.push(`career_items:${created.id}`);
    }
  }

  for (const change of proposal.skillChanges.filter((item) => decisionIsAccepted(item.userDecision))) {
    const existingId = acceptedExistingId(change);
    const existing =
      skills.find((skill) => skill.id === existingId) ??
      skills.find((skill) => normalizeImportKey(skill.name) === normalizeImportKey(change.proposedValue.name));
    if (existing) {
      const updated = mergeSkill(existing, change.proposedValue);
      skills = skills.map((skill) => (skill.id === existing.id ? updated : skill));
      recordsUpdated.push(`skills:${updated.id}`);
    } else {
      const created = newSkill(change.proposedValue);
      skills = [...skills, created];
      recordsCreated.push(`skills:${created.id}`);
    }
  }

  for (const change of proposal.careerFactChanges.filter((item) => decisionIsAccepted(item.userDecision))) {
    const careerItemId = resolveCareerItemId(change.proposedValue, careerItems, itemIdByProposalId);
    if (!careerItemId) {
      throw new Error("career_import_unresolved_item|A fact references a career item that was not saved.");
    }
    const existingId = acceptedExistingId(change);
    const existing = careerFacts.find((fact) => fact.id === existingId);
    if (existing) {
      const updated = mergeFact(existing, change.proposedValue, careerItemId);
      careerFacts = careerFacts.map((factItem) => (factItem.id === existing.id ? updated : factItem));
      recordsUpdated.push(`career_facts:${updated.id}`);
    } else {
      const created = newFact(change.proposedValue, careerItemId);
      careerFacts = [...careerFacts, created];
      recordsCreated.push(`career_facts:${created.id}`);
    }
  }

  const record = createImportRecord(proposal, snapshot, unique(recordsCreated), unique(recordsUpdated));
  return { profile, careerItems, careerFacts, skills, proposal, record };
}
