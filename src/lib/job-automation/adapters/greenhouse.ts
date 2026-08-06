import { z } from "zod";
import type { JobSource } from "../../../types/domain";
import { fetchJsonWithPolicy, normalizedJob, sourceValidationResult, validateIdentifier } from "./shared";
import { JobSourceError, type FetchContext, type JobSourceAdapter, type RawJobPosting } from "../types";
import { htmlToText } from "../normalize";

const GreenhouseJobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string().min(1),
  updated_at: z.string().optional().default(""),
  location: z.object({ name: z.string().optional().default("") }).optional(),
  absolute_url: z.string().url(),
  content: z.string().optional().default(""),
  departments: z.array(z.object({ name: z.string().optional().default("") }).passthrough()).optional().default([]),
}).passthrough();

const GreenhouseResponseSchema = z.object({ jobs: z.array(GreenhouseJobSchema) }).passthrough();

export class GreenhouseAdapter implements JobSourceAdapter {
  readonly type = "greenhouse" as const;

  async validateSource(source: JobSource) {
    return sourceValidationResult(source.sourceType === this.type ? validateIdentifier(source) : ["Source type must be greenhouse."]);
  }

  async fetchJobs(source: JobSource, context: FetchContext = {}) {
    const validation = await this.validateSource(source);
    if (!validation.valid) throw new JobSourceError("invalid_source", validation.errors.join(" "), source.id);
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.sourceIdentifier)}/jobs?content=true`;
    const parsed = GreenhouseResponseSchema.safeParse(await fetchJsonWithPolicy(url, source, context));
    if (!parsed.success) throw new JobSourceError("malformed_response", "Greenhouse returned an invalid jobs payload.", source.id);
    return parsed.data.jobs.map((payload): RawJobPosting => ({ externalId: String(payload.id), payload }));
  }

  normalizeJob(raw: RawJobPosting, source: JobSource) {
    const parsed = GreenhouseJobSchema.safeParse(raw.payload);
    if (!parsed.success) throw new JobSourceError("malformed_job", "Greenhouse job is missing a valid ID, title, or URL.", source.id);
    const job = parsed.data;
    return normalizedJob({
      source,
      externalId: String(job.id),
      title: job.title,
      descriptionHtml: job.content,
      descriptionText: htmlToText(job.content).startsWith("<") ? htmlToText(htmlToText(job.content)) : htmlToText(job.content),
      location: job.location?.name,
      department: job.departments.map((department) => department.name).filter(Boolean).join(", "),
      postedAt: job.updated_at,
      applicationUrl: job.absolute_url,
      payload: raw.payload,
    });
  }
}
