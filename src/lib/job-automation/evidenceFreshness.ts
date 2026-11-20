import { scoreJob } from "./scoring";
import { filterJob } from "./filtering";
import { classifySponsorship, classifyCitizenshipRequirement } from "./classification";
import { canonicalDigest } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
import type { AppRepository } from "../database/repository";
import type { CareerFact, CareerItem, Job, JobSearchPreferences, Skill, JobMatch } from "../../types/domain";
import { buildJobMatchEvidencePacket } from "./evidencePacket";
import { readJobMatchAnalysisAudit } from "./analysisState";
import { createId } from "../utils";

export const EVIDENCE_FINGERPRINT_VERSION = "cc-match-evidence-v1";
// Local provenance only; supporting references/notes are never added to AI requests.
export async function matchEvidenceFingerprint(repository: AppRepository, jobId: string) {
  const [job, preferences, careerItems, careerFacts, skills] = await Promise.all([
    repository.getJob(jobId), repository.getJobSearchPreferences(), repository.listCareerItems(), repository.listCareerFacts(), repository.listSkills(),
  ]);
  if (!job) return "";
  return fingerprintEvidenceInput({ job, preferences, careerItems, careerFacts, skills });
}
export async function fingerprintEvidenceInput({ job, preferences, careerItems, careerFacts, skills }: { job: Job; preferences: JobSearchPreferences; careerItems: CareerItem[]; careerFacts: CareerFact[]; skills: Skill[] }) {
  const orderedItems = [...careerItems].sort((a, b) => a.id.localeCompare(b.id));
  const packet = buildJobMatchEvidencePacket({ job, preferences, careerItems: orderedItems, careerFacts, skills });
  const ids = new Set(packet.items.map(item => item.id));
  const parents = orderedItems.filter(item => ids.has(item.id)).map(({ createdAt: _created, updatedAt: _updated, displayOrder: _order, ...item }) => item);
  const facts = careerFacts.filter(fact => ids.has(fact.id)).sort((a,b) => a.id.localeCompare(b.id)).map(({ createdAt: _created, updatedAt: _updated, ...fact }) => fact);
  return canonicalDigest({ version: EVIDENCE_FINGERPRINT_VERSION, packet, parents, facts });
}

// Called inside the repository's transaction, for BOTH reads and mutations. A raw
// SQL/import/legacy write cannot become current merely by bypassing a UI callback.
export async function reconcileEvidenceFreshness(repository: AppRepository, matches: JobMatch[]) {
  const result: JobMatch[] = [];
  for (const match of matches) {
    const audit = readJobMatchAnalysisAudit(match.analysisJson);
    if ((!audit && match.aiScore === null) || (audit && !["valid", "valid_after_repair"].includes(audit.state))) { result.push(match); continue; }
    const fingerprint = await matchEvidenceFingerprint(repository, match.jobId);
    if (audit?.evidenceFingerprintVersion === EVIDENCE_FINGERPRINT_VERSION && audit?.evidenceFingerprint === fingerprint) { result.push(match); continue; }
    const now = new Date().toISOString();
    await repository.saveJobMatchHistory({ id: createId("evidence-stale"), jobId: match.jobId, contentHash: audit?.contentHash ?? "", deterministicScore: match.deterministicScore, aiScore: match.aiScore, combinedScore: match.combinedScore, analysisJson: match.analysisJson, createdAt: now });
    const [job, preferences, careerItems, careerFacts, skills] = await Promise.all([
      repository.getJob(match.jobId), repository.getJobSearchPreferences(), repository.listCareerItems(), repository.listCareerFacts(), repository.listSkills(),
    ]);
    if (!job) throw new Error("analysis_job_missing");
    const deterministic = scoreJob(job, preferences, { careerItems, careerFacts, skills });
    const filter = filterJob(job, preferences);
    const saved = await repository.saveJobMatch({ ...match, ...deterministic, aiScore: null,
      hardReject: !filter.eligible, hardRejectReasons: filter.hardRejectReasons, warnings: filter.warnings,
      sponsorshipStatus: classifySponsorship(job.descriptionText || job.rawDescription),
      citizenshipRequirement: classifyCitizenshipRequirement(job.descriptionText || job.rawDescription),
      recommendedResumeProfile: "", strengths: [], concerns: [],
      analysisJson: { ...audit, schemaVersion: "careercompiler-job-match-audit-v1", state: "stale", errorCode: "analysis_evidence_changed", errorMessage: "Evidence changed or legacy provenance is missing; explicit reviewed reanalysis required." } });
    for (const item of (await repository.listApplicationPackages()).filter(item => item.jobId === match.jobId)) {
      await repository.saveApplicationPackage({ ...item, approvedAt: "", validationStatus: "not_validated", unresolvedQuestions: ["Candidate evidence changed; review resume evidence and reapprove."] });
    }
    if (job.status === "filtered_out" && filter.eligible) {
      await repository.saveJob({ ...job, rawDescription: job.rawDescription, status: deterministic.combinedScore >= preferences.minimumMatchScore ? "matched" : "analysis_pending" });
    }
    result.push(saved);
  }
  return result;
}

export async function reconcileEvidencePackages(repository: AppRepository) {
  for (const item of await repository.listApplicationPackages()) {
    if (!item.approvedAt) continue;
    const revision = (await repository.listSafetyRecords("package_revision")).find(record => record.id === item.id);
    if (revision?.value.evidenceFingerprintVersion === EVIDENCE_FINGERPRINT_VERSION && revision.value.evidenceFingerprint === await matchEvidenceFingerprint(repository, item.jobId)) continue;
    await repository.saveApplicationPackage({ ...item, approvedAt: "", validationStatus: "not_validated", unresolvedQuestions: ["Evidence provenance changed; review and reapprove."] });
  }
}
