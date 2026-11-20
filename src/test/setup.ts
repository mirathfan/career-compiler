import { webcrypto } from "node:crypto";
if (!globalThis.crypto.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
import "@testing-library/jest-dom/vitest";

// Explicit synthetic file reader for unit tests; production always invokes native bounded reads.
import { vi } from "vitest";
vi.mock("../lib/resume/pdfProvenance", () => ({
  PDF_PROVENANCE_VERSION: "cc-pdf-sha256-v1",
  readPdfProvenance: vi.fn(async () => ({ version: "cc-pdf-sha256-v1", digest: "a".repeat(64), sizeBytes: 100 })),
}));

// jsdom does not implement dialog presentation. Native/browser focus is verified separately.
if (typeof HTMLDialogElement !== "undefined") HTMLDialogElement.prototype.show = function () { this.setAttribute("open", ""); };
