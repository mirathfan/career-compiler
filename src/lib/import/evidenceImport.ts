import type { CareerFact, CareerFactSourceType, EvidenceImportCandidate } from "../../types/domain";
import { createId } from "../utils";
import { extractNumericTokens } from "../resume/validation";

export interface LocalEvidenceFile {
  path: string;
  fileName: string;
  text: string;
  byteLength: number;
}

const injectionPattern = /(?:ignore|disregard).{0,40}(?:instruction|system|developer|prompt)|<\/?system>|BEGIN SYSTEM/i;

function sourceTypeFor(fileName: string): CareerFactSourceType {
  const lower = fileName.toLowerCase();
  if (lower.includes("readme") || lower.endsWith(".md")) return "readme";
  if (/test|pytest|vitest|jest/i.test(lower)) return "test_result";
  if (/build|report/i.test(lower)) return "build_output";
  return "repository";
}

function candidate(
  statement: string,
  file: LocalEvidenceFile,
  skillTags: string[] = [],
): EvidenceImportCandidate {
  return {
    id: createId("import-candidate"),
    statement,
    sourceType: sourceTypeFor(file.fileName),
    sourceReference: file.path,
    skillTags,
    metricTokens: extractNumericTokens(statement),
    confidence: "deterministic",
    approved: false,
    rejected: false,
  };
}

function packageJsonCandidates(file: LocalEvidenceFile) {
  try {
    const parsed = JSON.parse(file.text) as Record<string, unknown>;
    const values: EvidenceImportCandidate[] = [];
    if (typeof parsed.name === "string") values.push(candidate(`Project package name is ${parsed.name}.`, file));
    if (parsed.scripts && typeof parsed.scripts === "object") {
      const scripts = Object.keys(parsed.scripts as Record<string, unknown>).slice(0, 12);
      if (scripts.length) values.push(candidate(`Project defines scripts: ${scripts.join(", ")}.`, file, scripts));
    }
    const dependencies = parsed.dependencies && typeof parsed.dependencies === "object"
      ? Object.keys(parsed.dependencies as Record<string, unknown>).slice(0, 20)
      : [];
    if (dependencies.length) {
      values.push(candidate(`Project uses dependencies including ${dependencies.join(", ")}.`, file, dependencies));
    }
    const repository = typeof parsed.repository === "string"
      ? parsed.repository
      : parsed.repository && typeof parsed.repository === "object"
        ? String((parsed.repository as Record<string, unknown>).url ?? "")
        : "";
    if (repository) values.push(candidate(`Repository reference: ${repository}.`, file));
    return values;
  } catch {
    return [];
  }
}

export function extractEvidenceCandidates(file: LocalEvidenceFile) {
  if (file.byteLength > 1_000_000) throw new Error("Evidence file exceeds the 1 MB limit.");
  const lower = file.fileName.toLowerCase();
  const values = lower === "package.json" ? packageJsonCandidates(file) : [];
  const safeLines = file.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !injectionPattern.test(line));
  const heading = safeLines.find((line) => /^#\s+\S/.test(line));
  if (heading) values.push(candidate(`Project title: ${heading.replace(/^#+\s*/, "")}.`, file));
  const packageName = file.text.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1];
  if (packageName && !values.some((value) => value.statement.includes(packageName))) {
    values.push(candidate(`Project package name is ${packageName}.`, file));
  }
  const dependencyNames = [...file.text.matchAll(/^([A-Za-z0-9_.-]+)\s*(?:=|:)/gm)]
    .map((match) => match[1])
    .filter((name) => !["name", "version", "description", "authors"].includes(name.toLowerCase()))
    .slice(0, 16);
  if ((lower.endsWith(".toml") || lower.includes("pyproject")) && dependencyNames.length) {
    values.push(candidate(`Project manifest references ${[...new Set(dependencyNames)].join(", ")}.`, file, dependencyNames));
  }
  const testResult = safeLines.find((line) => /\b\d+\s+(?:tests?|passing|passed)\b/i.test(line));
  if (testResult) values.push(candidate(`Recorded test result: ${testResult}.`, file));
  const buildResult = safeLines.find((line) => /(?:build|compile|lint|typecheck).{0,40}(?:passed|succeeded|finished)/i.test(line));
  if (buildResult) values.push(candidate(`Recorded build result: ${buildResult}.`, file));
  const repositoryUrl = file.text.match(/https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/)?.[0];
  if (repositoryUrl && !values.some((value) => value.statement.includes(repositoryUrl))) {
    values.push(candidate(`Repository reference: ${repositoryUrl}.`, file));
  }
  return values.filter(
    (value, index, all) => all.findIndex((candidateValue) => candidateValue.statement === value.statement) === index,
  );
}

export function approvedCandidateToFact(
  candidateValue: EvidenceImportCandidate,
  careerItemId: string,
): Partial<CareerFact> & Pick<CareerFact, "careerItemId" | "statement"> {
  if (!candidateValue.approved || candidateValue.rejected) {
    throw new Error("Imported facts must be explicitly approved before saving.");
  }
  return {
    careerItemId,
    statement: candidateValue.statement,
    evidenceStatus: "needs_review",
    sourceNote: `Imported from ${candidateValue.sourceReference}.`,
    sourceType: candidateValue.sourceType,
    sourceReference: candidateValue.sourceReference,
    verificationDate: "",
    lastReviewedDate: "",
    notes: "Imported deterministically; review factual wording before generation use.",
    skillTags: candidateValue.skillTags,
    roleTags: [],
    metricTokens: candidateValue.metricTokens,
    importance: 3,
    enabled: true,
  };
}

export function containsPromptInjectionText(text: string) {
  return injectionPattern.test(text);
}
