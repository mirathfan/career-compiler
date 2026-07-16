import type { AppRepository } from "../database/repository";
import type { Job, ResumeRecommendation, ResumeVersion } from "../../types/domain";
import { allResumeBullets } from "../resume/validation";
import { createId, nowIso } from "../utils";

function normalizedSet(values: string[]) {
  return new Set(values.map((value) => value.toLowerCase().trim()).filter(Boolean));
}

function overlap(left: string[], right: string[]) {
  const leftSet = normalizedSet(left);
  const rightSet = normalizedSet(right);
  if (!leftSet.size || !rightSet.size) return 0;
  const hits = [...leftSet].filter((value) => rightSet.has(value)).length;
  return hits / Math.max(leftSet.size, rightSet.size);
}

function daysSince(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 365;
  return Math.max(0, (Date.now() - parsed) / 86_400_000);
}

function resumeSkills(resume: ResumeVersion) {
  const bulletKeywords = allResumeBullets(resume.contentJson).flatMap(({ bullet }) => bullet.keywordsAddressed);
  return [...resume.contentJson.skills, ...bulletKeywords];
}

function resumeResponsibilities(resume: ResumeVersion) {
  return allResumeBullets(resume.contentJson).map(({ bullet }) => bullet.text);
}

function resumeFactIds(resume: ResumeVersion) {
  return allResumeBullets(resume.contentJson).flatMap(({ bullet }) => bullet.sourceFactIds);
}

function resumeCareerItemIds(resume: ResumeVersion) {
  return [...resume.contentJson.projects, ...resume.contentJson.experience].map((section) => section.careerItemId);
}

function validationScore(resume: ResumeVersion) {
  const errors = resume.validationJson.filter((issue) => issue.severity === "error").length;
  const warnings = resume.validationJson.filter((issue) => issue.severity === "warning").length;
  return Math.max(0, 1 - errors * 0.35 - warnings * 0.08);
}

export async function generateResumeRecommendations(repository: AppRepository, targetJobId: string) {
  const [job, resumes, applications, existing] = await Promise.all([
    repository.getJob(targetJobId),
    repository.listResumeVersions(),
    repository.listApplications(),
    repository.listResumeRecommendations(targetJobId),
  ]);
  if (!job?.analysisJson) return [];
  const existingByResume = new Map(existing.map((item) => [item.candidateResumeVersionId, item]));
  const submittedIds = new Set(applications.flatMap((application) => [application.resumeVersionId, application.submittedResumeVersionId].filter(Boolean)));
  const jobSkills = [...job.analysisJson.requiredSkills, ...job.analysisJson.preferredSkills];
  const scored = resumes
    .filter((resume) => resume.jobId !== targetJobId)
    .map((resume) => scoreResume(job, resume, jobSkills, submittedIds.has(resume.id), existingByResume.get(resume.id)?.explanationJson.dismissed ?? false))
    .sort((left, right) => right.overallScore - left.overallScore)
    .slice(0, 8);
  for (const recommendation of scored) {
    await repository.saveResumeRecommendation(recommendation);
  }
  return scored;
}

function scoreResume(
  job: Job,
  resume: ResumeVersion,
  jobSkills: string[],
  submitted: boolean,
  dismissed: boolean,
): ResumeRecommendation {
  const analysis = job.analysisJson;
  const roleScore = overlap(analysis?.roleCategories ?? [], [resume.layoutProfileId, resume.name]);
  const skillScore = overlap(jobSkills, resumeSkills(resume));
  const responsibilityScore = overlap(analysis?.responsibilities ?? [], resumeResponsibilities(resume));
  const factIds = resumeFactIds(resume);
  const careerItemIds = resumeCareerItemIds(resume);
  const evidenceScore = Math.min(1, factIds.length / 8);
  const careerItemScore = Math.min(1, careerItemIds.length / 4);
  const recencyScore = Math.max(0, 1 - daysSince(resume.updatedAt) / 365);
  const validScore = validationScore(resume);
  const submittedBoost = submitted ? 0.05 : 0;
  const overallScore =
    roleScore * 0.16 +
    skillScore * 0.24 +
    responsibilityScore * 0.2 +
    evidenceScore * 0.12 +
    careerItemScore * 0.1 +
    recencyScore * 0.08 +
    validScore * 0.1 +
    submittedBoost;
  const matchingSkills = jobSkills.filter((skill) =>
    resumeSkills(resume).some((value) => value.toLowerCase() === skill.toLowerCase()),
  );
  const matchingResponsibilities = (analysis?.responsibilities ?? []).filter((responsibility) =>
    resumeResponsibilities(resume).some((text) => text.toLowerCase().includes(responsibility.toLowerCase().slice(0, 24))),
  );
  const reusableContent = allResumeBullets(resume.contentJson)
    .filter(({ bullet }) => bullet.approved || bullet.sourceFactIds.length > 0)
    .slice(0, 4)
    .map(({ bullet }) => bullet.text);
  const requiredChanges = [
    matchingSkills.length < (analysis?.requiredSkills.length ?? 0) ? "Review missing required skills against Career Memory." : "",
    resume.validationJson.some((issue) => issue.severity === "error") ? "Resolve validation errors before export." : "",
    submitted ? "Check submitted wording before reusing for a different company." : "",
  ].filter(Boolean);
  return {
    id: createId("resume-rec"),
    targetJobId: job.id,
    candidateResumeVersionId: resume.id,
    overallScore,
    roleScore,
    skillScore,
    responsibilityScore,
    evidenceScore,
    careerItemScore,
    recencyScore,
    validationScore: validScore,
    explanationJson: {
      reasons: [
        skillScore > 0 ? "Overlaps with target job skills." : "Limited direct skill overlap.",
        responsibilityScore > 0 ? "Contains related responsibilities." : "Responsibilities need review.",
        validScore >= 1 ? "No blocking validation errors recorded." : "Validation issues reduce confidence.",
      ],
      matchingSkills,
      matchingResponsibilities,
      reusableContent,
      requiredChanges,
      submitted,
      dismissed,
    },
    createdAt: nowIso(),
  };
}
