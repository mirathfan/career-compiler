import type { ApplicationQuestionType, DetectedApplicationField } from "../../types/domain";

export interface FieldClassificationInput {
  id?: string;
  label?: string;
  nearbyText?: string;
  placeholder?: string;
  elementName?: string;
  elementId?: string;
  ariaLabel?: string;
  inputType?: string;
  detectedFieldType?: string;
  options?: string[];
  pageHeading?: string;
  atsPlatform?: string;
}

export interface FieldClassification {
  normalizedQuestionType: ApplicationQuestionType;
  confidence: number;
  reasons: string[];
}

export const applicationQuestionTypes: ApplicationQuestionType[] = [
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "postal_code",
  "country",
  "linkedin",
  "github",
  "portfolio",
  "education",
  "degree",
  "graduation_date",
  "current_company",
  "current_title",
  "years_of_experience",
  "skill_experience",
  "work_authorization",
  "future_sponsorship",
  "salary_expectation",
  "start_date",
  "relocation",
  "travel",
  "remote_preference",
  "security_clearance",
  "why_company",
  "why_role",
  "candidate_fit",
  "relevant_project",
  "technical_challenge",
  "behavioral_story",
  "additional_information",
  "demographic",
  "legal_attestation",
  "unknown",
];

const deterministicRules: Array<{
  type: ApplicationQuestionType;
  confidence: number;
  patterns: RegExp[];
  optionPatterns?: RegExp[];
}> = [
  { type: "email", confidence: 0.99, patterns: [/\bemail\b/i, /e-mail/i] },
  { type: "phone", confidence: 0.98, patterns: [/\bphone\b/i, /mobile/i, /telephone/i] },
  { type: "first_name", confidence: 0.98, patterns: [/\bfirst\s*name\b/i, /\bgiven\s*name\b/i] },
  { type: "last_name", confidence: 0.98, patterns: [/\blast\s*name\b/i, /\bfamily\s*name\b/i, /\bsurname\b/i] },
  { type: "full_name", confidence: 0.96, patterns: [/\bfull\s*name\b/i, /^name$/i, /\blegal\s*name\b/i] },
  { type: "linkedin", confidence: 0.97, patterns: [/linkedin/i] },
  { type: "github", confidence: 0.97, patterns: [/github/i, /\bgit\s*hub\b/i] },
  { type: "portfolio", confidence: 0.94, patterns: [/portfolio/i, /personal\s*(?:site|website)/i, /\bwebsite\b/i] },
  { type: "address", confidence: 0.9, patterns: [/\bstreet\s*address\b/i, /\baddress\b/i] },
  { type: "city", confidence: 0.92, patterns: [/^city$/i, /\bcity\b/i] },
  { type: "state", confidence: 0.88, patterns: [/^state$/i, /\bprovince\b/i, /\bregion\b/i] },
  { type: "postal_code", confidence: 0.92, patterns: [/\bzip\b/i, /\bpostal\b/i] },
  { type: "country", confidence: 0.92, patterns: [/\bcountry\b/i] },
  { type: "education", confidence: 0.84, patterns: [/\beducation\b/i, /\bschool\b/i, /\buniversity\b/i, /\bcollege\b/i] },
  { type: "degree", confidence: 0.9, patterns: [/\bdegree\b/i, /\bmajor\b/i, /\bfield\s*of\s*study\b/i] },
  { type: "graduation_date", confidence: 0.9, patterns: [/\bgraduat(?:e|ion)\b/i, /\bgrad\s*date\b/i] },
  { type: "current_company", confidence: 0.9, patterns: [/\bcurrent\s*(?:company|employer)\b/i, /\bemployer\b/i] },
  { type: "current_title", confidence: 0.9, patterns: [/\bcurrent\s*(?:title|role|position)\b/i, /\bjob\s*title\b/i] },
  { type: "years_of_experience", confidence: 0.88, patterns: [/\byears?.{0,18}experience\b/i, /\bexperience.{0,18}years?\b/i] },
  { type: "skill_experience", confidence: 0.78, patterns: [/\bexperience\s+(?:with|in)\b/i, /\bproficien/i, /\bskill\b/i] },
  { type: "work_authorization", confidence: 0.96, patterns: [/\b(?:work|employment).{0,30}authori[sz]ation\b/i, /\bauthorized\s+to\s+work\b/i] },
  { type: "future_sponsorship", confidence: 0.96, patterns: [/\bsponsorship\b/i, /\bvisa\b/i, /\bnow\s+or\s+in\s+the\s+future\b/i] },
  { type: "salary_expectation", confidence: 0.94, patterns: [/\bsalary\b/i, /\bcompensation\b/i, /\bpay\s*(?:range|expectation)/i] },
  { type: "start_date", confidence: 0.9, patterns: [/\bstart\s*date\b/i, /\bavailable\s*(?:from|to\s*start)\b/i, /\bavailability\b/i] },
  { type: "relocation", confidence: 0.93, patterns: [/\brelocat/i, /\bmove\s+to\b/i] },
  { type: "travel", confidence: 0.9, patterns: [/\btravel\b/i] },
  { type: "remote_preference", confidence: 0.84, patterns: [/\bremote\b/i, /\bhybrid\b/i, /\bon[-\s]?site\b/i] },
  { type: "security_clearance", confidence: 0.95, patterns: [/\bsecurity\s*clearance\b/i, /\bclearance\b/i] },
  { type: "why_company", confidence: 0.82, patterns: [/\bwhy\s+(?:this\s+)?company\b/i, /\bwhy\s+.*(?:join|work)\b/i] },
  { type: "why_role", confidence: 0.82, patterns: [/\bwhy\s+(?:this\s+)?role\b/i, /\bwhy\s+.*position\b/i] },
  { type: "candidate_fit", confidence: 0.8, patterns: [/\b(?:good|great|strong)\s+fit\b/i, /\bwhy\s+you\b/i, /\bqualified\b/i] },
  { type: "relevant_project", confidence: 0.82, patterns: [/\bproject\b/i, /\bportfolio\s+piece\b/i] },
  { type: "technical_challenge", confidence: 0.84, patterns: [/\btechnical\s+challenge\b/i, /\bdifficult\s+(?:bug|problem)\b/i] },
  { type: "behavioral_story", confidence: 0.78, patterns: [/\btell\s+me\s+about\s+a\s+time\b/i, /\bdescribe\s+a\s+time\b/i, /\bconflict\b/i, /\bleadership\b/i] },
  { type: "additional_information", confidence: 0.8, patterns: [/\badditional\s+information\b/i, /\banything\s+else\b/i, /\bcover\s+letter\b/i] },
  {
    type: "demographic",
    confidence: 0.96,
    patterns: [/\bgender\b/i, /\brace\b/i, /\bethnicity\b/i, /\bveteran\b/i, /\bdisability\b/i],
    optionPatterns: [/decline/i, /prefer\s+not/i],
  },
  { type: "legal_attestation", confidence: 0.94, patterns: [/\bcertif/i, /\battest/i, /\bterms\b/i, /\bprivacy\b/i, /\bbackground\s*check\b/i] },
];

function compact(value: FieldClassificationInput) {
  return [
    value.label,
    value.nearbyText,
    value.placeholder,
    value.elementName,
    value.elementId,
    value.ariaLabel,
    value.inputType,
    value.detectedFieldType,
    value.pageHeading,
    value.atsPlatform,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/[_-]+/g, " ");
}

function optionText(options: string[] | undefined) {
  return (options ?? []).join(" ");
}

export function classifyApplicationField(input: FieldClassificationInput): FieldClassification {
  const text = compact(input);
  const options = optionText(input.options);
  if (input.inputType === "email") {
    return { normalizedQuestionType: "email", confidence: 0.99, reasons: ["input type is email"] };
  }
  if (input.inputType === "tel") {
    return { normalizedQuestionType: "phone", confidence: 0.98, reasons: ["input type is tel"] };
  }
  if (input.inputType === "file" && /resume|cv/i.test(text)) {
    return { normalizedQuestionType: "unknown", confidence: 0.88, reasons: ["resume upload field"] };
  }

  for (const rule of deterministicRules) {
    const pattern = rule.patterns.find((candidate) => candidate.test(text));
    const optionPattern = rule.optionPatterns?.find((candidate) => candidate.test(options));
    if (pattern || optionPattern) {
      return {
        normalizedQuestionType: rule.type,
        confidence: optionPattern ? Math.min(0.98, rule.confidence + 0.02) : rule.confidence,
        reasons: [pattern ? `matched ${pattern.source}` : "", optionPattern ? "matched dropdown options" : ""].filter(Boolean),
      };
    }
  }
  return { normalizedQuestionType: "unknown", confidence: 0.35, reasons: ["no deterministic mapping matched"] };
}

export function normalizeDetectedField(input: FieldClassificationInput): DetectedApplicationField {
  const classification = classifyApplicationField(input);
  return {
    id: input.id ?? `${input.elementId || input.elementName || input.label || "field"}:${classification.normalizedQuestionType}`,
    label: input.label ?? "",
    nearbyText: input.nearbyText ?? "",
    placeholder: input.placeholder ?? "",
    elementName: input.elementName ?? "",
    elementId: input.elementId ?? "",
    ariaLabel: input.ariaLabel ?? "",
    inputType: input.inputType ?? "text",
    detectedFieldType: input.detectedFieldType ?? input.inputType ?? "text",
    options: input.options ?? [],
    pageHeading: input.pageHeading ?? "",
    atsPlatform: input.atsPlatform ?? "",
    normalizedQuestionType: classification.normalizedQuestionType,
    classificationConfidence: classification.confidence,
  };
}
