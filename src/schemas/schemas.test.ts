import { describe, expect, it } from "vitest";
import { JobAnalysisSchema, jobAnalysisJsonSchema } from "./jobAnalysis";
import { ResumePlanSchema, TailoredResumeSchema } from "./resume";

describe("zod schemas", () => {
  it("parses job analysis and exposes structured output JSON schema", () => {
    const analysis = JobAnalysisSchema.parse({
      inferredCompany: "Acme",
      inferredRoleTitle: "Engineer",
      seniority: "Mid",
      roleCategories: ["full-stack engineer"],
      requiredSkills: ["TypeScript"],
      preferredSkills: ["LangGraph"],
      responsibilities: ["Build"],
      domainKeywords: ["AI"],
      candidateSignals: ["Ships"],
      locationRequirements: ["US"],
      workAuthorizationLanguage: "",
      summary: "Build AI products.",
    });
    expect(analysis.requiredSkills).toContain("TypeScript");
    expect(jobAnalysisJsonSchema.required).toContain("summary");
  });

  it("requires source facts on resume bullets", () => {
    const bullet = {
      id: "bullet",
      text: "Built a product.",
      sourceFactIds: ["fact"],
      relevanceScore: 1,
      isUserEdited: false,
      included: true,
      locked: false,
      approved: false,
      rejected: false,
      generationSource: "ai",
      generationReason: "test",
      keywordsAddressed: [],
      selectionReason: "test",
    };
    expect(() =>
      TailoredResumeSchema.parse({
        id: "resume",
        header: {
          fullName: "Mir Athfan Ali",
          headline: "",
          location: "",
          email: "",
          phone: "",
          portfolioUrl: "",
          linkedInUrl: "",
          githubUrl: "",
          workAuthorizationNote: "",
        },
        summary: [],
        education: [],
        experience: [],
        projects: [
          {
            careerItemId: "item",
            title: "Project",
            organization: "",
            location: "",
            startDate: "",
            endDate: "",
            isCurrent: false,
            locked: false,
            bullets: [bullet],
          },
        ],
        skills: [],
        sectionOrder: ["projects", "skills"],
        compactionActions: [],
        layout: { bodyFontSize: 9.5, spacingScale: 1, condensedSkills: false },
        approvedWarningCodes: [],
      }),
    ).not.toThrow();
  });

  it("validates resume plan content budget", () => {
    const plan = ResumePlanSchema.parse({
      targetPositioning: "AI engineer",
      selectedCareerItemIds: ["item"],
      selectedFactIds: ["fact"],
      sectionOrder: ["projects", "education", "skills"],
      emphasisAreas: ["React"],
      deEmphasisAreas: [],
      omittedItems: [],
      skillSelection: ["React"],
      contentBudget: { maxBullets: 10, maxProjects: 3, includeSummary: true, maxBulletsPerItem: 2 },
    });
    expect(plan.contentBudget.maxBullets).toBe(10);
  });
});
