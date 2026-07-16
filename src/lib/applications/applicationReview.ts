import type {
  ApplicationFieldRecord,
  ApplicationRecord,
  DetectedApplicationField,
  Job,
} from "../../types/domain";
import type { AppRepository } from "../database/repository";
import { generateApplicationAnswers } from "./answerEngine";

export interface PrepareApplicationReviewInput {
  repository: AppRepository;
  application: ApplicationRecord;
  job: Job | null;
  fields: DetectedApplicationField[];
}

export interface PrepareApplicationReviewResult {
  application: ApplicationRecord;
  fields: ApplicationFieldRecord[];
}

export async function prepareApplicationReview({
  repository,
  application,
  job,
  fields,
}: PrepareApplicationReviewInput): Promise<PrepareApplicationReviewResult> {
  const [
    profile,
    careerItems,
    careerFacts,
    skills,
    claims,
    sensitiveAnswers,
    stories,
    approvedAnswers,
    preferences,
  ] = await Promise.all([
    repository.getProfile(),
    repository.listCareerItems(),
    repository.listCareerFacts(),
    repository.listSkills(),
    repository.listCandidateClaims(),
    repository.listSensitiveAnswers(),
    repository.listCareerStories(),
    repository.listApprovedApplicationAnswers(),
    repository.getCandidatePreferences(),
  ]);

  const answers = generateApplicationAnswers({
    fields,
    job,
    profile,
    careerItems,
    careerFacts,
    skills,
    claims,
    sensitiveAnswers,
    stories,
    approvedAnswers,
    preferences,
  });

  const savedFields = await Promise.all(
    answers.map((answer) => {
      const field = fields.find((candidate) => candidate.id === answer.fieldId);
      return repository.saveApplicationField({
        applicationId: application.id,
        originalQuestion: field?.label || field?.nearbyText || answer.normalizedQuestionType,
        normalizedQuestionType: answer.normalizedQuestionType,
        detectedFieldType: field?.detectedFieldType ?? "text",
        generatedAnswer: answer.answer,
        finalAnswer: answer.answer,
        answerSource: answer.answerSource,
        confidence: answer.confidence,
        requiresReview: answer.requiresReview,
        userEdited: false,
        approved: !answer.requiresReview && answer.confidence >= 0.85,
        claimIds: answer.claimIds,
        storyIds: answer.storyIds,
        warnings: answer.warnings,
        reasoningSummary: answer.reasoningSummary,
      });
    }),
  );

  const updatedApplication = await repository.saveApplication({
    ...application,
    status: savedFields.some((field) => field.requiresReview) ? "preparing" : "ready",
    automationMode: "autofill_manual_submit",
    atsPlatform: fields.find((field) => field.atsPlatform)?.atsPlatform ?? application.atsPlatform,
  });
  return { application: updatedApplication, fields: savedFields };
}
