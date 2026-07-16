import type {
  AppSettings,
  DatabaseStatus,
  FirstRunCheck,
  Profile,
  XeLaTeXDiagnostics,
} from "../../types/domain";
import { missingRequiredContactFields } from "../resume/validation";

export interface FirstRunInput {
  database: DatabaseStatus;
  careerFactCount: number;
  profile: Profile | null;
  xelatex: XeLaTeXDiagnostics;
  exportDirectoryWritable: boolean;
  apiKeyExists: boolean;
  settings: AppSettings;
}

export function buildFirstRunChecklist(input: FirstRunInput): FirstRunCheck[] {
  const missingContacts = missingRequiredContactFields(input.profile);
  return [
    {
      id: "database-writable",
      label: "SQLite database writable",
      status: input.database.writable ? "ready" : "blocking",
      detail: input.database.writable ? "Local data can be saved." : "The local database is read-only or unavailable.",
    },
    {
      id: "migrations",
      label: "Migrations completed",
      status: input.database.schemaVersion >= 3 ? "ready" : "blocking",
      detail: `Database schema version ${input.database.schemaVersion}.`,
    },
    {
      id: "career-data",
      label: "Career data available",
      status: input.careerFactCount > 0 ? "ready" : "needs_attention",
      detail: input.careerFactCount > 0 ? `${input.careerFactCount} facts available.` : "Seed or import career facts.",
    },
    {
      id: "contact-fields",
      label: "Profile contact fields complete",
      status: missingContacts.length === 0 ? "ready" : "needs_attention",
      detail: missingContacts.length === 0 ? "Required export fields are complete." : `Missing ${missingContacts.join(", ")}. Editing remains available, but export is blocked.`,
    },
    {
      id: "xelatex",
      label: "XeLaTeX runtime",
      status: input.xelatex.available ? "ready" : "blocking",
      detail: input.xelatex.available ? input.xelatex.version : "Install MacTeX or TinyTeX, then retry diagnostics.",
    },
    {
      id: "export-directory",
      label: "Export directory writable",
      status: input.exportDirectoryWritable ? "ready" : "blocking",
      detail: input.exportDirectoryWritable ? "PDF exports can be written." : "Choose a writable export directory.",
    },
    {
      id: "api-key",
      label: "OpenAI API key",
      status: input.apiKeyExists ? "ready" : "optional",
      detail: input.apiKeyExists ? "A key is available without exposing it." : "Optional. Mock mode remains fully usable.",
    },
    {
      id: "provider",
      label: "AI provider selected",
      status: input.settings.aiProvider === "mock" || input.apiKeyExists ? "ready" : "needs_attention",
      detail: `${input.settings.aiProvider} provider with ${input.settings.modelName}.`,
    },
    {
      id: "template",
      label: "Resume template selected",
      status: input.settings.defaultTemplateId === "mir-resume" ? "ready" : "needs_attention",
      detail: input.settings.defaultTemplateId === "mir-resume" ? "Mir Resume is selected." : "Select Mir Resume for the personal format.",
    },
  ];
}
