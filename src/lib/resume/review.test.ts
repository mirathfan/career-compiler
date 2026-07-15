import { beforeEach, describe, expect, it } from "vitest";
import { createGenerationFixture } from "../../test/generationFixture";
import { useResumeEditorStore } from "../../stores/resumeEditorStore";
import { deterministicFallback } from "../ai/generationPipeline";
import { compactResumeForOnePage } from "./compaction";
import { semanticResumeDiff } from "./diff";
import { calculateResumeQuality } from "./quality";
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
});
