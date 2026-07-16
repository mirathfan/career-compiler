import type { AIProviderMode, DatabaseStatus, XeLaTeXDiagnostics } from "../../types/domain";

export interface DiagnosticsReportInput {
  appVersion: string;
  operatingSystem: string;
  tauriVersion: string;
  database: DatabaseStatus;
  xelatex: XeLaTeXDiagnostics;
  aiProvider: AIProviderMode;
  modelName: string;
  lastSafeErrorCategory: string;
  lastPdfCompilationStatus: string;
}

function safeToken(value: string) {
  if (/sk-[A-Za-z0-9_-]+|@|\+?\d[\d ()-]{7,}/i.test(value)) return "[REDACTED]";
  return value.slice(0, 200);
}

export function createDiagnosticsReport(input: DiagnosticsReportInput) {
  return [
    `CareerCompiler ${safeToken(input.appVersion)}`,
    `OS: ${safeToken(input.operatingSystem)}`,
    `Tauri: ${safeToken(input.tauriVersion)}`,
    `Database schema: ${input.database.schemaVersion}`,
    `Database writable: ${input.database.writable}`,
    `Last migration: ${input.database.latestMigration?.success === false ? "failed" : "ready"}`,
    `XeLaTeX: ${input.xelatex.available ? "available" : "missing"}`,
    `XeLaTeX version: ${safeToken(input.xelatex.version || "unavailable")}`,
    `AI provider: ${input.aiProvider}`,
    `Configured model: ${safeToken(input.modelName)}`,
    `Last safe error: ${safeToken(input.lastSafeErrorCategory || "none")}`,
    `Last PDF compilation: ${safeToken(input.lastPdfCompilationStatus || "none")}`,
  ].join("\n");
}

export function diagnosticsReportContainsPrivateData(report: string) {
  return /sk-[A-Za-z0-9_-]+|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\+?\d[\d ()-]{7,}/i.test(report);
}
