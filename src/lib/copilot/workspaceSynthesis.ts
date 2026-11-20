import { z } from "zod";
import type { ReadRecord } from "./workspaceReads";
import type { InternalCitation } from "../../types/domain";

const Ref = z.object({ type: z.enum(["job", "career_fact", "application", "resume"]), id: z.string().regex(/^[\w:-]+$/).max(160), label: z.string().max(240) }).strict();
export const SynthesisEvidence = z.object({ id: z.string().regex(/^e\d+$/), category: z.enum(["answer", "uncertainty", "next_step"]), subjectId: z.string().max(160), required: z.boolean(), variants: z.array(z.string().min(1).max(1800)).min(1).max(2), sources: z.array(Ref).max(16) }).strict();
export type SynthesisEvidence = z.infer<typeof SynthesisEvidence>;
export const SynthesisAnswer = z.object({
  status: z.enum(["answered", "insufficient", "refused"]),
  answer: z.array(z.object({ text: z.string().min(1).max(1800), evidenceId: z.string().regex(/^e\d+$/) }).strict()).max(6),
  uncertainties: z.array(z.string().regex(/^e\d+$/)).max(5),
  nextSteps: z.array(z.string().regex(/^e\d+$/)).max(5),
}).strict();
export type SynthesisAnswer = z.infer<typeof SynthesisAnswer>;
export const synthesisJsonSchema = z.toJSONSchema(SynthesisAnswer);

export function synthesisIntent(question: string) {
  if (/résumé|resume/i.test(question)) return "resume";
  if (/already applied|have I applied|application status/i.test(question)) return "application";
  if (/do next|next steps?|next action/i.test(question)) return "next";
  if (/why|less suitable|ranked lower/i.test(question)) return "explain";
  return "compare";
}

// Only reviewed results enter this projection. No repository or provider access.
// Natural sentence variants preserve local semantics; a citation alone cannot validate arbitrary prose.
export function buildSynthesisEvidence(records: ReadRecord[], question: string, focus?: string | null) {
  const units: SynthesisEvidence[] = [];
  const add = (category: SynthesisEvidence["category"], subjectId: string, variants: string[], sources: SynthesisEvidence["sources"], required = false) => {
    if (units.length >= 30) return;
    units.push(SynthesisEvidence.parse({ id: `e${units.length}`, category, subjectId, required, variants, sources }));
  };
  const intent = synthesisIntent(question);
  for (const record of records) {
    const report = record.intelligence;
    if (!report) {
      const type = ({ get_job: "job", get_career_fact: "career_fact", get_application: "application", get_resume: "resume" } as const)[record.tool as "get_job" | "get_career_fact" | "get_application" | "get_resume"];
      if (!type) continue;
      if (type === "job" && !["compare", "explain"].includes(intent) || type === "resume" && !["resume", "next"].includes(intent) || type === "application" && !["application", "next"].includes(intent) || type === "career_fact" && !["compare", "explain"].includes(intent)) continue;
      const field = (name: string) => record.fields.find(f => f.name === name)?.value ?? "";
      if (focus && type === "application" && field("jobId") !== focus) continue;
      const sources = [{ type, id: record.id, label: record.label }];
      if (type === "career_fact") add("answer", record.id, [`Your selected verified evidence for ${field("project") || record.label} states: ${field("statement")}`], sources);
      if (type === "application") {
        add("answer", focus ?? record.id, [`${record.label} has recorded application status ${field("status") || "unknown"}${field("appliedDate") ? `, with applied date ${field("appliedDate")}` : ""}${field("submittedResumeVersionId") ? ` and submitted résumé version ${field("submittedResumeVersionId")}` : ""}.`], sources);
        add("uncertainty", focus ?? record.id, ["This describes the selected application snapshot; it does not establish the absence of other applications."], sources);
        if (field("followUpDate")) add("next_step", focus ?? record.id, [`Review the explicitly recorded follow-up date ${field("followUpDate")} for ${record.label}. No deadline has been inferred and no follow-up has been sent.`], sources);
      }
      if (type === "resume") {
        add("answer", record.id, [`${record.label} is the exact ${field("kind") || "saved"} version ${record.id}. Its parent version is ${field("parentResumeVersionId") || "not recorded"} and base version is ${field("baseResumeVersionId") || "not recorded"}.`], sources);
        add("uncertainty", record.id, ["Résumé metadata alone cannot establish content coverage or justify a recommendation. Enable local evidence comparison and select supporting verified facts if needed."], sources);
      }
      if (type === "job") {
        add("answer", record.id, [`${record.label} has saved job status ${field("status") || "unknown"}.`], sources);
        add("uncertainty", record.id, ["Saved job metadata alone does not establish technical fit, eligibility or a ranking."], sources);
      }
      continue;
    }
    if (report.kind === "jobs") {
      const jobs = focus && intent !== "compare" ? report.jobs.filter(j => j.id === focus) : report.jobs;
      for (const job of jobs) {
        const eligibility = { ELIGIBLE: "eligible under the checked rules", NEEDS_CONFIRMATION: "still in need of eligibility confirmation", DISQUALIFIED: "in conflict with a checked requirement" }[job.eligibility];
        if (intent === "compare" || intent === "explain") {
          add("answer", job.id, [
            `${job.label} is ranked ${job.rank} among the selected jobs. Its existing fit score is ${job.score ?? "not established"}, and it is ${eligibility}.`,
            `In the local ordering, ${job.label} is number ${job.rank}: fit score ${job.score ?? "not established"}, ${eligibility}.`,
          ], job.sources, true);
          const reasons = job.reasons.filter(r => ["skills", "experience"].includes(r.dimension)).slice(0, 2);
          if (reasons.length) add("answer", job.id, [`For ${job.label}, the checked evidence says: ${reasons.map(r => r.text).join(" ")}`], job.sources);
          if (intent === "explain") add("answer", job.id, [`Its position follows the local preparation priority, not just its score. ${job.recommendation} ${job.application}`], job.sources);
        }
        if (intent === "application" || intent === "next") add("answer", job.id, [`For ${job.label}: ${job.application}`, `${job.label} has this recorded application context: ${job.application}`], job.sources, true);
        add("uncertainty", job.id, [`${job.label}: Eligibility ${job.eligibility}. ${job.sponsorship} ${job.confidence} ${job.freshness}`], job.sources);
        add("next_step", job.id, [`For ${job.label}, ${job.recommendation.charAt(0).toLowerCase()}${job.recommendation.slice(1)}`], job.sources);
      }
    } else if ((!focus || report.jobId === focus) && (intent === "resume" || intent === "next")) {
      const best = report.versions.find(v => v.id === report.recommendedId);
      const sources = best?.sources ?? report.versions.flatMap(v => v.sources).filter((v,i,a) => a.findIndex(x => x.type === v.type && x.id === v.id) === i).slice(0, 16);
      if (best) {
        add("answer", report.jobId, [
          `For ${report.jobLabel}, I would start with ${best.label} (${best.id}). It has ${best.supportedBullets} validated included bullets and covers ${best.matches.length} checked technical requirements.`,
          `${best.label} (${best.id}) is the supported starting point for ${report.jobLabel}, with ${best.supportedBullets} validated included bullets and ${best.matches.length} checked technical requirements covered.`,
        ], sources, true);
        add("answer", report.jobId, [`Its supported coverage includes ${best.matches.join("; ") || "no established technical requirement"}. ${best.submitted ? "This exact version is recorded as submitted in the selected applications." : "Submission is not established from the selected applications."}`], sources);
        if (best.responsibilities?.length) add("answer", report.jobId, [`For responsibilities, related evidence was found for ${best.responsibilities.filter(r => r.status === "related_evidence").map(r => r.requirement).slice(0,2).join("; ") || "none of the checked responsibilities"}. These overlaps need manual review; they do not establish complete coverage.`], sources);
        add("uncertainty", report.jobId, [`Uncovered technical requirements: ${best.gaps.join("; ") || "none in the checked rules"}. This comparison is limited to selected verified evidence; it is not export approval or eligibility verification.`], sources);
        add("next_step", report.jobId, [`Open ${best.label} (${best.id}) and review its uncovered requirements and exact submitted-version identity before reusing it. No version has been changed.`], sources);
      } else {
        add("answer", report.jobId, [report.conclusion], sources, true);
        add("next_step", report.jobId, ["Select the existing versions and their verified source facts, then review the missing evidence before choosing a résumé."], sources);
      }
    }
  }
  // An opaque ID or a long source must not silently become truncated evidence.
  if (JSON.stringify({ records, evidence: units }).length > 24000) throw new Error("Reduce selected records; synthesis context exceeds 24,000 characters.");
  return units;
}

export function validateSynthesis(value: unknown, evidence: SynthesisEvidence[]) {
  const answer = SynthesisAnswer.parse(value);
  if (answer.status !== "answered") {
    if (answer.answer.length || answer.uncertainties.length || answer.nextSteps.length) throw new Error("Invalid refused or insufficient synthesis.");
    return answer;
  }
  if (!answer.answer.length) throw new Error("The explanation has no supported statements.");
  const byId = new Map(evidence.map(e => [e.id, e]));
  const seen = new Set<string>();
  const check = (id: string, category: SynthesisEvidence["category"]) => {
    const unit = byId.get(id);
    if (!unit || unit.category !== category || seen.has(id)) throw new Error("Unverifiable synthesis citation or repeated statement.");
    seen.add(id); return unit;
  };
  for (const statement of answer.answer) {
    const unit = check(statement.evidenceId, "answer");
    if (!unit.variants.includes(statement.text)) throw new Error("Unsupported synthesis claim. Review the local evidence and retry.");
  }
  if (evidence.some(e => e.required && !answer.answer.some(s => s.evidenceId === e.id))) throw new Error("The explanation omits a required local conclusion.");
  answer.uncertainties.forEach(id => check(id, "uncertainty")); answer.nextSteps.forEach(id => check(id, "next_step"));
  // The model may choose concision, but cannot hide relevant uncertainty or re-order a comparison.
  const positions = answer.answer.map(s => evidence.findIndex(e => e.id === s.evidenceId));
  if (positions.some((n,i) => i > 0 && n < positions[i-1])) throw new Error("The explanation changes the verified comparison order.");
  const subjects = new Set(answer.answer.map(s => byId.get(s.evidenceId)!.subjectId));
  const mandatory = evidence.filter(e => e.category === "uncertainty" && subjects.has(e.subjectId));
  if (mandatory.some(e => !answer.uncertainties.includes(e.id))) throw new Error("The explanation omits a relevant uncertainty.");
  return answer;
}

export function synthesisContent(answer: SynthesisAnswer, evidence: SynthesisEvidence[]) {
  if (answer.status === "refused") return "The provider declined to compose an explanation. Your conversation and records are unchanged; the reviewed local results remain available.";
  if (answer.status === "insufficient") return "I don’t have sufficient permitted evidence to answer. Select the relevant records or clarify the question.";
  const text = (ids: string[]) => ids.map(id => evidence.find(e => e.id === id)!.variants[0]);
  return [answer.answer.map(s => s.text).join("\n\n"), answer.uncertainties.length ? `What remains uncertain\n${text(answer.uncertainties).join("\n")}` : "", answer.nextSteps.length ? `Suggested next steps — nothing has been changed\n${text(answer.nextSteps).join("\n")}` : ""].filter(Boolean).join("\n\n");
}
export function synthesisCitations(answer: SynthesisAnswer, evidence: SynthesisEvidence[]): InternalCitation[] {
  const used = new Set([...answer.answer.map(s => s.evidenceId), ...answer.uncertainties, ...answer.nextSteps]);
  return [...new Map(evidence.filter(e => used.has(e.id)).flatMap(e => e.sources).map(s => [`${s.type}:${s.id}:`, { id: `${s.type}:${s.id}:`, entityType: s.type, entityId: s.id, label: s.label, detail: "Reviewed synthesis evidence", parentEntityType: "" as const, parentEntityId: "" }])).values()];
}

export const SYNTHESIS_INSTRUCTIONS = `When responseStyle is synthesis, compose an answer using the supplied synthesisEvidence instead of the quote-only answer format. Include all required answer units. Return status, answer sentences with evidenceId, uncertainties IDs and nextSteps IDs. Write each sentence using exactly one of that evidence unit's natural sentence variants. Select and combine relevant sentences in evidence order; do not rewrite factual wording, scores, ranks, eligibility or version identity. Include every uncertainty for each subject you mention. Select only provided read-only next steps, never invent deadlines or mutations. Prefer a concise answer. If no answer is supported return insufficient with empty arrays; a refusal also uses empty arrays. No private reasoning traces. This is controlled evidence-grounded composition, not permission for arbitrary factual prose.`;
