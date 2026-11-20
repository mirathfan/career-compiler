import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { extractPdfTextWithWorker } from "./pdfExtraction";

export function extractPdfText(bytes: Uint8Array, signal?: AbortSignal) {
  return extractPdfTextWithWorker(bytes, workerUrl, signal);
}
