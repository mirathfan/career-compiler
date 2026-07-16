import type { JobAnalysis, RoleProfileId } from "../../types/domain";

export interface ResumeEvaluationFixture {
  id: string;
  name: string;
  company: string;
  roleTitle: string;
  jobDescription: string;
  roleProfileId: RoleProfileId;
  analysis: JobAnalysis;
  expectedRoleCategories: string[];
  expectedPreferredCareerItemIds: string[];
  acceptableAlternativeCareerItemIds: string[];
  deEmphasizedCareerItemIds: string[];
  requiredSkillsWhenAvailable: string[];
  prohibitedFactIds: string[];
  maximumUnsupportedClaims: 0;
  expectedOnePage: true;
}

function analysis(
  company: string,
  roleTitle: string,
  roleCategories: string[],
  requiredSkills: string[],
  responsibilities: string[],
  domainKeywords: string[],
): JobAnalysis {
  return {
    inferredCompany: company,
    inferredRoleTitle: roleTitle,
    seniority: "early career",
    roleCategories,
    requiredSkills,
    preferredSkills: [],
    responsibilities,
    domainKeywords,
    candidateSignals: ["ownership", "testing", "delivery"],
    locationRequirements: [],
    workAuthorizationLanguage: "",
    summary: `${company} is hiring a ${roleTitle} focused on ${responsibilities.slice(0, 2).join(" and ")}.`,
  };
}

export const EVALUATION_FIXTURES: ResumeEvaluationFixture[] = [
  {
    id: "full-stack",
    name: "Full-stack role",
    company: "Loop",
    roleTitle: "New Grad Full-Stack Software Engineer",
    jobDescription: "Build and ship user-facing React and TypeScript products backed by APIs, PostgreSQL, authentication, testing, and reliable deployment. Own features end to end with product and design partners.",
    roleProfileId: "full-stack-software-engineer",
    analysis: analysis("Loop", "New Grad Full-Stack Software Engineer", ["full-stack engineer"], ["React", "TypeScript", "PostgreSQL", "REST APIs", "Testing"], ["end-to-end product delivery", "backend API development"], ["authentication", "database design"]),
    expectedRoleCategories: ["full-stack engineer"],
    expectedPreferredCareerItemIds: ["project-forge", "project-client-bookstore", "project-aura"],
    acceptableAlternativeCareerItemIds: [],
    deEmphasizedCareerItemIds: ["project-gpu-lab", "project-comma-compression"],
    requiredSkillsWhenAvailable: ["React", "TypeScript", "PostgreSQL", "Testing"],
    prohibitedFactIds: ["project-comma-compression-fact-02"],
    maximumUnsupportedClaims: 0,
    expectedOnePage: true,
  },
  {
    id: "ai-engineer",
    name: "AI engineer role",
    company: "Northstar AI",
    roleTitle: "AI Engineer",
    jobDescription: "Build production LLM systems using retrieval, embeddings, evaluation, Python, PyTorch, ONNX, and reliable backend services. Measure model quality and inference performance before release.",
    roleProfileId: "ai-engineer",
    analysis: analysis("Northstar AI", "AI Engineer", ["AI engineer", "ML systems"], ["OpenAI APIs", "LangGraph", "Embeddings", "LLM evaluation", "PyTorch", "ONNX"], ["production AI systems", "offline evaluation"], ["retrieval", "inference"]),
    expectedRoleCategories: ["AI engineer", "ML systems"],
    expectedPreferredCareerItemIds: ["project-aura", "project-gpu-lab"],
    acceptableAlternativeCareerItemIds: ["project-comma-compression", "project-forge"],
    deEmphasizedCareerItemIds: ["project-client-bookstore"],
    requiredSkillsWhenAvailable: ["OpenAI APIs", "LangGraph", "PyTorch", "ONNX"],
    prohibitedFactIds: [],
    maximumUnsupportedClaims: 0,
    expectedOnePage: true,
  },
  {
    id: "forward-deployed",
    name: "Forward deployed engineer role",
    company: "Fieldworks",
    roleTitle: "Forward Deployed Engineer",
    jobDescription: "Partner directly with customers, clarify ambiguous requirements, own end-to-end implementation, deploy user-facing systems, and iterate from feedback using TypeScript, React, backend APIs, and databases.",
    roleProfileId: "forward-deployed-engineer",
    analysis: analysis("Fieldworks", "Forward Deployed Engineer", ["forward deployed engineer", "client-facing engineer"], ["TypeScript", "React", "REST APIs", "PostgreSQL"], ["customer requirements", "end-to-end delivery", "deployment"], ["product ownership", "ambiguous requirements"]),
    expectedRoleCategories: ["forward deployed engineer"],
    expectedPreferredCareerItemIds: ["project-client-bookstore", "project-aura", "project-forge"],
    acceptableAlternativeCareerItemIds: [],
    deEmphasizedCareerItemIds: ["project-gpu-lab", "project-comma-compression"],
    requiredSkillsWhenAvailable: ["React", "TypeScript", "REST APIs"],
    prohibitedFactIds: [],
    maximumUnsupportedClaims: 0,
    expectedOnePage: true,
  },
  {
    id: "mobile",
    name: "Mobile engineer role",
    company: "Pocket Labs",
    roleTitle: "Mobile Engineer",
    jobDescription: "Ship polished iOS and cross-platform mobile products with React Native, Expo, TypeScript, offline behavior, testing, persistence, and beta distribution through TestFlight.",
    roleProfileId: "mobile-engineer",
    analysis: analysis("Pocket Labs", "Mobile Engineer", ["mobile engineer"], ["React Native", "Expo", "TypeScript", "Testing", "TestFlight"], ["mobile product delivery", "offline reliability"], ["iOS", "persistence"]),
    expectedRoleCategories: ["mobile engineer"],
    expectedPreferredCareerItemIds: ["project-aura", "project-forge"],
    acceptableAlternativeCareerItemIds: [],
    deEmphasizedCareerItemIds: ["project-gpu-lab", "project-comma-compression", "project-client-bookstore"],
    requiredSkillsWhenAvailable: ["React Native", "Expo", "TypeScript", "Testing"],
    prohibitedFactIds: [],
    maximumUnsupportedClaims: 0,
    expectedOnePage: true,
  },
  {
    id: "backend",
    name: "Backend engineer role",
    company: "Ledgerline",
    roleTitle: "Backend Software Engineer",
    jobDescription: "Design reliable APIs, PostgreSQL schemas, authentication, idempotent workflows, migrations, tests, and containerized services. Collaborate with product engineers to deliver complete systems.",
    roleProfileId: "backend-engineer",
    analysis: analysis("Ledgerline", "Backend Software Engineer", ["backend engineer"], ["FastAPI", "PostgreSQL", "REST APIs", "Docker", "Testing"], ["API design", "database reliability"], ["authentication", "idempotency"]),
    expectedRoleCategories: ["backend engineer"],
    expectedPreferredCareerItemIds: ["project-forge", "project-client-bookstore", "project-aura"],
    acceptableAlternativeCareerItemIds: [],
    deEmphasizedCareerItemIds: ["project-comma-compression"],
    requiredSkillsWhenAvailable: ["FastAPI", "PostgreSQL", "Docker", "Testing"],
    prohibitedFactIds: [],
    maximumUnsupportedClaims: 0,
    expectedOnePage: true,
  },
  {
    id: "ml-systems-performance",
    name: "ML systems and performance role",
    company: "Vector Runtime",
    roleTitle: "ML Systems Performance Engineer",
    jobDescription: "Benchmark and optimize model inference with PyTorch, ONNX Runtime, CUDA, FP16, batching, numerical validation, reproducible tests, and metric-driven experimentation.",
    roleProfileId: "ai-engineer",
    analysis: analysis("Vector Runtime", "ML Systems Performance Engineer", ["ML systems", "performance engineer"], ["PyTorch", "ONNX Runtime", "CUDA", "Testing"], ["inference benchmarking", "numerical validation"], ["FP16", "optimization"]),
    expectedRoleCategories: ["ML systems", "performance engineer"],
    expectedPreferredCareerItemIds: ["project-gpu-lab", "project-comma-compression"],
    acceptableAlternativeCareerItemIds: ["project-aura"],
    deEmphasizedCareerItemIds: ["project-client-bookstore"],
    requiredSkillsWhenAvailable: ["PyTorch", "ONNX Runtime", "CUDA", "Testing"],
    prohibitedFactIds: [],
    maximumUnsupportedClaims: 0,
    expectedOnePage: true,
  },
];
