import { describe, expect, it } from "vitest";
import type { TailoredResume } from "../../types/domain";
import { MemoryRepository } from "../database/memoryRepository";
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
  await repository.saveResumeVersion({
    jobId: "fixture-job",
    name: "Fixture exported resume",
    contentJson: fixtureResume,
    status: "exported",
    lastExportPath: "/tmp/careercompiler-fixture.pdf",
  });
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
      { id: "github", label: "GitHub", inputType: "url", detectedFieldType: "input" },
      { id: "sponsor", label: "Will you require sponsorship now or in the future?", inputType: "radio", detectedFieldType: "radio_group", options: ["Yes", "No"] },
      { id: "resume", label: "Resume / CV", inputType: "file", detectedFieldType: "input" },
    ],
  };
}

describe("extension request processor", () => {
  it("prepares a grounded application draft with an authorized resume and persists edits", async () => {
    const repository = await preparedRepository();
    const prepared = await handleExtensionRequest({
      repository,
      request: prepareRequest(),
      authorizeResumeFile: async () => ({
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

    const marked = await handleExtensionRequest({
      repository,
      request: {
        type: "mark_filled",
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
