import { z } from "zod";
import type { JobSource } from "../../../types/domain";
import { htmlToText } from "../normalize";
import { JobSourceError, type FetchContext, type JobSourceAdapter, type RawJobPosting } from "../types";
import { fetchJsonWithPolicy, normalizedJob, sourceValidationResult, validateIdentifier } from "./shared";

const LeverJobSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  categories: z.object({
    location: z.string().optional().default(""),
    commitment: z.string().optional().default(""),
    team: z.string().optional().default(""),
    department: z.string().optional().default(""),
  }).passthrough().optional().default({ location: "", commitment: "", team: "", department: "" }),
  description: z.string().optional().default(""),
  descriptionPlain: z.string().optional().default(""),
  additional: z.string().optional().default(""),
  additionalPlain: z.string().optional().default(""),
  lists: z.array(z.object({ text: z.string().optional().default(""), content: z.string().optional().default("") }).passthrough()).optional().default([]),
  hostedUrl: z.string().url(),
  applyUrl: z.string().url(),
  workplaceType: z.string().optional().default("unspecified"),
  salaryRange: z.object({
    currency: z.string().optional().default(""),
    interval: z.string().optional().default(""),
    min: z.number().nullable().optional(),
    max: z.number().nullable().optional(),
  }).passthrough().optional(),
}).passthrough();

const LeverResponseSchema = z.array(LeverJobSchema);

export class LeverAdapter implements JobSourceAdapter {
  readonly type = "lever" as const;

  async validateSource(source: JobSource) {
    return sourceValidationResult(source.sourceType === this.type ? validateIdentifier(source) : ["Source type must be lever."]);
  }

  async fetchJobs(source: JobSource, context: FetchContext = {}) {
    const validation = await this.validateSource(source);
    if (!validation.valid) throw new JobSourceError("invalid_source", validation.errors.join(" "), source.id);
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(source.sourceIdentifier)}?mode=json`;
    const parsed = LeverResponseSchema.safeParse(await fetchJsonWithPolicy(url, source, context));
    if (!parsed.success) throw new JobSourceError("malformed_response", "Lever returned an invalid postings payload.", source.id);
    return parsed.data.map((payload): RawJobPosting => ({ externalId: payload.id, payload }));
  }

  normalizeJob(raw: RawJobPosting, source: JobSource) {
    const parsed = LeverJobSchema.safeParse(raw.payload);
    if (!parsed.success) throw new JobSourceError("malformed_job", "Lever job is missing a valid ID, title, or URL.", source.id);
    const job = parsed.data;
    const listsHtml = job.lists.map((list) => `<h3>${list.text}</h3><ul>${list.content}</ul>`).join("");
    const html = `${job.description}${listsHtml}${job.additional}`;
    const plain = [job.descriptionPlain, ...job.lists.map((list) => `${list.text}\n${htmlToText(list.content)}`), job.additionalPlain].filter(Boolean).join("\n\n");
    return normalizedJob({
      source,
      externalId: job.id,
      title: job.text,
      descriptionHtml: html,
      descriptionText: plain,
      location: job.categories.location,
      workplaceType: job.workplaceType,
      employmentType: job.categories.commitment,
      department: job.categories.department || job.categories.team,
      salaryMin: job.salaryRange?.min ?? null,
      salaryMax: job.salaryRange?.max ?? null,
      salaryCurrency: job.salaryRange?.currency,
      salaryInterval: job.salaryRange?.interval,
      applicationUrl: job.applyUrl,
      canonicalUrl: job.hostedUrl,
      payload: raw.payload,
    });
  }
}
