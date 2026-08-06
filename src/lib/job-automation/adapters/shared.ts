import { invoke } from "@tauri-apps/api/core";
import type { Job, JobSource } from "../../../types/domain";
import { nowIso } from "../../utils";
import { canonicalizeUrl, htmlToText, inferWorkplaceType, normalizeLocation, normalizeTitle, stableContentHash } from "../normalize";
import { JobSourceError, type FetchContext, type NormalizedJob } from "../types";

const SOURCE_IDENTIFIER = /^[a-zA-Z0-9_-]{1,100}$/;

export function validateIdentifier(source: JobSource) {
  return SOURCE_IDENTIFIER.test(source.sourceIdentifier.trim())
    ? []
    : ["Source identifier must use 1-100 letters, numbers, underscores, or hyphens."];
}

async function browserFetchJson(url: string, timeoutMs: number, signal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) throw new JobSourceError("http_error", `Job source returned HTTP ${response.status}.`, "", response.status >= 500);
    return await response.json() as unknown;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

async function defaultFetchJson(url: string, timeoutMs: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return invoke<unknown>("fetch_public_job_board", { url, timeoutMs });
  }
  return browserFetchJson(url, timeoutMs, signal);
}

export async function fetchJsonWithPolicy(url: string, source: JobSource, context: FetchContext = {}) {
  const fetchJson = context.fetchJson ?? defaultFetchJson;
  const attempts = Math.min(Math.max(context.maxAttempts ?? 2, 1), 3);
  const timeoutMs = Math.min(Math.max(context.timeoutMs ?? 12_000, 1_000), 30_000);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchJson(url, timeoutMs, context.signal);
    } catch (caught) {
      lastError = caught;
      if (context.signal?.aborted || attempt === attempts) break;
    }
  }
  if (lastError instanceof JobSourceError) {
    throw new JobSourceError(lastError.code, lastError.message, source.id, lastError.retryable);
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new JobSourceError("source_fetch_failed", `Could not fetch ${source.name}: ${message}`, source.id, true);
}

export function normalizedJob(input: {
  source: JobSource;
  externalId: string;
  title: string;
  descriptionHtml?: string;
  descriptionText?: string;
  location?: string;
  workplaceType?: string;
  employmentType?: string;
  department?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  salaryInterval?: string;
  postedAt?: string;
  applicationUrl: string;
  canonicalUrl?: string;
  payload: unknown;
}): NormalizedJob {
  const now = nowIso();
  const html = input.descriptionHtml ?? "";
  const text = (input.descriptionText || htmlToText(html)).trim();
  const canonicalUrl = canonicalizeUrl(input.canonicalUrl || input.applicationUrl);
  const workplace = inferWorkplaceType(`${input.workplaceType ?? ""} ${input.location ?? ""}`, text);
  return {
    company: input.source.companyName,
    roleTitle: input.title.trim(),
    sourceUrl: canonicalUrl,
    rawDescription: text,
    sourceId: input.source.id,
    externalId: input.externalId,
    normalizedTitle: normalizeTitle(input.title),
    descriptionHtml: html,
    descriptionText: text,
    location: input.location?.trim() ?? "",
    normalizedLocation: normalizeLocation(input.location ?? ""),
    workplaceType: workplace,
    employmentType: input.employmentType?.trim() ?? "",
    department: input.department?.trim() ?? "",
    salaryMin: input.salaryMin ?? null,
    salaryMax: input.salaryMax ?? null,
    salaryCurrency: input.salaryCurrency?.trim() ?? "",
    salaryInterval: input.salaryInterval?.trim() ?? "",
    postedAt: input.postedAt ?? "",
    discoveredAt: now,
    lastSeenAt: now,
    applicationUrl: input.applicationUrl,
    canonicalUrl,
    contentHash: stableContentHash(`${input.title}\n${input.location ?? ""}\n${text}`),
    sourcePayloadJson: input.payload,
    status: "new",
    closedAt: "",
    changedSinceAnalysis: false,
  } satisfies Omit<Job, "id" | "analysisJson" | "createdAt" | "updatedAt">;
}

export function sourceValidationResult(errors: string[]) {
  return { valid: errors.length === 0, errors };
}
