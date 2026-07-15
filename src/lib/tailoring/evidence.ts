import type { CareerFact, CareerItem, EvidenceScore, JobAnalysis } from "../../types/domain";
import { unique } from "../utils";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
}

function matchesAny(source: string, terms: string[]) {
  const haystack = normalize(source);
  return terms.filter((term) => term && haystack.includes(normalize(term)));
}

function evidenceWeight(status: CareerFact["evidenceStatus"]) {
  if (status === "verified") return 2;
  if (status === "user_provided") return 1;
  if (status === "needs_review") return -1;
  return -100;
}

export function scoreCareerFacts(
  analysis: JobAnalysis,
  facts: CareerFact[],
  items: CareerItem[],
): EvidenceScore[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const required = analysis.requiredSkills;
  const preferred = [...analysis.preferredSkills, ...analysis.domainKeywords];
  const roleTerms = [...analysis.roleCategories, ...analysis.candidateSignals, ...analysis.responsibilities];

  return facts.map((fact) => {
    const item = itemById.get(fact.careerItemId);
    if (!item) {
      return {
        fact,
        item: {
          id: "missing",
          type: "project",
          title: "Missing item",
          organization: "",
          location: "",
          startDate: "",
          endDate: "",
          isCurrent: false,
          shortDescription: "",
          url: "",
          repositoryUrl: "",
          displayOrder: 999,
          enabled: false,
          createdAt: "",
          updatedAt: "",
        },
        score: 0,
        selected: false,
        excludedReason: "Career item is missing.",
        reasons: [],
      };
    }

    if (!fact.enabled || !item.enabled) {
      return { fact, item, score: 0, selected: false, excludedReason: "Disabled.", reasons: [] };
    }
    if (fact.evidenceStatus === "prohibited") {
      return {
        fact,
        item,
        score: 0,
        selected: false,
        excludedReason: "Prohibited fact.",
        reasons: [],
      };
    }

    const factText = [fact.statement, ...fact.skillTags, ...fact.roleTags, item.title, item.shortDescription].join(" ");
    const requiredMatches = unique([
      ...matchesAny(factText, required),
      ...fact.skillTags.filter((tag) => matchesAny(tag, required).length),
    ]);
    const preferredMatches = unique([
      ...matchesAny(factText, preferred),
      ...fact.skillTags.filter((tag) => matchesAny(tag, preferred).length),
    ]);
    const roleMatches = unique([
      ...matchesAny(factText, roleTerms),
      ...fact.roleTags.filter((tag) => matchesAny(tag, roleTerms).length),
    ]);

    let score = 0;
    const reasons: string[] = [];
    if (requiredMatches.length) {
      score += requiredMatches.length * 8;
      reasons.push(`Required skill match: ${requiredMatches.slice(0, 3).join(", ")}`);
    }
    if (preferredMatches.length) {
      score += preferredMatches.length * 4;
      reasons.push(`Preferred/domain match: ${preferredMatches.slice(0, 3).join(", ")}`);
    }
    if (roleMatches.length) {
      score += roleMatches.length * 3;
      reasons.push(`Role signal match: ${roleMatches.slice(0, 3).join(", ")}`);
    }
    score += fact.importance * 2;
    if (fact.metricTokens.length > 0) {
      score += 4;
      reasons.push("Contains user-provided metrics.");
    }
    score += evidenceWeight(fact.evidenceStatus);
    score += Math.max(0, 6 - Math.ceil(item.displayOrder / 50));

    if (!reasons.length) {
      reasons.push("General career evidence.");
    }

    return {
      fact,
      item,
      score,
      selected: score >= 10,
      excludedReason: score >= 10 ? "" : "Lower relevance for this job.",
      reasons,
    };
  });
}

export function splitEvidence(scores: EvidenceScore[], overrides: Record<string, boolean>) {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  return sorted.map((score) => {
    if (score.fact.id in overrides) {
      const isBlockingExclusion =
        !score.fact.enabled ||
        !score.item.enabled ||
        score.fact.evidenceStatus === "prohibited" ||
        score.item.id === "missing";
      if (isBlockingExclusion) return score;
      return {
        ...score,
        selected: overrides[score.fact.id],
        excludedReason: overrides[score.fact.id] ? "" : "Manually excluded.",
      };
    }
    return score;
  });
}
