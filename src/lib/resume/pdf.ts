import { invoke } from "@tauri-apps/api/core";
import { PDFDocument } from "pdf-lib";
import type { ResumeTemplateSettings, TailoredResume } from "../../types/domain";
import { renderResumeLatex } from "./latex";

export async function renderResumePdfBytes(
  resume: TailoredResume,
  templateSettings?: ResumeTemplateSettings,
) {
  try {
    const bytes = await invoke<number[]>("render_resume_latex", {
      latexSource: renderResumeLatex(resume, templateSettings),
    });
    return Uint8Array.from(bytes);
  } catch (caught) {
    const raw = caught instanceof Error ? caught.message : String(caught);
    const separator = raw.indexOf("|");
    throw new Error(separator === -1 ? raw : raw.slice(separator + 1));
  }
}

export async function countPdfPages(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes);
  return document.getPageCount();
}

export function pdfBytesToDataUrl(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:application/pdf;base64,${btoa(binary)}`;
}
