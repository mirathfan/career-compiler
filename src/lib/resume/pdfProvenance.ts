import { invoke } from "@tauri-apps/api/core";
import { PDFDocument } from "pdf-lib";
export const PDF_PROVENANCE_VERSION = "cc-pdf-sha256-v1";
export interface PdfProvenance { version: string; digest: string; sizeBytes: number }
export async function readPdfProvenance(path: string): Promise<PdfProvenance> {
  const snapshot = await invoke<{ contentDigest: string; sizeBytes: number; fileBase64: string }>("resume_pdf_snapshot", { path });
  const bytes = Uint8Array.from(atob(snapshot.fileBase64), character => character.charCodeAt(0));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const digest = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
  if (digest !== snapshot.contentDigest || bytes.length !== snapshot.sizeBytes) throw new Error("resume_pdf_invalid|PDF snapshot integrity failed.");
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, throwOnInvalidObject: true });
    if (pdf.getPageCount() !== 1) throw new Error("page count");
  } catch { throw new Error("resume_pdf_invalid|A readable, unencrypted one-page PDF is required."); }
  return { version: PDF_PROVENANCE_VERSION, digest, sizeBytes: bytes.length };
}
