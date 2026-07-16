import { z } from "zod";
import type { BackupPayload } from "../../types/domain";
import { PROMPT_VERSIONS } from "../ai/prompts";
import { defaultSettings } from "./seed";

const BackupEnvelopeSchema = z.object({
  profile: z.unknown().nullable(),
  careerItems: z.array(z.unknown()),
  careerFacts: z.array(z.unknown()),
  skills: z.array(z.unknown()),
  jobs: z.array(z.unknown()),
  resumes: z.array(z.unknown()),
  approvedVariants: z.array(z.unknown()).optional().default([]),
  applications: z.array(z.unknown()).optional().default([]),
  evaluationSummaries: z.array(z.unknown()).optional().default([]),
  settings: z.unknown(),
  exportedAt: z.string(),
  schemaVersion: z.number().int().min(1).max(3),
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
    approvedVariants: raw.approvedVariants ?? [],
    applications: raw.applications ?? [],
    evaluationSummaries: raw.evaluationSummaries ?? [],
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
    },
    schemaVersion: 3,
  };
}

export function createBackupPreview(payload: BackupPayload, current?: BackupPayload) {
  const collections = {
    careerItems: payload.careerItems,
    careerFacts: payload.careerFacts,
    skills: payload.skills,
    jobs: payload.jobs,
    resumes: payload.resumes,
    approvedVariants: payload.approvedVariants,
    applications: payload.applications,
    evaluationSummaries: payload.evaluationSummaries,
  };
  const conflicts = current
    ? Object.entries(collections).flatMap(([name, values]) => {
        const currentIds = new Set(
          (current[name as keyof typeof collections] as Array<{ id: string }>).map((item) => item.id),
        );
        return (values as Array<{ id: string }>).filter((item) => currentIds.has(item.id)).map(
          (item) => `${name}:${item.id}`,
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
