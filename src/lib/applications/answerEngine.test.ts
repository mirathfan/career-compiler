import { describe, expect, it } from "vitest";
import type {
  CareerFact,
  CareerItem,
  DetectedApplicationField,
  Profile,
  SensitiveAnswer,
  Skill,
} from "../../types/domain";
import { generateApplicationAnswers } from "./answerEngine";
import { normalizeDetectedField } from "./questionClassifier";

const profile: Profile = {
  id: "profile-1",
  fullName: "Mir Athfan Ali",
  headline: "Software engineer",
  city: "Chicago",
  region: "Illinois",
  email: "mir@example.com",
  phone: "555-0100",
  portfolioUrl: "https://example.com",
  linkedInUrl: "https://linkedin.com/in/mir",
  githubUrl: "https://github.com/mir",
  workAuthorizationNote: "",
  updatedAt: "2026-07-16T00:00:00.000Z",
};

const project: CareerItem = {
  id: "project-1",
  type: "project",
  title: "CareerCompiler",
  organization: "Personal",
  location: "Chicago",
  startDate: "2025",
  endDate: "2026",
  isCurrent: false,
  shortDescription: "Evidence-grounded resume compiler.",
  url: "",
  repositoryUrl: "",
  displayOrder: 10,
  enabled: true,
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
};

const fact: CareerFact = {
  id: "fact-1",
  careerItemId: "project-1",
  statement: "Built a Tauri, React, TypeScript, Rust, and SQLite app with 76 automated tests.",
  evidenceStatus: "verified",
  sourceNote: "Reviewed project notes",
  sourceType: "manually_verified",
  sourceReference: "local evidence",
  verificationDate: "2026-07-16",
  lastReviewedDate: "2026-07-16",
  notes: "",
  skillTags: ["Tauri", "React", "TypeScript", "Rust", "SQLite"],
  roleTags: ["full-stack engineer"],
  metricTokens: ["76"],
  importance: 5,
  enabled: true,
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
};

const skill: Skill = {
  id: "skill-1",
  name: "TypeScript",
  category: "Languages",
  proficiencyNote: "",
  enabled: true,
};

function answer(fields: DetectedApplicationField[], sensitiveAnswers: SensitiveAnswer[] = []) {
  return generateApplicationAnswers({
    fields,
    job: {
      id: "job-1",
      company: "Loop",
      roleTitle: "Full-stack Engineer",
      sourceUrl: "",
      rawDescription: "React TypeScript full-stack product engineering role.",
      analysisJson: null,
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    },
    profile,
    careerItems: [project],
    careerFacts: [fact],
    skills: [skill],
    claims: [],
    sensitiveAnswers,
    stories: [],
    approvedAnswers: [],
    preferences: null,
  });
}

describe("application answer engine", () => {
  it("fills fixed profile fields with high confidence", () => {
    const [email] = answer([normalizeDetectedField({ id: "email", label: "Email", inputType: "email" })]);
    expect(email.answer).toBe("mir@example.com");
    expect(email.answerSource).toBe("fixed_profile");
    expect(email.requiresReview).toBe(false);
  });

  it("does not infer sensitive legal answers", () => {
    const [workAuth] = answer([normalizeDetectedField({ id: "auth", label: "Are you authorized to work in the United States?" })]);
    expect(workAuth.answerSource).toBe("user_required");
    expect(workAuth.requiresReview).toBe(true);
  });

  it("uses locked sensitive answers exactly as saved", () => {
    const [sponsorship] = answer(
      [normalizeDetectedField({ id: "sponsor", label: "Will you require sponsorship now or in the future?" })],
      [{
        id: "sensitive-1",
        key: "future_sponsorship",
        label: "Future sponsorship",
        value: "No",
        verificationStatus: "user_confirmed",
        locked: true,
        requiresReview: false,
        createdAt: "2026-07-16T00:00:00.000Z",
        updatedAt: "2026-07-16T00:00:00.000Z",
      }],
    );
    expect(sponsorship.answer).toBe("No");
    expect(sponsorship.answerSource).toBe("locked_sensitive");
    expect(sponsorship.requiresReview).toBe(false);
  });

  it("grounds long-form answers in supplied facts and requires review", () => {
    const [fit] = answer([normalizeDetectedField({ id: "fit", label: "Why are you a strong fit for this role?" })]);
    expect(String(fit.answer)).toContain("76 automated tests");
    expect(String(fit.answer)).not.toContain("99");
    expect(fit.claimIds).toEqual(["fact-1"]);
    expect(fit.requiresReview).toBe(true);
  });
});
