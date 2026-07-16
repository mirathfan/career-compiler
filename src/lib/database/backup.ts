import { z } from "zod";
import type { BackupPayload } from "../../types/domain";
import { PROMPT_VERSIONS } from "../ai/prompts";
import { defaultSettings } from "./seed";

const BackupEnvelopeSchema = z.object({
  profile: z.unknown().nullable(),
  careerItems: z.array(z.unknown()),
  careerFacts: z.array(z.unknown()),
  skills: z.array(z.unknown()),
  candidateClaims: z.array(z.unknown()).optional().default([]),
  sensitiveAnswers: z.array(z.unknown()).optional().default([]),
  candidatePreferences: z.unknown().nullable().optional().default(null),
  careerStories: z.array(z.unknown()).optional().default([]),
  approvedApplicationAnswers: z.array(z.unknown()).optional().default([]),
  jobs: z.array(z.unknown()),
  resumes: z.array(z.unknown()),
  approvedVariants: z.array(z.unknown()).optional().default([]),
  applications: z.array(z.unknown()).optional().default([]),
  applicationFields: z.array(z.unknown()).optional().default([]),
  savedApplicationAnswers: z.array(z.unknown()).optional().default([]),
  evaluationSummaries: z.array(z.unknown()).optional().default([]),
  careerImports: z.array(z.unknown()).optional().default([]),
  careerCopilotThreads: z.array(z.unknown()).optional().default([]),
  careerCopilotMessages: z.array(z.unknown()).optional().default([]),
  resumeFavorites: z.array(z.unknown()).optional().default([]),
  resumeArchives: z.array(z.unknown()).optional().default([]),
  resumeRecommendations: z.array(z.unknown()).optional().default([]),
  settings: z.unknown(),
  exportedAt: z.string(),
  schemaVersion: z.number().int().min(1).max(5),
});

function containsSecret(text: string) {
  return /\bsk-[A-Za-z0-9_-]{8,}|"(?:apiKey|openaiKey|secret)"\s*:/i.test(text);
}

export function parseBackupText(text: string): BackupPayload {
  if (text.length > 25_000_000) throw new Error("Backup exceeds the 25 MB import limit.");
  if (containsSecret(text)) throw new Error("Backup contains a value that looks like an API key or secret.");
  const envelope = BackupEnvelopeSchema.parse(JSON.parse(text) as unknown);
  const raw = envelope as unknown as BackupPayload;
  return {
    ...raw,
    careerFacts: raw.careerFacts.map((fact) => ({
      ...fact,
      sourceType: fact.sourceType ?? "user_statement",
      sourceReference: fact.sourceReference ?? fact.sourceNote ?? "",
      verificationDate: fact.verificationDate ?? "",
      lastReviewedDate: fact.lastReviewedDate ?? "",
      notes: fact.notes ?? "",
    })),
    resumes: raw.resumes.map((resume) => ({
      ...resume,
      promptVersionsJson: resume.promptVersionsJson ?? PROMPT_VERSIONS,
      layoutProfileId: resume.layoutProfileId ?? "general-software-engineer",
      templateSettingsJson: resume.templateSettingsJson ?? defaultSettings.templateSettings,
    })),
    candidateClaims: raw.candidateClaims ?? [],
    sensitiveAnswers: raw.sensitiveAnswers ?? [],
    candidatePreferences: raw.candidatePreferences ?? null,
    careerStories: raw.careerStories ?? [],
    approvedApplicationAnswers: raw.approvedApplicationAnswers ?? [],
    approvedVariants: raw.approvedVariants ?? [],
    applications: raw.applications ?? [],
    applicationFields: raw.applicationFields ?? [],
    savedApplicationAnswers: raw.savedApplicationAnswers ?? [],
    evaluationSummaries: raw.evaluationSummaries ?? [],
    careerImports: raw.careerImports ?? [],
    careerCopilotThreads: raw.careerCopilotThreads ?? [],
    careerCopilotMessages: raw.careerCopilotMessages ?? [],
    resumeFavorites: raw.resumeFavorites ?? [],
    resumeArchives: raw.resumeArchives ?? [],
    resumeRecommendations: raw.resumeRecommendations ?? [],
    settings: {
      ...defaultSettings,
      ...raw.settings,
      tailoringDefaults: {
        ...defaultSettings.tailoringDefaults,
        ...raw.settings.tailoringDefaults,
      },
      templateSettings: {
        ...defaultSettings.templateSettings,
        ...raw.settings.templateSettings,
      },
      uiState: { ...defaultSettings.uiState, ...raw.settings.uiState },
      semanticSearchMode: raw.settings.semanticSearchMode ?? defaultSettings.semanticSearchMode,
      allowRemoteEmbeddings:
        raw.settings.allowRemoteEmbeddings ?? defaultSettings.allowRemoteEmbeddings,
      allowPrivateNotesInEmbeddings:
        raw.settings.allowPrivateNotesInEmbeddings ??
        defaultSettings.allowPrivateNotesInEmbeddings,
      allowContactFieldsInCopilotContext:
        raw.settings.allowContactFieldsInCopilotContext ??
        defaultSettings.allowContactFieldsInCopilotContext,
    },
    schemaVersion: 5,
  };
}

export function createBackupPreview(payload: BackupPayload, current?: BackupPayload) {
  const collections = {
    careerItems: payload.careerItems,
    careerFacts: payload.careerFacts,
    skills: payload.skills,
    candidateClaims: payload.candidateClaims,
    sensitiveAnswers: payload.sensitiveAnswers,
    careerStories: payload.careerStories,
    approvedApplicationAnswers: payload.approvedApplicationAnswers,
    jobs: payload.jobs,
    resumes: payload.resumes,
    approvedVariants: payload.approvedVariants,
    applications: payload.applications,
    applicationFields: payload.applicationFields,
    savedApplicationAnswers: payload.savedApplicationAnswers,
    evaluationSummaries: payload.evaluationSummaries,
    careerImports: payload.careerImports,
    careerCopilotThreads: payload.careerCopilotThreads,
    careerCopilotMessages: payload.careerCopilotMessages,
    resumeFavorites: payload.resumeFavorites,
    resumeArchives: payload.resumeArchives,
    resumeRecommendations: payload.resumeRecommendations,
  };
  const keyFor = (item: unknown) => {
    const value = item as { id?: string; resumeVersionId?: string };
    return value.id ?? value.resumeVersionId ?? "";
  };
  const conflicts = current
    ? Object.entries(collections).flatMap(([name, values]) => {
        const currentIds = new Set(
          (current[name as keyof typeof collections] as unknown[]).map(keyFor).filter(Boolean),
        );
        return (values as unknown[]).filter((item) => currentIds.has(keyFor(item))).map(
          (item) => `${name}:${keyFor(item)}`,
        );
      })
    : [];
  return {
    schemaVersion: payload.schemaVersion,
    exportedAt: payload.exportedAt,
    counts: Object.fromEntries(Object.entries(collections).map(([name, values]) => [name, values.length])),
    conflicts,
    valid: true,
    errors: [],
  };
}

export function serializeBackup(payload: BackupPayload) {
  const text = JSON.stringify(payload, null, 2);
  if (containsSecret(text)) throw new Error("Backup serialization was blocked because it contained a secret.");
  return text;
}
