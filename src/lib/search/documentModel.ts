import type {
  ApplicationRecord,
  ApplicationFieldRecord,
  ApprovedApplicationAnswer,
  ApprovedBulletVariant,
  CandidateClaim,
  CareerCopilotThread,
  CareerFact,
  CareerImportRecord,
  CareerItem,
  CareerStory,
  EvaluationSummary,
  Job,
  Profile,
  ResumeArchive,
  ResumeFavorite,
  ResumeVersion,
  SearchDocument,
  SearchEntityType,
  SensitiveAnswer,
  Skill,
} from "../../types/domain";
import { allResumeBullets } from "../resume/validation";
import { contentHash, normalizeSearchText } from "./text";

export interface SearchCorpusInput {
  profile: Profile | null;
  careerItems: CareerItem[];
  careerFacts: CareerFact[];
  skills: Skill[];
  candidateClaims?: CandidateClaim[];
  sensitiveAnswers?: SensitiveAnswer[];
  careerStories?: CareerStory[];
  approvedApplicationAnswers?: ApprovedApplicationAnswer[];
  jobs: Job[];
  resumes: ResumeVersion[];
  approvedVariants: ApprovedBulletVariant[];
  applications: ApplicationRecord[];
  applicationFields?: ApplicationFieldRecord[];
  evaluations: EvaluationSummary[];
  careerImports: CareerImportRecord[];
  copilotThreads: CareerCopilotThread[];
  resumeFavorites: ResumeFavorite[];
  resumeArchives: ResumeArchive[];
}

function doc(
  entityType: SearchEntityType,
  entityId: string,
  title: string,
  text: string,
  metadataJson: Record<string, unknown>,
  updatedAt: string,
  parentEntityType: SearchEntityType | "" = "",
  parentEntityId = "",
): SearchDocument {
  const normalizedText = normalizeSearchText(text);
  return {
    id: `${entityType}:${entityId}:${parentEntityType}:${parentEntityId}`,
    entityType,
    entityId,
    parentEntityType,
    parentEntityId,
    title,
    normalizedText,
    metadataJson,
    contentHash: contentHash(`${title}\n${normalizedText}\n${JSON.stringify(metadataJson)}`),
    updatedAt,
  };
}

function itemText(item: CareerItem) {
  return [item.title, item.organization, item.location, item.shortDescription, item.repositoryUrl, item.url].filter(Boolean).join(". ");
}

function resumeText(resume: ResumeVersion, job: Job | undefined) {
  const bullets = allResumeBullets(resume.contentJson).map(({ bullet }) => bullet.text);
  return [
    resume.name,
    job?.company,
    job?.roleTitle,
    resume.contentJson.summary.join(" "),
    resume.contentJson.skills.join(" "),
    bullets.join(" "),
  ].filter(Boolean).join(". ");
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

export function buildSearchDocuments(input: SearchCorpusInput): SearchDocument[] {
  const now = new Date().toISOString();
  const itemById = new Map(input.careerItems.map((item) => [item.id, item]));
  const jobById = new Map(input.jobs.map((job) => [job.id, job]));
  const favoriteIds = new Set(input.resumeFavorites.map((favorite) => favorite.resumeVersionId));
  const archivedIds = new Set(input.resumeArchives.map((archive) => archive.resumeVersionId));
  const submittedResumeIds = new Set(input.applications.flatMap((application) => [application.resumeVersionId, application.submittedResumeVersionId].filter(Boolean)));
  const documents: SearchDocument[] = [];

  if (input.profile) {
    documents.push(doc("profile", input.profile.id, input.profile.fullName, [input.profile.fullName, input.profile.headline, input.profile.city, input.profile.region, input.profile.portfolioUrl, input.profile.linkedInUrl, input.profile.githubUrl, input.profile.workAuthorizationNote].filter(Boolean).join(". "), { kind: "candidate_profile" }, input.profile.updatedAt));
  }

  for (const item of input.careerItems) {
    documents.push(doc("career_item", item.id, item.title, itemText(item), {
      careerItemType: item.type,
      organization: item.organization,
      roleCategories: [],
      skills: [],
      enabled: item.enabled,
    }, item.updatedAt));
  }

  for (const fact of input.careerFacts) {
    const item = itemById.get(fact.careerItemId);
    documents.push(doc("career_fact", fact.id, item ? `${item.title}: fact` : "Career fact", [item?.title, item?.organization, fact.statement, fact.skillTags.join(" "), fact.roleTags.join(" "), fact.metricTokens.join(" ")].filter(Boolean).join(". "), {
      careerItemId: fact.careerItemId,
      careerItemTitle: item?.title ?? "",
      evidenceStatus: fact.evidenceStatus,
      skills: fact.skillTags,
      roleCategories: fact.roleTags,
      enabled: fact.enabled,
      importance: fact.importance,
    }, fact.updatedAt, "career_item", fact.careerItemId));
  }

  for (const skill of input.skills) {
    documents.push(doc("skill", skill.id, skill.name, [skill.name, skill.category, skill.proficiencyNote].join(". "), {
      skills: [skill.name],
      category: skill.category,
      enabled: skill.enabled,
    }, now));
  }

  for (const claim of input.candidateClaims ?? []) {
    const valueText = typeof claim.value === "string" ? claim.value : JSON.stringify(claim.value);
    documents.push(doc("candidate_claim", claim.id, claim.category, [claim.category, valueText].filter(Boolean).join(". "), {
      verificationStatus: claim.verificationStatus,
      evidenceIds: claim.evidenceIds,
      locked: claim.locked,
    }, claim.updatedAt));
  }

  for (const answer of input.sensitiveAnswers ?? []) {
    documents.push(doc("sensitive_answer", answer.id, answer.label, [answer.label, answer.key, answer.verificationStatus].join(". "), {
      key: answer.key,
      verificationStatus: answer.verificationStatus,
      locked: answer.locked,
      requiresReview: answer.requiresReview,
      valueStored: Boolean(String(answer.value ?? "").trim()),
    }, answer.updatedAt));
  }

  for (const story of input.careerStories ?? []) {
    documents.push(doc("career_story", story.id, story.title, [
      story.title,
      story.tags.join(" "),
      story.competencies.join(" "),
      story.situation,
      story.problem,
      story.actions.join(" "),
      story.result,
      story.metrics.join(" "),
      story.technologies.join(" "),
    ].filter(Boolean).join(". "), {
      tags: story.tags,
      skills: story.technologies,
      competencies: story.competencies,
      sourceFactIds: story.evidenceIds,
      verificationStatus: story.verificationStatus,
      approved: story.approved,
      archived: story.archived,
    }, story.updatedAt));
  }

  for (const answer of input.approvedApplicationAnswers ?? []) {
    documents.push(doc("approved_application_answer", answer.id, answer.originalQuestion, [
      answer.originalQuestion,
      answer.normalizedQuestionType,
      answer.answer,
      answer.applicableRoleFamilies.join(" "),
      answer.applicableIndustries.join(" "),
      answer.applicableSkills.join(" "),
      answer.tone,
    ].filter(Boolean).join(". "), {
      normalizedQuestionType: answer.normalizedQuestionType,
      roleCategories: answer.applicableRoleFamilies,
      skills: answer.applicableSkills,
      sourceStoryIds: answer.sourceStoryIds,
      sourceClaimIds: answer.sourceClaimIds,
      approvedByUser: answer.approvedByUser,
      doNotReuse: answer.doNotReuse,
      useCount: answer.useCount,
    }, answer.updatedAt));
  }

  for (const variant of input.approvedVariants) {
    const item = itemById.get(variant.careerItemId);
    documents.push(doc("approved_bullet_variant", variant.id, item ? `${item.title}: approved variant` : "Approved bullet variant", [item?.title, variant.text, variant.skillTags.join(" "), variant.roleCategories.join(" ")].filter(Boolean).join(". "), {
      careerItemId: variant.careerItemId,
      sourceFactIds: variant.sourceFactIds,
      skills: variant.skillTags,
      roleCategories: variant.roleCategories,
      approvalState: "approved",
      targetJobId: variant.targetJobId,
    }, variant.approvedAt, "career_item", variant.careerItemId));
  }

  for (const job of input.jobs) {
    const analysis = job.analysisJson;
    documents.push(doc("job", job.id, `${job.company || analysis?.inferredCompany || "Saved job"} ${job.roleTitle || analysis?.inferredRoleTitle || ""}`.trim(), [job.company, job.roleTitle, job.rawDescription, analysis?.summary, analysis?.requiredSkills.join(" "), analysis?.preferredSkills.join(" "), analysis?.responsibilities.join(" ")].filter(Boolean).join(". "), {
      company: job.company || analysis?.inferredCompany || "",
      role: job.roleTitle || analysis?.inferredRoleTitle || "",
      roleCategories: analysis?.roleCategories ?? [],
      skills: unique([...(analysis?.requiredSkills ?? []), ...(analysis?.preferredSkills ?? [])]),
    }, job.updatedAt));

    for (const [kind, values] of Object.entries({
      required: analysis?.requiredSkills ?? [],
      preferred: analysis?.preferredSkills ?? [],
      responsibility: analysis?.responsibilities ?? [],
      domain: analysis?.domainKeywords ?? [],
    })) {
      values.forEach((value, index) => {
        documents.push(doc("job_requirement", `${job.id}:${kind}:${index}`, `${job.company || "Job"} ${kind} requirement`, value, {
          company: job.company,
          role: job.roleTitle,
          requirementType: kind,
          skills: kind === "required" || kind === "preferred" ? [value] : [],
          roleCategories: analysis?.roleCategories ?? [],
        }, job.updatedAt, "job", job.id));
      });
    }
  }

  for (const resume of input.resumes) {
    const job = jobById.get(resume.jobId);
    const bullets = allResumeBullets(resume.contentJson);
    const factIds = unique(bullets.flatMap(({ bullet }) => bullet.sourceFactIds));
    const itemIds = unique(bullets.map(({ section }) => section.careerItemId));
    const validationState = resume.validationJson.some((issue) => issue.severity === "error") ? "errors" : "valid";
    documents.push(doc("resume", resume.id, resume.name, resumeText(resume, job), {
      company: job?.company ?? "",
      role: job?.roleTitle ?? "",
      skills: resume.contentJson.skills,
      careerItemIds: itemIds,
      sourceFactIds: factIds,
      validationState,
      status: resume.status,
      provider: resume.generationProvider,
      model: resume.generationModel,
      promptVersion: resume.promptVersion,
      submitted: submittedResumeIds.has(resume.id),
      favorite: favoriteIds.has(resume.id),
      archived: archivedIds.has(resume.id),
      parentResumeVersionId: resume.parentResumeVersionId,
    }, resume.updatedAt, "job", resume.jobId));

    for (const { bullet, section } of bullets) {
      documents.push(doc("resume_bullet", `${resume.id}:${bullet.id}`, `${resume.name}: ${section.title}`, bullet.text, {
        resumeVersionId: resume.id,
        careerItemId: section.careerItemId,
        sourceFactIds: bullet.sourceFactIds,
        skills: bullet.keywordsAddressed,
        approvalState: bullet.approved ? "approved" : bullet.rejected ? "rejected" : "draft",
        validationState,
        submitted: submittedResumeIds.has(resume.id),
      }, resume.updatedAt, "resume", resume.id));
    }
  }

  for (const application of input.applications) {
    documents.push(doc("application", application.id, `${application.company} ${application.role}`.trim(), [application.company, application.role, application.status, application.notes, application.nextAction, application.recruiter, application.hiringManager, application.referral, application.source, application.salaryRange, application.locationType, application.sponsorshipNotes].filter(Boolean).join(". "), {
      company: application.company,
      role: application.role,
      applicationStatus: application.status,
      jobId: application.jobId,
      resumeVersionId: application.resumeVersionId,
      submittedResumeVersionId: application.submittedResumeVersionId,
      submitted: Boolean(application.submittedResumeVersionId || application.submittedPdfPath),
      followUpDate: application.followUpDate,
    }, application.updatedAt, application.jobId ? "job" : "", application.jobId));
    if (application.notes.trim()) {
      documents.push(doc("application_note", `${application.id}:notes`, `${application.company} notes`, application.notes, {
        company: application.company,
        role: application.role,
        applicationStatus: application.status,
      }, application.updatedAt, "application", application.id));
    }
  }

  for (const field of input.applicationFields ?? []) {
    documents.push(doc("application_field", field.id, field.originalQuestion, [
      field.originalQuestion,
      field.normalizedQuestionType,
      field.answerSource,
      field.warnings.join(" "),
      field.reasoningSummary,
    ].filter(Boolean).join(". "), {
      applicationId: field.applicationId,
      normalizedQuestionType: field.normalizedQuestionType,
      answerSource: field.answerSource,
      confidence: field.confidence,
      requiresReview: field.requiresReview,
      userEdited: field.userEdited,
      approved: field.approved,
      claimIds: field.claimIds,
      storyIds: field.storyIds,
    }, field.updatedAt, "application", field.applicationId));
  }

  for (const evaluation of input.evaluations) {
    documents.push(doc("evaluation_summary", evaluation.id, evaluation.fixtureName, [evaluation.fixtureName, evaluation.mode, evaluation.provider, evaluation.roleProfileId, evaluation.metrics.missingRequiredSkills.join(" "), evaluation.validationIssues.map((issue) => issue.message).join(" ")].join(". "), {
      roleCategories: [evaluation.roleProfileId],
      skills: evaluation.metrics.requiredSkillsRepresented,
      provider: evaluation.provider,
      model: evaluation.model,
      validationState: evaluation.metrics.validationSuccess ? "valid" : "errors",
    }, evaluation.createdAt));
  }

  for (const careerImport of input.careerImports) {
    documents.push(doc("career_import", careerImport.id, careerImport.sourceTitle, [careerImport.sourceTitle, careerImport.sourceType, careerImport.provider, careerImport.model, careerImport.promptVersion].join(". "), {
      sourceType: careerImport.sourceType,
      provider: careerImport.provider,
      model: careerImport.model,
    }, careerImport.createdAt));
  }

  for (const thread of input.copilotThreads.filter((item) => item.summary.trim())) {
    documents.push(doc("career_copilot_summary", thread.id, thread.title, thread.summary, {
      activeContextType: thread.activeContextType,
      activeContextId: thread.activeContextId,
    }, thread.updatedAt));
  }

  return documents;
}
