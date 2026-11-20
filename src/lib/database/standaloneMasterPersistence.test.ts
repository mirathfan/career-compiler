import { expect, it } from "vitest";
import initSqlJs from "sql.js/dist/sql-asm.js";
import type { Database } from "sql.js";
import type TauriDatabase from "@tauri-apps/plugin-sql";
import { readFile, writeFile } from "node:fs/promises";
import { SqliteRepository } from "./sqliteRepository";
import { resumeAuditFixture } from "../../test/resumeAuditFixture";
import { prepareProfileMaster, saveProfileMaster } from "../tailoring/profileMaster";
import { saveReviewedTailoredChild } from "../tailoring/reviewedChild";
import { renderResumeLatex } from "../resume/latex";

const proposalPath = 'docs/migration-proposals/012_standalone_master_resume.sql';
async function migrateSynthetic(db: Database, fail = false) {
  const sql=await readFile(proposalPath,'utf8');
  db.run('PRAGMA foreign_keys=OFF');db.run('BEGIN IMMEDIATE');
  try {
    db.run(sql);
    if (fail) throw Error('synthetic migration interruption');
    expect(db.exec('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.exec('PRAGMA integrity_check')[0].values).toEqual([['ok']]);
    db.run('COMMIT');
  } catch (e) { db.run('ROLLBACK');throw e; }
  finally { db.run('PRAGMA foreign_keys=ON'); }
}
it('requires approval of the schema change, preserves every legacy row/reference, then saves a standalone Master and tailored child atomically across restart',async()=>{
  const SQL=await initSqlJs();let db=new SQL.Database(), failSave=false;
  const adapter={execute:async(sql:string,values:unknown[]=[])=>{db.run(sql,values as (string|number|null)[]);if(failSave && /INSERT INTO resume_versions/.test(sql)){failSave=false;throw Error('synthetic save interruption');}return{rowsAffected:db.getRowsModified(),lastInsertId:0};},select:async(sql:string,values:unknown[]=[])=>{const stmt=db.prepare(sql);stmt.bind(values as (string|number|null)[]);const rows=[];while(stmt.step())rows.push(stmt.getAsObject());stmt.free();return rows;}} as unknown as TauriDatabase;
  let repo=new SqliteRepository(adapter);await repo.initialize();const f=await resumeAuditFixture();
  await repo.saveProfile(f.profile);for(const x of f.items)await repo.saveCareerItem(x);for(const x of f.facts)await repo.saveCareerFact(x);for(const x of f.skills)await repo.saveSkill(x);
  const draft=await prepareProfileMaster(repo);expect(await repo.listJobs()).toEqual([]);expect(await repo.supportsStandaloneMaster()).toBe(false);
  await expect(saveProfileMaster(repo,draft,true)).rejects.toThrow('approved database update');expect(await repo.listResumeVersions()).toEqual([]);expect(await repo.listJobs()).toEqual([]);
  // Approval is simulated ONLY on this fresh synthetic in-memory database.
  await expect(migrateSynthetic(db,true)).rejects.toThrow('migration interruption');expect(await repo.supportsStandaloneMaster()).toBe(false);
  const job=await repo.saveJob(f.jobs[0]);const original=await repo.saveResumeVersion({jobId:job.id,kind:'master',contentJson:draft.resume,status:'approved'});
  const submitted=await repo.saveResumeVersion({jobId:job.id,kind:'tailored',contentJson:draft.resume,parentResumeVersionId:original.id,baseResumeVersionId:original.id,status:'exported',lastExportPath:'/synthetic/submitted.pdf'});
  const application=await repo.saveApplication({jobId:job.id,company:'Synthetic',role:'Engineer',status:'applied',submittedResumeVersionId:submitted.id,submittedPdfHash:'synthetic-submitted-hash'});
  await repo.setResumeFavorite(original.id,true);
  const originals=db.exec('SELECT * FROM resume_versions ORDER BY id'), applications=db.exec('SELECT * FROM applications ORDER BY id'), favorites=db.exec('SELECT * FROM resume_favorites');
  await expect(migrateSynthetic(db,true)).rejects.toThrow('migration interruption');expect(db.exec('SELECT * FROM resume_versions ORDER BY id')).toEqual(originals);expect(db.exec('SELECT * FROM resume_favorites')).toEqual(favorites);
  await migrateSynthetic(db);expect(await repo.supportsStandaloneMaster()).toBe(true);
  expect(db.exec('SELECT * FROM resume_versions ORDER BY id')).toEqual(originals);expect(db.exec('SELECT * FROM applications ORDER BY id')).toEqual(applications);expect(db.exec('SELECT * FROM resume_favorites')).toEqual(favorites);
  // The new schema preserves the job requirement for non-Master records.
  expect(()=>db.run('UPDATE resume_versions SET job_id=NULL WHERE id=?',[submitted.id])).toThrow();
  const jobsBefore=await repo.listJobs();
  await expect(saveProfileMaster(repo,draft,false)).rejects.toThrow('Review');failSave=true;await expect(saveProfileMaster(repo,draft,true)).rejects.toThrow('save interruption');expect(await repo.listResumeVersions()).toHaveLength(2);
  const master=await saveProfileMaster(repo,draft,true);expect(master.jobId).toBe('');expect(master.resumeDocumentJson.sourceJobId).toBeUndefined();expect(db.exec('SELECT job_id FROM resume_versions WHERE id=?',[master.id])[0].values).toEqual([[null]]);expect(await repo.listJobs()).toEqual(jobsBefore);
  const child=await saveReviewedTailoredChild(repo,master,{jobId:job.id,contentJson:master.contentJson},true);expect(child.baseResumeVersionId).toBe(master.id);expect(child.parentResumeVersionId).toBe(master.id);expect(child.jobId).toBe(job.id);
  const bytes=db.export();db.close();db=new SQL.Database(bytes);repo=new SqliteRepository(adapter);
  expect(await repo.getResumeVersion(master.id)).toEqual(master);expect(await repo.getResumeVersion(original.id)).toEqual(original);expect(await repo.getResumeVersion(submitted.id)).toEqual(submitted);expect(await repo.getResumeVersion(child.id)).toEqual(child);expect(await repo.getApplication(application.id)).toEqual(application);expect(db.exec('PRAGMA foreign_key_check')).toEqual([]);
  if(process.env.CC_INTELLIGENCE_EVIDENCE){const out=process.env.CC_INTELLIGENCE_EVIDENCE;await writeFile(`${out}/standalone-master.sqlite3`,db.export());await writeFile(`${out}/standalone-master.tex`,renderResumeLatex(master.contentJson,master.templateSettingsJson));await writeFile(`${out}/standalone-persistence.json`,JSON.stringify({master,original,submitted,application,child,jobsBefore,sqliteVersion:db.exec('SELECT sqlite_version()')[0].values[0][0]},null,2));}
  db.close();
});

it('persists the first SQLite Master with no jobs at all after the proposed update',async()=>{
  const SQL=await initSqlJs();let db=new SQL.Database();
  const adapter={execute:async(sql:string,values:unknown[]=[])=>{db.run(sql,values as (string|number|null)[]);return{rowsAffected:db.getRowsModified(),lastInsertId:0};},select:async(sql:string,values:unknown[]=[])=>{const stmt=db.prepare(sql);stmt.bind(values as (string|number|null)[]);const rows=[];while(stmt.step())rows.push(stmt.getAsObject());stmt.free();return rows;}} as unknown as TauriDatabase;
  let repo=new SqliteRepository(adapter);await repo.initialize();const f=await resumeAuditFixture();await repo.saveProfile(f.profile);for(const x of f.items)await repo.saveCareerItem(x);for(const x of f.facts)await repo.saveCareerFact(x);for(const x of f.skills)await repo.saveSkill(x);
  await migrateSynthetic(db);const master=await saveProfileMaster(repo,await prepareProfileMaster(repo),true);
  expect(db.exec('SELECT COUNT(*) FROM jobs')[0].values).toEqual([[0]]);expect(db.exec('SELECT job_id FROM resume_versions')[0].values).toEqual([[null]]);
  const bytes=db.export();db.close();db=new SQL.Database(bytes);repo=new SqliteRepository(adapter);expect(await repo.getResumeVersion(master.id)).toEqual(master);expect(await repo.listJobs()).toEqual([]);db.close();
});
