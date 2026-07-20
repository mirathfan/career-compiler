import type {
  AIRequestMetadata,
  ResumeCareerItemSection,
  ResumeDiffEntry,
  ResumeVersion,
  TailoredResume,
} from "../../types/domain";
import { buildResumeGenerationRequest } from "../ai/generationRequest";
import { generateEvidenceGroundedResume } from "../ai/generationPipeline";
import { createAIProvider } from "../ai/providerFactory";
import { PROMPT_VERSION } from "../ai/prompts";
import type { AppRepository } from "../database/repository";
import { semanticResumeDiff } from "../resume/diff";
import { allResumeBullets, validateResumeClaims } from "../resume/validation";
import { unique } from "../utils";
import { createControlledResumeVariantFromBase } from "./baseVariant";
import { scoreCareerFacts, splitEvidence } from "./evidence";

function sameFacts(left: string[], right: string[]) {
  return [...left].sort().join("|") === [...right].sort().join("|");
}

export function mergeLockedResumeContent(previous: TailoredResume, generated: TailoredResume) {
  const next = structuredClone(generated);
  for (const sectionKind of ["projects", "experience"] as const) {
    for (const oldSection of previous[sectionKind]) {
      let newSection = next[sectionKind].find(
        (section) => section.careerItemId === oldSection.careerItemId,
      );
      if (oldSection.locked && !newSection) {
        next[sectionKind].push(structuredClone(oldSection));
        newSection = next[sectionKind].at(-1);
      }
      if (!newSection) continue;
      newSection.locked = oldSection.locked;
      for (const lockedBullet of oldSection.bullets.filter((bullet) => bullet.locked)) {
        const index = newSection.bullets.findIndex((bullet) =>
          sameFacts(bullet.sourceFactIds, lockedBullet.sourceFactIds),
        );
        if (index === -1) newSection.bullets.push(structuredClone(lockedBullet));
        else newSection.bullets[index] = structuredClone(lockedBullet);
      }
    }
  }
  return next;
}

export interface RegenerationResult {
  parent: ResumeVersion;
  child: ResumeVersion;
  diff: ResumeDiffEntry[];
}

export async function regenerateResumeVersion({
  repository,
  resumeVersionId,
  refreshAnalysis,
}: {
  repository: AppRepository;
  resumeVersionId: string;
  refreshAnalysis: boolean;
}): Promise<RegenerationResult> {
  const parent = await repository.getResumeVersion(resumeVersionId);
  if (!parent) throw new Error("The selected resume version no longer exists.");
  const [job, profile, items, facts, skills, settings] = await Promise.all([
    repository.getJob(parent.jobId),
    repository.getProfile(),
    repository.listCareerItems(),
    repository.listCareerFacts(),
    repository.listSkills(),
    repository.getSettings(),
  ]);
  if (!job || !profile) throw new Error("The saved job or candidate profile is missing.");
  const provider = createAIProvider(settings.aiProvider);
  const calls: AIRequestMetadata[] = [];
  let analysis = job.analysisJson;
  if (refreshAnalysis || !analysis) {
    const analyzed = await provider.analyzeJob({
      company: job.company,
      roleTitle: job.roleTitle,
      sourceUrl: job.sourceUrl,
      rawDescription: job.rawDescription,
      modelName: settings.modelName,
    });
    calls.push(analyzed.metadata);
    analysis = analyzed.data;
    await repository.saveJob({ ...job, analysisJson: analysis });
  }
  if (!analysis) throw new Error("The saved job does not have a usable analysis.");

  const lockedSections = [...parent.contentJson.projects, ...parent.contentJson.experience].filter(
    (section) => section.locked,
  );
  const baseFactIds = unique(allResumeBullets(parent.contentJson).flatMap(({ bullet }) => bullet.sourceFactIds));
  const baseCareerItemIds = unique(
    [...parent.contentJson.projects, ...parent.contentJson.experience].map((section) => section.careerItemId),
  );
  const lockedFactIds = new Set([
    ...baseFactIds,
    ...lockedSections.flatMap((section) => section.bullets.flatMap((bullet) => bullet.sourceFactIds)),
    ...[...parent.contentJson.projects, ...parent.contentJson.experience].flatMap((section) =>
      section.bullets.filter((bullet) => bullet.locked).flatMap((bullet) => bullet.sourceFactIds),
    ),
  ]);
  const overrides = Object.fromEntries([...lockedFactIds].map((factId) => [factId, true]));
  const evidence = splitEvidence(scoreCareerFacts(analysis, facts, items), overrides);
  const variants = await repository.listApprovedBulletVariants({
    factIds: unique([...evidence.filter((score) => score.selected).map((score) => score.fact.id), ...baseFactIds]),
    roleCategories: analysis.roleCategories,
  });
  const controls = {
    ...settings.tailoringDefaults,
    lockedCareerItemIds: unique([...baseCareerItemIds, ...lockedSections.map((section) => section.careerItemId)]),
    requiredFactIds: [...lockedFactIds],
  };
  const request = buildResumeGenerationRequest({
    job,
    analysis,
    profile,
    items,
    evidence,
    skills,
    controls,
    approvedVariants: variants,
  });
  const generated = await generateEvidenceGroundedResume({
    provider,
    request,
    modelName: settings.modelName,
  });
  const content = createControlledResumeVariantFromBase({
    base: parent.contentJson,
    proposed: generated.resume,
  }).variant;
  const validationJson = validateResumeClaims({
    resume: content,
    facts,
    items,
    skills,
    profile,
    generationRequest: request,
  });
  const metadata = {
    ...generated.metadata,
    calls: [...calls, ...generated.metadata.calls],
  };
  const child = await repository.saveResumeVersion({
    jobId: parent.jobId,
    name: `${parent.name} - regenerated`,
    templateId: parent.templateId,
    contentJson: content,
    validationJson,
    status: "draft",
    lastExportPath: "",
    kind: "tailored",
    parentResumeVersionId: parent.id,
    baseResumeVersionId: parent.id,
    generationProvider: settings.aiProvider,
    generationModel: settings.modelName,
    promptVersion: PROMPT_VERSION,
    promptVersionsJson: parent.promptVersionsJson,
    layoutProfileId: parent.layoutProfileId,
    templateSettingsJson: parent.templateSettingsJson,
    generationMetadataJson: metadata,
    deterministicBaselineJson: parent.contentJson,
  });
  return { parent, child, diff: semanticResumeDiff(parent.contentJson, content) };
}

export function lockedSections(resume: TailoredResume): ResumeCareerItemSection[] {
  return [...resume.projects, ...resume.experience].filter((section) => section.locked);
}
