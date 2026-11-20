import type { Job, JobAnalysis, CareerFact } from "../../types/domain";

export const broadSoftwareTerms = [
  "TypeScript",
  "React",
  "JavaScript",
  "Python",
  "API",
  "SQLite",
  "PostgreSQL",
  "Testing",
  "Automation",
  "Frontend",
  "Backend",
  "Full-stack",
  "AI",
];


export function words(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

export function containsTerm(text: string, term: string) {
  if (!term.trim()) return false;
  const normalizedText = ` ${text.toLowerCase()} `;
  const normalizedTerm = term.toLowerCase();
  if (/^[a-z0-9+#.]+$/.test(normalizedTerm)) {
    return new RegExp(`(^|[^a-z0-9+#.])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9+#.])`).test(text.toLowerCase());
  }
  return normalizedText.includes(normalizedTerm);
}


export function fallbackJobAnalysis(job: Job | null | undefined): JobAnalysis | null {
  if (!job) return null;
  if (job.analysisJson) return job.analysisJson;
  const text = job.rawDescription;
  const requiredSkills = broadSoftwareTerms.filter((term) => containsTerm(text, term));
  const lower = text.toLowerCase();
  return {
    inferredCompany: job.company,
    inferredRoleTitle: job.roleTitle,
    seniority: lower.includes("senior") ? "Senior" : lower.includes("new grad") ? "New graduate" : "",
    roleCategories: [
      lower.includes("full-stack") || lower.includes("full stack") ? "full-stack engineer" : "",
      lower.includes("frontend") ? "frontend engineer" : "",
      lower.includes("backend") ? "backend engineer" : "",
      lower.includes("ai") || lower.includes("llm") ? "AI engineer" : "",
    ].filter(Boolean),
    requiredSkills,
    preferredSkills: broadSoftwareTerms.filter((term) => !requiredSkills.includes(term) && containsTerm(text, term)),
    responsibilities: text
      .split(/[.\n]/)
      .map((line) => line.trim())
      .filter((line) => /\b(build|develop|own|implement|ship|test|design|support|collaborate)\b/i.test(line))
      .slice(0, 8),
    domainKeywords: broadSoftwareTerms.filter((term) => containsTerm(text, term)),
    candidateSignals: [],
    locationRequirements: [],
    workAuthorizationLanguage: lower.includes("authorization") ? "Job description mentions work authorization." : "",
    summary: "Derived local keyword analysis from the saved job description.",
  };
}


export function responsibilityCoverage(analysis: JobAnalysis | null, contextText: string, facts: CareerFact[]) {
  if (!analysis?.responsibilities.length) return { matched: [] as string[], total: 0 };
  const factText = facts.map((fact) => fact.statement).join(" ");
  const matched = analysis.responsibilities.filter((responsibility) => {
    const terms = words(responsibility).filter((word) => word.length > 4);
    return terms.some((word) => containsTerm(contextText, word) || containsTerm(factText, word));
  });
  return { matched, total: analysis.responsibilities.length };
}
