import { fallbackJobAnalysis, responsibilityCoverage } from "../resume/coverage";
import { z } from "zod";
import type { AppRepository } from "../database/repository";
import type { CareerFact, CareerItem, Job, ResumeVersion } from "../../types/domain";
import { assessJobFit, type FitCandidate } from "../jobs/fitAssessment";
import { filterFitFeed, hasApplied, type FitFeedRow } from "../jobs/fitFeed";
import { reconcileApplication } from "../jobs/fitAssessment";
import { rankPreferences, readRankingPreferences } from "../jobs/preferenceRefinement";
import { defaultJobSearchPreferences } from "../job-automation/preferences";
import { findDuplicate } from "../job-automation/deduplication";
import type { NormalizedJob } from "../job-automation/types";
import { allResumeBullets, validateResumeClaims } from "../resume/validation";
import { scoreResume } from "../search/resumeRecommendations";
import { canonicalDigest } from "../../../apps/careercompiler-extension/src/authorizationContract.js";

const Id = z.string().min(1).max(160).regex(/^[\w:-]+$/);
export const IntelligenceConsent = z.object({ jobFit: z.boolean(), resumeEvidence: z.boolean(), careerContext: z.boolean(), resumeResponsibilities: z.boolean().optional() }).strict();
export type IntelligenceConsent = z.infer<typeof IntelligenceConsent>;
export const noIntelligence: IntelligenceConsent = { jobFit: false, resumeEvidence: false, careerContext: false };
export const ConversationReferences = z.object({ orderedJobIds: z.array(Id).max(5), focusedJobId: Id.nullable() }).strict();
export type ConversationReferences = z.infer<typeof ConversationReferences>;
export const ComparisonTool = z.enum(["analyze_job_requirements", "compare_resumes"]);
const Text = z.string().max(1200);
const Source = z.object({ type: z.enum(["job", "career_fact", "application", "resume"]), id: Id, label: z.string().max(240) }).strict();
const Reason = z.object({ id: Id, dimension: z.string().max(30), status: z.enum(["ELIGIBLE", "NEEDS_CONFIRMATION", "DISQUALIFIED"]), text: Text, evidenceIds: z.array(Id).max(10) }).strict();
const JobResult = z.object({ id: Id, label: z.string().max(240), rank: z.number().int().min(1).max(5), score: z.number().nullable(), priority: z.number().nullable(), eligibility: z.enum(["ELIGIBLE", "NEEDS_CONFIRMATION", "DISQUALIFIED"]), sponsorship: Text, application: Text, freshness: Text, confidence: Text, recommendation: Text, duplicateOf: Id.nullable(), reasons: z.array(Reason).max(20), preferenceReasons: z.array(Text).max(6), sources: z.array(Source).max(16) }).strict();
const Responsibility = z.object({ requirement: Text, status: z.enum(["related_evidence", "not_established"]), evidenceIds: z.array(Id).max(5) }).strict();
const ResumeResult = z.object({ id: Id, label: z.string().max(240), kind: z.string().max(40), parentId: Id.or(z.literal("")), baseId: Id.or(z.literal("")), score: z.number(), matches: z.array(Text).max(20), gaps: z.array(Text).max(20), supportedBullets: z.number().int(), excludedBullets: z.number().int(), validationErrors: z.number().int(), submitted: z.boolean(), responsibilities: z.array(Responsibility).max(8).optional(), comparisonLimit: Text.optional(), sources: z.array(Source).max(12) }).strict();
export const IntelligenceReport = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("jobs"), assessedOn: z.string(), ordering: Text, jobs: z.array(JobResult).max(5) }).strict(),
  z.object({ kind: z.literal("resumes"), jobId: Id, jobLabel: z.string().max(240), recommendedId: Id.nullable(), conclusion: Text, versions: z.array(ResumeResult).max(5) }).strict(),
]);
export type IntelligenceReport = z.infer<typeof IntelligenceReport>;
export type Selection = { tool: "get_job" | "get_career_fact" | "get_application" | "get_resume"; id: string }[];
// Summary minimization is independent of the transport; no raw résumé text is returned.
const clean = (s: string, max = 1200) => s.replace(/sk-[\w-]{8,}/g, "[credential removed]").replace(/(?:file:\/\/)?\/(?:Users|home|private|tmp)\/[^\s"<>]+/g, "[path removed]").replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email removed]").slice(0, max);
const source = (type: z.infer<typeof Source>["type"], id: string, label: string) => ({ type, id, label: clean(label, 240) });
export class IntelligenceError extends Error {
  code: "scope_denied" | "missing_record" | "context_limit" | "clarification_required";
  constructor(code: IntelligenceError["code"], message: string) { super(message); this.code = code; }
}

export function resolveReferences(question: string, selected: string[], previous?: ConversationReferences, explicit?: string): ConversationReferences {
  const sameSet = previous && selected.length === previous.orderedJobIds.length && selected.every(id => previous.orderedJobIds.includes(id));
  const order = sameSet ? previous.orderedJobIds : selected;
  if (explicit && !selected.includes(explicit)) throw new IntelligenceError("scope_denied", "Select an authorized follow-up job.");
  const ordinals = [...question.toLowerCase().matchAll(/\b(first|second|third|fourth|fifth|[1-5](?:st|nd|rd|th))\b/g)].map(m => ({ first: 0, second: 1, third: 2, fourth: 3, fifth: 4 }[m[1]] ?? Number(m[1][0]) - 1));
  if (new Set(ordinals).size > 1 && !/compare|rank/i.test(question)) throw new IntelligenceError("clarification_required", "Choose one follow-up job; the reference is ambiguous.");
  let focusedJobId = explicit ?? (ordinals.length === 1 ? order[ordinals[0]] : /\b(that one|that job|it|already applied|do next|next steps?)\b/i.test(question) && sameSet ? previous?.focusedJobId : selected.length === 1 ? selected[0] : null);
  if (!explicit && ordinals.length === 1 && !focusedJobId) throw new IntelligenceError("clarification_required", "That position is outside the reviewed job selection.");
  if (!focusedJobId && /résumé|resume|that one|that job|already applied|do next|next steps?/i.test(question) && !/compare.*jobs/i.test(question)) throw new IntelligenceError("clarification_required", "Select the intended job for this follow-up.");
  focusedJobId ??= null;
  return ConversationReferences.parse({ orderedJobIds: order, focusedJobId });
}

export async function loadIntelligenceInputs(repo: AppRepository, selection: Selection, consent: IntelligenceConsent, now = new Date()) {
  if (selection.length > 10 || ["get_job", "get_career_fact", "get_application", "get_resume"].some(tool => selection.filter(g => g.tool === tool).length > 5)) throw new IntelligenceError("context_limit", "Select at most ten records, five per category.");
  const ids = (tool: Selection[number]["tool"]) => selection.filter(g => g.tool === tool).map(g => g.id);
  if (!consent.jobFit || consent.resumeResponsibilities && !consent.resumeEvidence) throw new IntelligenceError("scope_denied", "Authorize deterministic fit summaries first.");
  const [jobs, allFacts, allItems, applications, resumes] = await Promise.all([
    Promise.all(ids("get_job").map(id => repo.getJob(id))), repo.listCareerFacts(), repo.listCareerItems(),
    Promise.all(ids("get_application").map(id => repo.getApplication(id))),
    consent.resumeEvidence ? Promise.all(ids("get_resume").map(id => repo.getResumeVersion(id))) : [],
  ]);
  if (jobs.some(j => !j) || applications.some(a => !a) || resumes.some(r => !r)) throw new IntelligenceError("missing_record", "A selected comparison record is unavailable.");
  const facts = ids("get_career_fact").map(id => allFacts.find(f => f.id === id));
  if (facts.some(f => !f || !f.enabled || f.evidenceStatus !== "verified" || !allItems.some(i => i.id === f.careerItemId && i.enabled))) throw new IntelligenceError("scope_denied", "Comparison requires enabled, selected verified facts and parents.");
  const selectedFacts = facts as CareerFact[];
  const items = allItems.filter(i => selectedFacts.some(f => f.careerItemId === i.id));
  const preferences = consent.careerContext ? await repo.getJobSearchPreferences() : defaultJobSearchPreferences();
  const claims = consent.careerContext ? (await repo.listCandidateClaims()).filter(c => c.category === "job_fit_eligibility" && c.locked && ["verified", "user_confirmed"].includes(c.verificationStatus)) : [];
  const refinement = consent.careerContext ? await readRankingPreferences(repo) : { preferences: [] };
  if (claims.length > 5 || refinement.preferences.length > 30 || items.length > 5) throw new IntelligenceError("context_limit", "Reviewed comparison context exceeds its local bound.");
  const scopedClaims = claims.map(c => allItems.some(i => i.enabled && i.type === "employment" && !items.some(selected => selected.id === i.id)) && c.value && typeof c.value === "object" ? { ...c, value: { ...c.value, workHistoryComplete: false } } : c);
  const candidate: FitCandidate = { facts: selectedFacts, items, skills: [], claims: scopedClaims, preferences };
  // Hash sensitive inputs locally for freshness; never include them in the provider payload.
  const revision = await canonicalDigest({ jobs, facts: selectedFacts, items, applications, resumes, claims: scopedClaims, preferences: { ...preferences, createdAt: "", updatedAt: "" }, refinement: refinement.preferences, day: now.toISOString().slice(0, 10) });
  return { jobs: jobs as Job[], candidate, applications: applications.filter(a => !!a), resumes: resumes as ResumeVersion[], refinement, revision, now, consent };
}
export type IntelligenceInputs = Awaited<ReturnType<typeof loadIntelligenceInputs>>;

export function rankPermittedJobs(input: IntelligenceInputs, jobIds: string[]): IntelligenceReport {
  const selected = input.jobs.filter(j => jobIds.includes(j.id));
  if (selected.length !== jobIds.length) throw new IntelligenceError("scope_denied", "Only selected jobs may be compared.");
  const rows = selected.map(job => {
    const assessment = assessJobFit(job, input.candidate, input.revision, input.now);
    return { job, assessment, application: reconcileApplication(job, input.applications), ranking: rankPreferences(job, assessment.score, input.refinement.preferences, input.revision) };
  });
  const ordered = filterFitFeed(rows, "all");
  const markedApplied = (r: FitFeedRow) => hasApplied(r) || ["applied", "interviewing", "offer"].includes(r.job.status);
  const group = (r: FitFeedRow) => r.assessment.eligibility === "DISQUALIFIED" || ["closed", "archived", "rejected", "filtered_out"].includes(r.job.status) ? 3 : markedApplied(r) ? 2 : r.assessment.eligibility === "ELIGIBLE" && r.application.state !== "POSSIBLE_MATCH" && r.assessment.reasons.some(reason => reason.code === "future_sponsorship") ? 0 : 1;
  ordered.sort((a, b) => group(a) - group(b));
  const seen: Job[] = [];
  const jobs = ordered.map((row, i) => {
    const { job, assessment, application, ranking } = row;
    const duplicate = findDuplicate(job as unknown as NormalizedJob, seen); seen.push(job);
    const matchedFacts = input.candidate.facts.filter(f => assessment.reasons.some(r => r.evidenceIds.includes(f.id)));
    const applicationText = !input.applications.length ? "Application scope not supplied; whether you applied is unknown." : application.state === "NONE" ? "No match within the selected applications; this is not a workspace-wide absence check." : `${application.state === "EXACT" ? "Exact selected application" : "Possible match only; provenance needs review"}: ${application.records.map(a => `${a.status}${a.appliedDate ? `; recorded applied date ${a.appliedDate}` : ""}${a.submittedResumeVersionId ? `; submitted version ${a.submittedResumeVersionId}` : ""}`).join(" | ")}`;
    const sponsorship = assessment.reasons.filter(r => r.code === "future_sponsorship");
    const requirements = assessment.reasons.filter(r => !r.preferred && !r.trainable);
    return { id: job.id, label: clean(`${job.company} · ${job.roleTitle}`, 240), rank: i + 1, score: assessment.score, priority: ranking?.priority ?? assessment.score, eligibility: assessment.eligibility,
      sponsorship: sponsorship.length ? clean(sponsorship.map(r => `${r.status}: ${r.explanation}`).join(" ")) : "Sponsorship unknown: no explicit sponsorship conclusion in the reviewed posting.",
      application: clean(`Job workflow: ${job.status}. ${applicationText}`), freshness: Number.isFinite(Date.parse(job.postedAt)) ? `Recorded posting date ${job.postedAt}; no live availability check.` : "Posting date unknown; freshness cannot be confirmed.",
      confidence: requirements.some(r => r.status === "NEEDS_CONFIRMATION") || !matchedFacts.length || !sponsorship.length || !Number.isFinite(Date.parse(job.postedAt)) ? "Limited: unresolved requirements or insufficient selected evidence; only bounded rules were checked." : "Supported within selected evidence; this is not exhaustive verification.",
      recommendation: duplicate.duplicate ? "Possible duplicate posting; inspect identities before prioritizing twice." : group(row) === 3 ? "Do not prioritize preparation until the recorded conflict or unavailable/skipped state is resolved." : markedApplied(row) ? "Recorded application/job workflow already indicates application activity; inspect the exact record before preparing another application." : group(row) === 1 ? "Verify unresolved requirements and eligibility before investing in tailoring." : "Prioritize preparation, subject to posting freshness and the selected evidence scope.",
      duplicateOf: duplicate.duplicate ? duplicate.canonicalJobId : null,
      reasons: assessment.reasons.slice(0, 20).map(r => ({ id: r.id, dimension: r.dimension, status: r.status, text: clean(`${r.requirement} — ${r.explanation}`), evidenceIds: r.evidenceIds.slice(0, 10) })),
      preferenceReasons: (ranking?.explanations ?? []).slice(0, 6).map(s => clean(s)),
      sources: [source("job", job.id, job.roleTitle), ...matchedFacts.map(f => source("career_fact", f.id, f.statement)), ...application.records.map(a => source("application", a.id, `${a.company} · ${a.role}`))] };
  });
  return IntelligenceReport.parse({ kind: "jobs", assessedOn: input.now.toISOString().slice(0, 10), ordering: "Actionable eligible, needs confirmation, already applied, then conflicts/skipped/unavailable. Within each group: existing preference-adjusted fit, posting/creation date descending, then ID. Duplicates are flagged, never merged. Scores retain existing fit meaning, not probabilities or pure technical-fit percentages.", jobs });
}

function supportedResume(resume: ResumeVersion, facts: CareerFact[], items: CareerItem[]) {
  const issues = validateResumeClaims({ resume: resume.contentJson, facts, items, skills: [...new Set(facts.flatMap(f => f.skillTags))].map((name, i) => ({ id: `selected-skill-${i}`, name, category: "verified fact", proficiencyNote: "", enabled: true })), profile: null });
  const allowed = (bullet: ReturnType<typeof allResumeBullets>[number]["bullet"], itemId: string) => bullet.included && !bullet.rejected && bullet.sourceFactIds.length > 0 && bullet.sourceFactIds.every(id => facts.some(f => f.id === id && f.careerItemId === itemId)) && !issues.some(i => i.severity === "error" && (i.bulletId === bullet.id || !i.bulletId));
  // Derive scoring keywords from verified coverage below; arbitrary stored tags must not affect the tie-break.
  const sections = (values: ResumeVersion["contentJson"]["projects"]) => values.map(s => ({ ...s, bullets: s.bullets.filter(b => allowed(b, s.careerItemId)).map(b => ({ ...b, keywordsAddressed: [] })) })).filter(s => s.bullets.length);
  const content = { ...resume.contentJson, skills: [], experience: sections(resume.contentJson.experience), projects: sections(resume.contentJson.projects) };
  const factIds = new Set(allResumeBullets(content).flatMap(({ bullet }) => bullet.sourceFactIds));
  const supportedFacts = facts.filter(f => factIds.has(f.id));
  // Requirement coverage depends on verified linked facts AND words in included, validated bullets, not titles/tags alone.
  const texts = allResumeBullets(content).map(({ bullet }) => bullet.text).join(" ");
  const skills = [...new Set(supportedFacts.flatMap(f => f.skillTags).filter(tag => texts.toLowerCase().includes(tag.toLowerCase())))];
  return { filtered: { ...resume, contentJson: { ...content, skills }, validationJson: issues }, supportedFacts, issues };
}

export function comparePermittedResumes(input: IntelligenceInputs, jobId: string): IntelligenceReport {
  const job = input.jobs.find(j => j.id === jobId); if (!job) throw new IntelligenceError("scope_denied", "Select the comparison job.");
  const base = assessJobFit(job, input.candidate, input.revision, input.now);
  const requirements = base.reasons.filter(r => r.dimension === "skills" && !r.preferred);
  const versions = input.resumes.map(resume => {
    const supported = supportedResume(resume, input.candidate.facts, input.candidate.items);
    const facts = supported.supportedFacts;
    const assessment = assessJobFit(job, { ...input.candidate, facts, items: input.candidate.items.filter(i => facts.some(f => f.careerItemId === i.id)) }, input.revision, input.now);
    const usedBullets = allResumeBullets(supported.filtered.contentJson);
    const skillEvidence = supported.filtered.contentJson.skills;
    const matches = requirements.filter(r => {
      const evaluated = assessment.reasons.find(other => other.id === r.id);
      return evaluated?.status === "ELIGIBLE" && skillEvidence.some(skill => r.requirement.toLowerCase().includes(skill.toLowerCase()) && evaluated.explanation.toLowerCase().startsWith(skill.toLowerCase()+" is supported"));
    });
    const responsibilityAnalysis = input.consent.resumeResponsibilities ? fallbackJobAnalysis({ ...job, analysisJson: null }) : null;
    const responsibilities = responsibilityAnalysis?.responsibilities.map(requirement => {
      const evidenceIds = facts.filter(fact => usedBullets.some(({ bullet }) => bullet.sourceFactIds.includes(fact.id) && responsibilityCoverage({ ...responsibilityAnalysis, responsibilities: [requirement] }, bullet.text, []).matched.length && responsibilityCoverage({ ...responsibilityAnalysis, responsibilities: [requirement] }, "", [fact]).matched.length)).map(f => f.id);
      return { requirement: clean(requirement), status: evidenceIds.length ? "related_evidence" as const : "not_established" as const, evidenceIds };
    });
    const submitted = input.applications.some(a => a.submittedResumeVersionId === resume.id);
    // Reuse the existing recommendation formula on supported content, with neutralized names/recency and fresh validation.
    const jobSkills = requirements.map(r => r.explanation.split(/ is supported|:/)[0]);
    const scored = scoreResume({ ...job, analysisJson: null }, { ...supported.filtered, name: "", layoutProfileId: "" as ResumeVersion["layoutProfileId"], updatedAt: "" }, jobSkills, submitted, false);
    return { id: resume.id, label: clean(resume.name || "Unnamed version", 240), kind: resume.kind, parentId: resume.parentResumeVersionId, baseId: resume.baseResumeVersionId, score: scored.overallScore,
      matches: matches.map(r => clean(r.requirement)).slice(0, 20), gaps: requirements.filter(r => !matches.includes(r)).map(r => clean(r.requirement)).slice(0, 20), supportedBullets: usedBullets.length,
      excludedBullets: allResumeBullets(resume.contentJson).filter(({ bullet }) => bullet.included).length - usedBullets.length, validationErrors: supported.issues.filter(i => i.severity === "error").length,
      submitted, ...(responsibilities ? { responsibilities, comparisonLimit: "Responsibility overlaps are retrieval signals from validated bullets and linked verified facts, not proof of full responsibility coverage. Education, employment duration and other qualifications require separate review; no résumé body was exported." } : {}), sources: [source("resume", resume.id, resume.name), source("job", job.id, job.roleTitle), ...facts.map(f => source("career_fact", f.id, f.statement))] };
  }).sort((a, b) => b.matches.length - a.matches.length || a.gaps.length - b.gaps.length || (b.responsibilities?.filter(r => r.status === "related_evidence").length ?? 0) - (a.responsibilities?.filter(r => r.status === "related_evidence").length ?? 0) || b.score - a.score || a.id.localeCompare(b.id));
  const best = versions[0]; const justified = Boolean(requirements.length && best?.matches.length && best.supportedBullets && best.validationErrors === 0);
  return IntelligenceReport.parse({ kind: "resumes", jobId, jobLabel: clean(`${job.company} · ${job.roleTitle}`, 240), recommendedId: justified ? best.id : null,
    conclusion: justified ? `Use existing version ${best!.id} as the strongest supported starting point among selected versions. Review uncovered requirements; this does not approve export or verify eligibility.` : "Insufficient permitted, validated bullet evidence to recommend an existing version. Select its verified source facts or review missing requirements.", versions });
}

export function intelligenceText(report: IntelligenceReport) {
  if (report.kind === "jobs") return report.jobs.map(j => `${j.rank}. ${j.label}\nFit score: ${j.score ?? "insufficient evidence"}; eligibility: ${j.eligibility}. ${j.sponsorship}\n${j.application}\n${j.confidence}\n${j.recommendation}`).join("\n\n");
  return `${report.conclusion}\n${report.versions.map(v => `${v.label} [${v.id}]: ${v.matches.length} supported requirements; ${v.gaps.length} missing; ${v.supportedBullets} validated bullets. ${v.submitted ? "Exact version recorded as submitted in selected applications." : ""}`).join("\n")}`;
}
