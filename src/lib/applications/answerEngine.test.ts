import { describe, expect, it } from "vitest";
import type {
  CandidateClaim,
  CareerFact,
  CareerItem,
  DetectedApplicationField,
  Profile,
  SensitiveAnswer,
  Skill,
} from "../../types/domain";
import { generateApplicationAnswers } from "./answerEngine";
import { normalizeDetectedField } from "./questionClassifier";
import { legacyJobAutomationFields } from "../job-automation/normalize";

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
      ...legacyJobAutomationFields({ roleTitle: "Full-stack Engineer", rawDescription: "React TypeScript full-stack product engineering role.", sourceUrl: "", timestamp: "2026-07-16T00:00:00.000Z" }),
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
  it.each([{ verificationStatus: "inferred" as const, locked: true, requiresReview: false }, { verificationStatus: "verified" as const, locked: false, requiresReview: false }, { verificationStatus: "verified" as const, locked: true, requiresReview: true }])("leaves uncertain sensitive answers unresolved", flags => {
    const result=answer([normalizeDetectedField({id:"auth",label:"Are you authorized to work in the United States?"})],[{id:"sensitive",key:"current_work_authorization",label:"Authorization",value:true,createdAt:"",updatedAt:"",...flags}])[0];
    expect(result).toMatchObject({answer:"",answerSource:"user_required",requiresReview:true});
  });
  it.each([
    ["Are you authorized to work in Canada?", "current_work_authorization"],
    ["Employment authorization within Germany", "current_work_authorization"],
    ["Will you require sponsorship to work in Canada?", "future_sponsorship"],
  ] as const)("does not reuse an unscoped legal flag for %s", (label, key) => {
    const result = answer([normalizeDetectedField({ id: "legal", label })], [{ id: "legal-answer", key, label: "Global saved flag", value: key === "future_sponsorship" ? false : true, verificationStatus: "verified", locked: true, requiresReview: false, createdAt: "", updatedAt: "" }])[0];
    expect(result).toMatchObject({ answer: "", answerSource: "user_required", requiresReview: true });
  });
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


describe("explicit address evidence", () => {
  const field = (type: "country" | "postal_code" | "work_authorization" | "future_sponsorship" | "city") => ({ ...normalizeDetectedField({ id: type, label: type }), normalizedQuestionType: type });
  const claim = (value: string, category = "country", status: CandidateClaim["verificationStatus"] = "verified"): CandidateClaim => ({ id: value, category, value, verificationStatus: status, evidenceIds: [], locked: false, createdAt: "", updatedAt: "" });
  const resolve = (changes: Partial<Profile>, claims: CandidateClaim[] = [], type: Parameters<typeof field>[0] = "country") => generateApplicationAnswers({ fields: [field(type)], job: null, profile: { ...profile, city: "", region: "", ...changes }, careerItems: [], careerFacts: [], skills: [], claims, sensitiveAnswers: [], stories: [], approvedAnswers: [], preferences: null })[0];
  it.each([{ city: "Paris" }, { region: "Illinois" }, { city: "Springfield", region: "Illinois" }, { phone: "+1 312 555 0123" }, { city: "London", phone: "+44 20 1234 5678" }])("never guesses country from %j", (changes) => { expect(resolve(changes)).toMatchObject({ answer: "", answerSource: "user_required", requiresReview: true }); });
  it("preserves explicit international country and requires review for conflicts", () => {
    expect(resolve({ city: "Paris" }, [claim("France")])).toMatchObject({ answer: "France", requiresReview: false });
    expect(resolve({}, [claim("Canada"), claim("France")]).requiresReview).toBe(true);
    expect(resolve({}, [claim("France", "country", "inferred")]).answer).toBe("");
  });
  it.each(["Country where authorized to work", "Country of employment", "Country of visa eligibility", "Country requiring sponsorship", "Country of work permit"])("never substitutes address country for %s", label => {
    const result = generateApplicationAnswers({ fields: [{ ...field("country"), label }], job: null, profile, careerItems: [], careerFacts: [], skills: [], claims: [claim("Canada")], sensitiveAnswers: [], stories: [], approvedAnswers: [], preferences: null })[0];
    expect(result).toMatchObject({ answer: "", answerSource: "user_required", requiresReview: true });
  });
  it("uses field metadata to prevent an address country from filling a code field", () => {
    const result = generateApplicationAnswers({ fields: [{ ...field("country"), label: "Code", elementName: "phoneCountryCode" }], job: null, profile, careerItems: [], careerFacts: [], skills: [], claims: [claim("Canada")], sensitiveAnswers: [], stories: [], approvedAnswers: [], preferences: null })[0];
    expect(result).toMatchObject({ answer: "", answerSource: "user_required", requiresReview: true });
  });
  it.each(["Country of citizenship", "Nationality", "Immigration status", "Country of birth", "Phone country code", "Country code", "Country of origin", "Country-code", "Country-of-birth", "Phone-country-code", "Dialling code", "Telephone country prefix"])("never repurposes address evidence for %s", label => {
    const result=generateApplicationAnswers({fields:[normalizeDetectedField({id:"legal",label})],job:null,profile,careerItems:[],careerFacts:[],skills:[],claims:[claim("United States")],sensitiveAnswers:[],stories:[],approvedAnswers:[],preferences:null})[0];expect(result).toMatchObject({answer:"",requiresReview:true});
  });
  it("does not infer postal code or legal answers from location", () => {
    for (const type of ["postal_code", "work_authorization", "future_sponsorship"] as const) expect(resolve({ city: "Paris", region: "France" }, [], type)).toMatchObject({ answer: "", requiresReview: true });
    expect(resolve({ city: "Paris" }, [claim("Toronto", "city")], "city").requiresReview).toBe(true);
  });
});
