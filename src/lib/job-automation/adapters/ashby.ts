import { z } from "zod";
import type { JobSource } from "../../../types/domain";
import { JobSourceError, type FetchContext, type JobSourceAdapter, type RawJobPosting } from "../types";
import { fetchJsonWithPolicy, normalizedJob, sourceValidationResult, validateIdentifier } from "./shared";

const CompensationComponentSchema = z.object({
  compensationType: z.string().optional().default(""),
  interval: z.string().optional().default(""),
  currencyCode: z.string().nullable().optional(),
  minValue: z.number().nullable().optional(),
  maxValue: z.number().nullable().optional(),
}).passthrough();

const AshbyJobSchema = z.object({
  title: z.string().min(1),
  location: z.string().optional().default(""),
  department: z.string().optional().default(""),
  team: z.string().optional().default(""),
  isListed: z.boolean().optional().default(true),
  isRemote: z.boolean().optional().default(false),
  workplaceType: z.string().optional().default(""),
  descriptionHtml: z.string().optional().default(""),
  descriptionPlain: z.string().optional().default(""),
  publishedAt: z.string().optional().default(""),
  employmentType: z.string().optional().default(""),
  jobUrl: z.string().url(),
  applyUrl: z.string().url(),
  compensation: z.object({ summaryComponents: z.array(CompensationComponentSchema).optional().default([]) }).passthrough().optional(),
}).passthrough();

const AshbyResponseSchema = z.object({ apiVersion: z.string(), jobs: z.array(AshbyJobSchema) }).passthrough();

export class AshbyAdapter implements JobSourceAdapter {
  readonly type = "ashby" as const;

  async validateSource(source: JobSource) {
    return sourceValidationResult(source.sourceType === this.type ? validateIdentifier(source) : ["Source type must be ashby."]);
  }

  async fetchJobs(source: JobSource, context: FetchContext = {}) {
    const validation = await this.validateSource(source);
    if (!validation.valid) throw new JobSourceError("invalid_source", validation.errors.join(" "), source.id);
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(source.sourceIdentifier)}?includeCompensation=true`;
    const parsed = AshbyResponseSchema.safeParse(await fetchJsonWithPolicy(url, source, context));
    if (!parsed.success) throw new JobSourceError("malformed_response", "Ashby returned an invalid jobs payload.", source.id);
    return parsed.data.jobs.filter((job) => job.isListed).map((payload): RawJobPosting => ({ externalId: payload.jobUrl, payload }));
  }

  normalizeJob(raw: RawJobPosting, source: JobSource) {
    const parsed = AshbyJobSchema.safeParse(raw.payload);
    if (!parsed.success) throw new JobSourceError("malformed_job", "Ashby job is missing a valid title or URL.", source.id);
    const job = parsed.data;
    const salary = job.compensation?.summaryComponents.find((component) => component.compensationType.toLowerCase() === "salary");
    return normalizedJob({
      source,
      externalId: job.jobUrl.split("/").filter(Boolean).at(-1) ?? job.jobUrl,
      title: job.title,
      descriptionHtml: job.descriptionHtml,
      descriptionText: job.descriptionPlain,
      location: job.location,
      workplaceType: job.workplaceType || (job.isRemote ? "remote" : ""),
      employmentType: job.employmentType,
      department: job.department || job.team,
      salaryMin: salary?.minValue ?? null,
      salaryMax: salary?.maxValue ?? null,
      salaryCurrency: salary?.currencyCode ?? "",
      salaryInterval: salary?.interval,
      postedAt: job.publishedAt,
      applicationUrl: job.applyUrl,
      canonicalUrl: job.jobUrl,
      payload: raw.payload,
    });
  }
}
