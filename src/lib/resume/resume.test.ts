import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { MemoryRepository } from "../database/memoryRepository";
import { defaultResumeFilename, sanitizeFilenamePart } from "./filename";
import { escapeLatex, renderResumeLatex } from "./latex";
import { countPdfPages } from "./pdf";
import { validateResumeClaims } from "./validation";
import type { TailoredResume } from "../../types/domain";

function baseResume(): TailoredResume {
  return {
    id: "resume",
    header: {
      fullName: "Mir Athfan Ali",
      headline: "",
      location: "Chicago, Illinois",
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
        careerItemId: "project-comma-compression",
        title: "Comma Video Compression Challenge",
        organization: "Independent challenge",
        location: "",
        startDate: "",
        endDate: "",
        isCurrent: false,
        locked: false,
        bullets: [
          {
            id: "bullet-1",
            text: "Improved from a baseline score of approximately 2.99 to a CPU-validated final score of 1.3545992946.",
            sourceFactIds: ["project-comma-compression-fact-02"],
            relevanceScore: 40,
            isUserEdited: false,
            included: true,
            locked: false,
            approved: false,
            rejected: false,
            generationSource: "deterministic",
            generationReason: "Metric match.",
            keywordsAddressed: [],
            selectionReason: "Metric match.",
          },
        ],
      },
    ],
    skills: ["TypeScript"],
    sectionOrder: ["projects", "education", "skills"],
    compactionActions: [],
    layout: { bodyFontSize: 9.5, spacingScale: 1, condensedSkills: false },
    approvedWarningCodes: [],
  };
}

describe("resume utilities", () => {
  it("sanitizes filenames", () => {
    expect(sanitizeFilenamePart("Acme / AI: Engineer")).toBe("Acme_AI_Engineer");
    expect(defaultResumeFilename("Acme Inc.", "AI Engineer")).toBe(
      "Mir_Athfan_Ali_Acme_Inc_AI_Engineer.pdf",
    );
  });

  it("builds escaped XeLaTeX source from resume data", () => {
    const resume = baseResume();
    resume.header.headline = "AI & Full-Stack_Engineer";
    const source = renderResumeLatex(resume);
    expect(escapeLatex("R&D_100% #1")).toBe("R\\&D\\_100\\% \\#1");
    expect(source).toContain("\\documentclass[letterpaper,10pt]{article}");
    expect(source).toContain("\\XeTeXgenerateactualtext=1");
    expect(source).toContain("\\usepackage{fontspec}");
    expect(source).toContain("AI \\& Full-Stack\\_Engineer");
    expect(source).not.toContain("-no-shell-escape");
  });

  it("validates source facts and numeric claims", async () => {
    const repository = new MemoryRepository();
    await repository.seedSampleData();
    const resume = baseResume();
    const issues = validateResumeClaims({
      resume,
      facts: await repository.listCareerFacts(),
      items: await repository.listCareerItems(),
      skills: await repository.listSkills(),
      profile: await repository.getProfile(),
    });
    expect(issues.filter((issue) => issue.severity === "error")).toHaveLength(0);

    resume.projects[0].bullets[0].text = "Improved compression by 75%.";
    const unsupported = validateResumeClaims({
      resume,
      facts: await repository.listCareerFacts(),
      items: await repository.listCareerItems(),
      skills: await repository.listSkills(),
      profile: await repository.getProfile(),
    });
    expect(unsupported.some((issue) => issue.message.includes("Unsupported percentage"))).toBe(true);
  });

  it("counts PDF pages", async () => {
    const document = await PDFDocument.create();
    document.addPage();
    const bytes = await document.save();
    await expect(countPdfPages(bytes)).resolves.toBe(1);
  });
});
