import type {
  ApplicationAnswerSource,
  ApplicationQuestionType,
  DetectedApplicationField,
  GeneratedApplicationAnswer,
} from "../../types/domain";

export const EXTENSION_PROTOCOL_VERSION = 1;
export const NATIVE_HOST_NAME = "com.mirathfan.careercompiler";

export interface ExtensionResponse<T = unknown> {
  ok: boolean;
  requestId?: string;
  protocolVersion: number;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface JobPageContext {
  url: string;
  title: string;
  atsPlatform: string;
  companyName: string;
  jobTitle: string;
  jobDescription: string;
}

export interface ExtensionDetectedField extends Partial<DetectedApplicationField> {
  id: string;
  selector?: string;
  required?: boolean;
  characterLimit?: number | null;
}

export interface EditedApplicationField {
  fieldId: string;
  recordId?: string;
  originalQuestion: string;
  normalizedQuestionType: ApplicationQuestionType;
  detectedFieldType: string;
  currentValue: unknown;
  originallyFilledValue?: unknown;
  userEdited: boolean;
  safeToSave: boolean;
  changedAt: string;
}

export interface ResumeFillPayload {
  authorizedFileReference: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  expiresAtMs: number;
  fileBase64?: string;
}

export type AuthorizedResumeFile = ResumeFillPayload;

export interface GeneratedApplicationFillInstruction extends GeneratedApplicationAnswer {
  originalQuestion: string;
  detectedFieldType: string;
  recordId?: string;
  fillKind?: "value" | "resume_file";
  resumeFile?: ResumeFillPayload;
}

export interface PreparedApplication {
  applicationId: string;
  jobId: string;
  companyName: string;
  jobTitle: string;
  resume?: {
    resumeId: string;
    filename: string;
    authorizedFileReference: string;
    mimeType: string;
    sizeBytes: number;
    fileBase64?: string;
  };
  fields: GeneratedApplicationFillInstruction[];
  warnings: string[];
  hardConflicts: string[];
}

export type ExtensionRequest =
  | {
      type: "ping";
      protocolVersion: number;
      requestId?: string;
    }
  | {
      type: "pair";
      protocolVersion: number;
      requestId?: string;
      extensionId: string;
      pairingCode: string;
    }
  | {
      type: "capture_job";
      protocolVersion: number;
      requestId: string;
      extensionId: string;
      credential: string;
      pageContext: JobPageContext;
    }
  | {
      type: "prepare_application";
      protocolVersion: number;
      requestId: string;
      extensionId: string;
      credential: string;
      pageContext: JobPageContext;
      fields: ExtensionDetectedField[];
    }
  | {
      type: "save_application_edits";
      protocolVersion: number;
      requestId: string;
      extensionId: string;
      credential: string;
      applicationId: string;
      fields: EditedApplicationField[];
    }
  | {
      type: "mark_filled";
      protocolVersion: number;
      requestId: string;
      extensionId: string;
      credential: string;
      applicationId: string;
    };

export function extensionOk<T>(requestId: string | undefined, data: T): ExtensionResponse<T> {
  return {
    ok: true,
    requestId,
    protocolVersion: EXTENSION_PROTOCOL_VERSION,
    data,
  };
}

export function extensionError<T = unknown>(
  requestId: string | undefined,
  code: string,
  message: string,
  retryable = false,
): ExtensionResponse<T> {
  return {
    ok: false,
    requestId,
    protocolVersion: EXTENSION_PROTOCOL_VERSION,
    error: { code, message, retryable },
  };
}

export function isApplicationAnswerSource(value: string): value is ApplicationAnswerSource {
  return ["fixed_profile", "locked_sensitive", "approved_answer", "tailored_ai", "user_required"].includes(value);
}
