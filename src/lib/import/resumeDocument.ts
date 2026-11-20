import { docxXmlToText, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_TEXT } from "./docxText";

export interface ExtractedResume { text: string; sourceReference: string; format: "pdf" | "docx"; pages?: number; warnings: string[] }
export function validateResumeFile(file: Pick<File, "name" | "size">): "pdf" | "docx" {
  if (!file.size) throw new Error("The selected file is empty.");
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("Choose a résumé smaller than 10 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "pdf" && extension !== "docx") throw new Error("Choose a PDF or DOCX file. Images, DOC and macro-enabled documents are not supported.");
  return extension;
}
async function readDocx(bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
  const worker = new Worker(new URL("./docxExtraction.worker.ts", import.meta.url), { type: "module" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  try {
    return await new Promise<string>((resolve, reject) => {
      abort = () => reject(new Error("Document import cancelled."));
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => reject(new Error("DOCX extraction timed out. Try a simpler document or paste its text.")), 15_000);
      worker.onerror = () => reject(new Error("DOCX extraction failed. Try a fresh DOCX or paste its text."));
      worker.onmessage = (event: MessageEvent<{ xml?: string; error?: string }>) => {
        if (event.data.error) reject(new Error(event.data.error));
        else { try { resolve(docxXmlToText(event.data.xml ?? "")); } catch (error) { reject(error); } }
      };
      if (signal?.aborted) abort(); else worker.postMessage(bytes, [bytes.buffer]);
    });
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); worker.terminate(); }
}
// Only a user-selected File, never a pathname or URL. No persistence or provider calls.
export async function extractResumeDocument(file: File, signal?: AbortSignal): Promise<ExtractedResume> {
  const format = validateResumeFile(file);
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength !== file.size || buffer.byteLength > MAX_DOCUMENT_BYTES) throw new Error("The selected file changed or exceeds the import limit.");
  if (signal?.aborted) throw new Error("Document import cancelled.");
  const bytes = new Uint8Array(buffer);
  const signature = new TextDecoder().decode(bytes.subarray(0, 5));
  if (format === "pdf" ? signature !== "%PDF-" : bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) throw new Error("The file content does not match its PDF/DOCX extension.");
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))).map(n => n.toString(16).padStart(2, "0")).join("");
  const result = format === "pdf" ? await (await import("./pdfText")).extractPdfText(bytes, signal) : { text: await readDocx(bytes, signal), pages: undefined };
  if (!result.text.trim()) throw new Error("No readable text was found. This may be a scanned or image-only résumé. OCR is not supported; paste the text or select a text-based document.");
  if (result.text.length > MAX_DOCUMENT_TEXT) throw new Error("Extracted text exceeds 100,000 characters.");
  return { ...result, format, sourceReference: `resume-${format}-sha256:${hash};file=${encodeURIComponent(file.name)}`, warnings: ["Text only: the original layout is not imported. Check reading order, especially columns and tables.", "Extracted claims are unverified. Review the detected structure and every proposed fact before saving."] };
}
