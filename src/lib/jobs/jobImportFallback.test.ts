import { afterEach, expect, it, vi } from "vitest";
import { MemoryRepository } from "../database/memoryRepository";
import { createImportDraft, previewJobImport, saveJobImport } from "./jobImport";

afterEach(() => vi.restoreAllMocks());
const description = "Company: Synthetic Employer\nTitle: Backend Engineer\nRequired qualifications:\nBuild PostgreSQL services.\nPreferred qualifications:\nPython preferred.";

it("retains a manually supplied LinkedIn source through preview and confirmed save without fetching it", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No requests permitted"));
  const repo = new MemoryRepository();
  const sourceUrl = "https://www.linkedin.com/jobs/view/123456789/?utm_source=synthetic";
  const draft = createImportDraft({ mode: "text", value: description, sourceUrl });
  const preview = await previewJobImport(repo, draft);
  expect(preview.job?.sourceUrl).toBe("https://www.linkedin.com/jobs/view/123456789");
  expect(preview.identified?.source).toBe("linkedin");
  expect(preview.job?.rawDescription).toBe(description);
  expect(preview.job?.sourcePayloadJson).toMatchObject({ retrieval: "manual_paste", originalText: description });
  expect(await repo.listJobs()).toEqual([]);
  await expect(saveJobImport(repo, draft, preview.reviewFingerprint!, false, false)).rejects.toThrow("Confirm");
  const saved = await saveJobImport(repo, draft, preview.reviewFingerprint!, true, false);
  expect(saved.sourceUrl).toBe(preview.job?.sourceUrl);
  expect(saved.sourcePayloadJson).toMatchObject({ input: { mode: "text", sourceUrl }, reviewStatus: "confirmed" });
  expect(await repo.listApplications()).toEqual([]);
  expect(network).not.toHaveBeenCalled();
});

it.each(["file:///etc/passwd", "http://127.0.0.1/private", "https://host.internal/a", "https://www.linkedin.com/jobs/view/1?token=secret"])("rejects an unsafe manual source URL before saving: %s", async sourceUrl => {
  const repo = new MemoryRepository();
  await expect(previewJobImport(repo, createImportDraft({ mode: "text", value: description, sourceUrl }))).rejects.toThrow("public HTTPS");
  expect(await repo.listJobs()).toEqual([]);
});

it.each([
  "https://www.linkedin.com/jobs/view/123456789/",
  "https://www.linkedin.com/jobs/view/123456789?trk=public_jobs&refId=synthetic",
  "https://lnkd.in/synthetic",
  "https://www.linkedin.com/checkpoint/lg/login",
  "https://jobs.lever.co/synthetic/not-a-fixture",
])("does not claim retrieval, authentication status or expiry for an unfetched URL: %s", async value => {
  const network = vi.spyOn(globalThis, "fetch");
  const repo = new MemoryRepository();
  expect((await previewJobImport(repo, createImportDraft({ mode: "url", value }))).state).toBe("CONTENT_UNAVAILABLE");
  expect(await repo.listJobs()).toEqual([]);
  expect(network).not.toHaveBeenCalled();
});

it("does not invalidate a first import as default preference timestamps advance, but still rejects changed preference values", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
    const repo = new MemoryRepository();
    const draft = createImportDraft({ mode: "text", value: description });
    const before = await previewJobImport(repo, draft);
    vi.setSystemTime(new Date("2026-11-13T12:10:00Z"));
    expect((await previewJobImport(repo, draft)).reviewFingerprint).toBe(before.reviewFingerprint);
    await repo.saveJobSearchPreferences({ preferredLocations: ["Synthetic City"] });
    await expect(saveJobImport(repo, draft, before.reviewFingerprint!, true, false)).rejects.toThrow("changed");
    expect(await repo.listJobs()).toEqual([]);
  } finally { vi.useRealTimers(); }
});
