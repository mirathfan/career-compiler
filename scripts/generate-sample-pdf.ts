import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { MockAIProvider } from "../src/lib/ai/mockProvider";
import { generateEvidenceGroundedResume } from "../src/lib/ai/generationPipeline";
import { compactResumeForOnePage } from "../src/lib/resume/compaction";
import { defaultResumeFilename } from "../src/lib/resume/filename";
import { renderResumeLatex } from "../src/lib/resume/latex";
import { countPdfPages } from "../src/lib/resume/pdf";
import { createGenerationFixture } from "../src/test/generationFixture";

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
  const directory = await mkdtemp(path.join(os.tmpdir(), "careercompiler-latex-sample-"));
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

const fixture = await createGenerationFixture();
const request = structuredClone(fixture.request);
request.constraints.maximumSelectedProjects = 3;
request.constraints.contentBudget.maximumTotalBullets = 9;
const generated = await generateEvidenceGroundedResume({
  provider: new MockAIProvider("valid"),
  request,
  modelName: "mock-model",
});
const blockingIssues = generated.validationIssues.filter((issue) => issue.severity === "error");
if (blockingIssues.length > 0) {
  throw new Error(`Sample generation has ${blockingIssues.length} blocking validation issue(s).`);
}

const compacted = compactResumeForOnePage(generated.resume);
const bytes = await compileLatex(renderResumeLatex(compacted));
const pageCount = await countPdfPages(bytes);
if (pageCount !== 1) {
  throw new Error(`Sample resume rendered to ${pageCount} pages instead of one.`);
}

const outputDirectory = path.resolve("output/pdf");
const outputPath = path.join(
  outputDirectory,
  defaultResumeFilename(fixture.job.company, fixture.job.roleTitle),
);
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, bytes);

console.log(
  JSON.stringify(
    {
      outputPath,
      pageCount,
      blockingValidationIssues: blockingIssues.length,
      compactionActions: compacted.compactionActions,
      byteLength: bytes.byteLength,
      renderer: "XeLaTeX",
    },
    null,
    2,
  ),
);
