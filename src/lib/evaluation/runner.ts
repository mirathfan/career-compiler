import type {
  AIProviderMode,
  AppSettings,
  CareerFact,
  CareerItem,
  EvaluationMode,
  EvaluationSummary,
  Job,
  Profile,
  ResumeGenerationRequest,
  Skill,
  TailoredResume,
} from "../../types/domain";
import { createId, nowIso } from "../utils";
import { PROMPT_VERSIONS } from "../ai/prompts";
import { createAIProvider } from "../ai/providerFactory";
import { buildResumeGenerationRequest } from "../ai/generationRequest";
import { deterministicFallback, generateEvidenceGroundedResume } from "../ai/generationPipeline";
import { estimateResumePageCount } from "../resume/compaction";
import { allResumeBullets, validateResumeClaims } from "../resume/validation";
import { scoreCareerFacts, splitEvidence } from "../tailoring/evidence";
import { ROLE_PROFILES, controlsForRoleProfile } from "../tailoring/roleProfiles";
import { createResumePlanFromRequest } from "../tailoring/plan";
import type { ResumeEvaluationFixture } from "./fixtures";

export interface EvaluationRunResult {
  summary: EvaluationSummary;
  resume: TailoredResume;
  request: ResumeGenerationRequest;
}

function representedSkills(resume: TailoredResume, required: string[]) {
  const content = [
    ...resume.skills,
    ...resume.summary,
    ...allResumeBullets(resume).filter(({ bullet }) => bullet.included).map(({ bullet }) => bullet.text),
  ].join(" ").toLowerCase();
  return required.filter((skill) => content.includes(skill.toLowerCase()));
}

function issueCount(issues: ReturnType<typeof validateResumeClaims>, fragments: string[]) {
  return issues.filter((issue) => fragments.some((fragment) => issue.code.includes(fragment))).length;
}

export async function runEvaluationFixture({
  fixture,
  mode,
  profile,
  items,
  facts,
  skills,
  settings,
  providerMode,
}: {
  fixture: ResumeEvaluationFixture;
  mode: EvaluationMode;
  profile: Profile;
  items: CareerItem[];
  facts: CareerFact[];
  skills: Skill[];
  settings: AppSettings;
  providerMode?: AIProviderMode;
}): Promise<EvaluationRunResult> {
  const started = performance.now();
  const roleProfile = ROLE_PROFILES[fixture.roleProfileId];
  const controls = controlsForRoleProfile(fixture.roleProfileId, settings.tailoringDefaults);
  const ranked = splitEvidence(scoreCareerFacts(fixture.analysis, facts, items, roleProfile), {});
  const preferredFirstFact = ranked.find(
    (score) => score.item.id === fixture.expectedPreferredCareerItemIds[0] && score.selected,
  );
  controls.requiredFactIds = preferredFirstFact ? [preferredFirstFact.fact.id] : [];
  controls.lockedCareerItemIds = fixture.expectedPreferredCareerItemIds.slice(0, 1);
  controls.excludedFactIds = fixture.prohibitedFactIds;
  const job: Job = {
    id: `evaluation-job-${fixture.id}`,
    company: fixture.company,
    roleTitle: fixture.roleTitle,
    sourceUrl: "",
    rawDescription: fixture.jobDescription,
    analysisJson: fixture.analysis,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const request = buildResumeGenerationRequest({
    job,
    analysis: fixture.analysis,
    profile,
    items,
    evidence: ranked,
    skills,
    controls,
  });
  const plan = createResumePlanFromRequest(request);
  let resume: TailoredResume;
  let calls: Array<{ durationMs: number; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null }> = [];
  const actualProvider = mode === "ranking" ? "deterministic" : providerMode ?? (mode === "openai" ? "openai" : "mock");
  if (mode === "ranking") {
    resume = deterministicFallback(request, plan);
  } else {
    const generated = await generateEvidenceGroundedResume({
      provider: createAIProvider(actualProvider as AIProviderMode),
      request,
      modelName: settings.modelName,
    });
    resume = generated.resume;
    calls = generated.metadata.calls;
  }
  const validationIssues = validateResumeClaims({ resume, facts, items, skills, profile, generationRequest: request });
  const selectedCareerItemIds = [...resume.projects, ...resume.experience].map((section) => section.careerItemId);
  const selectedFactIds = [...new Set(
    allResumeBullets(resume).filter(({ bullet }) => bullet.included).flatMap(({ bullet }) => bullet.sourceFactIds),
  )];
  const expectedOrAllowed = new Set([
    ...fixture.expectedPreferredCareerItemIds,
    ...fixture.acceptableAlternativeCareerItemIds,
  ]);
  const represented = representedSkills(resume, fixture.requiredSkillsWhenAvailable);
  const rankingByFact = new Map(ranked.map((score) => [score.fact.id, score.score]));
  const totals = calls.reduce(
    (result, call) => ({
      input: result.input === null || call.inputTokens === null ? null : result.input + call.inputTokens,
      output: result.output === null || call.outputTokens === null ? null : result.output + call.outputTokens,
      total: result.total === null || call.totalTokens === null ? null : result.total + call.totalTokens,
    }),
    { input: calls.length ? 0 : null, output: calls.length ? 0 : null, total: calls.length ? 0 : null } as {
      input: number | null;
      output: number | null;
      total: number | null;
    },
  );
  const summary: EvaluationSummary = {
    id: createId("evaluation"),
    fixtureId: fixture.id,
    fixtureName: fixture.name,
    mode,
    provider: actualProvider,
    model: mode === "ranking" ? "deterministic" : settings.modelName,
    promptVersions: PROMPT_VERSIONS,
    roleProfileId: fixture.roleProfileId,
    templateId: settings.defaultTemplateId as EvaluationSummary["templateId"],
    metrics: {
      expectedProjectsSelected: selectedCareerItemIds.filter((id) => fixture.expectedPreferredCareerItemIds.includes(id)),
      unexpectedProjectsSelected: selectedCareerItemIds.filter((id) => !expectedOrAllowed.has(id)),
      requiredSkillsRepresented: represented,
      missingRequiredSkills: fixture.requiredSkillsWhenAvailable.filter((skill) => !represented.includes(skill)),
      highRelevanceFactsUsed: selectedFactIds.filter((id) => (rankingByFact.get(id) ?? 0) >= 20).length,
      unsupportedClaims: issueCount(validationIssues, ["unsupported", "missing_source", "source_item_mismatch"]),
      unsupportedNumbers: issueCount(validationIssues, ["number", "percentage", "metric"]),
      duplicateBullets: issueCount(validationIssues, ["duplicate", "repeated"]),
      bulletLengthViolations: issueCount(validationIssues, ["long_bullet"]),
      onePageSuccess: estimateResumePageCount(resume) === 1,
      validationSuccess: !validationIssues.some((issue) => issue.severity === "error"),
      lockedContentPreserved:
        controls.lockedCareerItemIds.length === 0 ||
        controls.lockedCareerItemIds.every((id) => selectedCareerItemIds.includes(id)),
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      inputTokens: totals.input,
      outputTokens: totals.output,
      totalTokens: totals.total,
    },
    selectedCareerItemIds,
    selectedFactIds,
    validationIssues,
    preferred: false,
    createdAt: nowIso(),
  };
  return { summary, resume, request };
}
