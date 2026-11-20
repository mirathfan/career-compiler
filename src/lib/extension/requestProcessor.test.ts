import { describe, expect, it } from "vitest";
import type { TailoredResume } from "../../types/domain";
import { MemoryRepository } from "../database/memoryRepository";
import { updatePackageResume } from "../job-automation/applicationPackages";
import { handleExtensionRequest } from "./requestProcessor";
import {
  EXTENSION_PROTOCOL_VERSION,
  type ExtensionRequest,
  type ExtensionResponse,
  type PreparedApplication,
} from "./protocol";

const fixtureResume: TailoredResume = {
  id: "fixture-resume-content",
  header: {
    fullName: "Mir Athfan Ali",
    headline: "Full-Stack and AI Software Engineer",
    location: "Chicago, Illinois",
    email: "mir@example.com",
    phone: "555-0100",
    portfolioUrl: "https://example.com",
    linkedInUrl: "https://linkedin.com/in/example",
    githubUrl: "https://github.com/mirathfan",
    workAuthorizationNote: "",
  },
  summary: [],
  education: [],
  experience: [],
  projects: [],
  skills: ["React", "TypeScript"],
  sectionOrder: ["education", "experience", "projects", "skills"],
  compactionActions: [],
  layout: { bodyFontSize: 9.5, spacingScale: 1, condensedSkills: false },
  approvedWarningCodes: [],
};

async function preparedRepository() {
  const repository = new MemoryRepository();
  await repository.initialize();
  await repository.seedSampleData();
  const profile = await repository.getProfile();
  if (profile) {
    await repository.saveProfile({
      ...profile,
      email: "mir@example.com",
      phone: "555-0100",
      linkedInUrl: "https://linkedin.com/in/mirathfan",
    });
  }
  await repository.saveSensitiveAnswer({
    key: "future_sponsorship",
    label: "Future sponsorship",
    value: false,
    locked: true,
    requiresReview: false,
    verificationStatus: "verified",
  });
  await repository.saveJob({ id: "fixture-job", company: "ExampleCo", roleTitle: "Software Engineer", sourceUrl: "https://boards.greenhouse.io/example/jobs/123", applicationUrl: "https://boards.greenhouse.io/example/jobs/123", rawDescription: "Build React and TypeScript product workflows.", descriptionText: "Build React and TypeScript product workflows." });
  const resume = await repository.saveResumeVersion({
    jobId: "fixture-job",
    name: "Fixture exported resume",
    contentJson: fixtureResume,
    status: "exported",
    lastExportPath: "/tmp/careercompiler-fixture.pdf",
  });
  await repository.saveApplicationPackage({ jobId: "fixture-job" });
  await updatePackageResume(repository, "fixture-job", resume.id, true);
  return repository;
}

function prepareRequest(): Extract<ExtensionRequest, { type: "prepare_application" }> {
  return {
    type: "prepare_application",
    protocolVersion: EXTENSION_PROTOCOL_VERSION,
    requestId: "prepare-test",
    extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    credential: "test",
    pageContext: {
      url: "https://boards.greenhouse.io/example/jobs/123",
      title: "Software Engineer",
      atsPlatform: "greenhouse",
      companyName: "ExampleCo",
      jobTitle: "Software Engineer",
      jobDescription: "Build React and TypeScript product workflows.",
    },
    fields: [
      { id: "first", label: "First Name", inputType: "text", detectedFieldType: "input" },
      {
        id: "country",
        label: "Country",
        inputType: "text",
        detectedFieldType: "input",
        normalizedQuestionType: "unknown",
        classificationConfidence: 0.35,
      },
      { id: "github", label: "GitHub", inputType: "url", detectedFieldType: "input" },
      { id: "sponsor", label: "Will you require sponsorship now or in the future?", inputType: "radio", detectedFieldType: "radio_group", options: ["Yes", "No"] },
      { id: "resume", label: "Resume / CV", inputType: "file", detectedFieldType: "input" },
    ],
  };
}

describe("extension request processor", () => {
  it("reports file preparation failure without leaking file details or pretending it attached", async () => {
    const repository=await preparedRepository();
    const result=await handleExtensionRequest({repository,request:prepareRequest(),authorizeResumeFile:async()=>{throw new Error("private synthetic file contents must not escape");}}) as ExtensionResponse<PreparedApplication>;
    expect(result.ok).toBe(true);expect(result.data?.resumePreparationStatus).toBe("failed");expect(result.data?.resume).toBeUndefined();expect(JSON.stringify(result)).not.toContain("private synthetic file contents");
    expect(result.data?.fields.find(field=>field.fieldId==="resume")?.requiresReview).toBe(true);
  });
  it("rejects a destination forged from an existing approved company's title", async () => {
    const repository=await preparedRepository();const request=prepareRequest();request.pageContext.url="https://boards.greenhouse.io/other/jobs/456";
    const result=await handleExtensionRequest({repository,request});expect(result.ok).toBe(false);expect(result.error?.message).toContain("application_destination_mismatch");
  });
  it("prepares a grounded application draft with an authorized resume and persists edits", async () => {
    const repository = await preparedRepository();
    const prepared = await handleExtensionRequest({
      repository,
      request: prepareRequest(),
      authorizeResumeFile: async () => ({
        contentDigest: "a".repeat(64),
        authorizedFileReference: "resume-ref",
        filename: "CareerCompiler.pdf",
        mimeType: "application/pdf",
        sizeBytes: 28,
        expiresAtMs: Date.now() + 60000,
        fileBase64: "JVBERi0xLjQKJUZpeHR1cmUK",
      }),
    });

    const preparedApplication = prepared as ExtensionResponse<PreparedApplication>;
    expect(preparedApplication.ok).toBe(true);
    expect(preparedApplication.data?.companyName).toBe("ExampleCo");
    expect(preparedApplication.data?.resume?.authorizedFileReference).toBe("resume-ref");
    expect(preparedApplication.data?.fields.some((field) => field.fillKind === "resume_file")).toBe(true);
    expect(preparedApplication.data?.fields.find(field => field.fillKind === "resume_file")).toMatchObject({ originalQuestion: "Resume / CV", detectedFieldType: "input" });
    expect(preparedApplication.data?.fields.find((field) => field.fieldId === "country")?.answerSource).toBe("user_required");
    expect(preparedApplication.data?.fields.find((field) => field.fieldId === "sponsor")?.answerSource).toBe("locked_sensitive");

    const application = await repository.getApplication(preparedApplication.data!.applicationId);
    expect(application?.status).not.toBe("applied");
    expect(application?.automationMode).toBe("autofill_manual_submit");

    const github = preparedApplication.data!.fields.find((field) => field.fieldId === "github");
    const saved = await handleExtensionRequest({
      repository,
      request: {
        type: "save_application_edits",
        protocolVersion: EXTENSION_PROTOCOL_VERSION,
        requestId: "save-test",
        extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        credential: "test",
        applicationId: preparedApplication.data!.applicationId,
        fields: [
          {
            fieldId: "github",
            recordId: github?.recordId,
            originalQuestion: github?.originalQuestion ?? "GitHub",
            normalizedQuestionType: "github",
            detectedFieldType: "input",
            currentValue: "https://github.com/mirathfan",
            originallyFilledValue: github?.answer,
            userEdited: true,
            safeToSave: true,
            changedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(saved.ok).toBe(true);
    expect(saved.data).toMatchObject({ savedFieldCount: 1 });
    const fields = await repository.listApplicationFields(preparedApplication.data!.applicationId);
    expect(fields.find((field) => field.id === github?.recordId)?.userEdited).toBe(true);

    await handleExtensionRequest({ repository, request: { type: "authorize_fill", protocolVersion: EXTENSION_PROTOCOL_VERSION,
      requestId: "authorize-fixture", extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", credential: "test", prepared: preparedApplication.data!, pageUrl: prepareRequest().pageContext.url } });
    const marked = await handleExtensionRequest({
      repository,
      request: {
        type: "mark_filled",
        fillAuthorizationId: preparedApplication.data!.authorization!.id,
        protocolVersion: EXTENSION_PROTOCOL_VERSION,
        requestId: "filled-test",
        extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        credential: "test",
        applicationId: preparedApplication.data!.applicationId,
      },
    });
    expect(marked.ok).toBe(true);
    expect((await repository.getApplication(preparedApplication.data!.applicationId))?.status).toBe("ready");
  });
});
