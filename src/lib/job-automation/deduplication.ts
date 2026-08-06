import type { Job } from "../../types/domain";
import type { NormalizedJob } from "./types";

export type DuplicateReason =
  | "source_external_id"
  | "canonical_application_url"
  | "company_title_location"
  | "description_content_hash"
  | "near_identical_repost";

export interface DuplicateDecision {
  duplicate: boolean;
  canonicalJobId: string;
  reason: DuplicateReason | null;
  confidence: number;
}

function same(valueA: string, valueB: string) {
  return Boolean(valueA && valueB && valueA.toLowerCase() === valueB.toLowerCase());
}

function tokenSet(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9+#.]{3,}/g) ?? []);
}

export function descriptionSimilarity(first: string, second: string) {
  const left = tokenSet(first);
  const right = tokenSet(second);
  if (left.size < 20 || right.size < 20) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

export function findDuplicate(incoming: NormalizedJob, existingJobs: Job[]): DuplicateDecision {
  const sourceExternal = existingJobs.find((job) =>
    same(job.sourceId, incoming.sourceId) && same(job.externalId, incoming.externalId));
  if (sourceExternal) return { duplicate: true, canonicalJobId: sourceExternal.id, reason: "source_external_id", confidence: 1 };

  const url = existingJobs.find((job) => same(job.canonicalUrl || job.sourceUrl, incoming.canonicalUrl));
  if (url) return { duplicate: true, canonicalJobId: url.id, reason: "canonical_application_url", confidence: 0.99 };

  const identity = existingJobs.find((job) =>
    same(job.company, incoming.company) &&
    same(job.normalizedTitle, incoming.normalizedTitle) &&
    same(job.normalizedLocation || "unspecified", incoming.normalizedLocation || "unspecified"));
  if (identity) return { duplicate: true, canonicalJobId: identity.id, reason: "company_title_location", confidence: 0.96 };

  const hash = existingJobs.find((job) => same(job.contentHash, incoming.contentHash));
  if (hash) return { duplicate: true, canonicalJobId: hash.id, reason: "description_content_hash", confidence: 0.94 };

  const repost = existingJobs
    .filter((job) => same(job.company, incoming.company))
    .map((job) => ({ job, similarity: descriptionSimilarity(job.descriptionText || job.rawDescription, incoming.descriptionText) }))
    .filter(({ similarity }) => similarity >= 0.92)
    .sort((a, b) => b.similarity - a.similarity)[0];
  if (repost) return { duplicate: true, canonicalJobId: repost.job.id, reason: "near_identical_repost", confidence: repost.similarity };

  return { duplicate: false, canonicalJobId: "", reason: null, confidence: 0 };
}

const materialFields: Array<keyof NormalizedJob> = [
  "roleTitle",
  "descriptionText",
  "location",
  "workplaceType",
  "employmentType",
  "department",
  "salaryMin",
  "salaryMax",
  "applicationUrl",
];

export function hasMaterialJobChange(existing: Job, incoming: NormalizedJob) {
  return materialFields.some((field) => existing[field] !== incoming[field]);
}
