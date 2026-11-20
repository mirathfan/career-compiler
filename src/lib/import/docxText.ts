import { Unzip, UnzipInflate } from "fflate";

export const MAX_DOCUMENT_BYTES = 10_000_000;
export const MAX_DOCUMENT_TEXT = 100_000;
const MAX_XML = 2_000_000;
const invalid = () => new Error("This DOCX is corrupt or uses an unsupported archive structure. Export a fresh DOCX or paste its text.");

// Inspect the directory before decompression. No archive member is written to disk.
export function extractDocxXml(bytes: Uint8Array): string {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65_557) && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || end < bytes.length - 65_557) throw invalid();
  const count = view.getUint16(end + 10, true), start = view.getUint32(end + 16, true);
  if (!count || count > 512 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || start >= end) throw invalid();
  const entries = new Map<string, number>(); let offset = start, expanded = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw invalid();
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 24, true), nameLength = view.getUint16(offset + 28, true);
    const next = offset + 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (next > end || flags & 1 || ![0, 8].includes(method) || size > 8_000_000) throw invalid();
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..") || name.includes(":") || entries.has(name)) throw invalid();
    if (/vbaProject|word\/embeddings\//i.test(name)) throw new Error("This document contains macros or embedded objects. Export a plain DOCX without those objects.");
    expanded += size; if (expanded > 32_000_000) throw new Error("This DOCX expands beyond the safe import limit.");
    entries.set(name, size); offset = next;
  }
  const expected = entries.get("word/document.xml");
  if (!entries.has("[Content_Types].xml") || expected === undefined || expected > MAX_XML) throw invalid();
  const chunks: Uint8Array[] = []; let total = 0, done = false, seen = 0;
  const unzip = new Unzip(file => {
    if (++seen > 512 || !entries.has(file.name)) throw invalid();
    if (file.name !== "word/document.xml") return;
    if (done) throw invalid();
    file.ondata = (error, data, final) => {
      if (error) throw invalid();
      total += data.length;
      if (total > MAX_XML || total > expected) throw new Error("This DOCX expands beyond the safe import limit.");
      chunks.push(data); done = final;
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  // Bound each inflate output burst, including dishonest archive size headers.
  for (let p = 0; p < bytes.length; p += 1024) unzip.push(bytes.subarray(p, p + 1024), p + 1024 >= bytes.length);
  if (!done || total !== expected) throw invalid();
  const xmlBytes = new Uint8Array(total); let pos = 0;
  for (const chunk of chunks) { xmlBytes.set(chunk, pos); pos += chunk.length; }
  return decoder.decode(xmlBytes);
}

export function docxXmlToText(xml: string): string {
  if (xml.length > MAX_XML || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw invalid();
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length || doc.documentElement.localName !== "document") throw invalid();
  const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paragraphs = Array.from(doc.getElementsByTagNameNS(ns, "p"));
  const lines = paragraphs.map(p => {
    const collect = (node: Element): string => {
      if (node.namespaceURI === ns && node.localName === "t") return node.textContent ?? "";
      if (node.namespaceURI === ns && ["br", "cr", "tab"].includes(node.localName)) return " ";
      return Array.from(node.children).map(collect).join("");
    };
    const text = collect(p);
    return (p.getElementsByTagNameNS(ns, "numPr").length ? "• " : "") + text;
  });
  const text = lines.join("\n");
  if (text.length > MAX_DOCUMENT_TEXT) throw new Error("Extracted text exceeds 100,000 characters. Import a shorter document.");
  return text.trim();
}
