import type {
  CareerFact,
  CareerItem,
  Profile,
  ResumeGenerationRequest,
  Skill,
  TailoredResume,
  ValidationIssue,
} from "../../types/domain";
import { formatDateRange, unique } from "../utils";

const numberPattern = /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?/g;
const commonTechnologyTerms = [
  "AWS",
  "Azure",
  "GCP",
  "GraphQL",
  "Kubernetes",
  "MongoDB",
  "Redis",
  "Terraform",
  "DynamoDB",
  "Kafka",
  "Angular",
  "Vue",
  "C#",
  "C++",
  ".NET",
];

function normalizeNumber(value: string) {
  return value.replace(/,/g, "").trim();
}

function normalizeWords(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

export function allResumeBullets(resume: TailoredResume) {
  return [...resume.projects, ...resume.experience].flatMap((section) =>
    section.bullets.map((bullet) => ({ bullet, section })),
  );
}

export function extractNumericTokens(text: string) {
  return text.match(numberPattern)?.map(normalizeNumber) ?? [];
}

function issue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  options: Partial<Pick<ValidationIssue, "bulletId" | "section" | "relatedFactIds">> = {},
): ValidationIssue {
  return {
    severity,
    code,
    message,
    relatedFactIds: options.relatedFactIds ?? [],
    bulletId: options.bulletId,
    section: options.section,
    canApprove: severity === "warning",
  };
}

function jaccardSimilarity(left: string, right: string) {
  const leftWords = new Set(normalizeWords(left).filter((word) => word.length > 2));
  const rightWords = new Set(normalizeWords(right).filter((word) => word.length > 2));
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size;
  return intersection / union;
}

function containsTerm(text: string, term: string) {
  const normalizedText = ` ${text.toLowerCase()} `;
  const normalizedTerm = term.toLowerCase();
  return normalizedText.includes(normalizedTerm);
}

function validateSectionFields(
  section: TailoredResume["projects"][number],
  stored: CareerItem,
): ValidationIssue[] {
  const fields: Array<keyof Pick<CareerItem, "title" | "organization" | "location" | "startDate" | "endDate" | "isCurrent">> = [
    "title",
    "organization",
    "location",
    "startDate",
    "endDate",
    "isCurrent",
  ];
  return fields.flatMap((field) =>
    section[field] === stored[field]
      ? []
      : [
          issue(
            "error",
            field === "startDate" || field === "endDate" || field === "isCurrent"
              ? "date_mutation"
              : "career_item_mutation",
            `${section.title || stored.title} changed the stored ${field} value.`,
            { section: stored.title },
          ),
        ],
  );
}

export function validateResumeClaims({
  resume,
  facts,
  items,
  skills,
  profile: _profile,
  generationRequest,
}: {
  resume: TailoredResume;
  facts: CareerFact[];
  items: CareerItem[];
  skills: Skill[];
  profile: Profile | null;
  generationRequest?: ResumeGenerationRequest;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const allowedFactIds = generationRequest
    ? new Set(generationRequest.selectedFacts.map((fact) => fact.factId))
    : new Set(facts.filter((fact) => fact.enabled && fact.evidenceStatus !== "prohibited").map((fact) => fact.id));
  const allowedItemIds = generationRequest
    ? new Set(generationRequest.selectedCareerItems.map((item) => item.careerItemId))
    : new Set(items.filter((item) => item.enabled).map((item) => item.id));
  const approvedSkillNames = generationRequest
    ? new Set(generationRequest.approvedSkills.map((skill) => skill.name))
    : new Set(skills.filter((skill) => skill.enabled).map((skill) => skill.name));
  const selectedSupportText = generationRequest
    ? generationRequest.selectedFacts.flatMap((fact) => [fact.statement, ...fact.skillTags]).join(" ")
    : facts.filter((fact) => allowedFactIds.has(fact.id)).flatMap((fact) => [fact.statement, ...fact.skillTags]).join(" ");
  const technologyTerms = unique([
    ...commonTechnologyTerms,
    ...skills.map((skill) => skill.name),
    ...facts.flatMap((fact) => fact.skillTags),
  ]).filter((term) => term.length > 1);

  if (generationRequest) {
    const expectedHeader = {
      fullName: generationRequest.candidateProfile.name,
      headline: generationRequest.candidateProfile.headline,
      location: generationRequest.candidateProfile.location,
      email: generationRequest.candidateProfile.email,
      phone: generationRequest.candidateProfile.phone,
      portfolioUrl: generationRequest.candidateProfile.portfolioUrl,
      linkedInUrl: generationRequest.candidateProfile.linkedInUrl,
      githubUrl: generationRequest.candidateProfile.githubUrl,
      workAuthorizationNote: generationRequest.candidateProfile.workAuthorizationNote ?? "",
    };
    for (const [field, expected] of Object.entries(expectedHeader)) {
      if (resume.header[field as keyof typeof expectedHeader] !== expected) {
        issues.push(issue("error", "profile_mutation", `Resume header changed the saved ${field} value.`));
      }
    }
  }

  for (const { bullet, section } of allResumeBullets(resume).filter(({ bullet }) => bullet.included)) {
    if (bullet.sourceFactIds.length === 0) {
      issues.push(
        issue("error", "missing_source_fact", "Every generated bullet must cite at least one source fact.", {
          bulletId: bullet.id,
        }),
      );
      continue;
    }

    const referencedFacts = bullet.sourceFactIds
      .map((id) => factById.get(id))
      .filter((fact): fact is CareerFact => Boolean(fact));

    for (const factId of bullet.sourceFactIds) {
      const fact = factById.get(factId);
      if (!fact) {
        issues.push(
          issue("error", "missing_source_fact", `Bullet references missing source fact ${factId}.`, {
            bulletId: bullet.id,
            relatedFactIds: [factId],
          }),
        );
        continue;
      }
      if (!allowedFactIds.has(factId)) {
        issues.push(
          issue("error", "unselected_source_fact", "Bullet references a fact that was not selected for generation.", {
            bulletId: bullet.id,
            relatedFactIds: [factId],
          }),
        );
      }
      if (fact.careerItemId !== section.careerItemId) {
        issues.push(
          issue("error", "source_item_mismatch", "Bullet cites a fact from a different career item.", {
            bulletId: bullet.id,
            relatedFactIds: [fact.id],
          }),
        );
      }
      if (!fact.enabled) {
        issues.push(issue("error", "disabled_source_fact", "Bullet references a disabled fact.", {
          bulletId: bullet.id,
          relatedFactIds: [fact.id],
        }));
      }
      if (fact.evidenceStatus === "prohibited") {
        issues.push(issue("error", "prohibited_source_fact", "Bullet references a prohibited fact.", {
          bulletId: bullet.id,
          relatedFactIds: [fact.id],
        }));
      }
      if (fact.evidenceStatus === "needs_review") {
        issues.push(issue("warning", "source_needs_review", "Bullet references a fact that needs review.", {
          bulletId: bullet.id,
          relatedFactIds: [fact.id],
        }));
      }
    }

    const supportText = referencedFacts
      .flatMap((fact) => [fact.statement, ...fact.metricTokens])
      .join(" ");
    const supportedNumbers = new Set(extractNumericTokens(supportText));
    for (const token of extractNumericTokens(bullet.text)) {
      if (!supportedNumbers.has(token)) {
        issues.push(
          issue(
            "error",
            token.endsWith("%") ? "unsupported_percentage" : "unsupported_number",
            token.endsWith("%")
              ? `Unsupported percentage ${token} is not present in cited facts.`
              : `Numeric token ${token} is not present in cited facts.`,
            { bulletId: bullet.id, relatedFactIds: bullet.sourceFactIds },
          ),
        );
      }
    }

    for (const technology of technologyTerms) {
      if (
        containsTerm(bullet.text, technology) &&
        !containsTerm(selectedSupportText, technology) &&
        !approvedSkillNames.has(technology)
      ) {
        issues.push(
          issue("error", "unsupported_technology", `Technology "${technology}" is not in selected facts or approved skills.`, {
            bulletId: bullet.id,
            relatedFactIds: bullet.sourceFactIds,
          }),
        );
      }
    }

    const wordCount = normalizeWords(bullet.text).length;
    if (wordCount > 32) {
      issues.push(issue("warning", "long_bullet", `Bullet has ${wordCount} words; 32 or fewer is recommended.`, {
        bulletId: bullet.id,
        relatedFactIds: bullet.sourceFactIds,
      }));
    }
    if (/\b(helped with|worked on|responsible for|various tasks|multiple things)\b/i.test(bullet.text) || wordCount < 6) {
      issues.push(issue("warning", "vague_bullet", "Bullet is too vague to communicate concrete ownership or implementation.", {
        bulletId: bullet.id,
        relatedFactIds: bullet.sourceFactIds,
      }));
    }
    const item = itemById.get(section.careerItemId);
    if (item && wordCount < 10 && !technologyTerms.some((term) => containsTerm(bullet.text, term))) {
      issues.push(issue("warning", "missing_project_context", "Short bullet may not provide enough project context.", {
        bulletId: bullet.id,
        relatedFactIds: bullet.sourceFactIds,
      }));
    }
  }

  for (const skill of resume.skills) {
    if (!approvedSkillNames.has(skill)) {
      issues.push(issue("error", "invented_skill", `Rendered skill "${skill}" is not in the approved skills list.`, {
        section: "skills",
      }));
    }
  }

  for (const section of [...resume.projects, ...resume.experience]) {
    const stored = itemById.get(section.careerItemId);
    if (!stored || !allowedItemIds.has(section.careerItemId)) {
      issues.push(issue("error", "invented_career_item", `Resume section "${section.title}" is not an allowed career item.`, {
        section: section.title,
      }));
      continue;
    }
    if (!stored.enabled) {
      issues.push(issue("error", "disabled_career_item", `Resume section "${section.title}" is disabled.`, {
        section: section.title,
      }));
    }
    issues.push(...validateSectionFields(section, stored));
  }

  for (const education of resume.education) {
    const stored = itemById.get(education.careerItemId);
    if (!stored || stored.type !== "education" || !allowedItemIds.has(education.careerItemId)) {
      issues.push(issue("error", "invented_career_item", `Education entry "${education.organization}" is not allowed.`, {
        section: "education",
      }));
      continue;
    }
    const expectedDate = formatDateRange(stored.startDate, stored.endDate, stored.isCurrent);
    if (
      education.title !== stored.title ||
      education.organization !== stored.organization ||
      education.location !== stored.location
    ) {
      issues.push(issue("error", "career_item_mutation", `Education entry changed stored school or degree details.`, {
        section: "education",
      }));
    }
    if (education.dateLabel !== expectedDate) {
      issues.push(issue("error", "date_mutation", `Education entry changed the stored date.`, {
        section: "education",
      }));
    }
  }

  const included = allResumeBullets(resume).filter(({ bullet }) => bullet.included);
  for (let leftIndex = 0; leftIndex < included.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < included.length; rightIndex += 1) {
      const left = included[leftIndex].bullet;
      const right = included[rightIndex].bullet;
      const similarity = jaccardSimilarity(left.text, right.text);
      if (similarity >= 0.82) {
        issues.push(
          issue(
            similarity >= 0.95 ? "error" : "warning",
            "duplicate_bullet",
            `Bullets ${left.id} and ${right.id} repeat substantially the same content.`,
            { bulletId: right.id, relatedFactIds: unique([...left.sourceFactIds, ...right.sourceFactIds]) },
          ),
        );
      }
    }
  }

  const openingPhrases = new Map<string, string[]>();
  for (const { bullet } of included) {
    const phrase = normalizeWords(bullet.text).slice(0, 2).join(" ");
    if (!phrase) continue;
    openingPhrases.set(phrase, [...(openingPhrases.get(phrase) ?? []), bullet.id]);
  }
  for (const [phrase, bulletIds] of openingPhrases) {
    if (bulletIds.length >= 3) {
      issues.push(issue("warning", "repeated_action_phrase", `Opening phrase "${phrase}" is repeated ${bulletIds.length} times.`, {
        bulletId: bulletIds[0],
      }));
    }
  }

  if (generationRequest) {
    const renderedItemIds = new Set(
      [...resume.projects, ...resume.experience].map((section) => section.careerItemId),
    );
    for (const lockedItemId of generationRequest.constraints.lockedCareerItemIds) {
      if (!renderedItemIds.has(lockedItemId)) {
        issues.push(issue("error", "locked_item_removed", `Locked career item ${lockedItemId} was removed.`));
      }
    }
    const renderedFactIds = new Set(included.flatMap(({ bullet }) => bullet.sourceFactIds));
    for (const lockedFactId of generationRequest.constraints.lockedFactIds) {
      if (!renderedFactIds.has(lockedFactId)) {
        issues.push(issue("error", "locked_fact_removed", `Locked fact ${lockedFactId} was removed.`, {
          relatedFactIds: [lockedFactId],
        }));
      }
    }
  }

  return issues;
}

export function hasBlockingValidationErrors(issues: ValidationIssue[]) {
  return issues.some((validationIssue) => validationIssue.severity === "error");
}
