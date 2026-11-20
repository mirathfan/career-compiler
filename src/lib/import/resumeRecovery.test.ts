import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { extractDocxXml, docxXmlToText } from "./docxText";
import { validateResumeFile } from "./resumeDocument";
import { proposeResumeIntake } from "./resumeIntake";
import { prepareCareerImportProposal } from "./careerIntake";
import { MemoryRepository } from "../database/memoryRepository";

export const recoveryText = `Projects
Backend Platform | Synthetic Labs
• Built Python and FastAPI services with PostgreSQL, Docker and automated tests.
Agent Evaluation | Synthetic Labs
• Built Python agent orchestration, tool calling and model evaluation using LangChain and OpenAI.
Experience
Software Engineer | Synthetic Company
• Implemented TypeScript interfaces and reliability tests for API services.
Education
Bachelor of Computer Science | Synthetic University
Skills
Python, FastAPI, PostgreSQL, Docker, TypeScript, LangChain, OpenAI`;
const xml = (body: string) => `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const docx = (body: string, extra = {}) => zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "word/document.xml": strToU8(xml(body)), ...extra });

describe("local résumé document boundaries", () => {
  it("reads DOCX paragraphs and table cells in order without changing the input", () => {
    const bytes = docx(paragraph("Projects") + "<w:tbl><w:tr><w:tc>" + paragraph("Backend Platform") + "</w:tc><w:tc>" + paragraph("Python services") + "</w:tc></w:tr></w:tbl>");
    const before = bytes.slice();expect(docxXmlToText(extractDocxXml(bytes))).toBe("Projects\nBackend Platform\nPython services");expect(bytes).toEqual(before);
  });
  it.each([new Uint8Array(), new Uint8Array([80,75,3,4]), docx(paragraph("Hello"), { "../outside": strToU8("bad") }), docx(paragraph("Hello"), { "word/vbaProject.bin": strToU8("macro") })])("rejects empty/corrupt/traversing/macro archives", bytes => { expect(() => extractDocxXml(bytes)).toThrow(); });
  it("bounds decompression and XML entities and never interprets XML as HTML", () => {
    expect(() => extractDocxXml(docx(paragraph("x".repeat(2_100_000))))).toThrow();
    expect(() => docxXmlToText('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///private">]>'+xml(paragraph("&x;")))).toThrow();
    expect(docxXmlToText(xml(paragraph("&lt;script&gt;alert(1)&lt;/script&gt;")))).toBe("<script>alert(1)</script>");
  });
  it.each([{ name: "x.pdf", size: 0 }, { name: "x.docx", size: 10_000_001 }, { name: "x.docm", size: 8 }, { name: "x.png", size: 8 }])("rejects invalid selected file metadata", file => { expect(() => validateResumeFile(file)).toThrow(); });
  it("accepts only PDF and DOCX selections", () => { expect(validateResumeFile({name:"a.PDF",size:100})).toBe("pdf");expect(validateResumeFile({name:"a.docx",size:100})).toBe("docx"); });
});

it("uses existing approval, duplicate review, persistence and undo for locally extracted résumé claims", async () => {
  const repo = new MemoryRepository(); const context = { profile: await repo.getProfile(), careerItems: [], careerFacts: [], skills: [] };
  const text = docxXmlToText(extractDocxXml(docx(recoveryText.split("\n").map(paragraph).join(""))));
  const raw = proposeResumeIntake(text + "\nProjects\nUntrusted Claim\n• Increased synthetic sales by 99 percent without supporting evidence.", "resume-docx-sha256:synthetic");
  expect(raw.careerItemChanges.map(x => x.proposedValue.type)).toEqual(["project","project","employment","education","project"]);
  expect(raw.careerFactChanges.every(x => x.proposedValue.evidenceStatus === "needs_review")).toBe(true);
  expect(await repo.listCareerFacts()).toEqual([]);
  let proposal = prepareCareerImportProposal(raw, context);
  for (const change of [...proposal.careerItemChanges, ...proposal.careerFactChanges, ...proposal.skillChanges]) change.userDecision = change.sourceExcerpt.includes("99") || change.sourceExcerpt === "Untrusted Claim" ? "rejected" : "approved";
  proposal = prepareCareerImportProposal(proposal, context);
  await repo.applyCareerImportProposal(proposal);
  expect(await repo.listCareerFacts()).toHaveLength(3);expect((await repo.listCareerFacts()).every(f => f.evidenceStatus === "needs_review")).toBe(true);
  expect(await repo.listResumeVersions()).toEqual([]);
  const second = prepareCareerImportProposal(proposeResumeIntake(text, "resume-docx-sha256:synthetic"), { profile: await repo.getProfile(), careerItems: await repo.listCareerItems(), careerFacts: await repo.listCareerFacts(), skills: await repo.listSkills() });
  expect(second.careerItemChanges.some(c => c.duplicateCandidates.length > 0 || c.operation !== "add")).toBe(true);
  await repo.undoLastCareerImport();expect(await repo.listCareerFacts()).toEqual([]);
});
