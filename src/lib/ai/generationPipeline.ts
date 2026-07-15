import type {
  CareerFact,
  CareerItem,
  GenerationMetadata,
  Profile,
  ResumeGenerationRequest,
  ResumePlan,
  Skill,
  TailoredResume,
  ValidationIssue,
} from "../../types/domain";
import { hasBlockingValidationErrors, validateResumeClaims } from "../resume/validation";
import { createResumePlanFromRequest } from "../tailoring/plan";
import { generateResumeFromAllowedEvidence } from "../tailoring/generateFromRequest";
import type { AIProvider } from "./provider";

export interface GenerationPipelineResult {
  plan: ResumePlan;
  deterministicBaseline: TailoredResume;
  initialAIResume: TailoredResume;
  resume: TailoredResume;
  validationIssues: ValidationIssue[];
  metadata: GenerationMetadata;
}

function isPlanAllowed(plan: ResumePlan, request: ResumeGenerationRequest) {
  const factIds = new Set(request.selectedFacts.map((fact) => fact.factId));
  const itemIds = new Set(request.selectedCareerItems.map((item) => item.careerItemId));
  const skillNames = new Set(request.approvedSkills.map((skill) => skill.name));
  return (
    plan.selectedFactIds.every((id) => factIds.has(id)) &&
    plan.selectedCareerItemIds.every((id) => itemIds.has(id)) &&
    plan.skillSelection.every((name) => skillNames.has(name)) &&
    plan.contentBudget.maxProjects <= request.constraints.maximumSelectedProjects &&
    plan.contentBudget.maxBulletsPerItem <= request.constraints.maximumBulletsPerItem &&
    plan.contentBudget.maxBullets <= request.constraints.contentBudget.maximumTotalBullets
  );
}

function validationData(request: ResumeGenerationRequest) {
  const timestamp = new Date(0).toISOString();
  const facts: CareerFact[] = request.selectedFacts.map((fact) => ({
    id: fact.factId,
    careerItemId: fact.careerItemId,
    statement: fact.statement,
    evidenceStatus: fact.evidenceStatus,
    sourceNote: "",
    skillTags: fact.skillTags,
    roleTags: fact.roleTags,
    metricTokens: fact.metricTokens,
    importance: fact.importance,
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const items: CareerItem[] = request.selectedCareerItems.map((item, index) => ({
    id: item.careerItemId,
    type: item.type,
    title: item.title,
    organization: item.organization,
    location: item.location,
    startDate: item.startDate,
    endDate: item.endDate,
    isCurrent: item.isCurrent,
    shortDescription: "",
    url: item.url,
    repositoryUrl: item.repositoryUrl,
    displayOrder: index,
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const skills: Skill[] = request.approvedSkills.map((skill) => ({
    id: skill.skillId,
    name: skill.name,
    category: skill.category,
    proficiencyNote: "",
    enabled: true,
  }));
  const [city = "", region = ""] = request.candidateProfile.location.split(",").map((part) => part.trim());
  const profile: Profile = {
    id: "generation-profile",
    fullName: request.candidateProfile.name,
    headline: request.candidateProfile.headline,
    city,
    region,
    email: request.candidateProfile.email,
    phone: request.candidateProfile.phone,
    portfolioUrl: request.candidateProfile.portfolioUrl,
    linkedInUrl: request.candidateProfile.linkedInUrl,
    githubUrl: request.candidateProfile.githubUrl,
    workAuthorizationNote: request.candidateProfile.workAuthorizationNote ?? "",
    updatedAt: timestamp,
  };
  return { facts, items, skills, profile };
}

function validate(resume: TailoredResume, request: ResumeGenerationRequest) {
  return validateResumeClaims({
    resume,
    ...validationData(request),
    generationRequest: request,
  });
}

export async function generateEvidenceGroundedResume({
  provider,
  request,
  modelName,
}: {
  provider: AIProvider;
  request: ResumeGenerationRequest;
  modelName: string;
}): Promise<GenerationPipelineResult> {
  const calls: GenerationMetadata["calls"] = [];
  const deterministicPlan = createResumePlanFromRequest(request);
  const planResult = await provider.planResume({ request, modelName });
  calls.push(planResult.metadata);
  const plan = isPlanAllowed(planResult.data, request) ? planResult.data : deterministicPlan;
  const deterministicBaseline = generateResumeFromAllowedEvidence(request, plan, "deterministic");

  const generated = await provider.generateResume({ request, plan, modelName });
  calls.push(generated.metadata);
  const initialAIResume = generated.data;
  let resume = initialAIResume;
  let validationIssues = validate(resume, request);
  let repairAttempted = false;
  let repairSucceeded = false;

  if (hasBlockingValidationErrors(validationIssues)) {
    repairAttempted = true;
    const repaired = await provider.repairResume({
      request,
      plan,
      modelName,
      invalidResume: resume,
      validationIssues,
    });
    calls.push(repaired.metadata);
    resume = repaired.data;
    validationIssues = validate(resume, request);
    repairSucceeded = !hasBlockingValidationErrors(validationIssues);
  }

  return {
    plan,
    deterministicBaseline,
    initialAIResume,
    resume,
    validationIssues,
    metadata: {
      calls,
      repairAttempted,
      repairSucceeded,
      deterministicFallbackUsed: false,
      compactionLog: [],
    },
  };
}

export function deterministicFallback(
  request: ResumeGenerationRequest,
  plan = createResumePlanFromRequest(request),
) {
  return generateResumeFromAllowedEvidence(request, plan, "deterministic");
}
