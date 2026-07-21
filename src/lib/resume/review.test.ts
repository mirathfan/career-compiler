import { beforeEach, describe, expect, it } from "vitest";
import { createGenerationFixture } from "../../test/generationFixture";
import { resumeReviewCategoryIds } from "../../schemas/resumeReview";
import { defaultSettings } from "../database/seed";
import { useResumeEditorStore } from "../../stores/resumeEditorStore";
import { deterministicFallback } from "../ai/generationPipeline";
import { compactResumeForOnePage } from "./compaction";
import { semanticResumeDiff } from "./diff";
import { calculateResumeQuality } from "./quality";
import {
  applySafeResumeImprovements,
  buildResumeReview,
  improveResumeFromReview,
  reviewResumeVersion,
} from "./review";
import { validateResumeClaims } from "./validation";

describe("resume review behavior", () => {
  let fixture: Awaited<ReturnType<typeof createGenerationFixture>>;

  beforeEach(async () => {
    fixture = await createGenerationFixture();
    const resume = deterministicFallback(fixture.request);
    useResumeEditorStore.getState().setReviewDraft(resume, resume);
  });

  it("locks a bullet against later automated changes", () => {
    const bullet = useResumeEditorStore.getState().resume!.projects[0].bullets[0];
    useResumeEditorStore.getState().toggleBulletLock(bullet.id);
    const locked = useResumeEditorStore.getState().resume!.projects[0].bullets[0];
    expect(locked.locked).toBe(true);
  });

  it("locks a career item against automatic removal", () => {
    const section = useResumeEditorStore.getState().resume!.projects[0];
    useResumeEditorStore.getState().toggleCareerItemLock(section.careerItemId);
    expect(useResumeEditorStore.getState().resume!.projects[0].locked).toBe(true);
  });

  it("supports per-bullet acceptance and rejection", () => {
    const bullets = useResumeEditorStore.getState().resume!.projects.flatMap((section) => section.bullets);
    useResumeEditorStore.getState().acceptBullet(bullets[0].id);
    useResumeEditorStore.getState().rejectBullet(bullets[1].id);
    const updated = useResumeEditorStore.getState().resume!.projects.flatMap((section) => section.bullets);
    expect(updated.find((bullet) => bullet.id === bullets[0].id)?.approved).toBe(true);
    expect(updated.find((bullet) => bullet.id === bullets[1].id)?.rejected).toBe(true);
    expect(updated.find((bullet) => bullet.id === bullets[1].id)?.included).toBe(false);
  });

  it("persists a dirty draft and supports undo and redo", () => {
    const store = useResumeEditorStore.getState();
    const bullet = store.resume!.projects[0].bullets[0];
    const original = bullet.text;
    store.updateBullet(bullet.id, `${original} Reviewed edit.`);
    expect(useResumeEditorStore.getState().dirty).toBe(true);
    expect(localStorage.getItem("careercompiler-resume-draft-v3")).toContain("Reviewed edit");
    useResumeEditorStore.getState().undo();
    expect(useResumeEditorStore.getState().resume!.projects[0].bullets[0].text).toBe(original);
    useResumeEditorStore.getState().redo();
    expect(useResumeEditorStore.getState().resume!.projects[0].bullets[0].text).toContain("Reviewed edit");
    useResumeEditorStore.getState().markSaved();
    expect(useResumeEditorStore.getState().dirty).toBe(false);
  });

  it("produces a semantic rewording diff instead of raw character output", () => {
    const before = deterministicFallback(fixture.request);
    const after = structuredClone(before);
    after.projects[0].bullets[0].text = `Reworded: ${after.projects[0].bullets[0].text}`;
    after.skills = [...after.skills, "Docker"];
    const diff = semanticResumeDiff(before, after);
    expect(diff.some((entry) => entry.category === "reworded" && entry.before && entry.after)).toBe(true);
    expect(diff.some((entry) => entry.category === "skills_changed")).toBe(true);
  });

  it("compaction never removes locked bullets or locked career items", () => {
    const resume = deterministicFallback(fixture.request);
    const section = resume.projects[0];
    section.locked = true;
    section.bullets[0].locked = true;
    const lockedId = section.bullets[0].id;
    section.bullets = Array.from({ length: 24 }, (_, index) => ({
      ...structuredClone(section.bullets[0]),
      id: index === 0 ? lockedId : `locked-${index}`,
      locked: true,
      text: `${section.bullets[0].text} Additional grounded context for layout verification.`,
    }));
    const compacted = compactResumeForOnePage(resume);
    expect(compacted.projects.some((item) => item.careerItemId === section.careerItemId)).toBe(true);
    expect(compacted.projects[0].bullets.find((bullet) => bullet.id === lockedId)?.included).toBe(true);
  });

  it("calculates factual quality counts", () => {
    const resume = deterministicFallback(fixture.request);
    const issues = validateResumeClaims({
      resume,
      facts: fixture.facts,
      items: fixture.items,
      skills: fixture.skills,
      profile: fixture.profile,
      generationRequest: fixture.request,
    });
    const checks = calculateResumeQuality({
      resume,
      analysis: fixture.analysis,
      evidence: fixture.evidence,
      validationIssues: issues,
      profile: fixture.profile,
      pageCount: 1,
    });
    expect(checks.find((check) => check.id === "required-skills")?.detail).toMatch(/of/);
    expect(checks.find((check) => check.id === "unsupported-claims")?.count).toBe(0);
  });

  it("builds a structured scorecard with strengths, weaknesses, and safe proposals", () => {
    const resume = deterministicFallback(fixture.request);
    resume.summary = [
      "Software engineer with broad product experience and a deliberately long summary that should be easy to remove when the resume needs more space.",
    ];
    resume.projects[0].bullets.push({
      ...structuredClone(resume.projects[0].bullets[0]),
      id: "duplicate-review-bullet",
    });
    const saved = {
      id: "resume-review-source",
      jobId: fixture.job.id,
      name: "Review Source",
      kind: "tailored" as const,
      templateId: "mir-standard",
      contentJson: resume,
      resumeDocumentJson: {} as never,
      validationJson: validateResumeClaims({
        resume,
        facts: fixture.facts,
        items: fixture.items,
        skills: fixture.skills,
        profile: fixture.profile,
        generationRequest: fixture.request,
      }),
      status: "draft" as const,
      lastExportPath: "",
      parentResumeVersionId: "",
      baseResumeVersionId: "",
      generationProvider: "deterministic" as const,
      generationModel: "",
      promptVersion: "",
      promptVersionsJson: {
        jobAnalysis: "",
        planning: "",
        resumeGeneration: "",
        repair: "",
        bulletRegeneration: "",
        bulletShortening: "",
        careerIntake: "",
        careerCopilot: "",
        resumeReview: "",
      },
      layoutProfileId: "general-software-engineer" as const,
      templateSettingsJson: {
        fontFamily: "Arial" as const,
        bodyFontSize: 9.5,
        headerFontSize: 18,
        sectionHeadingSize: 11,
        marginInches: 0.5,
        sectionSpacing: 1,
        bulletSpacing: 1,
        dateAlignment: "right" as const,
        urlDisplay: "labels" as const,
        educationOrdering: "graduate-first" as const,
        projectsExperienceOrdering: "projects-first" as const,
        summaryAllowed: true,
        maximumProjectCount: 4 as const,
        defaultBulletsPerProject: 2 as const,
      },
      generationMetadataJson: {
        calls: [],
        repairAttempted: false,
        repairSucceeded: false,
        deterministicFallbackUsed: true,
        compactionLog: [],
      },
      deterministicBaselineJson: null,
      createdAt: "",
      updatedAt: "",
    };
    const review = buildResumeReview({
      resumeVersion: saved,
      job: fixture.job,
      reviewMode: "job_specific",
      profile: fixture.profile,
      facts: fixture.facts,
      items: fixture.items,
      skills: fixture.skills,
      provider: "local-mock",
      model: "resume-review-v1",
      pdfPageCount: 2,
    });
    expect(review.categoryScores.map((score) => score.id)).toEqual(resumeReviewCategoryIds);
    expect(review.strengths.length).toBeGreaterThan(0);
    expect(review.weaknesses.length).toBeGreaterThan(0);
    expect(review.recommendedChanges.some((change) => change.kind === "remove_summary")).toBe(true);
    expect(review.recommendedChanges.some((change) => change.safety === "safe")).toBe(true);
    for (const change of review.recommendedChanges) {
      expect(change).toEqual(expect.objectContaining({
        before: expect.any(String),
        after: expect.any(String),
        rationale: expect.any(String),
        evidence: expect.any(Array),
        category: expect.any(String),
        priority: expect.stringMatching(/^(low|medium|high|critical)$/),
        expectedScoreImpact: expect.any(Number),
        safeToAutoApply: expect.any(Boolean),
        confirmationRequired: expect.any(Boolean),
      }));
    }

    const renderFailure = buildResumeReview({
      resumeVersion: saved,
      reviewMode: "general",
      profile: fixture.profile,
      facts: fixture.facts,
      items: fixture.items,
      skills: fixture.skills,
      provider: "local-mock",
      model: "resume-review-v1",
      pdfPageCount: 1,
      pdfRenderError: "XeLaTeX unavailable",
    });
    expect(renderFailure.readyToSubmit).toBe(false);
    expect(renderFailure.weaknesses.some((issue) => issue.message.includes("PDF rendering failed"))).toBe(true);
  });

  it("blocks pre-submission approval for page overflow, missing contact, and classification errors", () => {
    const resume = deterministicFallback(fixture.request);
    resume.header.email = "";
    resume.experience = [structuredClone(resume.projects[0])];
    resume.projects = [];
    const saved = {
      id: "resume-pre-submit-source",
      jobId: fixture.job.id,
      name: "Pre Submit Source",
      kind: "tailored" as const,
      templateId: "mir-standard",
      contentJson: resume,
      resumeDocumentJson: {} as never,
      validationJson: [],
      status: "draft" as const,
      lastExportPath: "",
      parentResumeVersionId: "",
      baseResumeVersionId: "",
      generationProvider: "deterministic" as const,
      generationModel: "",
      promptVersion: "",
      promptVersionsJson: {
        jobAnalysis: "",
        planning: "",
        resumeGeneration: "",
        repair: "",
        bulletRegeneration: "",
        bulletShortening: "",
        careerIntake: "",
        careerCopilot: "",
        resumeReview: "",
      },
      layoutProfileId: "general-software-engineer" as const,
      templateSettingsJson: {
        fontFamily: "Arial" as const,
        bodyFontSize: 9.5,
        headerFontSize: 18,
        sectionHeadingSize: 11,
        marginInches: 0.5,
        sectionSpacing: 1,
        bulletSpacing: 1,
        dateAlignment: "right" as const,
        urlDisplay: "labels" as const,
        educationOrdering: "graduate-first" as const,
        projectsExperienceOrdering: "projects-first" as const,
        summaryAllowed: true,
        maximumProjectCount: 4 as const,
        defaultBulletsPerProject: 2 as const,
      },
      generationMetadataJson: {
        calls: [],
        repairAttempted: false,
        repairSucceeded: false,
        deterministicFallbackUsed: true,
        compactionLog: [],
      },
      deterministicBaselineJson: null,
      createdAt: "",
      updatedAt: "",
    };
    const review = buildResumeReview({
      resumeVersion: saved,
      job: fixture.job,
      reviewMode: "pre_submission",
      profile: fixture.profile,
      facts: fixture.facts,
      items: fixture.items,
      skills: fixture.skills,
      provider: "local-mock",
      model: "resume-review-v1",
      pdfPageCount: 2,
    });
    expect(review.readyToSubmit).toBe(false);
    expect(review.criticalIssues.some((issue) => issue.message.includes("Missing required contact"))).toBe(true);
    expect(review.criticalIssues.some((issue) => issue.message.includes("listed as experience"))).toBe(true);
    expect(review.criticalIssues.some((issue) => issue.category === "Visual layout")).toBe(true);
  });

  it("requires confirmation for unverified leadership and duplicate cross-section coverage", () => {
    const resume = deterministicFallback(fixture.request);
    const project = structuredClone(resume.projects[0]);
    const experience = structuredClone(project);
    experience.title = `${project.title} Founder`;
    resume.experience = [experience];
    resume.projects = [project];
    const review = buildResumeReview({
      resumeVersion: {
        id: "resume-leadership-review",
        jobId: fixture.job.id,
        name: "Leadership review",
        kind: "tailored",
        templateId: "mir-standard",
        contentJson: resume,
        resumeDocumentJson: {} as never,
        validationJson: [],
        status: "draft",
        lastExportPath: "",
        parentResumeVersionId: "",
        baseResumeVersionId: "",
        generationProvider: "deterministic",
        generationModel: "",
        promptVersion: "",
        promptVersionsJson: {
          jobAnalysis: "",
          planning: "",
          resumeGeneration: "",
          repair: "",
          bulletRegeneration: "",
          bulletShortening: "",
          careerIntake: "",
          careerCopilot: "",
          resumeReview: "",
        },
        layoutProfileId: "general-software-engineer",
        templateSettingsJson: defaultSettings.templateSettings,
        generationMetadataJson: {
          calls: [],
          repairAttempted: false,
          repairSucceeded: false,
          deterministicFallbackUsed: true,
          compactionLog: [],
        },
        deterministicBaselineJson: null,
        createdAt: "",
        updatedAt: "",
      },
      job: fixture.job,
      reviewMode: "pre_submission",
      profile: fixture.profile,
      facts: fixture.facts,
      items: fixture.items,
      skills: fixture.skills,
      candidateClaims: [],
      provider: "local-deterministic",
      model: "resume-review-v2",
      pdfPageCount: 1,
    });

    expect(review.readyToSubmit).toBe(false);
    expect(review.criticalIssues.some((issue) => issue.message.includes("Leadership title"))).toBe(true);
    const classificationProposal = review.recommendedChanges.find((change) => change.title.includes("leadership"));
    expect(classificationProposal).toEqual(expect.objectContaining({
      safety: "needs_review",
      safeToAutoApply: false,
      confirmationRequired: true,
    }));
    expect(review.recommendedChanges.some((change) => change.kind === "consolidate_duplicate" && change.confirmationRequired)).toBe(true);
  });

  it("applies only explicitly approved safe operations and preserves the source", () => {
    const resume = deterministicFallback(fixture.request);
    resume.summary = ["A deliberately long existing summary with enough repeated context to trigger deterministic review without adding any new factual claim to the candidate record or changing the meaning of the source resume in this test. It repeats broad engineering positioning, project context, collaboration language, technical interests, and outcome language that already appear elsewhere in the document."];
    resume.projects[0].technologies = ["React", "PostgreSQL"];
    resume.projects[0].url = "https://example.com/project";
    resume.projects[0].repositoryUrl = "https://github.com/example/project";
    const saved = {
      id: "resume-explicit-approval",
      jobId: fixture.job.id,
      name: "Explicit approval",
      kind: "tailored" as const,
      templateId: "mir-standard",
      contentJson: resume,
      resumeDocumentJson: {} as never,
      validationJson: [],
      status: "draft" as const,
      lastExportPath: "",
      parentResumeVersionId: "",
      baseResumeVersionId: "",
      generationProvider: "deterministic" as const,
      generationModel: "",
      promptVersion: "",
      promptVersionsJson: {
        jobAnalysis: "",
        planning: "",
        resumeGeneration: "",
        repair: "",
        bulletRegeneration: "",
        bulletShortening: "",
        careerIntake: "",
        careerCopilot: "",
        resumeReview: "",
      },
      layoutProfileId: "general-software-engineer" as const,
      templateSettingsJson: defaultSettings.templateSettings,
      generationMetadataJson: {
        calls: [],
        repairAttempted: false,
        repairSucceeded: false,
        deterministicFallbackUsed: true,
        compactionLog: [],
      },
      deterministicBaselineJson: null,
      createdAt: "",
      updatedAt: "",
    };
    const review = buildResumeReview({
      resumeVersion: saved,
      reviewMode: "general",
      profile: fixture.profile,
      facts: fixture.facts,
      items: fixture.items,
      skills: fixture.skills,
      provider: "local-deterministic",
      model: "resume-review-v2",
      pdfPageCount: 1,
    });
    const grouping = review.recommendedChanges.find((change) => change.kind === "categorize_skills")!;
    const summaryRemoval = review.recommendedChanges.find((change) => change.kind === "remove_summary")!;
    const sourceSnapshot = structuredClone(resume);
    const result = applySafeResumeImprovements({
      resume,
      proposals: review.recommendedChanges,
      facts: fixture.facts,
      skills: fixture.skills,
      templateSettings: defaultSettings.templateSettings,
      approvedProposalIds: [grouping.id],
    });

    expect(result.appliedProposalIds).toEqual([grouping.id]);
    expect(result.skippedProposalIds).toContain(summaryRemoval.id);
    expect(result.resume.summary).toEqual(resume.summary);
    expect(result.resume.skillGroups?.flatMap((group) => group.skills).sort()).toEqual([...resume.skills].sort());
    expect(result.resume.projects[0]).toEqual(expect.objectContaining({
      technologies: ["React", "PostgreSQL"],
      url: "https://example.com/project",
      repositoryUrl: "https://github.com/example/project",
    }));
    expect(resume).toEqual(sourceSnapshot);

    const groupedReview = buildResumeReview({
      resumeVersion: { ...saved, contentJson: result.resume },
      reviewMode: "general",
      profile: fixture.profile,
      facts: fixture.facts,
      items: fixture.items,
      skills: fixture.skills,
      provider: "local-deterministic",
      model: "resume-review-v2",
      pdfPageCount: 1,
    });
    expect(groupedReview.recommendedChanges.some((change) => change.kind === "categorize_skills")).toBe(false);
  });

  it("persists reviews and creates an optimized child without mutating the master", async () => {
    const resume = deterministicFallback(fixture.request);
    resume.summary = ["Extra summary text that the optimizer may remove for one-page fit."];
    resume.projects[0].technologies = ["React", "PostgreSQL"];
    resume.projects[0].url = "https://example.com/project";
    resume.projects[0].repositoryUrl = "https://github.com/example/project";
    resume.projects[0].bullets.push({
      ...structuredClone(resume.projects[0].bullets[0]),
      id: "duplicate-optimizer-bullet",
      relevanceScore: 1,
    });
    const master = await fixture.repository.saveResumeVersion({
      jobId: fixture.job.id,
      name: "Master Review Test",
      kind: "master",
      contentJson: resume,
      validationJson: validateResumeClaims({
        resume,
        facts: fixture.facts,
        items: fixture.items,
        skills: fixture.skills,
        profile: fixture.profile,
      }),
    });
    const originalReview = await reviewResumeVersion({
      repository: fixture.repository,
      resumeVersionId: master.id,
      jobId: fixture.job.id,
      reviewMode: "job_specific",
      pdfPageCount: 2,
    });
    const approvedProposalIds = originalReview.recommendedChanges
      .filter((change) => change.safety === "safe" && change.safeToAutoApply && !change.confirmationRequired)
      .map((change) => change.id);
    const result = await improveResumeFromReview({
      repository: fixture.repository,
      reviewId: originalReview.id,
      approvedProposalIds,
      renderPdf: async () => ({ pageCount: 1 }),
    });
    expect(result.improvedResume.parentResumeVersionId).toBe(master.id);
    expect(result.improvedResume.kind).toBe("tailored");
    expect(result.run.pdfStatus).toBe("rendered");
    expect(result.run.appliedProposalIds.length).toBeGreaterThan(0);
    expect(result.improvedReview.overallScore).toBeGreaterThanOrEqual(originalReview.overallScore);
    expect(result.improvedResume.contentJson.projects[0]).toEqual(expect.objectContaining({
      technologies: ["React", "PostgreSQL"],
      url: "https://example.com/project",
      repositoryUrl: "https://github.com/example/project",
    }));
    expect(result.improvedResume.deterministicBaselineJson?.projects[0]).toEqual(expect.objectContaining({
      technologies: ["React", "PostgreSQL"],
      url: "https://example.com/project",
      repositoryUrl: "https://github.com/example/project",
    }));
    expect((await fixture.repository.getResumeVersion(master.id))?.contentJson).toEqual(resume);
    expect(await fixture.repository.getResumeReview(result.improvedReview.id)).not.toBeNull();
    expect(await fixture.repository.listResumeImprovementRuns(master.id)).toHaveLength(1);
  });

  it("rejects a stale review before creating a child", async () => {
    const resume = deterministicFallback(fixture.request);
    resume.summary = ["A long reviewable summary that exists solely to provide an approved safe removal proposal while the stale review protection is exercised against a newer saved resume version."];
    const source = await fixture.repository.saveResumeVersion({
      jobId: fixture.job.id,
      name: "Stale review source",
      kind: "master",
      contentJson: resume,
    });
    const review = await reviewResumeVersion({
      repository: fixture.repository,
      resumeVersionId: source.id,
      reviewMode: "general",
      pdfPageCount: 1,
    });
    const staleReview = await fixture.repository.saveResumeReview({ ...review, generatedAt: "2000-01-01T00:00:00.000Z" });
    await expect(improveResumeFromReview({
      repository: fixture.repository,
      reviewId: staleReview.id,
      approvedProposalIds: staleReview.recommendedChanges.filter((change) => change.safety === "safe").map((change) => change.id),
    })).rejects.toThrow("changed after this review");
    expect((await fixture.repository.listResumeVersions()).filter((item) => item.parentResumeVersionId === source.id)).toHaveLength(0);
  });

  it("stops after negligible improvement and never exceeds two automatic passes", async () => {
    const resume = deterministicFallback(fixture.request);
    resume.summary = ["A long summary with repeated context included so the deterministic optimizer has at least one explicitly approvable safe removal operation available for its first pass."];
    const source = await fixture.repository.saveResumeVersion({
      jobId: fixture.job.id,
      name: "Pass limit source",
      kind: "master",
      contentJson: resume,
    });
    const review = await reviewResumeVersion({
      repository: fixture.repository,
      resumeVersionId: source.id,
      reviewMode: "general",
      pdfPageCount: 1,
    });
    const first = await improveResumeFromReview({
      repository: fixture.repository,
      reviewId: review.id,
      approvedProposalIds: review.recommendedChanges.filter((change) => change.safety === "safe").map((change) => change.id),
      renderPdf: async () => ({ pageCount: 1 }),
    });
    const negligible = await fixture.repository.saveResumeReview({
      ...first.improvedReview,
      overallScore: first.originalReview.overallScore + 1,
    });
    await expect(improveResumeFromReview({
      repository: fixture.repository,
      reviewId: negligible.id,
      approvedProposalIds: negligible.recommendedChanges.filter((change) => change.safety === "safe").map((change) => change.id),
    })).rejects.toThrow("negligible improvement");

    await fixture.repository.saveResumeImprovementRun({ ...first.run, passNumber: 2 });
    await expect(improveResumeFromReview({
      repository: fixture.repository,
      reviewId: negligible.id,
      approvedProposalIds: negligible.recommendedChanges.filter((change) => change.safety === "safe").map((change) => change.id),
    })).rejects.toThrow("stops after two automatic passes");
  });
});
