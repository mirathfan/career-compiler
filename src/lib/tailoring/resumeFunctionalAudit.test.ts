import { expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { resumeAuditFixture } from "../../test/resumeAuditFixture";
import { createMasterResumeFromProfile } from "./masterResume";
import { scoreCareerFacts } from "./evidence";
import { createControlledResumeVariantFromBase } from "./baseVariant";
import { MockAIProvider } from "../ai/mockProvider";
import { buildResumeGenerationRequest } from "../ai/generationRequest";
import { generateEvidenceGroundedResume } from "../ai/generationPipeline";
import { allResumeBullets, validateResumeClaims } from "../resume/validation";
import { renderResumeLatex } from "../resume/latex";

it("audits complete-profile creation, two job-specific plans, conservative children and submitted identity", async () => {
  const f = await resumeAuditFixture();
  const master = createMasterResumeFromProfile({ ...f, settings: f.settings.templateSettings });
  expect(master.projects).toHaveLength(2);expect(master.experience).toHaveLength(1);expect(master.education).toHaveLength(1);
  expect(validateResumeClaims({ resume: master, ...f }).filter(x => x.severity === "error")).toEqual([]);
  const source = await f.repo.saveResumeVersion({ id: "audit-master", jobId: "", name: "Synthetic Master", kind: "master", contentJson: master });
  const submitted = await f.repo.saveResumeVersion({ id: "audit-submitted", jobId: "", name: "Synthetic Submitted", kind: "tailored", parentResumeVersionId: source.id, contentJson: master, status: "exported" });
  const historical = await f.repo.saveApplication({ id: "audit-historical-application", company: "Past Synthetic", role: "Engineer", status: "applied", submittedResumeVersionId: submitted.id, submittedPdfHash: "synthetic-preserved-digest" });
  const snapshots = [];
  for (const job of f.jobs) {
    const provider = new MockAIProvider();
    const analysis = (await provider.analyzeJob({ ...job, modelName: "mock" })).data;
    const evidence = scoreCareerFacts(analysis, f.facts, f.items);
    const controls = { ...f.settings.tailoringDefaults, projectCount: 2 as const, bulletsPerProject: 1 as const };
    const request = buildResumeGenerationRequest({ ...f, job, analysis, evidence, controls });
    const result = await generateEvidenceGroundedResume({ provider, request, modelName: "mock" });
    expect(result.validationIssues.filter(x => x.severity === "error")).toEqual([]);
    expect(result.resume.projects[0].careerItemId).toBe(job.id === "audit-backend-job" ? "audit-backend" : "audit-ai");
    for (const { bullet } of allResumeBullets(result.resume)) {
      expect(bullet.sourceFactIds.length).toBeGreaterThan(0);
      expect(f.facts.some(fact => fact.id === bullet.sourceFactIds[0] && fact.statement === bullet.text)).toBe(true);
    }
    const controlled = createControlledResumeVariantFromBase({ base: master, proposed: result.resume });
    const child = await f.repo.saveResumeVersion({ id: `${job.id}-child`, jobId: job.id, contentJson: controlled.variant, parentResumeVersionId: source.id, baseResumeVersionId: source.id, kind: "tailored" });
    expect(child.parentResumeVersionId).toBe(source.id);
    expect(await f.repo.getResumeVersion(source.id)).toEqual(source);
    expect(await f.repo.getResumeVersion(submitted.id)).toEqual(submitted);
    expect(await f.repo.getApplication(historical.id)).toEqual(historical);
    // The existing controlled merge preserves base content. Do not mistake a
    // job-specific ranking for automatic removal/reordering of base sections.
    expect(child.contentJson.projects.map(x => x.careerItemId)).toEqual(master.projects.map(x => x.careerItemId));
    snapshots.push({ job, analysis, selectedProject: result.resume.projects[0].careerItemId, proposed: result.resume, child, controlled });
  }
  if (process.env.CC_INTELLIGENCE_EVIDENCE) {
    const out = process.env.CC_INTELLIGENCE_EVIDENCE;
    await writeFile(`${out}/resume-functional-audit.json`, JSON.stringify({ master: source, submitted, historical, scenarios: snapshots, limitation: "Mock generation changes selected proposed projects. Controlled variants retain all base sections and, for these generic fact IDs, original wording." }, null, 2));
    for (const [name, content] of [["master", master], ["backend", snapshots[0].child.contentJson], ["ai", snapshots[1].child.contentJson]] as const) await writeFile(`${out}/audit-${name}.tex`, renderResumeLatex(content, f.settings.templateSettings));
  }
});

it("does not fabricate experience when the profile has no eligible facts", async () => {
  const f = await resumeAuditFixture();
  const empty = createMasterResumeFromProfile({ ...f, facts: f.facts.map(x => ({ ...x, evidenceStatus: "needs_review" as const })), settings: f.settings.templateSettings });
  expect(empty.projects).toEqual([]);expect(empty.experience).toEqual([]);expect(allResumeBullets(empty)).toEqual([]);
});
