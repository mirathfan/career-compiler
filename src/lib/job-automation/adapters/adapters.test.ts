import { describe, expect, it } from "vitest";
import type { JobSource } from "../../../types/domain";
import { AshbyAdapter } from "./ashby";
import { GreenhouseAdapter } from "./greenhouse";
import { LeverAdapter } from "./lever";

function source(sourceType: JobSource["sourceType"]): JobSource {
  return { id: `source-${sourceType}`, name: sourceType, companyName: "Example", sourceType, sourceIdentifier: "example", careersUrl: "", enabled: true, pollingIntervalHours: 24, lastCheckedAt: "", lastSuccessAt: "", lastError: "", createdAt: "now", updatedAt: "now" };
}

describe("public ATS adapters", () => {
  it("validates and normalizes Greenhouse jobs", async () => {
    const adapter = new GreenhouseAdapter();
    const postings = await adapter.fetchJobs(source("greenhouse"), { fetchJson: async () => ({ jobs: [{ id: 123, title: "Software Engineer", updated_at: "2026-08-01T00:00:00Z", location: { name: "Chicago, IL" }, absolute_url: "https://boards.greenhouse.io/example/jobs/123?gh_src=test", content: "&lt;p&gt;Build &amp; ship React products.&lt;/p&gt;", departments: [{ name: "Engineering" }] }] }) });
    const job = adapter.normalizeJob(postings[0]!, source("greenhouse"));
    expect(job.externalId).toBe("123");
    expect(job.descriptionText).toBe("Build & ship React products.");
    expect(job.canonicalUrl).not.toContain("gh_src");
    expect(job.department).toBe("Engineering");
  });

  it("validates and normalizes Lever jobs including salary", async () => {
    const adapter = new LeverAdapter();
    const postings = await adapter.fetchJobs(source("lever"), { fetchJson: async () => [{ id: "lever-1", text: "Product Engineer", categories: { location: "Remote", commitment: "Full-time", team: "Product", department: "Engineering" }, description: "<p>Build TypeScript apps.</p>", descriptionPlain: "Build TypeScript apps.", lists: [{ text: "Requirements", content: "<li>React</li>" }], hostedUrl: "https://jobs.lever.co/example/lever-1", applyUrl: "https://jobs.lever.co/example/lever-1/apply", workplaceType: "remote", salaryRange: { currency: "USD", interval: "year", min: 100000, max: 140000 } }] });
    const job = adapter.normalizeJob(postings[0]!, source("lever"));
    expect(job.workplaceType).toBe("remote");
    expect(job.salaryMin).toBe(100000);
    expect(job.descriptionText).toContain("Requirements\nReact");
  });

  it("validates and normalizes listed Ashby jobs", async () => {
    const adapter = new AshbyAdapter();
    const postings = await adapter.fetchJobs(source("ashby"), { fetchJson: async () => ({ apiVersion: "1", jobs: [{ title: "AI Engineer", location: "New York, NY", department: "Engineering", isListed: true, isRemote: false, workplaceType: "Hybrid", descriptionHtml: "<p>Build LLM systems.</p>", descriptionPlain: "Build LLM systems.", publishedAt: "2026-08-02T00:00:00Z", employmentType: "FullTime", jobUrl: "https://jobs.ashbyhq.com/example/job-1", applyUrl: "https://jobs.ashbyhq.com/example/job-1/application", compensation: { summaryComponents: [{ compensationType: "Salary", interval: "1 YEAR", currencyCode: "USD", minValue: 120000, maxValue: 160000 }] } }, { title: "Hidden", isListed: false, jobUrl: "https://jobs.ashbyhq.com/example/hidden", applyUrl: "https://jobs.ashbyhq.com/example/hidden/application" }] }) });
    expect(postings).toHaveLength(1);
    const job = adapter.normalizeJob(postings[0]!, source("ashby"));
    expect(job.externalId).toBe("job-1");
    expect(job.workplaceType).toBe("hybrid");
    expect(job.salaryMax).toBe(160000);
  });

  it("rejects malformed provider payloads and unsafe identifiers", async () => {
    const adapter = new GreenhouseAdapter();
    expect((await adapter.validateSource({ ...source("greenhouse"), sourceIdentifier: "../secret" })).valid).toBe(false);
    await expect(adapter.fetchJobs(source("greenhouse"), { fetchJson: async () => ({ jobs: [{ id: 1 }] }) })).rejects.toMatchObject({ code: "malformed_response" });
  });
});
