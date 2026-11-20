import { RESUME_BULLET_ACTION } from "../copilot/resumeBulletContract";
import { PROFILE_SKILL_ACTION, requestedProfileSkillName } from "../copilot/profileSkillContract";
import { grantPlan } from "../copilot/workspaceReads";
import type { WorkspaceRequest, WorkspaceResponse } from "../copilot/workspaceContract";
import type { JobAnswer, JobConversationRequest } from "../copilot/modelContract";
import type {
  AIProviderResult,
  AIRequestMetadata,
  AIRequestType,
  CareerImportProposal,
  JobAnalysis,
  ResumePlan,
  TailoredResume,
} from "../../types/domain";
import type { ResumeReviewAdvisory } from "../../schemas/resumeReview";
import type { JobMatchAnalysis } from "../../schemas/jobMatchAnalysis";
import { createDeterministicCareerImportProposal } from "../import/careerIntake";
import { createResumePlanFromRequest } from "../tailoring/plan";
import { generateResumeFromAllowedEvidence } from "../tailoring/generateFromRequest";
import { classifySponsorship } from "../job-automation/classification";
import type {
  AIProvider,
  AnalyzeJobInput,
  AnalyzeJobMatchInput,
  ExtractCareerInformationInput,
  GenerateResumeInput,
  PlanResumeInput,
  RepairResumeInput,
  RepairJobMatchInput,
  ReviewResumeInput,
  ShortenBulletInput,
} from "./provider";

export type MockGenerationFixture =
  | "valid"
  | "unsupported_number"
  | "missing_source_fact"
  | "invented_skill"
  | "repairable_invalid"
  | "non_repairable_invalid";

export type MockJobMatchFixture =
  | "valid"
  | "invalid_evidence_then_repair"
  | "unsupported_number_then_repair"
  | "permanent_invalid"
  | "hard_reject"
  | "unclear_sponsorship";

function includes(text: string, value: string) {
  const normalizedValue = value.toLowerCase();
  if (/^[a-z0-9]+$/.test(normalizedValue) && normalizedValue.length <= 3) {
    const escaped = normalizedValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(text);
  }
  return text.toLowerCase().includes(normalizedValue);
}

function metadata(requestType: AIRequestType, model: string, durationMs = 0): AIRequestMetadata {
  return {
    provider: "mock",
    model,
    requestType,
    success: true,
    durationMs,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    errorCode: "",
  };
}

function result<T>(data: T, requestType: AIRequestType, model: string): AIProviderResult<T> {
  return { data, metadata: metadata(requestType, model) };
}

function firstBullet(resume: TailoredResume) {
  return [...resume.projects, ...resume.experience].flatMap((section) => section.bullets)[0];
}

function applyFixture(resume: TailoredResume, fixture: MockGenerationFixture) {
  const next = structuredClone(resume);
  const bullet = firstBullet(next);
  if ((fixture === "unsupported_number" || fixture === "repairable_invalid" || fixture === "non_repairable_invalid") && bullet) {
    bullet.text = `${bullet.text.replace(/\.$/, "")} and improved throughput by 99%.`;
  }
  if (fixture === "missing_source_fact" && bullet) {
    bullet.sourceFactIds = ["missing-source-fact"];
  }
  if (fixture === "invented_skill") {
    next.skills.push("Kubernetes");
  }
  return next;
}

export class MockAIProvider implements AIProvider {
  readonly mode = "mock" as const;
  private readonly fixture: MockGenerationFixture;
  private readonly jobMatchFixture: MockJobMatchFixture;

  constructor(fixture: MockGenerationFixture = "valid", jobMatchFixture: MockJobMatchFixture = "valid") {
    this.fixture = fixture;
    this.jobMatchFixture = jobMatchFixture;
  }

  private jobMatchResult(input: AnalyzeJobMatchInput, repaired: boolean): JobMatchAnalysis {
    const ids = input.request.evidencePacket.suppliedIds;
    const permanentInvalid = this.jobMatchFixture === "permanent_invalid";
    const invalidEvidence = permanentInvalid || (this.jobMatchFixture === "invalid_evidence_then_repair" && !repaired);
    const unsupportedNumber = this.jobMatchFixture === "unsupported_number_then_repair" && !repaired;
    const hardReject = this.jobMatchFixture === "hard_reject";
    const sponsorship = this.jobMatchFixture === "unclear_sponsorship"
      ? "unclear"
      : classifySponsorship(input.request.job.descriptionText);
    return {
      score: hardReject ? 25 : Math.min(100, input.request.deterministic.score + 7),
      hardReject,
      hardRejectReasons: hardReject ? ["Mock fixture supplied an additional explicit concern."] : [],
      recommendedResumeProfile: ids.resumeProfileIds[0] ?? null,
      matchedEvidenceIds: invalidEvidence ? ["invented-evidence-id"] : ids.evidenceIds.slice(0, 4),
      matchedSkillIds: ids.skillIds.slice(0, 4),
      matchedProjectIds: ids.projectIds.slice(0, 2),
      matchedExperienceIds: ids.experienceIds.slice(0, 2),
      requiredQualifications: ["Software engineering skills described in the job posting"],
      preferredQualifications: ["Additional relevant product experience"],
      missingRequirements: [],
      strengths: unsupportedNumber ? ["Improved an unsupported metric by 99%"] : ["Supplied evidence aligns with the role"],
      concerns: hardReject ? ["Mock hard-reject scenario"] : [],
      experienceCompatibility: hardReject ? "incompatible" : "strong",
      locationCompatibility: "moderate",
      sponsorshipStatus: sponsorship,
      summary: "Mock analysis grounded in the supplied evidence packet.",
    };
  }

  async converseWorkspace(input: { request: WorkspaceRequest; modelName: string }): Promise<AIProviderResult<WorkspaceResponse>> {
    const requestedSkill = input.request.allowProfileSkillProposal ? requestedProfileSkillName(input.request.question) : null;
    const skillIds = input.request.records.filter(r => r.tool === "get_career_fact" && r.fields.some(f => f.name === "statement" && requestedSkill && f.value.toLowerCase().includes(requestedSkill.toLowerCase()))).slice(0,3).map(r => r.id);
    const fact = input.request.records.find(r => r.tool === "get_career_fact");
    const statement = fact?.fields.find(f => f.name === "statement")?.value;
    const proposed = input.request.allowResumeBulletProposal ? { resumeBulletProposal: fact && statement ? { operation: RESUME_BULLET_ACTION, evidenceId: fact.id, replacementText: statement } : null } : input.request.allowProfileSkillProposal ? { profileSkillProposal: requestedSkill && skillIds.length ? { operation: PROFILE_SKILL_ACTION, skillName: requestedSkill, evidenceIds: skillIds } : null } : {};
    if ((input.request.allowProfileSkillProposal || input.request.allowResumeBulletProposal) && input.request.phase === "plan") return { data: { phase: "plan", plan: grantPlan(input.request.catalog) }, metadata: metadata("career_copilot", input.modelName) };
    if (input.request.phase === "answer" && input.request.responseStyle === "synthesis") {
      const evidence = input.request.synthesisEvidence ?? [];
      const required = evidence.filter(e => e.category === "answer" && e.required);
      const optional = evidence.filter(e => e.category === "answer" && !e.required).slice(0, 6 - required.length);
      const selected = evidence.filter(e => required.includes(e) || optional.includes(e));
      const subjects = new Set(selected.map(e => e.subjectId));
      return { data: { phase: "answer", ...proposed, answer: { status: selected.length ? "answered" : "insufficient", answer: selected.map(e => ({ text: e.variants.at(-1)!, evidenceId: e.id })), uncertainties: evidence.filter(e => e.category === "uncertainty" && subjects.has(e.subjectId)).map(e => e.id), nextSteps: evidence.filter(e => e.category === "next_step" && subjects.has(e.subjectId)).map(e => e.id).slice(0, 5) } }, metadata: metadata("career_copilot", input.modelName) };
    }
    // Deterministic fixture only: explicit labels in the UI never claim reasoning.
    const data: WorkspaceResponse = input.request.phase === "plan"
      ? { phase: "plan", plan: input.request.intelligenceConsent?.jobFit ? { calls: [
          { tool: "analyze_job_requirements", ids: input.request.catalog.filter(g => g.tool === "get_job").map(g => g.id) },
          ...(input.request.intelligenceConsent.resumeEvidence && input.request.references?.focusedJobId ? [{ tool: "compare_resumes" as const, ids: [input.request.references.focusedJobId] }] : []),
        ] } : grantPlan(input.request.catalog) }
      : { phase: "answer", ...proposed, answer: { insufficient: !input.request.records.some(r => r.fields.some(f => f.value.trim() && (!r.intelligence || f.value.length <= 1200))),
        quotes: input.request.records.flatMap(r => { const f = r.fields.find(f => f.value.trim() && (!r.intelligence || f.value.length <= 1200)); return f ? [{ tool: r.tool, id: r.id, field: f.name, quote: f.value.slice(0, 1200) }] : []; }).slice(0, 8) } };
    return { data, metadata: metadata("career_copilot", input.modelName) };
  }

  async converseJob(input: { request: JobConversationRequest; modelName: string }): Promise<AIProviderResult<JobAnswer>> {
    // Deliberately labeled demo: fixed field echo, not model reasoning.
    const quote = input.request.job.roleTitle || input.request.job.description.slice(0, 2000);
    return { data: { noteProposal: null, insufficient: !quote.trim(), quotes: quote.trim() ? [{ jobId: input.request.job.id, field: input.request.job.roleTitle ? "roleTitle" : "description", quote }] : [] },
      metadata: { provider: "mock", model: input.modelName, requestType: "career_copilot", success: true, durationMs: 0, inputTokens: null, outputTokens: null, totalTokens: null, errorCode: "" } };
  }

  async analyzeJob(input: AnalyzeJobInput): Promise<AIProviderResult<JobAnalysis>> {
    const text = input.rawDescription;
    const isLoopFixture = input.company.toLowerCase() === "loop";
    const requiredSkills = [
      "TypeScript",
      "React",
      "REST APIs",
      "PostgreSQL",
      "Testing",
      "Python",
      "FastAPI",
      "OpenAI APIs",
      "Embeddings",
      "React Native",
      "Docker",
    ].filter(
      (skill) =>
        includes(text, skill) ||
        (skill === "REST APIs" && includes(text, "APIs")) ||
        (isLoopFixture && ["TypeScript", "React", "REST APIs", "PostgreSQL", "Testing"].includes(skill)) ||
        ["TypeScript", "React"].includes(skill),
    );

    const preferredSkills = [
      "LangGraph",
      "Supabase",
      "Firebase",
      "ONNX",
      "CUDA",
      "Zod",
      "TanStack Query",
      "LLM evaluation",
    ].filter((skill) => includes(text, skill) || (!isLoopFixture && ["LangGraph", "LLM evaluation"].includes(skill)));
    const roleCategories = [
      includes(text, "mobile") ? "mobile engineer" : "",
      includes(text, "ai") || includes(text, "llm") ? "AI engineer" : "",
      includes(text, "full-stack") || includes(text, "full stack") ? "full-stack engineer" : "",
      includes(text, "client") || includes(text, "customer") ? "client-facing engineer" : "",
    ].filter(Boolean);

    return result(
      {
        inferredCompany: input.company || "Sample Company",
        inferredRoleTitle: input.roleTitle || "Full-Stack Software Engineer",
        seniority: includes(text, "new grad") ? "New graduate" : includes(text, "senior") ? "Senior" : "Early-career",
        roleCategories: isLoopFixture
          ? ["full-stack engineer"]
          : roleCategories.length
            ? roleCategories
            : ["full-stack engineer"],
        requiredSkills,
        preferredSkills,
        responsibilities: isLoopFixture
          ? [
              "Build end-to-end products",
              "Own production functionality",
              "Write reliable automated tests",
              "Work effectively with changing requirements",
            ]
          : [
              "Build product-quality user experiences",
              "Develop backend APIs and durable data models",
              "Ground AI output in reliable evaluation and retrieval systems",
              "Collaborate with stakeholders and adapt to changing requirements",
            ],
        domainKeywords: isLoopFixture
          ? ["full-stack", "product engineering", "production ownership", "testing"]
          : ["AI", "full-stack", "product engineering", "evaluation"],
        candidateSignals: [
          "Ships complete products",
          "Owns functionality end to end",
          "Adapts to changing requirements",
        ],
        locationRequirements: includes(text, "Chicago") ? ["Chicago"] : [],
        workAuthorizationLanguage: includes(text, "authorization")
          ? "Job description mentions work authorization."
          : "",
        summary: isLoopFixture
          ? "The role values an early-career full-stack engineer who ships tested TypeScript and React products, owns APIs and data, and adapts as requirements change."
          : "The role values a product-minded software engineer who can build reliable full-stack systems.",
      },
      "job_analysis",
      input.modelName,
    );
  }

  async analyzeJobMatch(input: AnalyzeJobMatchInput): Promise<AIProviderResult<JobMatchAnalysis>> {
    return result(this.jobMatchResult(input, false), "job_match_analysis", input.modelName);
  }

  async repairJobMatch(input: RepairJobMatchInput): Promise<AIProviderResult<JobMatchAnalysis>> {
    return result(this.jobMatchResult(input, true), "job_match_repair", input.modelName);
  }

  async planResume(input: PlanResumeInput): Promise<AIProviderResult<ResumePlan>> {
    const plan = createResumePlanFromRequest(input.request);
    const priority = ["project-forge", "project-aura", "project-client-bookstore"];
    const itemRank = (id: string) => {
      const index = priority.indexOf(id);
      return index === -1 ? priority.length + 1 : index;
    };
    plan.selectedFactIds.sort((a, b) => {
      const left = input.request.selectedFacts.find((fact) => fact.factId === a)?.careerItemId ?? "";
      const right = input.request.selectedFacts.find((fact) => fact.factId === b)?.careerItemId ?? "";
      return itemRank(left) - itemRank(right);
    });
    plan.selectedCareerItemIds.sort((a, b) => itemRank(a) - itemRank(b));
    plan.contentBudget.includeSummary = input.request.constraints.summaryMode === "always";
    return result(plan, "resume_plan", input.modelName);
  }

  async generateResume(input: GenerateResumeInput): Promise<AIProviderResult<TailoredResume>> {
    const resume = generateResumeFromAllowedEvidence(input.request, input.plan, "ai");
    return result(applyFixture(resume, this.fixture), "resume_generation", input.modelName);
  }

  async repairResume(input: RepairResumeInput): Promise<AIProviderResult<TailoredResume>> {
    const resume = generateResumeFromAllowedEvidence(input.request, input.plan, "ai");
    const repaired = this.fixture === "non_repairable_invalid"
      ? applyFixture(resume, "non_repairable_invalid")
      : resume;
    return result(repaired, "validation_repair", input.modelName);
  }

  async shortenBullet(input: ShortenBulletInput) {
    return result({ ...input.bullet }, "bullet_shortening", input.modelName);
  }

  async extractCareerInformation(input: ExtractCareerInformationInput): Promise<AIProviderResult<CareerImportProposal>> {
    // Mock/local intake must never replace user input with a canned candidate's
    // education or achievements. Reuse the bounded, review-only local extractor.
    const proposal = createDeterministicCareerImportProposal({
      text: input.text,
      sourceType: input.sourceType,
      sourceTitle: input.sourceTitle,
      sourceReference: input.sourceReference,
      provider: "mock",
      model: input.modelName,
    });
    return result(proposal, "career_intake", input.modelName);
  }

  async reviewResume(input: ReviewResumeInput): Promise<AIProviderResult<ResumeReviewAdvisory>> {
    return result(
      {
        scores: {
          visualQuality: 75,
          atsReadability: 75,
          contentStrength: 75,
          factualSafety: 75,
          roleFit: 75,
          technicalDepth: 75,
          conciseness: 75,
          skillsQuality: 75,
        },
        rationales: {
          visualQuality: "Mock visual review.",
          atsReadability: "Mock ATS review.",
          contentStrength: "Mock content review.",
          factualSafety: "Local deterministic checks remain authoritative.",
          roleFit: "Mock role-fit review.",
          technicalDepth: "Mock technical-depth review.",
          conciseness: "Mock conciseness review.",
          skillsQuality: "Mock skills review.",
        },
        strengths: [],
        weaknesses: [],
        proposals: [],
        visualInspection: {
          readableFont: true,
          clippingDetected: false,
          bottomPageCompression: false,
          educationDatesAligned: true,
          skillsDense: false,
          bulletsOverThreeLines: 0,
          notes: "Mock provider does not inspect PDF pixels.",
        },
      },
      "resume_review",
      input.modelName,
    );
  }
}
