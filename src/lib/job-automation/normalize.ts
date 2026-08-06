import type { Job, JobWorkplaceType } from "../../types/domain";

const entityMap: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntities(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, token: string) => {
    if (token.startsWith("#x")) return String.fromCodePoint(Number.parseInt(token.slice(2), 16));
    if (token.startsWith("#")) return String.fromCodePoint(Number.parseInt(token.slice(1), 10));
    return entityMap[token.toLowerCase()] ?? entity;
  });
}

export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|section|article|tr)>/gi, "\n")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeTitle(title: string) {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLocation(location: string) {
  return location
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b(remote within|remote in)\b/g, "remote")
    .replace(/[^a-z0-9,]+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|gh_src|lever-source|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function inferWorkplaceType(value: string, description = ""): JobWorkplaceType {
  const text = `${value} ${description.slice(0, 2_000)}`.toLowerCase();
  if (/\bhybrid\b/.test(text)) return "hybrid";
  if (/\b(on[- ]?site|in office|in-office)\b/.test(text)) return "on_site";
  if (/\b(remote|distributed)\b/.test(text)) return "remote";
  return "unspecified";
}

export function stableContentHash(value: string) {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  let first = 0xcbf29ce484222325n;
  let second = 0x84222325cbf29ce4n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < normalized.length; index += 1) {
    const code = BigInt(normalized.charCodeAt(index));
    first = ((first ^ code) * prime) & mask;
    second = ((second ^ (code + BigInt(index & 255))) * prime) & mask;
  }
  return `${first.toString(16).padStart(16, "0")}${second.toString(16).padStart(16, "0")}`;
}

export function detectSeniority(text: string) {
  const value = text.toLowerCase();
  if (/\b(principal|staff|distinguished)\b/.test(value)) return "staff";
  if (/\b(senior|sr\.?|lead)\b/.test(value)) return "senior";
  if (/\b(intern(ship)?|co-op)\b/.test(value)) return "intern";
  if (/\b(junior|jr\.?|entry[- ]level|new grad(uate)?)\b/.test(value)) return "entry";
  return "mid";
}

export function extractExperienceRequirement(text: string) {
  const values: number[] = [];
  const pattern = /\b(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*\+?\s*(?:years?|yrs?)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const minimum = Number(match[1]);
    if (Number.isFinite(minimum) && minimum <= 40) values.push(minimum);
  }
  return values.length ? Math.max(...values) : null;
}

export function legacyJobAutomationFields(input: {
  roleTitle: string;
  rawDescription: string;
  sourceUrl: string;
  timestamp: string;
}): Pick<Job,
  "sourceId" | "externalId" | "normalizedTitle" | "descriptionHtml" | "descriptionText" |
  "location" | "normalizedLocation" | "workplaceType" | "employmentType" | "department" |
  "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryInterval" | "postedAt" |
  "discoveredAt" | "lastSeenAt" | "applicationUrl" | "canonicalUrl" | "contentHash" |
  "sourcePayloadJson" | "status" | "closedAt" | "changedSinceAnalysis"> {
  return {
    sourceId: "", externalId: "", normalizedTitle: normalizeTitle(input.roleTitle), descriptionHtml: "",
    descriptionText: input.rawDescription, location: "", normalizedLocation: "", workplaceType: "unspecified",
    employmentType: "", department: "", salaryMin: null, salaryMax: null, salaryCurrency: "",
    salaryInterval: "", postedAt: "", discoveredAt: input.timestamp, lastSeenAt: input.timestamp,
    applicationUrl: input.sourceUrl, canonicalUrl: canonicalizeUrl(input.sourceUrl),
    contentHash: stableContentHash(input.rawDescription), sourcePayloadJson: {}, status: "new", closedAt: "",
    changedSinceAnalysis: false,
  };
}
