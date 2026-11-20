// Increment when answer authorization semantics change; old handoffs fail closed.
export const APPLICATION_ANSWER_POLICY_VERSION = "cc-application-answers-v2";
import type {
  ApplicationQuestionType,
  ApprovedApplicationAnswer,
  CandidateClaim,
  CandidatePreferences,
  CareerFact,
  CareerItem,
  CareerStory,
  DetectedApplicationField,
  GeneratedApplicationAnswer,
  Job,
  Profile,
  SensitiveAnswer,
  SensitiveAnswerKey,
  Skill,
} from "../../types/domain";

export interface ApplicationAnswerEngineInput {
  fields: DetectedApplicationField[];
  job: Job | null;
  profile: Profile | null;
  careerItems: CareerItem[];
  careerFacts: CareerFact[];
  skills: Skill[];
  claims: CandidateClaim[];
  sensitiveAnswers: SensitiveAnswer[];
  stories: CareerStory[];
  approvedAnswers: ApprovedApplicationAnswer[];
  preferences: CandidatePreferences | null;
}

const allowedClaimStatuses = new Set(["verified", "user_confirmed"]);
const allowedFactStatuses = new Set(["verified", "user_provided"]);
const longFormTypes = new Set<ApplicationQuestionType>([
  "why_company",
  "why_role",
  "candidate_fit",
  "relevant_project",
  "technical_challenge",
  "behavioral_story",
  "additional_information",
]);

const sensitiveQuestionMap: Partial<Record<ApplicationQuestionType, SensitiveAnswerKey>> = {
  work_authorization: "current_work_authorization",
  future_sponsorship: "future_sponsorship",
  salary_expectation: "salary_expectations",
  start_date: "start_date",
  relocation: "relocation",
  travel: "willingness_to_travel",
  security_clearance: "security_clearance",
  demographic: "demographic_selections",
  legal_attestation: "background_check_consent",
};

function asText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(", ");
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.at(-1) ?? "" : "",
  };
}

function profileValue(type: ApplicationQuestionType, profile: Profile | null, items: CareerItem[]) {
  if (!profile) return "";
  const name = splitName(profile.fullName);
  const education = items.find((item) => item.type === "education" && item.enabled);
  const currentEmployment = items.find((item) => item.type === "employment" && item.enabled && item.isCurrent);
  switch (type) {
    case "first_name":
      return name.firstName;
    case "last_name":
      return name.lastName;
    case "full_name":
      return profile.fullName;
    case "email":
      return profile.email;
    case "phone":
      return profile.phone;
    case "city":
      return profile.city;
    case "state":
      return profile.region;
    case "linkedin":
      return profile.linkedInUrl;
    case "github":
      return profile.githubUrl;
    case "portfolio":
      return profile.portfolioUrl;
    case "education":
      return education ? [education.organization, education.title].filter(Boolean).join(", ") : "";
    case "degree":
      return education?.title ?? "";
    case "graduation_date":
      return education?.endDate ?? "";
    case "current_company":
      return currentEmployment?.organization ?? "";
    case "current_title":
      return currentEmployment?.title ?? "";
    case "country":
      return ""; // Only an explicit reviewed country claim may resolve this field.
    case "work_authorization":
      return profile.workAuthorizationNote;
    default:
      return "";
  }
}

function fieldLimit(field: DetectedApplicationField) {
  const text = `${field.label} ${field.nearbyText} ${field.placeholder}`;
  const charMatch = /\b(\d{2,5})\s*(?:characters|chars)\b/i.exec(text);
  if (charMatch) return { characters: Number(charMatch[1]) };
  const wordMatch = /\b(\d{1,4})\s*words?\b/i.exec(text);
  if (wordMatch) return { words: Number(wordMatch[1]) };
  return {};
}

function fitAnswer(text: string, field: DetectedApplicationField) {
  const limit = fieldLimit(field);
  const warnings: string[] = [];
  let answer = text.trim();
  if (limit.words && answer.split(/\s+/).filter(Boolean).length > limit.words) {
    answer = answer.split(/\s+/).filter(Boolean).slice(0, limit.words).join(" ");
    warnings.push(`Answer was shortened to ${limit.words} words.`);
  }
  if (limit.characters && answer.length > limit.characters) {
    answer = answer.slice(0, limit.characters).replace(/\s+\S*$/, "").trim();
    warnings.push(`Answer was shortened to ${limit.characters} characters.`);
  }
  return { answer, warnings };
}

function emptyAnswer(field: DetectedApplicationField, warning: string): GeneratedApplicationAnswer {
  return {
    fieldId: field.id,
    normalizedQuestionType: field.normalizedQuestionType,
    answer: "",
    answerSource: "user_required",
    confidence: 0,
    requiresReview: true,
    claimIds: [],
    storyIds: [],
    warnings: [warning],
    reasoningSummary: warning,
  };
}

function fixedAnswer(field: DetectedApplicationField, answer: string, claimIds: string[] = []): GeneratedApplicationAnswer {
  const fitted = fitAnswer(answer, field);
  return {
    fieldId: field.id,
    normalizedQuestionType: field.normalizedQuestionType,
    answer: fitted.answer,
    answerSource: "fixed_profile",
    confidence: 0.96,
    requiresReview: fitted.warnings.length > 0,
    claimIds,
    storyIds: [],
    warnings: fitted.warnings,
    reasoningSummary: "Used a verified fixed profile field.",
  };
}

function matchApprovedAnswer(
  field: DetectedApplicationField,
  approvedAnswers: ApprovedApplicationAnswer[],
  job: Job | null,
) {
  const jobTerms = `${job?.roleTitle ?? ""} ${job?.analysisJson?.roleCategories.join(" ") ?? ""}`.toLowerCase();
  return approvedAnswers
    .filter((answer) => answer.approvedByUser && !answer.doNotReuse)
    .filter((answer) => answer.normalizedQuestionType === field.normalizedQuestionType)
    .sort((left, right) => {
      const leftRole = left.applicableRoleFamilies.some((role) => jobTerms.includes(role.toLowerCase())) ? 1 : 0;
      const rightRole = right.applicableRoleFamilies.some((role) => jobTerms.includes(role.toLowerCase())) ? 1 : 0;
      return rightRole - leftRole || right.useCount - left.useCount || right.updatedAt.localeCompare(left.updatedAt);
    })[0];
}

function relevantFacts(job: Job | null, facts: CareerFact[], items: CareerItem[], skills: Skill[]) {
  const enabledSkills = new Set(skills.filter((skill) => skill.enabled).map((skill) => skill.name.toLowerCase()));
  const jobText = [
    job?.rawDescription,
    job?.analysisJson?.requiredSkills.join(" "),
    job?.analysisJson?.preferredSkills.join(" "),
    job?.analysisJson?.responsibilities.join(" "),
    job?.analysisJson?.roleCategories.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const itemById = new Map(items.map((item) => [item.id, item]));
  return facts
    .filter((fact) => fact.enabled && allowedFactStatuses.has(fact.evidenceStatus))
    .map((fact) => {
      const skillScore = fact.skillTags.filter((tag) => jobText.includes(tag.toLowerCase())).length * 2;
      const roleScore = fact.roleTags.filter((tag) => jobText.includes(tag.toLowerCase())).length * 2;
      const approvedSkillScore = fact.skillTags.filter((tag) => enabledSkills.has(tag.toLowerCase())).length;
      const item = itemById.get(fact.careerItemId);
      return { fact, item, score: fact.importance + skillScore + roleScore + approvedSkillScore };
    })
    .filter((entry) => entry.item?.enabled)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function relevantStory(field: DetectedApplicationField, stories: CareerStory[], job: Job | null) {
  const text = `${field.label} ${field.nearbyText} ${job?.rawDescription ?? ""}`.toLowerCase();
  return stories
    .filter((story) => story.approved && !story.archived && allowedClaimStatuses.has(story.verificationStatus))
    .map((story) => {
      const score = [
        ...story.tags,
        ...story.competencies,
        ...story.technologies,
      ].filter((tag) => text.includes(tag.toLowerCase())).length;
      return { story, score };
    })
    .sort((a, b) => b.score - a.score || b.story.updatedAt.localeCompare(a.story.updatedAt))[0]?.story;
}

function longFormAnswer(
  field: DetectedApplicationField,
  input: ApplicationAnswerEngineInput,
): GeneratedApplicationAnswer {
  const approved = matchApprovedAnswer(field, input.approvedAnswers, input.job);
  if (approved && input.preferences?.reuseApprovedAnswers !== false) {
    const fitted = fitAnswer(approved.answer, field);
    return {
      fieldId: field.id,
      normalizedQuestionType: field.normalizedQuestionType,
      answer: fitted.answer,
      answerSource: "approved_answer",
      confidence: fitted.warnings.length ? 0.78 : 0.88,
      requiresReview: longFormTypes.has(field.normalizedQuestionType) || fitted.warnings.length > 0,
      claimIds: approved.sourceClaimIds,
      storyIds: approved.sourceStoryIds,
      warnings: ["Review for company and role fit before submitting.", ...fitted.warnings],
      reasoningSummary: "Used a previously approved answer as reusable context.",
    };
  }

  const story = relevantStory(field, input.stories, input.job);
  const facts = relevantFacts(input.job, input.careerFacts, input.careerItems, input.skills);
  if (!story && facts.length === 0) {
    return emptyAnswer(field, "No verified or user-confirmed evidence is available for this question.");
  }

  const company = input.job?.company || input.job?.analysisJson?.inferredCompany || "this company";
  const role = input.job?.roleTitle || input.job?.analysisJson?.inferredRoleTitle || "this role";
  const evidenceText = facts
    .slice(0, 2)
    .map(({ fact, item }) => `${item?.title ?? "A project"}: ${fact.statement}`)
    .join(" ");
  const storyText = story
    ? `${story.title}: ${[story.situation, story.problem, story.actions.join(" "), story.result].filter(Boolean).join(" ")}`
    : "";
  const prefix =
    field.normalizedQuestionType === "why_company"
      ? `I am interested in ${company} because the role emphasizes work that matches my verified experience.`
      : field.normalizedQuestionType === "why_role"
        ? `I am a strong fit for ${role} because I have shipped related work with concrete evidence.`
        : "A relevant example from my background is grounded in reviewed CareerCompiler evidence.";
  const fitted = fitAnswer([prefix, storyText, evidenceText].filter(Boolean).join(" "), field);
  return {
    fieldId: field.id,
    normalizedQuestionType: field.normalizedQuestionType,
    answer: fitted.answer,
    answerSource: "tailored_ai",
    confidence: fitted.warnings.length ? 0.66 : 0.72,
    requiresReview: true,
    claimIds: facts.map(({ fact }) => fact.id),
    storyIds: story ? [story.id] : [],
    warnings: ["Newly tailored long-form answer requires review.", ...fitted.warnings],
    reasoningSummary: `Used ${[story?.title, ...facts.map(({ item }) => item?.title)].filter(Boolean).join(", ")}.`,
  };
}

function answerSensitive(field: DetectedApplicationField, answers: SensitiveAnswer[]) {
  const key = sensitiveQuestionMap[field.normalizedQuestionType];
  if (!key) return null;
  const saved = answers.find((answer) => answer.key === key);
  if (!saved || !allowedClaimStatuses.has(saved.verificationStatus) || !saved.locked || saved.requiresReview || !asText(saved.value)) {
    return emptyAnswer(field, "Sensitive or legal answer is not configured; user input is required.");
  }
  const fitted = fitAnswer(asText(saved.value), field);
  return {
    fieldId: field.id,
    normalizedQuestionType: field.normalizedQuestionType,
    answer: fitted.answer,
    answerSource: saved.locked ? "locked_sensitive" : "fixed_profile",
    confidence: saved.locked && fitted.warnings.length === 0 ? 0.97 : 0.86,
    requiresReview: saved.requiresReview || !saved.locked || fitted.warnings.length > 0,
    claimIds: [saved.id],
    storyIds: [],
    warnings: saved.locked
      ? fitted.warnings
      : ["Sensitive answer is saved but not locked; review before use.", ...fitted.warnings],
    reasoningSummary: saved.locked
      ? "Used a locked sensitive answer exactly as saved."
      : "Used a saved sensitive answer that still requires review.",
  } satisfies GeneratedApplicationAnswer;
}

export function generateApplicationAnswers(input: ApplicationAnswerEngineInput): GeneratedApplicationAnswer[] {
  return input.fields.map((field) => {
    const question = [field.label, field.nearbyText, field.placeholder, field.elementName, field.elementId, field.ariaLabel].filter(Boolean).join(" ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
    if (/\b(citizenship|citizen|nationality|passport|immigration status|country of birth|birth country|country of origin|residency status|residence status)\b/i.test(question)
        || /\b(?:country|dial(?:l?ing)?|calling)\s+(?:code|prefix)\b/i.test(question)
        || /(?:phone|telephone).*(?:country|dial(?:l?ing)?|calling)\s*(?:code|prefix)|(?:country|dial(?:l?ing)?|calling)\s*(?:code|prefix).*(?:phone|telephone)/i.test(question)) {
      return emptyAnswer(field, "This question needs specific explicit evidence; address or full-phone fields cannot answer it.");
    }
    if (field.normalizedQuestionType === "country") {
      if (/\b(?:work|employment|authori[sz]\w*|eligib\w*|visa|sponsor\w*|permit)\b/i.test(question)) {
        return emptyAnswer(field, "A work or legal jurisdiction needs specific reviewed evidence; an address-country claim cannot answer it.");
      }
      const claims = input.claims.filter((claim) => allowedClaimStatuses.has(claim.verificationStatus) && claim.category.trim().toLowerCase() === "country" && typeof claim.value === "string" && claim.value.trim());
      const countries = new Set(claims.map((claim) => String(claim.value).trim().toLowerCase()));
      if (countries.size !== 1) return emptyAnswer(field, countries.size ? "Conflicting explicit country evidence; review required." : "Explicit country evidence is missing; review required.");
      return fixedAnswer(field, String(claims[0].value).trim(), claims.map((claim) => claim.id));
    }
    const legalQuestion = question.replace(/\bin\s+(?:the\s+)?future\b/ig, "future");
    if (["work_authorization", "future_sponsorship"].includes(field.normalizedQuestionType)
        && /\b(?:work|employment|authori[sz](?:ed|ation)|sponsorship|visa|permit).{0,40}\b(?:in|within)\b/i.test(legalQuestion)) {
      return emptyAnswer(field, "Jurisdiction-specific legal questions need a specific reviewed answer; an unscoped saved flag is insufficient.");
    }
    const sensitive = answerSensitive(field, input.sensitiveAnswers);
    if (sensitive) return sensitive;

    if (["city", "state", "postal_code", "phone"].includes(field.normalizedQuestionType)) {
      const fixedLocation = profileValue(field.normalizedQuestionType, input.profile, input.careerItems);
      const reviewed = input.claims.filter((claim) => allowedClaimStatuses.has(claim.verificationStatus) && claim.category.trim().toLowerCase() === field.normalizedQuestionType.replaceAll("_", " ") && typeof claim.value === "string" && claim.value.trim());
      const values = new Set([fixedLocation, ...reviewed.map((claim) => String(claim.value))].filter(Boolean).map((value) => value.trim().toLowerCase()));
      if (values.size !== 1) return emptyAnswer(field, values.size ? "Conflicting location/contact evidence; review required." : "Explicit location/contact evidence missing.");
      return fixedAnswer(field, fixedLocation || String(reviewed[0].value).trim(), reviewed.map((claim) => claim.id));
    }
    const fixed = profileValue(field.normalizedQuestionType, input.profile, input.careerItems);
    if (fixed) return fixedAnswer(field, fixed, input.profile ? [input.profile.id] : []);

    const matchingClaim = input.claims.find(
      (claim) =>
        allowedClaimStatuses.has(claim.verificationStatus) &&
        claim.category.toLowerCase() === field.normalizedQuestionType.replaceAll("_", " "),
    );
    if (matchingClaim && asText(matchingClaim.value)) {
      return fixedAnswer(field, asText(matchingClaim.value), [matchingClaim.id]);
    }

    if (longFormTypes.has(field.normalizedQuestionType)) {
      return longFormAnswer(field, input);
    }

    if (field.normalizedQuestionType === "skill_experience") {
      const facts = relevantFacts(input.job, input.careerFacts, input.careerItems, input.skills);
      if (facts.length) {
        const fitted = fitAnswer(facts.map(({ fact }) => fact.statement).join(" "), field);
        return {
          fieldId: field.id,
          normalizedQuestionType: field.normalizedQuestionType,
          answer: fitted.answer,
          answerSource: "tailored_ai",
          confidence: 0.68,
          requiresReview: true,
          claimIds: facts.map(({ fact }) => fact.id),
          storyIds: [],
          warnings: ["Skill experience answer was assembled from reviewed facts; confirm wording.", ...fitted.warnings],
          reasoningSummary: "Used the strongest matching verified/user-provided facts.",
        };
      }
    }

    return emptyAnswer(field, "No safe stored answer is available for this field.");
  });
}
