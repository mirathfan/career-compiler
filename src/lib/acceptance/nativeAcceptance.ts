import { issueFillAuthorization, consumeFillAuthorization } from "../extension/fillAuthorization";
import type { PreparedApplication } from "../extension/protocol";
import { jobFingerprint, resumeFingerprint } from "../job-automation/safety";
import { readPdfProvenance } from "../resume/pdfProvenance";
import { reserveBudget, budgetUsage } from "../job-automation/budget";
import type Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { PDFDocument } from "pdf-lib";
import type { Job, TailoredResume } from "../../types/domain";
import { SqliteRepository } from "../database/sqliteRepository";
import { MockAIProvider } from "../ai/mockProvider";
import { runJobAutomation } from "../job-automation/runner";
import { cancelPendingJobMatchBatch, runApprovedJobMatchBatch, setDeterministicScoreOnly } from "../job-automation/aiBatch";
import { requireApprovedPackage, updatePackageResume } from "../job-automation/applicationPackages";
import { readJobMatchAnalysisAudit } from "../job-automation/analysisState";
import { renderResumeLatex } from "../resume/latex";

export interface AcceptanceEnvironment { windowGeometry?: Record<string, unknown>; root: string; databaseUrl: string; appConfigDir: string; uiMode?: boolean; jobsFeed?: boolean; bridgeMode?: boolean; processId?: number; budgetProbe?: string; interruptProbe?: boolean }
export interface AcceptanceResult { scenario: string; status: "PASS" | "FAIL"; detail: string }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function deferred() { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; }
const now = () => new Date("2026-10-13T12:00:00Z");
const description = "Build React and TypeScript products. 2 years experience.";
export function fixtureJobPayload(url: string, changed = false) {
  const text = changed ? "Build distributed Rust infrastructure and operate multi-region data services with incident response, architecture and reliability ownership." : description;
  if (url.includes("greenhouse")) return { jobs: [{ id: 101, title: "Software Engineer", updated_at: now().toISOString(), location: { name: "Remote" }, absolute_url: "https://example.invalid/greenhouse/101", content: text }] };
  if (url.includes("lever")) return [{ id: "lever-1", text: "Software Engineer", categories: { location: "Remote", commitment: "Full-time" }, descriptionPlain: "Build React frontend interfaces, accessible component libraries and design tools. Test browser workflows. 2 years experience.", hostedUrl: "https://example.invalid/lever/1", applyUrl: "https://example.invalid/lever/1/apply", workplaceType: "remote" }];
  if (url.includes("ashby")) return { apiVersion: "1", jobs: [{ title: "Software Engineer", location: "Remote", isListed: true, isRemote: true, descriptionPlain: "Build TypeScript backend APIs and SQL services. Maintain automated tests, cloud infrastructure and reliable data processing systems. 2 years experience.", publishedAt: now().toISOString(), employmentType: "FullTime", jobUrl: "https://example.invalid/ashby/1", applyUrl: "https://example.invalid/ashby/1/application" }] };
  throw new Error("Unknown fixture source");
}

export async function openIsolatedRepository(environment: AcceptanceEnvironment) {
  // Exact native allowlist, path verified via SQLite itself before migrations.
  assert(environment.databaseUrl === `sqlite:${environment.root}/native.sqlite3`, "Unexpected database URI");
  const db = {
    path: environment.databaseUrl,
    select: async <T>(query: string, values: unknown[] = []) => invoke<T>("acceptance_query", { query, values, select: true }),
    execute: async (query: string, values: unknown[] = []) => invoke("acceptance_query", { query, values, select: false }),
    close: async () => true,
  } as unknown as Database;
  const paths = await db.select<Array<{ file: string }>>("PRAGMA database_list");
  assert(paths.some((path) => path.file === `${environment.root}/native.sqlite3`), `Unexpected SQLite path: ${JSON.stringify(paths)}`);
  const repository = new SqliteRepository(db);
  await repository.initialize();
  return { db, repository, paths };
}

export async function runNativeAcceptance(environment: AcceptanceEnvironment, record: (result: AcceptanceResult) => void) {
  const results: AcceptanceResult[] = [];
  const check = async (scenario: string, operation: () => Promise<string>) => {
    try { const result: AcceptanceResult = { scenario, status: "PASS", detail: await operation() }; results.push(result); record(result); }
    catch (error) { const result: AcceptanceResult = { scenario, status: "FAIL", detail: String(error) }; results.push(result); record(result); }
  };
  const { db, repository, paths } = await openIsolatedRepository(environment);
  const resumed = Boolean(await repository.getProfile());
  await check("1 native launch and isolation", async () => {
    for (const [command, args] of [["run_openai_structured", { request: {} }], ["fetch_public_job_board", { url: "https://api.lever.co/v0/postings/fixture", timeoutMs: 1000 }], ["get_openai_key_status", {}], ["extension_install_native_host", {}]] as const) {
      let blocked = false; try { await invoke(command, args); } catch { blocked = true; }
      assert(blocked, `${command} was not blocked`);
    }
    let blocked = false; try { await invoke("plugin:sql|load", { db: "sqlite:careercompiler.db" }); } catch { blocked = true; }
    assert(blocked, "Production database URL was not denied by SQL scope");
    return `Native SQLite ${paths[0].file}; OpenAI, boards, Keychain, bridge and production DB commands denied; normal App/scheduler never mounted`;
  });
  if (resumed) {
    await check("13 native process restart persistence", async () => {
      assert((await repository.listJobs()).length === 3, "Jobs missing after restart");
      const packageRecord = (await repository.listApplicationPackages())[0];
      const tracker = (await repository.listApplications()).find(item => item.jobId === packageRecord.jobId)!;
      assert(packageRecord.approvedAt && packageRecord.resumeVersionId === "resume-b" && tracker.resumeVersionId === "resume-b", "Package/tracker not restored");
      assert(tracker.statusHistoryJson.length >= 4, "History missing");
      const preview = await runApprovedJobMatchBatch(repository, { jobIds: (await repository.listJobs()).map((job) => job.id), approved: true, forceReanalysis: true, trigger: "mock", provider: new MockAIProvider(), now });
      assert(preview.started === 0 && preview.dailyUsed === 3, "Daily capacity was not preserved");
      const interrupted = (await repository.listJobMatches()).find((match) => readJobMatchAnalysisAudit(match.analysisJson)?.errorCode === "analysis_interrupted");
      assert(interrupted && interrupted.aiScore === null, "Interrupted analysis was not recovered");
      assert((await repository.listJobMatches()).some(match => readJobMatchAnalysisAudit(match.analysisJson)?.state === "stale" && match.aiScore === null), "Evidence stale state was not restored");
      assert(await requireApprovedPackage(repository, packageRecord.jobId), "PDF digest approval was not restored");
      return `3 jobs, approved resume-b package/tracker, ${tracker.statusHistoryJson.length} history events, daily usage 3 and interrupted fallback restored`;
    });
  } else {
    await check("2 import synthetic candidate profile and evidence", async () => {
      const profile = JSON.parse(JSON.stringify({ id: "synthetic-profile", fullName: "Synthetic Test Candidate", headline: "Software Engineer", city: "Fixture City", region: "", email: "synthetic@example.invalid", phone: "", portfolioUrl: "", linkedInUrl: "", githubUrl: "", workAuthorizationNote: "", updatedAt: now().toISOString() }));
      await repository.saveProfile(profile);
      await repository.saveSettings({ ...(await repository.getSettings()), aiProvider: "mock" });
      for (const [id, enabled, organization] of [["eligible", true, "Fixture Org"], ["disabled", false, "Fixture Org"], ["sensitive", true, "sensitive@example.invalid"]] as const) {
        await repository.saveCareerItem({ id, enabled, organization, type: "project", title: "TypeScript React project" });
        await repository.saveCareerFact({ id: `fact-${id}`, careerItemId: id, statement: `Built React TypeScript software (${id}).`, enabled: true, evidenceStatus: "verified", skillTags: ["React", "TypeScript"] });
      }
      await repository.saveSkill({ id: "skill-react", name: "React", category: "Framework" });
      await repository.saveJobSearchPreferences({ automationEnabled: false, aiMatchEnabled: true, aiMatchMockMode: true, aiMatchMinimumDeterministicScore: 0, minimumMatchScore: 0, maximumAiAnalysesPerRun: 3, maximumAiAnalysesPerDay: 3, targetRoleTitles: ["Software Engineer"], preferredSkills: ["React", "TypeScript"] });
      return "Synthetic JSON profile saved via repository; eligible/disabled/sensitive parent fixtures saved; mock provider and discovery disabled";
    });
    await check("3 mock Greenhouse Lever Ashby ingestion", async () => {
      for (const sourceType of ["greenhouse", "lever", "ashby"] as const) await repository.saveJobSource({ name: `Fixture ${sourceType}`, companyName: `Synthetic ${sourceType}`, sourceType, sourceIdentifier: "fixture", enabled: true });
      const run = await runJobAutomation(repository, { now, fetchContext: { maxAttempts: 1, fetchJson: async (url) => fixtureJobPayload(url) } });
      assert(run.jobsAdded === 3 && run.sourcesChecked === 3 && run.errors.length === 0, JSON.stringify(run.errors));
      return "3 fixture postings normalized through the real adapters/runner; no network transport used";
    });
    const jobs = (await repository.listJobs()).sort((a, b) => ["Synthetic greenhouse", "Synthetic lever", "Synthetic ashby"].indexOf(a.company) - ["Synthetic greenhouse", "Synthetic lever", "Synthetic ashby"].indexOf(b.company));
    await check("4 deterministic eligibility and scoring", async () => {
      const matches = await repository.listJobMatches();
      assert(matches.length === 3 && matches.every((match) => match.deterministicScore > 0 && !match.hardReject), "Scoring failed");
      return JSON.stringify(matches.map((match) => ({ jobId: match.jobId, deterministicScore: match.deterministicScore })));
    });
    await check("5 mocked AI matching and 7 evidence exclusion", async () => {
      const provider = new MockAIProvider();
      const original = provider.analyzeJobMatch.bind(provider);
      provider.analyzeJobMatch = async (input) => {
        const ids = input.request.evidencePacket.suppliedIds.evidenceIds;
        assert(ids.includes("fact-eligible") && !ids.includes("fact-disabled") && !ids.includes("fact-sensitive"), "Excluded parent leaked into request");
        return original(input);
      };
      const result = await runApprovedJobMatchBatch(repository, { jobIds: [jobs[0].id], approved: true, trigger: "mock", provider, now });
      assert(result.valid === 1, "Mock analysis not accepted");
      return "Captured mock request includes eligible fact and excludes disabled/sensitive parents; valid audit persisted";
    });
    await check("6 cancellation overlap provider failure and daily caps", async () => {
      const gate = deferred(); const entered = deferred(); const provider = new MockAIProvider("valid", "permanent_invalid");
      const original = provider.analyzeJobMatch.bind(provider);
      provider.analyzeJobMatch = async (input) => { entered.resolve(); await gate.promise; return original(input); };
      const running = runApprovedJobMatchBatch(repository, { jobIds: [jobs[1].id, jobs[2].id], approved: true, trigger: "mock", provider, now });
      await entered.promise;
      let rejected = false; try { await runApprovedJobMatchBatch(repository, { jobIds: [jobs[2].id], approved: true, trigger: "mock", provider: new MockAIProvider(), now }); } catch { rejected = true; }
      cancelPendingJobMatchBatch(); gate.resolve(); const cancelled = await running;
      assert(rejected && cancelled.started === 1 && cancelled.cancelled && cancelled.failed === 1, "Overlap/cancellation/failure mismatch");
      const resumedBatch = await runApprovedJobMatchBatch(repository, { jobIds: [jobs[2].id], approved: true, trigger: "mock", provider: new MockAIProvider(), now });
      assert(resumedBatch.valid === 1, "Failure prevented restart");
      const capped = await runApprovedJobMatchBatch(repository, { jobIds: jobs.map((job) => job.id), approved: true, forceReanalysis: true, trigger: "mock", provider: new MockAIProvider(), now });
      assert(capped.dailyUsed === 3 && capped.started === 0, "Daily cap bypassed");
      return "Concurrent start rejected; cancelled between jobs; permanent repair failure fell back; next batch succeeded; 3/day cap blocks forced reanalysis";
    });
    const job = jobs[0];
    await check("8 create application package", async () => { await repository.saveApplicationPackage({ jobId: job.id }); return "Unapproved package created"; });
    await check("9 native XeLaTeX test resumes", async () => {
      const content: TailoredResume = { id: "synthetic-resume", header: { fullName: "Synthetic Test Candidate", headline: "Software Engineer", location: "Fixture City", email: "synthetic@example.invalid", phone: "", portfolioUrl: "", linkedInUrl: "", githubUrl: "", workAuthorizationNote: "" }, summary: [], education: [], experience: [], projects: [], skills: ["React", "TypeScript"], sectionOrder: ["education", "experience", "projects", "skills"], compactionActions: [], layout: { bodyFontSize: 9.5, spacingScale: 1, condensedSkills: false }, approvedWarningCodes: [] };
      const master = await repository.saveResumeVersion({ id: "resume-master", jobId: job.id, name: "Synthetic Master", kind: "master", contentJson: { ...content, id: "resume-master" }, validationJson: [] });
      let exportedA: string | undefined;
      let submittedA: string | undefined;
      let digestA: string | undefined;
      for (const id of ["resume-a", "resume-b"]) {
        const versionContent = { ...content, id, header: { ...content.header, headline: `Software Engineer - Synthetic version ${id === "resume-a" ? "A" : "B"}` } };
        const bytes = await invoke<number[]>("render_resume_latex", { latexSource: renderResumeLatex(versionContent) });
        assert((await PDFDocument.load(new Uint8Array(bytes))).getPageCount() === 1, "PDF page check failed");
        const path = await invoke<string>("acceptance_artifact", { name: `${id}.pdf`, bytes });
        const saved = await repository.saveResumeVersion({ id, name: id === "resume-a" ? "Synthetic resume A" : "Synthetic resume B", jobId: job.id, contentJson: versionContent, parentResumeVersionId: master.id, baseResumeVersionId: master.id, status: "exported", lastExportPath: path, validationJson: [] });
        const provenance = await readPdfProvenance(path);
        assert(provenance.digest && saved.contentJson.id === id && path === `${environment.root}/${id}.pdf`, "Version/output identity mismatch");
        if (id === "resume-a") {
          exportedA = JSON.stringify(saved);
          digestA = provenance.digest;
          submittedA = JSON.stringify(await repository.saveApplication({ id: "pdf-historical-submission", company: "Synthetic Historical Employer", role: "Software Engineer", status: "applied", appliedDate: "2026-10-01", submittedAt: "2026-10-01T12:00:00Z", resumeVersionId: id, submittedResumeVersionId: id, submittedPdfPath: path, submittedPdfHash: provenance.digest }));
        }
      }
      assert(JSON.stringify(await repository.getResumeVersion(master.id)) === JSON.stringify(master), "Master changed during export");
      assert(JSON.stringify(await repository.getResumeVersion("resume-a")) === exportedA, "Existing exported version changed");
      assert(JSON.stringify(await repository.getApplication("pdf-historical-submission")) === submittedA, "Historical submitted reference changed");
      assert((await readPdfProvenance(`${environment.root}/resume-a.pdf`)).digest === digestA, "Historical PDF was overwritten");
      const beforeFailure = JSON.stringify(await repository.listResumeVersions());
      let failure = "";
      try { await invoke("render_resume_latex", { latexSource: "\\documentclass{article}\\begin{document}\\SyntheticUndefinedCommand\\end{document}" }); }
      catch (error) { failure = String(error); }
      assert(failure.startsWith("latex_compile_failed|") && !failure.includes("SyntheticUndefinedCommand"), "Compiler failure was not sanitized");
      assert(JSON.stringify(await repository.listResumeVersions()) === beforeFailure, "Failed render changed versions");
      assert((await readPdfProvenance(`${environment.root}/resume-a.pdf`)).digest === digestA, "Failed render changed submitted PDF");
      return "Two distinct synthetic version A/B PDFs compiled by native XeLaTeX; pdf-lib and native SHA-256 snapshots verify readable one-page output. Master, prior exported A and historical submitted A reference/hash preserved. Invalid LaTeX fails with sanitized latex_compile_failed and no version/output mutation. No model resume generation claimed.";
    });
    await check("10 approve package", async () => { await updatePackageResume(repository, job.id, "resume-a", true); assert(await requireApprovedPackage(repository, job.id, "resume-a"), "Approval missing"); return "resume-a package approved and tracker ready"; });
    await check("11 replace resume and revoke approval", async () => {
      await updatePackageResume(repository, job.id, "resume-b"); let denied = false; try { await requireApprovedPackage(repository, job.id); } catch { denied = true; }
      assert(denied && (await repository.listApplications()).find(item => item.jobId === job.id)!.resumeVersionId === "resume-b", "Replacement inconsistency");
      return "resume-b tracker synchronized; old approval revoked; package preparation gate rejects";
    });
    await check("12 reapprove and synchronize tracker", async () => { await updatePackageResume(repository, job.id, "resume-b", true); assert(await requireApprovedPackage(repository, job.id, "resume-b"), "Reapproval missing"); return "Fresh approval for resume-b and tracker ready"; });
    await check("15 package tracker partial-write failure and recovery", async () => {
      repository.saveApplication = async () => { throw new Error("synthetic injected tracker write failure"); };
      let failed = false; try { await updatePackageResume(repository, job.id, "resume-a"); } catch { failed = true; } finally { Reflect.deleteProperty(repository, "saveApplication"); }
      const restored = await requireApprovedPackage(repository, job.id, "resume-b");
      assert(failed && restored?.approvedAt, "Partial failure did not roll back approval");
      await updatePackageResume(repository, job.id, "resume-b", true);
      const tracker = (await repository.listApplications()).find(item => item.jobId === job.id)!;
      assert(tracker.resumeVersionId === "resume-b" && tracker.statusHistoryJson.length >= 4, "Recovery/history failure");
      return "Injected write failure rolled back package/tracker/revision/audit together; retry recovered successfully";
    });
    await check("14 stale analysis invalidation", async () => {
      await runJobAutomation(repository, { now, fetchContext: { maxAttempts: 1, fetchJson: async (url) => fixtureJobPayload(url, true) } });
      const greenhouse = (await repository.listJobs()).find((item: Job) => item.company === "Synthetic greenhouse")!;
      const match = await repository.getJobMatch(greenhouse.id);
      assert(match?.aiScore === null && readJobMatchAnalysisAudit(match.analysisJson)?.state === "stale", "Changed posting retained AI influence");
      return "Material fixture posting change archived prior analysis and cleared AI score";
    });
    await setDeterministicScoreOnly(repository, job.id); // explicit synthetic review chooses deterministic justification after job change
    await updatePackageResume(repository, job.id, "resume-b", true);
    await check("16 PDF same-path provenance and stale browser token", async () => {
      const resume = (await repository.getResumeVersion("resume-b"))!;
      const original = await invoke<{ fileBase64: string }>("resume_pdf_snapshot", { path: resume.lastExportPath });
      const originalBytes = Uint8Array.from(atob(original.fileBase64), character => character.charCodeAt(0));
      const provenance = await readPdfProvenance(resume.lastExportPath);
      const application = (await repository.listApplications()).find(item => item.jobId === job.id)!;
      const prepared = { applicationId: application.id, fields: [], contentFingerprint: { job: jobFingerprint((await repository.getJob(job.id))!), resume: await resumeFingerprint(resume), pdf: provenance.digest } } as unknown as PreparedApplication;
      prepared.authorization = await issueFillAuthorization(repository, prepared, "synthetic-native");
      const replacement = await PDFDocument.load(originalBytes); replacement.setTitle("Synthetic changed bytes");
      await invoke("acceptance_artifact", { name: "resume-b.pdf", bytes: Array.from(await replacement.save()) });
      let denied = false;
      try { await consumeFillAuthorization(repository, prepared, "synthetic-native", job.applicationUrl); } catch { denied = true; }
      assert(denied && !(await repository.listApplicationPackages()).find(item => item.jobId === job.id)?.approvedAt, "Changed PDF retained approval");
      await invoke("acceptance_artifact", { name: "resume-b.pdf", bytes: Array.from(originalBytes) });
      let restoreDenied = false; try { await requireApprovedPackage(repository, job.id); } catch { restoreDenied = true; }
      assert(restoreDenied, "Restoring bytes resurrected revoked approval");
      await updatePackageResume(repository, job.id, "resume-b", true);
      let replayDenied = false; try { await consumeFillAuthorization(repository, prepared, "synthetic-native", job.applicationUrl); } catch { replayDenied = true; }
      assert(replayDenied, "Reapproval resurrected old browser token");
      return "Same-path native bytes changed: token rejected, approval/tracker revoked atomically; restoration requires reapproval; old token stays rejected";
    });
    await check("17 evidence edit invalidates completed analysis and approval", async () => {
      const valid = (await repository.listJobMatches()).find(item => readJobMatchAnalysisAudit(item.analysisJson)?.state === "valid")!;
      assert(valid, "Completed analysis missing");
      const fact = (await repository.listCareerFacts()).find(item => item.id === "fact-eligible")!;
      const reservations = (await repository.listSafetyRecords("ai_budget")).length;
      await repository.saveCareerFact({ ...fact, sourceReference: "synthetic reviewed correction" });
      const stale = await repository.getJobMatch(valid.jobId);
      assert(stale?.aiScore === null && readJobMatchAnalysisAudit(stale.analysisJson)?.state === "stale", "Evidence edit retained valid AI");
      assert(!(await repository.listApplicationPackages()).find(item => item.jobId === job.id)?.approvedAt, "Evidence edit retained package approval");
      assert((await repository.listSafetyRecords("ai_budget")).length === reservations, "Invalidation spent budget");
      assert((await repository.listJobMatchHistory()).some(row => readJobMatchAnalysisAudit(row.analysisJson)?.state === "valid"), "Analysis audit lost");
      await repository.saveCareerFact(fact); // restore fixture inputs, never restore completed AI validity
      await setDeterministicScoreOnly(repository, job.id);
      await updatePackageResume(repository, job.id, "resume-b", true); // explicit synthetic review, not AI justification
      return "Persisted evidence correction revoked completed AI and package, preserved historical analysis and budget; explicit deterministic-only review reapproved package";
    });
    await check("6 stage interrupted analysis for process restart", async () => {
      const match = (await repository.listJobMatches()).find((item) => readJobMatchAnalysisAudit(item.analysisJson)?.state === "failed")!;
      assert(match, "No failed synthetic attempt to stage");
      await repository.saveJobMatch({ ...match, analysisJson: { ...readJobMatchAnalysisAudit(match.analysisJson)!, state: "running" } });
      return "Injected interrupted running state persisted; stage-two process must recover without spending capacity";
    });
    // Persist sources disabled so any future manual page cannot start collection.
    for (const source of await repository.listJobSources()) await repository.saveJobSource({ ...source, enabled: false });
  }
  const report = { environment, actualDatabasePaths: paths, stage: resumed ? "restart" : "initial", results, finishedAt: new Date().toISOString(), limitations: ["Dedicated acceptance WebView harness, not normal routed UI", "Mock ATS transport and AI, not live integration", "Failure injection, not OS-level power loss"] };
  await invoke("acceptance_artifact", { name: resumed ? "stage-two.json" : "stage-one.json", bytes: Array.from(new TextEncoder().encode(JSON.stringify(report, null, 2))) });
  await db.close();
  return report;
}


export async function runNativeBudgetProbe(environment: AcceptanceEnvironment) {
  const { db, repository } = await openIsolatedRepository(environment);
  const day = "2026-10-14T12:00:00Z";
  await repository.saveSafetyRecord({ id: environment.budgetProbe!, kind: "probe_ready", createdAt: new Date().toISOString(), value: { processId: environment.processId } });
  const deadline = Date.now() + 15_000;
  while ((await repository.listSafetyRecords("probe_ready")).length < 2) {
    if (Date.now() > deadline) throw new Error("Second native process did not reach the reservation barrier");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const results = [];
  for (const job of await repository.listJobs()) results.push(await reserveBudget(repository, `process-${environment.processId}-${job.id}`, job.id, job.contentHash, day, "mock"));
  const report = { processId: environment.processId, root: environment.root, granted: results.filter(Boolean).length, usage: await budgetUsage(repository, day.slice(0,10)), providerCalls: 0 };
  await invoke("acceptance_artifact", { name: `budget-probe-${environment.budgetProbe}.json`, bytes: Array.from(new TextEncoder().encode(JSON.stringify(report,null,2))) });
  await db.close();
  return report;
}


export async function runNativeInterruptionProbe(environment: AcceptanceEnvironment) {
  const { repository } = await openIsolatedRepository(environment);
  const item = (await repository.listApplicationPackages())[0];
  const tracker = (await repository.listApplications())[0];
  const revision = (await repository.listSafetyRecords("package_revision")).find((record) => record.id === item.id);
  const audits = await repository.listSafetyRecords("package_audit");
  const id = await invoke<string>("transaction_begin");
  await invoke("transaction_query", { id, query: "UPDATE application_packages SET approved_at='',resume_version_id='resume-a' WHERE id=$1", values: [item.id], select: false });
  await invoke("transaction_query", { id, query: "UPDATE applications SET resume_version_id='resume-a' WHERE id=$1", values: [tracker.id], select: false });
  await invoke("transaction_query", { id, query: "UPDATE safety_records SET value_json='{}' WHERE kind='package_revision' AND id=$1", values: [item.id], select: false });
  await invoke("transaction_query", { id, query: "INSERT INTO safety_records(id,kind,value_json,created_at) VALUES('interrupted-audit','package_audit','{}','synthetic')", values: [], select: false });
  await invoke("acceptance_artifact", { name: "interrupt-ready.json", bytes: Array.from(new TextEncoder().encode(JSON.stringify({ processId: environment.processId, item, tracker, revision, auditCount: audits.length, uncommittedWrites: 4 },null,2))) });
  // The controller terminates this process before COMMIT. Native session timeout
  // is a fallback, not the event used to verify process-interruption rollback.
  await new Promise(() => {});
}
