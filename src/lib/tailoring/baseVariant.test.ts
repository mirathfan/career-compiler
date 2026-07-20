import { describe, expect, it } from "vitest";
import type { ResumeBullet, TailoredResume } from "../../types/domain";
import { createControlledResumeVariantFromBase } from "./baseVariant";

function bullet(id: string, text: string, sourceFactIds: string[], approved = true): ResumeBullet {
  return {
    id,
    text,
    sourceFactIds,
    relevanceScore: 10,
    isUserEdited: false,
    included: true,
    locked: false,
    approved,
    rejected: false,
    generationSource: "deterministic",
    generationReason: "Base content.",
    keywordsAddressed: [],
    selectionReason: "Base content.",
  };
}

function resume(): TailoredResume {
  return {
    id: "base-resume",
    header: {
      fullName: "Candidate Example",
      headline: "Software Engineer",
      location: "Chicago, Illinois",
      email: "mir@example.com",
      phone: "555-0100",
      portfolioUrl: "https://example.com",
      linkedInUrl: "https://linkedin.com/in/mir",
      githubUrl: "https://github.com/mir",
      workAuthorizationNote: "",
    },
    summary: ["Base summary stays."],
    education: [],
    experience: [
      {
        careerItemId: "employment-loop",
        title: "Software Engineer",
        organization: "Loop",
        location: "Chicago, Illinois",
        startDate: "2025-01",
        endDate: "",
        isCurrent: true,
        locked: false,
        bullets: [bullet("base-exp", "Built production APIs for internal tools.", ["fact-exp"])],
      },
    ],
    projects: [
      {
        careerItemId: "project-forge",
        title: "Forge",
        organization: "",
        location: "",
        startDate: "2024-01",
        endDate: "2024-05",
        isCurrent: false,
        url: "https://forge.example.com",
        repositoryUrl: "https://github.com/mir/forge",
        locked: false,
        bullets: [bullet("base-project", "Built a workout tracker with React Native and FastAPI.", ["fact-project"])],
      },
    ],
    skills: ["TypeScript", "React Native", "FastAPI", "PostgreSQL"],
    sectionOrder: ["summary", "experience", "projects", "education", "skills"],
    compactionActions: ["old compaction"],
    layout: { bodyFontSize: 10, spacingScale: 1, condensedSkills: false },
    approvedWarningCodes: ["old-warning"],
  };
}

describe("controlled base resume variants", () => {
  it("preserves the base document and marks only proposed material edits as pending", () => {
    const base = resume();
    const proposed = resume();
    proposed.projects[0].bullets[0] = {
      ...proposed.projects[0].bullets[0],
      text: "Built a full-stack workout tracker with React Native, FastAPI, and PostgreSQL.",
      generationSource: "ai",
      generationReason: "Matched target full-stack role.",
      keywordsAddressed: ["React Native", "FastAPI"],
    };
    proposed.experience = [];
    proposed.projects.push({
      careerItemId: "project-aura",
      title: "Aura",
      organization: "",
      location: "",
      startDate: "2024-06",
      endDate: "2024-08",
      isCurrent: false,
      locked: false,
      bullets: [bullet("proposed-aura", "Built an AI styling app with Expo and Firebase.", ["fact-aura"], false)],
    });

    const result = createControlledResumeVariantFromBase({ base, proposed });

    expect(result.variant.id).not.toBe(base.id);
    expect(result.variant.header).toEqual(base.header);
    expect(result.variant.summary).toEqual(base.summary);
    expect(result.variant.skills).toEqual(base.skills);
    expect(result.variant.layout).toEqual(base.layout);
    expect(result.variant.experience).toHaveLength(1);
    expect(result.variant.experience[0].bullets[0].approved).toBe(true);
    expect(result.variant.projects[0].url).toBe("https://forge.example.com");
    expect(result.variant.projects[0].bullets[0].text).toContain("full-stack workout tracker");
    expect(result.variant.projects[0].bullets[0].approved).toBe(false);
    expect(result.variant.projects[1].careerItemId).toBe("project-aura");
    expect(result.variant.projects[1].bullets[0].approved).toBe(false);
    expect(result.changedBulletIds).toEqual(["base-project"]);
    expect(result.addedBulletIds).toHaveLength(1);
  });
});
