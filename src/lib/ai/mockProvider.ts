import type { JobAnalysis } from "../../types/domain";
import type { AIProvider, AnalyzeJobInput } from "./provider";

function includes(text: string, value: string) {
  return text.toLowerCase().includes(value.toLowerCase());
}

export class MockAIProvider implements AIProvider {
  async analyzeJob(input: AnalyzeJobInput): Promise<JobAnalysis> {
    const text = input.rawDescription;
    const requiredSkills = [
      "TypeScript",
      "React",
      "Python",
      "FastAPI",
      "PostgreSQL",
      "OpenAI APIs",
      "Embeddings",
      "React Native",
      "Docker",
      "Testing",
    ].filter((skill) => includes(text, skill) || ["TypeScript", "React", "Python"].includes(skill));

    const preferredSkills = [
      "LangGraph",
      "Supabase",
      "Firebase",
      "ONNX",
      "CUDA",
      "Zod",
      "TanStack Query",
      "LLM evaluation",
    ].filter((skill) => includes(text, skill) || ["LangGraph", "LLM evaluation"].includes(skill));

    const roleCategories = [
      includes(text, "mobile") ? "mobile engineer" : "",
      includes(text, "ai") || includes(text, "llm") ? "AI engineer" : "",
      includes(text, "full-stack") || includes(text, "full stack") ? "full-stack engineer" : "",
      includes(text, "client") || includes(text, "customer") ? "forward deployed engineer" : "",
    ].filter(Boolean);

    return {
      inferredCompany: input.company || "Sample Company",
      inferredRoleTitle: input.roleTitle || "Full-Stack AI Software Engineer",
      seniority: includes(text, "senior") ? "Senior" : "Early-career to mid-level",
      roleCategories: roleCategories.length ? roleCategories : ["full-stack engineer", "AI engineer"],
      requiredSkills,
      preferredSkills,
      responsibilities: [
        "Build product-quality user experiences",
        "Develop backend APIs and durable data models",
        "Ground AI output in reliable evaluation and retrieval systems",
        "Collaborate with stakeholders and adapt to changing requirements",
      ],
      domainKeywords: ["AI", "full-stack", "product engineering", "local-first", "evaluation"],
      candidateSignals: [
        "Ships complete products",
        "Understands AI retrieval and evaluation",
        "Combines frontend, mobile, backend, and database work",
      ],
      locationRequirements: includes(text, "Chicago") ? ["Chicago"] : ["United States"],
      workAuthorizationLanguage: includes(text, "authorization")
        ? "Job description mentions work authorization."
        : "",
      summary:
        "The role values a product-minded software engineer who can build full-stack systems and ground AI features in reliable evidence.",
    };
  }
}
