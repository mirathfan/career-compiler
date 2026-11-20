import { getDocument, GlobalWorkerOptions, PDFWorker } from "pdfjs-dist/legacy/build/pdf.mjs";
import { MAX_DOCUMENT_TEXT } from "./docxText";

export async function extractPdfTextWithWorker(bytes: Uint8Array, workerSource: string, signal?: AbortSignal) {
  GlobalWorkerOptions.workerSrc = workerSource;
  const worker = new PDFWorker();
  const task = getDocument({ data: bytes, worker, enableXfa: false,
    useWorkerFetch: false, useSystemFonts: false, disableFontFace: true, disableAutoFetch: true,
    isOffscreenCanvasSupported: false, isImageDecoderSupported: false, useWasm: false, stopAtErrors: true, verbosity: 0 });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => { void task.destroy(); worker.destroy(); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const extraction = async () => {
      const pdf = await task.promise;
      if (pdf.numPages > 40) throw new Error("PDF import supports up to 40 pages. Select a shorter document.");
      const pages: string[] = []; let length = 0;
      for (let p = 1; p <= pdf.numPages; p++) {
        if (signal?.aborted) throw new Error("Document import cancelled.");
        const page = await pdf.getPage(p); const content = await page.getTextContent();
        let text = "", lastY: number | undefined;
        for (const item of content.items) {
          if (!("str" in item)) continue;
          const y = item.transform[5];
          if (lastY !== undefined && Math.abs(y - lastY) > 3 && !text.endsWith("\n")) text += "\n";
          text += item.str + (item.hasEOL ? "\n" : " "); lastY = y;
          if (length + text.length > MAX_DOCUMENT_TEXT) throw new Error("Extracted text exceeds 100,000 characters. Import a shorter document.");
        }
        pages.push(text.trim()); length += text.length; page.cleanup();
      }
      return { text: pages.join("\f"), pages: pdf.numPages };
    };
    return await Promise.race([extraction(), new Promise<never>((_, reject) => { timer = setTimeout(() => { abort(); reject(new Error("PDF extraction timed out. Try a simpler document or paste its text.")); }, 15_000); })]);
  } catch (error) {
    if (signal?.aborted) throw new Error("Document import cancelled.");
    if (error instanceof Error && error.name === "PasswordException") throw new Error("This PDF is password-protected. Select an unencrypted copy; CareerCompiler does not request or store document passwords.");
    if (error instanceof Error && /supports up to|exceeds|timed out/.test(error.message)) throw error;
    throw new Error("This PDF could not be read. It may be corrupt or unsupported. Export a fresh text-based PDF or paste its text.");
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); await task.destroy(); worker.destroy(); }
}
