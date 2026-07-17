import { describe, expect, it } from "vitest";
import { CareerImportProposal, careerImportProposalJsonSchema } from "./careerImport";
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

  it("parses strict career import proposals and rejects arbitrary fields", () => {
    const baseProposal = {
      importId: "career-import-test",
      sourceType: "paste_anything",
      sourceTitle: "Test paste",
      sourceReference: "manual paste",
      profileChanges: [],
      careerItemChanges: [],
      careerFactChanges: [],
      skillChanges: [],
      relationshipChanges: [],
      warnings: [],
      unresolvedQuestions: [],
      extractionMetadata: {
        provider: "mock",
        model: "mock",
        promptVersion: "careercompiler-career-intake-v1.0.0",
        classifiedAs: "paste_anything",
        createdAt: "2026-07-16T00:00:00.000Z",
      },
    };
    expect(CareerImportProposal.parse(baseProposal).importId).toBe("career-import-test");
    expect(() =>
      CareerImportProposal.parse({
        ...baseProposal,
        careerItemChanges: [
          {
            proposalId: "proposal-1",
            operation: "add",
            targetType: "career_item",
            existingRecordId: "",
            confidence: 0.8,
            reason: "test",
            sourceExcerpt: "test",
            validationStatus: "pending",
            validationIssues: [],
            duplicateCandidates: [],
            conflictDetails: [],
            userDecision: "pending",
            proposedValue: {
              type: "project",
              title: "Project",
              organization: "",
              location: "",
              startDate: "",
              endDate: "",
              isCurrent: false,
              shortDescription: "",
              url: "",
              repositoryUrl: "",
              enabled: true,
              rawSql: "DROP TABLE career_items",
            },
            existingValue: null,
          },
        ],
      }),
    ).toThrow();
  });

  it("keeps the career import provider schema strict-output compatible", () => {
    const careerItemChange = careerImportProposalJsonSchema.properties.careerItemChanges.items;
    expect(careerItemChange.properties.existingValue).toEqual({ type: "null" });
    expect(JSON.stringify(careerImportProposalJsonSchema)).not.toContain('"additionalProperties":true');
  });
});
