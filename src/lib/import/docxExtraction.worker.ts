import { extractDocxXml } from "./docxText";
self.onmessage = (event: MessageEvent<Uint8Array>) => {
  try { self.postMessage({ xml: extractDocxXml(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "DOCX extraction failed." }); }
};
