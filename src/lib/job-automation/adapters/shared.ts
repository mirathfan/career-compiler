import { isIsolatedRuntime } from "../../acceptance/runtime";
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
  let timedOut = false;
  const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      const status = response.status;
      const [code, message] = status === 401 ? ["job_source_auth_required", "This job source requires authentication; authenticated retrieval is not supported."]
        : status === 403 ? ["job_source_access_denied", "This job source denied access. Paste the job description instead."]
        : status === 404 || status === 410 ? ["job_source_not_found", "This job source is unavailable. Check its board identifier; it may have moved or been removed."]
        : status === 429 ? ["job_source_rate_limited", "This job source is rate limiting requests. Try again later."]
        : ["job_source_http_error", `Job source returned HTTP ${status}.`];
      throw new JobSourceError(code, message, "", status >= 500);
    }
    try { return await response.json() as unknown; }
    catch { throw new JobSourceError("job_source_json_invalid", "The job source returned unreadable JSON. Try a supported source or paste the description.", ""); }
  } catch (caught) {
    if (timedOut) throw new JobSourceError("job_source_timeout", "The job source timed out. Try again later or paste the description.", "", true);
    if (signal?.aborted) throw new JobSourceError("job_source_cancelled", "Job source request cancelled.", "");
    if (caught instanceof JobSourceError) throw caught;
    throw new JobSourceError("job_source_network_unavailable", "The job source could not be reached. Check your connection or try again later; this does not establish that all internet access is unavailable.", "", true);
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

function sourceFailure(caught: unknown, sourceId: string): JobSourceError {
  if (caught instanceof JobSourceError) return new JobSourceError(caught.code, caught.message, sourceId, caught.retryable);
  // Only native command codes carry safe, deliberately constructed diagnostics.
  // Never display arbitrary transport strings, which can contain request URLs.
  const raw = typeof caught === "string" ? caught : "";
  const separator = raw.indexOf("|");
  const code = raw.slice(0, separator);
  const known = /^job_source_(timeout|network_unavailable|auth_required|access_denied|not_found|rate_limited|host_blocked|redirect_blocked|json_invalid|content_type|too_large|url_invalid|url_blocked|credentials_blocked|client_failed|http_error|read_failed|fetch_failed)$/;
  if (separator > 0 && known.test(code)) {
    return new JobSourceError(code, raw.slice(separator + 1), sourceId, ["job_source_timeout", "job_source_network_unavailable", "job_source_read_failed", "job_source_fetch_failed", "job_source_http_error"].includes(code));
  }
  return new JobSourceError("source_fetch_failed", "The job source request failed. Check the source configuration and connection, or paste the job description.", sourceId, true);
}

async function defaultFetchJson(url: string, timeoutMs: number, signal?: AbortSignal) {
  if (isIsolatedRuntime()) {
    const { fixtureJobPayload } = await import("../../acceptance/nativeAcceptance");
    return fixtureJobPayload(url);
  }
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
      lastError = sourceFailure(caught, source.id);
      if (context.signal?.aborted || !(lastError as JobSourceError).retryable || attempt === attempts) break;
    }
  }
  if (lastError instanceof JobSourceError) {
    throw new JobSourceError(lastError.code, lastError.message, source.id, lastError.retryable);
  }
  throw sourceFailure(lastError, source.id);
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
