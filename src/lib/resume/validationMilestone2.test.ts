import { beforeEach, describe, expect, it } from "vitest";
import type { TailoredResume } from "../../types/domain";
import { createGenerationFixture } from "../../test/generationFixture";
import { deterministicFallback } from "../ai/generationPipeline";
import { validateResumeClaims } from "./validation";

describe("Milestone 2 resume validation", () => {
  let fixture: Awaited<ReturnType<typeof createGenerationFixture>>;
  let resume: TailoredResume;

  beforeEach(async () => {
    fixture = await createGenerationFixture();
    resume = deterministicFallback(fixture.request);
  });

  function validate() {
    return validateResumeClaims({
      resume,
      facts: fixture.facts,
      items: fixture.items,
      skills: fixture.skills,
      profile: fixture.profile,
      generationRequest: fixture.request,
    });
  }

  it("rejects an unsupported numeric claim", () => {
    resume.projects[0].bullets[0].text += " Served 1234 customers.";
    expect(validate().some((issue) => issue.code === "unsupported_number" && issue.severity === "error")).toBe(true);
  });

  it("rejects an unsupported percentage", () => {
    resume.projects[0].bullets[0].text += " Improved latency by 75%.";
    expect(validate().some((issue) => issue.code === "unsupported_percentage")).toBe(true);
  });

  it("rejects an invented skill", () => {
    resume.skills.push("Kubernetes");
    expect(validate().some((issue) => issue.code === "invented_skill")).toBe(true);
  });

  it("rejects an invented project", () => {
    resume.projects.push({
      ...structuredClone(resume.projects[0]),
      careerItemId: "invented-project",
      title: "Invented Search Engine",
    });
    expect(validate().some((issue) => issue.code === "invented_career_item")).toBe(true);
  });

  it("rejects a mutated stored date", () => {
    resume.education[0].dateLabel = "June 2027";
    expect(validate().some((issue) => issue.code === "date_mutation")).toBe(true);
  });

  it("detects duplicate bullets", () => {
    const bullets = resume.projects.flatMap((section) => section.bullets);
    expect(bullets.length).toBeGreaterThan(1);
    bullets[1].text = bullets[0].text;
    expect(validate().some((issue) => issue.code === "duplicate_bullet")).toBe(true);
  });

  it("warns when a bullet is excessively long", () => {
    resume.projects[0].bullets[0].text = `${resume.projects[0].bullets[0].text} ${Array(35).fill("implementation").join(" ")}`;
    const long = validate().find((issue) => issue.code === "long_bullet");
    expect(long?.severity).toBe("warning");
    expect(long?.canApprove).toBe(true);
  });
});
