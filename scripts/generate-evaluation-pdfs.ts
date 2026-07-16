import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { MemoryRepository } from "../src/lib/database/memoryRepository";
import { EVALUATION_FIXTURES } from "../src/lib/evaluation/fixtures";
import { runEvaluationFixture } from "../src/lib/evaluation/runner";
import { compactResumeForOnePage } from "../src/lib/resume/compaction";
import { renderResumeLatex } from "../src/lib/resume/latex";
import { countPdfPages } from "../src/lib/resume/pdf";
import { applyTemplateOrdering } from "../src/lib/resume/templateSettings";

const execFileAsync = promisify(execFile);

function findXelatex() {
  const candidates = [
    "/Library/TeX/texbin/xelatex",
    "/usr/local/bin/xelatex",
    "/opt/homebrew/bin/xelatex",
  ];
  return candidates.find(existsSync) ?? "xelatex";
}

async function compileLatex(source: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "careercompiler-evaluation-"));
  try {
    await writeFile(path.join(directory, "resume.tex"), source, "utf8");
    await execFileAsync(
      findXelatex(),
      [
        "-no-shell-escape",
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-file-line-error",
        "resume.tex",
      ],
      { cwd: directory, maxBuffer: 10 * 1024 * 1024 },
    );
    return new Uint8Array(await readFile(path.join(directory, "resume.pdf")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const repository = new MemoryRepository();
await repository.seedSampleData();
const profile = await repository.getProfile();
if (!profile) throw new Error("The evaluation profile is unavailable.");
const items = await repository.listCareerItems();
const facts = await repository.listCareerFacts();
const skills = await repository.listSkills();
const settings = await repository.getSettings();
const outputDirectory = path.resolve("output/pdf/evaluation");
await mkdir(outputDirectory, { recursive: true });

const reports = [];
for (const fixture of EVALUATION_FIXTURES) {
  const result = await runEvaluationFixture({
    fixture,
    mode: "ranking",
    profile,
    items,
    facts,
    skills,
    settings,
  });
  if (result.summary.metrics.unsupportedClaims !== 0 || result.summary.metrics.unsupportedNumbers !== 0) {
    throw new Error(`${fixture.name} contains unsupported generated content.`);
  }
  const ordered = applyTemplateOrdering(result.resume, settings.templateSettings);
  const compacted = compactResumeForOnePage(ordered);
  const bytes = await compileLatex(renderResumeLatex(compacted, settings.templateSettings));
  const pageCount = await countPdfPages(bytes);
  if (pageCount !== 1) throw new Error(`${fixture.name} rendered to ${pageCount} pages.`);
  const outputPath = path.join(outputDirectory, `CareerCompiler_${fixture.id}.pdf`);
  await writeFile(outputPath, bytes);
  reports.push({
    fixture: fixture.name,
    outputPath,
    pageCount,
    byteLength: bytes.byteLength,
    selectedCareerItemIds: result.summary.selectedCareerItemIds,
    selectedFactCount: result.summary.selectedFactIds.length,
    unsupportedClaims: result.summary.metrics.unsupportedClaims,
    unsupportedNumbers: result.summary.metrics.unsupportedNumbers,
    compactionActions: compacted.compactionActions,
  });
}

console.log(JSON.stringify(reports, null, 2));
