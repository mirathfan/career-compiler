import type { CareerFact, CareerItem, Job, JobSearchPreferences, Skill } from "../../types/domain";
import { ROLE_PROFILES } from "../tailoring/roleProfiles";
import { unique } from "../utils";
import type { JobMatchEvidenceItem, JobMatchEvidencePacket } from "./aiTypes";

const MAX_SKILLS = 30;
const MAX_FACTS = 40;
const MAX_ITEMS = 12;
const MAX_TEXT_LENGTH = 1_200;

function terms(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9+#.]{2,}/g) ?? []);
}

function relevance(text: string, targetTerms: Set<string>, tags: string[] = []) {
  const evidenceTerms = terms(`${text} ${tags.join(" ")}`);
  let matches = 0;
  for (const term of evidenceTerms) if (targetTerms.has(term)) matches += 1;
  return matches;
}

function boundedText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}

export function containsSensitiveData(value: string) {
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)
    || /\bsk-[a-z0-9_-]{12,}\b/i.test(value)
    || /(?:\+?\d[\s().-]*){7,}/.test(value);
}

type PacketInput = {
  job: Job;
  preferences: JobSearchPreferences;
  careerItems: CareerItem[];
  careerFacts: CareerFact[];
  skills: Skill[];
};
export function buildJobMatchEvidencePacket(input: PacketInput): JobMatchEvidencePacket {
  return buildPacket(input, { items: MAX_ITEMS, facts: MAX_FACTS, skills: MAX_SKILLS });
}
// Local fit only: reuse privacy/inheritance rules without the remote prompt caps.
export function buildLocalFitEvidencePacket(input: PacketInput): JobMatchEvidencePacket {
  return buildPacket(input, { items: Infinity, facts: Infinity, skills: Infinity });
}
function buildPacket(input: PacketInput, limits: { items: number; facts: number; skills: number }): JobMatchEvidencePacket {
  const targetText = [
    input.job.roleTitle,
    input.job.descriptionText || input.job.rawDescription,
    ...input.preferences.targetRoleTitles,
    ...input.preferences.preferredSkills,
  ].join(" ");
  const targetTerms = terms(targetText);
  const eligibleParents = input.careerItems
    .filter((item) => item.enabled && !containsSensitiveData([item.title, item.organization, item.shortDescription].join(" ")))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, limits.items);
  const eligibleParentIds = new Set(eligibleParents.map((item) => item.id));
  const eligibleFacts = input.careerFacts
    .filter((fact) => eligibleParentIds.has(fact.careerItemId) && fact.enabled && ["verified", "user_provided"].includes(fact.evidenceStatus) && ![fact.statement, ...fact.skillTags, ...fact.roleTags, ...fact.metricTokens].some(containsSensitiveData))
    .map((fact) => ({ fact, score: relevance(fact.statement, targetTerms, [...fact.skillTags, ...fact.roleTags]) + fact.importance / 10 }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.fact.id.localeCompare(b.fact.id))
    .slice(0, limits.facts)
    .map(({ fact }): JobMatchEvidenceItem => ({
      id: fact.id,
      category: "fact",
      text: boundedText(fact.statement),
      tags: unique([...fact.roleTags, ...fact.skillTags]),
      normalizedSkills: unique(fact.skillTags.map((tag) => tag.toLowerCase())),
      numericClaims: unique(fact.metricTokens),
      locked: false,
      permittedForResume: true,
    }));
  const includedFactIds = new Set(eligibleFacts.map((fact) => fact.id));
  const factsByItem = new Map<string, CareerFact[]>();
  for (const fact of input.careerFacts.filter((candidate) => includedFactIds.has(candidate.id))) {
    factsByItem.set(fact.careerItemId, [...(factsByItem.get(fact.careerItemId) ?? []), fact]);
  }
  const careerItems = eligibleParents
    .filter((item) => item.enabled && factsByItem.has(item.id))
    .filter((item) => !containsSensitiveData([item.title, item.organization, item.shortDescription].join(" ")))
    .slice(0, limits.items)
    .map((item): JobMatchEvidenceItem => {
      const facts = factsByItem.get(item.id) ?? [];
      return {
        id: item.id,
        category: item.type === "employment" ? "experience" : item.type,
        text: boundedText([item.title, item.organization, item.shortDescription, item.startDate, item.endDate].filter(Boolean).join(" · ")),
        tags: unique(facts.flatMap((fact) => fact.roleTags)),
        normalizedSkills: unique(facts.flatMap((fact) => fact.skillTags).map((tag) => tag.toLowerCase())),
        numericClaims: unique(facts.flatMap((fact) => fact.metricTokens)),
        locked: false,
        permittedForResume: true,
      };
    });
  const skillItems = input.skills
    .filter((skill) => skill.enabled && !containsSensitiveData(`${skill.name} ${skill.proficiencyNote}`))
    .map((skill) => ({ skill, score: relevance(skill.name, targetTerms) + (input.preferences.preferredSkills.some((preferred) => preferred.toLowerCase() === skill.name.toLowerCase()) ? 2 : 0) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id))
    .slice(0, limits.skills)
    .map(({ skill }): JobMatchEvidenceItem => ({
      id: skill.id,
      category: "skill",
      text: boundedText(skill.name),
      tags: [skill.category],
      normalizedSkills: [skill.name.toLowerCase()],
      numericClaims: [],
      locked: false,
      permittedForResume: true,
    }));
  const profileItems = Object.values(ROLE_PROFILES).map((profile): JobMatchEvidenceItem => ({
    id: profile.id,
    category: "resume_profile",
    text: profile.name,
    tags: unique([...profile.roleTags, ...profile.emphasisTags]),
    normalizedSkills: [],
    numericClaims: [],
    locked: true,
    permittedForResume: true,
  }));
  const items = [...skillItems, ...careerItems, ...eligibleFacts, ...profileItems];
  const idsFor = (category: JobMatchEvidenceItem["category"]) => items.filter((item) => item.category === category).map((item) => item.id);
  return {
    version: "careercompiler-job-match-evidence-v1",
    jobId: input.job.id,
    items,
    suppliedIds: {
      evidenceIds: idsFor("fact"),
      skillIds: idsFor("skill"),
      projectIds: idsFor("project"),
      experienceIds: idsFor("experience"),
      educationIds: idsFor("education"),
      resumeProfileIds: idsFor("resume_profile"),
    },
  };
}
