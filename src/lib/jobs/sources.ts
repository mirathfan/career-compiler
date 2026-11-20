import type { JobSourceType } from "../../types/domain";

export function parseCareerBoard(input: string): { sourceType: JobSourceType; sourceIdentifier: string; careersUrl: string } {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("Paste the full career board URL, including https://."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Use a public HTTPS career board URL.");
  const hosts: Record<string, JobSourceType> = { "boards.greenhouse.io": "greenhouse", "job-boards.greenhouse.io": "greenhouse", "jobs.lever.co": "lever", "jobs.ashbyhq.com": "ashby" };
  const sourceType = hosts[url.hostname.toLowerCase()];
  const identifier = url.pathname.split("/").filter(Boolean)[0];
  if (!sourceType || !identifier || !/^[a-zA-Z0-9_-]{1,120}$/.test(identifier)) throw new Error("Use a Greenhouse, Lever, or Ashby company board URL. Other postings can be added by pasting their job description.");
  return { sourceType, sourceIdentifier: identifier, careersUrl: `${url.origin}/${identifier}` };
}
