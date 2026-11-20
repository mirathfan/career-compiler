import { afterEach, expect, it, vi } from "vitest";
import type { JobSource } from "../../../types/domain";
import { fetchJsonWithPolicy } from "./shared";

const source = { id: "synthetic-source", name: "Synthetic source" } as JobSource;
it.each([
  ["job_source_timeout", true], ["job_source_network_unavailable", true],
  ["job_source_auth_required", false], ["job_source_access_denied", false],
  ["job_source_not_found", false], ["job_source_rate_limited", false],
  ["job_source_host_blocked", false], ["job_source_redirect_blocked", false],
  ["job_source_json_invalid", false], ["job_source_content_type", false],
])("preserves the safe native failure category %s and retries only transient failures", async (code, retryable) => {
  const fetchJson = vi.fn().mockRejectedValue(`${code}|Synthetic safe diagnostic.`);
  await expect(fetchJsonWithPolicy("https://api.lever.co/v0/postings/synthetic", source, { fetchJson })).rejects.toMatchObject({ code, sourceId: source.id, retryable, message: "Synthetic safe diagnostic." });
  expect(fetchJson).toHaveBeenCalledTimes(retryable ? 2 : 1);
});
it("does not leak unknown transport details into user-facing errors", async () => {
  const fetchJson = vi.fn().mockRejectedValue(new Error("request https://example.invalid/?token=PRIVATE_SYNTHETIC"));
  try { await fetchJsonWithPolicy("https://api.lever.co/v0/postings/synthetic", source, { fetchJson, maxAttempts: 1 }); }
  catch (error) { expect(String(error)).not.toContain("PRIVATE_SYNTHETIC"); return; }
  throw new Error("Expected a classified failure");
});


afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it.each([
  [401, "job_source_auth_required", 1], [403, "job_source_access_denied", 1],
  [404, "job_source_not_found", 1], [410, "job_source_not_found", 1],
  [429, "job_source_rate_limited", 1], [503, "job_source_http_error", 2],
])("classifies browser transport HTTP %s without retrying permanent failures", async (status, code, calls) => {
  const fetch = vi.fn().mockResolvedValue(new Response("untrusted response body", { status }));vi.stubGlobal("fetch", fetch);
  await expect(fetchJsonWithPolicy("https://api.lever.co/v0/postings/synthetic", source)).rejects.toMatchObject({ code, sourceId: source.id });
  expect(fetch).toHaveBeenCalledTimes(calls);
});
it("distinguishes unreadable source JSON from a connection failure", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("<html>Sign in</html>", { status: 200 }));vi.stubGlobal("fetch", fetch);
  await expect(fetchJsonWithPolicy("https://api.lever.co/v0/postings/synthetic", source)).rejects.toMatchObject({ code: "job_source_json_invalid", retryable: false });
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockRejectedValue(new TypeError("Failed to fetch https://private.invalid/secret"));
  await expect(fetchJsonWithPolicy("https://api.lever.co/v0/postings/synthetic", source)).rejects.toMatchObject({ code: "job_source_network_unavailable", retryable: true });
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("distinguishes a timeout from user cancellation and stops the outstanding request", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })));
  vi.stubGlobal("fetch", fetch);
  const timed = expect(fetchJsonWithPolicy("https://api.lever.co/v0/postings/synthetic", source, { timeoutMs: 1000, maxAttempts: 1 })).rejects.toMatchObject({ code: "job_source_timeout" });
  await vi.advanceTimersByTimeAsync(1000);await timed;
  const controller = new AbortController();
  const cancelled = expect(fetchJsonWithPolicy("https://api.lever.co/v0/postings/synthetic", source, { signal: controller.signal })).rejects.toMatchObject({ code: "job_source_cancelled", retryable: false });
  controller.abort();await cancelled;expect(fetch).toHaveBeenCalledTimes(2);
});
