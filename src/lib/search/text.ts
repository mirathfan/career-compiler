import type { InternalCitation, SearchDocument, SearchEntityType, SearchFilters, SearchResult } from "../../types/domain";

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phonePattern = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g;
const secretPattern = /\bsk-[A-Za-z0-9_-]{8,}|\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*["']?[A-Za-z0-9_.:/+=-]{8,}/gi;

export function redactSensitiveText(text: string) {
  return text
    .replace(secretPattern, "[redacted-secret]")
    .replace(emailPattern, "[redacted-email]")
    .replace(phonePattern, "[redacted-phone]");
}

export function normalizeSearchText(text: string) {
  return redactSensitiveText(text)
    .toLowerCase()
    .replace(/[`*_>#|[\]{}()]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9+#.%/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contentHash(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function sanitizeFtsQuery(query: string) {
  const phrases = [...query.matchAll(/"([^"]+)"/g)].map((match) => normalizeSearchText(match[1] ?? ""));
  const withoutPhrases = query.replace(/"([^"]+)"/g, " ");
  const terms = normalizeSearchText(withoutPhrases)
    .split(" ")
    .map((term) => term.replace(/[*^~:()"]/g, ""))
    .filter((term) => term.length >= 2)
    .slice(0, 12);
  return [...phrases.filter(Boolean).map((phrase) => `"${phrase}"`), ...terms.map((term) => `${term}*`)].join(" OR ");
}

export function queryTerms(query: string) {
  const phraseTerms = [...query.matchAll(/"([^"]+)"/g)].flatMap((match) => normalizeSearchText(match[1] ?? "").split(" "));
  const normalTerms = normalizeSearchText(query.replace(/"([^"]+)"/g, " ")).split(" ");
  return [...phraseTerms, ...normalTerms].filter((term) => term.length >= 2);
}

function dateMs(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function citationForDocument(document: SearchDocument): InternalCitation {
  return {
    id: `${document.entityType}:${document.entityId}:${document.parentEntityId}`,
    entityType: document.entityType,
    entityId: document.entityId,
    parentEntityType: document.parentEntityType,
    parentEntityId: document.parentEntityId,
    label: document.title,
    detail: String(document.metadataJson.company ?? document.metadataJson.role ?? document.entityType),
  };
}

function matchesFilter(document: SearchDocument, filters: SearchFilters = {}) {
  if (filters.entityTypes?.length && !filters.entityTypes.includes(document.entityType)) return false;
  if (filters.company && String(document.metadataJson.company ?? "").toLowerCase() !== filters.company.toLowerCase()) return false;
  if (filters.applicationStatus && document.metadataJson.applicationStatus !== filters.applicationStatus) return false;
  if (filters.skill) {
    const skills = document.metadataJson.skills;
    const value = filters.skill.toLowerCase();
    if (!Array.isArray(skills) || !skills.some((skill) => String(skill).toLowerCase() === value)) return false;
  }
  if (filters.roleCategory) {
    const roles = document.metadataJson.roleCategories;
    const value = filters.roleCategory.toLowerCase();
    if (!Array.isArray(roles) || !roles.some((role) => String(role).toLowerCase() === value)) return false;
  }
  const updated = dateMs(document.updatedAt);
  if (filters.dateFrom && updated < dateMs(filters.dateFrom)) return false;
  if (filters.dateTo && updated > dateMs(filters.dateTo)) return false;
  return true;
}

function snippet(text: string, terms: string[]) {
  const normalized = normalizeSearchText(text);
  const firstIndex = terms.reduce((best, term) => {
    const index = normalized.indexOf(term.toLowerCase());
    return index === -1 ? best : Math.min(best, index);
  }, Number.POSITIVE_INFINITY);
  if (!Number.isFinite(firstIndex)) return text.slice(0, 220);
  const start = Math.max(0, firstIndex - 60);
  return `${start > 0 ? "..." : ""}${text.slice(start, start + 240)}${text.length > start + 240 ? "..." : ""}`;
}

export function deterministicSearch(documents: SearchDocument[], query: string, filters: SearchFilters = {}) {
  const started = performance.now();
  const normalizedQuery = normalizeSearchText(query);
  const terms = queryTerms(query);
  const exactEntityTypes: SearchEntityType[] = ["application", "resume", "job", "career_fact", "career_item"];
  const results: SearchResult[] = documents
    .filter((document) => matchesFilter(document, filters))
    .map((document) => {
      const title = normalizeSearchText(document.title);
      const body = document.normalizedText;
      const exact = normalizedQuery && (title === normalizedQuery || body.includes(normalizedQuery)) ? 1 : 0;
      const termHits = terms.filter((term) => title.includes(term) || body.includes(term)).length;
      const fts = terms.length ? termHits / terms.length : exact ? 1 : 0;
      const metadata = scoreMetadata(document);
      const recency = Math.min(1, Math.max(0, dateMs(document.updatedAt) / Math.max(Date.now(), 1)));
      const typeBoost = exactEntityTypes.includes(document.entityType) && exact ? 0.25 : 0;
      const final = exact * 4 + fts * 2 + metadata + recency * 0.2 + typeBoost;
      return {
        document,
        snippet: snippet(`${document.title}. ${document.normalizedText}`, terms),
        matchReasons: [
          exact ? "exact structured match" : "",
          fts ? "text match" : "",
          metadata ? "metadata boost" : "",
        ].filter(Boolean),
        scores: { exact, fts, semantic: 0, metadata, recency, final },
        sourceRef: citationForDocument(document),
      };
    })
    .filter((result) => result.scores.final > 0 || !normalizedQuery)
    .sort((left, right) => right.scores.final - left.scores.final || right.document.updatedAt.localeCompare(left.document.updatedAt))
    .slice(0, 25);
  return { results, durationMs: Math.round(performance.now() - started) };
}

function scoreMetadata(document: SearchDocument) {
  let score = 0;
  if (document.metadataJson.approvalState === "approved") score += 0.3;
  if (document.metadataJson.submitted === true) score += 0.25;
  if (document.metadataJson.validationState === "valid") score += 0.2;
  if (document.metadataJson.evidenceStatus === "verified") score += 0.2;
  if (document.metadataJson.evidenceStatus === "prohibited") score -= 2;
  if (document.metadataJson.archived === true) score -= 0.5;
  return score;
}
