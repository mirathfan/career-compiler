import { expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import initSqlJs from "sql.js/dist/sql-asm.js";
import type TauriDatabase from "@tauri-apps/plugin-sql";
import { migrations } from "./migrations";
import { SqliteRepository } from "./sqliteRepository";
import { resumeAuditFixture } from "../../test/resumeAuditFixture";
import { prepareProfileMaster, saveProfileMaster } from "../tailoring/profileMaster";
import { saveReviewedTailoredChild } from "../tailoring/reviewedChild";
import { renderResumeLatex } from "../resume/latex";

it("pins the native migration baseline to the real 011 history and generates representative synthetic records", async () => {
  expect(JSON.parse(await readFile("src-tauri/src/migration012/migrations-through-011.json", "utf8"))).toEqual(migrations);
  expect(migrations.at(-1)?.id).toBe(11); // Production startup must not register 012.
  const SQL = await initSqlJs(), db = new SQL.Database();
  const adapter = {
    execute: async (sql: string, values: unknown[] = []) => { db.run(sql, values as (string | number | null)[]); return { rowsAffected: db.getRowsModified(), lastInsertId: 0 }; },
    select: async (sql: string, values: unknown[] = []) => { const s = db.prepare(sql); s.bind(values as (string | number | null)[]); const rows = []; while (s.step()) rows.push(s.getAsObject()); s.free(); return rows; },
  } as unknown as TauriDatabase;
  const repo = new SqliteRepository(adapter); await repo.initialize();
  const f = await resumeAuditFixture(); await repo.saveProfile(f.profile);
  for (const item of f.items) await repo.saveCareerItem(item);
  for (const fact of f.facts) await repo.saveCareerFact(fact);
  for (const skill of f.skills) await repo.saveSkill(skill);
  const job = await repo.saveJob(f.jobs[0]), draft = await prepareProfileMaster(repo);
  draft.resume.projects[0].locked = true;
  draft.resume.projects[0].bullets[0].locked = true;
  const master = await repo.saveResumeVersion({ id: "m012-original-master", jobId: job.id, kind: "master", contentJson: draft.resume, status: "approved" });
  const submitted = await repo.saveResumeVersion({ id: "m012-submitted", jobId: job.id, kind: "tailored", contentJson: draft.resume, parentResumeVersionId: master.id, baseResumeVersionId: master.id, status: "exported", lastExportPath: "/synthetic/submitted.pdf" });
  await repo.saveResumeVersion({ id: "m012-imported", jobId: job.id, kind: "imported", contentJson: draft.resume });
  const app = await repo.saveApplication({ id: "m012-application", jobId: job.id, company: "Synthetic Employer", role: "Backend Engineer", status: "applied", resumeVersionId: submitted.id, submittedResumeVersionId: submitted.id, submittedPdfHash: "synthetic-original-pdf-hash", followUpDate: "2026-12-01", source: "synthetic-import", statusHistoryJson: [{ status: "applied", changedAt: "2026-11-15T00:00:00Z", note: "Synthetic preserved provenance" }] });
  await repo.setResumeFavorite(master.id, true);
  await repo.saveSafetyRecord({ id: "m012-provenance", kind: "package_audit", value: { applicationId: app.id, submittedResumeVersionId: submitted.id, source: "synthetic-original" }, createdAt: "2026-11-15T00:00:00Z" });
  const thread = await repo.saveCareerCopilotThread({ id: "m012-thread", title: "Synthetic preserved conversation", activeContextType: "job", activeContextId: job.id });
  await repo.saveCareerCopilotMessage({ id: "m012-message", threadId: thread.id, role: "assistant", content: "Synthetic approved local response", structuredContentJson: {}, toolCallsJson: [], internalCitationsJson: [], pendingActionsJson: [], provider: "deterministic", model: "", promptVersion: "synthetic", tokenUsageJson: { inputTokens: null, outputTokens: null, totalTokens: null }, createdAt: "2026-11-15T00:00:00Z" });
  const rows = db.exec("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")[0].values;
  const tables = rows.map(([name]) => ({ name, ...db.exec(`SELECT * FROM "${String(name).replaceAll('"', '""')}"`)[0] })).filter(t => t.values?.length && !["schema_migrations", "sqlite_sequence", "migration_events"].includes(String(t.name)));
  if (process.env.CC_INTELLIGENCE_EVIDENCE) await writeFile(`${process.env.CC_INTELLIGENCE_EVIDENCE}/legacy-records.json`, JSON.stringify(tables, null, 2));
  expect(await repo.supportsStandaloneMaster()).toBe(false); expect(await repo.getApplication(app.id)).toEqual(app); db.close();
});

it.skipIf(!process.env.CC_MIGRATION012_NATIVE_RESULT)("uses a native-migrated synthetic database through the real repository and preserves identities on reopen", async () => {
  // The optional integration artifact is produced by native bundled-SQLite tests.
  // Ordinary runs still exercise the binding and migration-history contract above.
  const out = process.env.CC_MIGRATION012_NATIVE_RESULT;
  if (!out) return;
  const SQL = await initSqlJs(); let db = new SQL.Database(new Uint8Array(await readFile(`${out}/native-migrated.sqlite3`)));
  const adapter = {
    execute: async (sql: string, values: unknown[] = []) => { db.run(sql, values as (string | number | null)[]); return { rowsAffected: db.getRowsModified(), lastInsertId: 0 }; },
    select: async (sql: string, values: unknown[] = []) => { const s = db.prepare(sql); s.bind(values as (string | number | null)[]); const rows = []; while (s.step()) rows.push(s.getAsObject()); s.free(); return rows; },
  } as unknown as TauriDatabase;
  let repo = new SqliteRepository(adapter);
  const historyBefore = db.exec("SELECT * FROM schema_migrations ORDER BY id");
  await repo.initialize();
  expect(db.exec("SELECT * FROM schema_migrations ORDER BY id")).toEqual(historyBefore);
  expect(await repo.supportsStandaloneMaster()).toBe(true);
  const original = await repo.getResumeVersion("m012-original-master"), submitted = await repo.getResumeVersion("m012-submitted"), application = await repo.getApplication("m012-application"), jobs = await repo.listJobs();
  const master = await saveProfileMaster(repo, await prepareProfileMaster(repo), true);
  expect(master.jobId).toBe(""); expect(master.resumeDocumentJson.sourceJobId).toBeUndefined();
  expect(db.exec("SELECT job_id FROM resume_versions WHERE id=?", [master.id])[0].values).toEqual([[null]]);
  const child = await saveReviewedTailoredChild(repo, master, { jobId: jobs[0].id, contentJson: master.contentJson }, true);
  expect(child).toMatchObject({ parentResumeVersionId: master.id, baseResumeVersionId: master.id, jobId: jobs[0].id });
  const bytes = db.export(); db.close(); db = new SQL.Database(bytes); repo = new SqliteRepository(adapter);
  expect(await repo.getResumeVersion(master.id)).toEqual(master); expect(await repo.getResumeVersion(child.id)).toEqual(child);
  expect(await repo.getResumeVersion(original!.id)).toEqual(original); expect(await repo.getResumeVersion(submitted!.id)).toEqual(submitted); expect(await repo.getApplication(application!.id)).toEqual(application); expect(await repo.listJobs()).toEqual(jobs);
  await writeFile(`${out}/repository-after.sqlite3`, db.export());
  await writeFile(`${out}/master.tex`, renderResumeLatex(master.contentJson, master.templateSettingsJson));
  await writeFile(`${out}/repository-identity.json`, JSON.stringify({ masterId: master.id, childId: child.id, originalId: original!.id, submittedId: submitted!.id, applicationId: application!.id, jobId: jobs[0].id }, null, 2)); db.close();
});
