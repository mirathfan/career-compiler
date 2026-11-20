import { supportedApplicationUrl } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
import { isIsolatedRuntime } from "../acceptance/runtime";
import { jobFingerprint, resumeFingerprint } from "../job-automation/safety";
import { issueFillAuthorization, consumeFillAuthorization, requireConsumedFill } from "./fillAuthorization";
import { invoke } from "@tauri-apps/api/core";
import type {
  ApplicationFieldRecord,
  Job,
  JobAnalysis,
  ResumeVersion,
} from "../../types/domain";
import type { AppRepository } from "../database/repository";
import { requireApprovedPackage } from "../job-automation/applicationPackages";
import { prepareApplicationReview } from "../applications/applicationReview";
import { normalizeDetectedField } from "../applications/questionClassifier";
import type {
  AuthorizedResumeFile,
  ExtensionDetectedField,
  ExtensionRequest,
  ExtensionResponse,
  GeneratedApplicationFillInstruction,
  JobPageContext,
  PreparedApplication,
} from "./protocol";
import { extensionError, extensionOk, EXTENSION_PROTOCOL_VERSION } from "./protocol";

interface HandleExtensionRequestInput {
  repository: AppRepository;
  request: ExtensionRequest;
  authorizeResumeFile?: (input: {
    applicationId: string;
    resumeVersionId: string;
    path: string;
    expectedDigest: string;
  }) => Promise<AuthorizedResumeFile>;
}

type NativeAuthorizedResumeFile = {
  contentDigest: string;
  authorizedFileReference: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  expiresAtMs: number;
  fileBase64?: string;
};

async function defaultAuthorizeResumeFile(input: {
  applicationId: string;
  resumeVersionId: string;
  path: string;
  expectedDigest: string;
}): Promise<AuthorizedResumeFile> {
  const result = await invoke<NativeAuthorizedResumeFile>("extension_authorize_resume_file", input);
  return {
    contentDigest: result.contentDigest,
    authorizedFileReference: result.authorizedFileReference,
    filename: result.filename,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    expiresAtMs: result.expiresAtMs,
    fileBase64: result.fileBase64,
  };
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function inferCompany(context: JobPageContext) {
  return cleanText(context.companyName) || hostname(context.url).split(".")[0] || "Unknown company";
}

function inferRole(context: JobPageContext) {
  return cleanText(context.jobTitle) || cleanText(context.title) || "Unknown role";
}

function extractKnownSkills(text: string) {
  const known = [
    "React",
    "TypeScript",
    "JavaScript",
    "Node",
    "Python",
    "Rust",
    "SQL",
    "PostgreSQL",
    "SQLite",
    "Tauri",
    "FastAPI",
    "OpenAI",
    "AWS",
    "Docker",
    "Kubernetes",
    "React Native",
    "Firebase",
  ];
  const lower = text.toLowerCase();
  return known.filter((skill) => lower.includes(skill.toLowerCase()));
}

function buildDeterministicAnalysis(context: JobPageContext): JobAnalysis {
  const text = [context.jobTitle, context.companyName, context.jobDescription, context.title].join(" ");
  const skills = extractKnownSkills(text);
  return {
    inferredCompany: inferCompany(context),
    inferredRoleTitle: inferRole(context),
    seniority: /\b(new grad|junior|entry)\b/i.test(text) ? "entry" : "",
    roleCategories: /\b(ai|machine learning|llm)\b/i.test(text)
      ? ["AI engineer", "software engineer"]
      : ["software engineer"],
    requiredSkills: skills.slice(0, 8),
    preferredSkills: skills.slice(8, 16),
    responsibilities: cleanText(context.jobDescription)
      .split(/[.\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6),
    domainKeywords: skills,
    candidateSignals: [],
    locationRequirements: [],
    workAuthorizationLanguage: /\bsponsor|visa|authorized\b/i.test(text) ? text.slice(0, 240) : "",
    summary: cleanText(context.jobDescription, `${inferRole(context)} at ${inferCompany(context)}`).slice(0, 500),
  };
}

async function findOrCreateJob(repository: AppRepository, context: JobPageContext) {
  const company = inferCompany(context);
  const roleTitle = inferRole(context);
  const sourceUrl = cleanText(context.url);
  const rawDescription = cleanText(context.jobDescription, cleanText(context.title, roleTitle));
  const existing = (await repository.listJobs()).find(
    (job) =>
      (sourceUrl && job.sourceUrl === sourceUrl) ||
      (job.company.toLowerCase() === company.toLowerCase() &&
        job.roleTitle.toLowerCase() === roleTitle.toLowerCase()),
  );
  if (existing && (await repository.listApplicationPackages()).some((item) => item.jobId === existing.id) && ![existing.applicationUrl, existing.sourceUrl].includes(sourceUrl)) throw new Error("application_destination_mismatch|Use the package's reviewed application destination.");
  return repository.saveJob({
    id: existing?.id,
    company,
    roleTitle,
    sourceUrl,
    rawDescription,
    analysisJson: existing?.analysisJson ?? buildDeterministicAnalysis(context),
  });
}

async function findOrCreateApplication(repository: AppRepository, job: Job, context: JobPageContext) {
  const applications = await repository.listApplications();
  const existing = applications.find(
    (application) =>
      (context.url && [application.applicationUrl, application.jobUrl].includes(context.url)) ||
      (application.jobId && application.jobId === job.id),
  );
  return repository.saveApplication({
    id: existing?.id,
    jobId: job.id,
    company: job.company || inferCompany(context),
    role: job.roleTitle || inferRole(context),
    jobUrl: context.url,
    applicationUrl: context.url,
    jobSnapshotJson: job,
    atsPlatform: context.atsPlatform,
    automationMode: "autofill_manual_submit",
    status: existing?.status === "applied" ? "applied" : "preparing",
    resumeVersionId: existing?.resumeVersionId,
  });
}

function normalizeExtensionField(field: ExtensionDetectedField) {
  const normalized = normalizeDetectedField(field);
  const useExtensionClassification =
    Boolean(field.normalizedQuestionType) && field.normalizedQuestionType !== "unknown";
  return {
    ...normalized,
    id: field.id || normalized.id,
    normalizedQuestionType: useExtensionClassification
      ? field.normalizedQuestionType ?? normalized.normalizedQuestionType
      : normalized.normalizedQuestionType,
    classificationConfidence: useExtensionClassification
      ? field.classificationConfidence ?? normalized.classificationConfidence
      : normalized.classificationConfidence,
  };
}

function isResumeUploadField(field: ExtensionDetectedField) {
  const text = [
    field.label,
    field.nearbyText,
    field.placeholder,
    field.elementName,
    field.elementId,
    field.ariaLabel,
  ]
    .filter(Boolean)
    .join(" ");
  return field.inputType === "file" && /\b(resume|cv|curriculum vitae)\b/i.test(text);
}

function selectedResumeForApplication(
  resumes: ResumeVersion[],
  applicationResumeId: string,
  jobId: string,
) {
  return (
    resumes.find((resume) => resume.id === applicationResumeId && resume.lastExportPath) ??
    resumes.find((resume) => resume.jobId === jobId && resume.lastExportPath) ??
    resumes.find((resume) => resume.status === "exported" && resume.lastExportPath) ??
    resumes.find((resume) => resume.lastExportPath) ??
    null
  );
}

function fieldQuestion(field: ExtensionDetectedField) {
  return cleanText(field.label) || cleanText(field.nearbyText) || cleanText(field.placeholder) || field.id;
}

function toFillInstruction(
  extensionField: ExtensionDetectedField,
  savedField: ApplicationFieldRecord,
): GeneratedApplicationFillInstruction {
  return {
    fieldId: extensionField.id,
    recordId: savedField.id,
    originalQuestion: savedField.originalQuestion,
    normalizedQuestionType: savedField.normalizedQuestionType,
    detectedFieldType: savedField.detectedFieldType,
    answer: savedField.finalAnswer as string | boolean | string[],
    answerSource: savedField.answerSource,
    confidence: savedField.confidence,
    requiresReview: savedField.requiresReview,
    claimIds: savedField.claimIds,
    storyIds: savedField.storyIds,
    warnings: savedField.warnings,
    reasoningSummary: savedField.reasoningSummary,
    fillKind: "value",
  };
}

async function prepareApplication(
  repository: AppRepository,
  request: Extract<ExtensionRequest, { type: "prepare_application" }>,
  authorizeResumeFile: NonNullable<HandleExtensionRequestInput["authorizeResumeFile"]>,
): Promise<ExtensionResponse<PreparedApplication>> {
  if (!request.pageContext?.url) {
    return extensionError(request.requestId, "page_context_invalid", "The extension did not send a page URL.", false);
  }
  const job = await findOrCreateJob(repository, request.pageContext);
  const approvedPackage = await requireApprovedPackage(repository, job.id);
  let application = await findOrCreateApplication(repository, job, request.pageContext);
  const normalizedFields = (request.fields ?? []).map(normalizeExtensionField);
  const resumeUploadFields = (request.fields ?? []).filter(isResumeUploadField);
  const answerFields = normalizedFields.filter(
    (field) => !resumeUploadFields.some((resumeField) => resumeField.id === field.id),
  );
  const warnings: string[] = [];
  const hardConflicts: string[] = [];

  const resumes = await repository.listResumeVersions();
  const selectedResume = approvedPackage
    ? resumes.find((resume) => resume.id === approvedPackage.resumeVersionId) ?? null
    : selectedResumeForApplication(resumes, application.resumeVersionId, job.id);
  const revision = (await repository.listSafetyRecords("package_revision")).find(record => record.id === approvedPackage?.id);
  const pdfDigest = (revision?.value.pdfProvenance as { digest?: string } | undefined)?.digest ?? "";
  let authorizedResume: Awaited<ReturnType<typeof authorizeResumeFile>> | null = null;
  if (selectedResume?.lastExportPath) {
    try {
      authorizedResume = await authorizeResumeFile({
        applicationId: application.id,
        resumeVersionId: selectedResume.id,
        path: selectedResume.lastExportPath,
        expectedDigest: pdfDigest,
      });
      if (authorizedResume.contentDigest !== pdfDigest) throw new Error("package_pdf_changed");
      application = await repository.saveApplication({
        ...application,
        resumeVersionId: selectedResume.id,
      });
      if (!authorizedResume.fileBase64) {
        warnings.push("Selected resume is authorized but too large for inline browser upload; choose it manually.");
      }
    } catch {
      warnings.push("Resume preparation failed. Verify the selected exported PDF, then prepare fresh authorization.");
    }
  } else if (resumeUploadFields.length > 0) {
    warnings.push("No exported resume PDF is linked to this application.");
  }

  const review = answerFields.length
    ? await prepareApplicationReview({ repository, application, job, fields: answerFields })
    : { application, fields: [] };
  application = review.application;
  const fillInstructions = answerFields
    .map((field, index) => {
      const saved = review.fields[index];
      return saved ? toFillInstruction(field, saved) : null;
    })
    .filter((field): field is GeneratedApplicationFillInstruction => Boolean(field));

  for (const answer of fillInstructions) {
    if (answer.answerSource === "user_required") {
      hardConflicts.push(`${answer.originalQuestion}: ${answer.reasoningSummary}`);
    }
  }

  for (const resumeField of resumeUploadFields) {
    const saved = await repository.saveApplicationField({
      applicationId: application.id,
      originalQuestion: fieldQuestion(resumeField),
      normalizedQuestionType: "unknown",
      detectedFieldType: cleanText(resumeField.detectedFieldType, "input"),
      generatedAnswer: authorizedResume?.filename ?? "",
      finalAnswer: authorizedResume?.filename ?? "",
      answerSource: authorizedResume?.fileBase64 ? "fixed_profile" : "user_required",
      confidence: authorizedResume?.fileBase64 ? 0.96 : 0,
      requiresReview: !authorizedResume?.fileBase64,
      userEdited: false,
      approved: Boolean(authorizedResume?.fileBase64),
      warnings: authorizedResume?.fileBase64
        ? []
        : ["Resume upload requires manual selection or a smaller exported PDF."],
      reasoningSummary: authorizedResume?.fileBase64
        ? "Used the application-authorized exported resume PDF."
        : "No browser-fillable authorized resume payload is available.",
    });
    fillInstructions.push({
      fieldId: resumeField.id,
      recordId: saved.id,
      originalQuestion: saved.originalQuestion,
      normalizedQuestionType: "unknown",
      detectedFieldType: cleanText(resumeField.detectedFieldType, "input"),
      answer: authorizedResume?.filename ?? "",
      answerSource: saved.answerSource,
      confidence: saved.confidence,
      requiresReview: saved.requiresReview,
      claimIds: [],
      storyIds: [],
      warnings: saved.warnings,
      reasoningSummary: saved.reasoningSummary,
      fillKind: "resume_file",
      resumeFile: authorizedResume
        ? {
            authorizedFileReference: authorizedResume.authorizedFileReference,
            filename: authorizedResume.filename,
            mimeType: authorizedResume.mimeType,
            sizeBytes: authorizedResume.sizeBytes,
            expiresAtMs: authorizedResume.expiresAtMs,
            fileBase64: authorizedResume.fileBase64,
          }
        : undefined,
    });
  }

  await requireApprovedPackage(repository, job.id, selectedResume?.id);
  const prepared: PreparedApplication = {
    resumePreparationStatus: authorizedResume ? (authorizedResume.fileBase64 ? "prepared" : "not_verified") : "failed",
    contentFingerprint: { job: jobFingerprint(job), resume: selectedResume ? await resumeFingerprint(selectedResume) : "", pdf: pdfDigest },
    applicationId: application.id,
    jobId: job.id,
    companyName: application.company,
    jobTitle: application.role,
    resume: selectedResume && authorizedResume
      ? {
          resumeId: selectedResume.id,
          filename: authorizedResume.filename,
          authorizedFileReference: authorizedResume.authorizedFileReference,
          mimeType: authorizedResume.mimeType,
          sizeBytes: authorizedResume.sizeBytes,
          fileBase64: authorizedResume.fileBase64,
        }
      : undefined,
    fields: fillInstructions,
    warnings,
    hardConflicts,
  };
  prepared.authorization = await issueFillAuthorization(repository, prepared, request.extensionId);
  return extensionOk(request.requestId, prepared);
}

async function saveApplicationEdits(
  repository: AppRepository,
  request: Extract<ExtensionRequest, { type: "save_application_edits" }>,
) {
  const application = await repository.getApplication(request.applicationId);
  if (!application) {
    return extensionError(request.requestId, "application_missing", "The application draft no longer exists.", false);
  }
  await requireApprovedPackage(repository, application.jobId, application.resumeVersionId);
  const existingFields = await repository.listApplicationFields(application.id);
  const fieldsById = new Map(existingFields.map((field) => [field.id, field]));
  const fieldsByQuestion = new Map(
    existingFields.map((field) => [`${field.originalQuestion}|${field.normalizedQuestionType}`, field]),
  );
  const saved: ApplicationFieldRecord[] = [];
  for (const edit of request.fields ?? []) {
    if (!edit.userEdited || !edit.safeToSave) continue;
    const existing =
      (edit.recordId ? fieldsById.get(edit.recordId) : undefined) ??
      fieldsByQuestion.get(`${edit.originalQuestion}|${edit.normalizedQuestionType}`);
    const savedField = await repository.saveApplicationField({
      id: existing?.id,
      applicationId: application.id,
      originalQuestion: edit.originalQuestion,
      normalizedQuestionType: edit.normalizedQuestionType,
      detectedFieldType: edit.detectedFieldType,
      generatedAnswer: existing?.generatedAnswer ?? edit.originallyFilledValue ?? "",
      finalAnswer: edit.currentValue,
      answerSource: existing?.answerSource ?? "user_required",
      confidence: existing?.confidence ?? 0.5,
      requiresReview: true,
      userEdited: true,
      approved: false,
      claimIds: existing?.claimIds ?? [],
      storyIds: existing?.storyIds ?? [],
      warnings: [...(existing?.warnings ?? []), "Saved browser edit; choose whether to promote it in CareerCompiler."],
      reasoningSummary: existing?.reasoningSummary ?? "Saved from a supervised browser edit.",
    });
    saved.push(savedField);
  }
  await requireApprovedPackage(repository, application.jobId, application.resumeVersionId);
  await repository.saveApplication({
    ...application,
    status: application.status === "applied" ? "applied" : "ready",
    automationMode: "autofill_manual_submit",
    nextAction: application.nextAction || "Review browser-filled answers and submit manually.",
  });
  return extensionOk(request.requestId, { savedFieldCount: saved.length, applicationId: application.id });
}

async function markFilled(
  repository: AppRepository,
  request: Extract<ExtensionRequest, { type: "mark_filled" }>,
) {
  const application = await repository.getApplication(request.applicationId);
  if (!application) {
    return extensionError(request.requestId, "application_missing", "The application draft no longer exists.", false);
  }
  await requireConsumedFill(repository, application.id, request.fillAuthorizationId, request.extensionId);
  await repository.saveApplication({
    ...application,
    status: application.status === "applied" ? "applied" : "ready",
    automationMode: "autofill_manual_submit",
    nextAction: application.nextAction || "Review highlighted browser fields and submit manually.",
  });
  const record = (await repository.listSafetyRecords("fill_token")).find((record) => record.id === request.fillAuthorizationId)!;
  await repository.saveSafetyRecord({ ...record, value: { ...record.value, state: "completed" } });
  return extensionOk(request.requestId, { applicationId: application.id, status: "ready" });
}

export async function handleExtensionRequest({
  repository,
  request,
  authorizeResumeFile = defaultAuthorizeResumeFile,
}: HandleExtensionRequestInput): Promise<ExtensionResponse> {
  try {
    if (request.protocolVersion !== EXTENSION_PROTOCOL_VERSION) return extensionError(request.requestId, "version_mismatch", "Update the extension before preparing or filling an application.");
    const destination = request.type === "authorize_fill" ? request.pageUrl : (request.type === "prepare_application" || request.type === "capture_job") ? request.pageContext.url : undefined;
    if (destination !== undefined && !supportedApplicationUrl(destination) && !(isIsolatedRuntime() && /^http:\/\/127\.0\.0\.1:5297\/(greenhouse|lever|ashby|multi-step|dynamic)\.html$/.test(destination))) return extensionError(request.requestId, "application_origin_denied", "Unsupported application destination.");
    if (request.type === "authorize_fill") {
      await consumeFillAuthorization(repository, request.prepared, request.extensionId, request.pageUrl);
      return extensionOk(request.requestId, { authorized: true });
    }
    if (request.type === "prepare_application") {
      return await repository.transaction((transaction) => prepareApplication(transaction, request, authorizeResumeFile));
    }
    if (request.type === "save_application_edits") {
      return await saveApplicationEdits(repository, request);
    }
    if (request.type === "mark_filled") {
      return await repository.transaction((transaction) => markFilled(transaction, request));
    }
    if (request.type === "capture_job") {
      const job = await findOrCreateJob(repository, request.pageContext);
      return extensionOk(request.requestId, { jobId: job.id, companyName: job.company, jobTitle: job.roleTitle });
    }
    return extensionError(request.requestId, "unsupported_request", "CareerCompiler cannot handle that extension request.", false);
  } catch (error) {
    return extensionError(
      "requestId" in request ? request.requestId : undefined,
      "desktop_request_failed",
      error instanceof Error ? error.message : String(error),
      true,
    );
  }
}
