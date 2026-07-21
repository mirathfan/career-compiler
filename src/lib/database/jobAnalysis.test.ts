import { describe, expect, it } from "vitest";
import type { JobAnalysis } from "../../types/domain";
import { normalizeStoredJobAnalysis } from "./jobAnalysis";

const analysis: JobAnalysis = {
  inferredCompany: "Confido",
  inferredRoleTitle: "New Grad Software Engineer",
  seniority: "early-career / new grad",
  roleCategories: ["full-stack engineering"],
  requiredSkills: ["programming fundamentals"],
  preferredSkills: ["APIs"],
  responsibilities: ["Build and ship product features across the stack"],
  domainKeywords: ["financial workflows"],
  candidateSignals: ["end-to-end product ownership"],
  locationRequirements: ["New York City office"],
  workAuthorizationLanguage: "Application asks about work authorization.",
  summary: "Early-career full-stack role.",
};

describe("normalizeStoredJobAnalysis", () => {
  it("accepts the current direct analysis shape", () => {
    expect(normalizeStoredJobAnalysis(analysis)).toEqual(analysis);
  });

  it("unwraps legacy analysis and snapshot envelopes", () => {
    expect(normalizeStoredJobAnalysis({ analysis, snapshot: { source: "saved-job-import" } })).toEqual(analysis);
  });

  it("rejects malformed stored analysis instead of leaking a partial object", () => {
    expect(normalizeStoredJobAnalysis({ analysis: { inferredCompany: "Confido" } })).toBeNull();
  });
});
