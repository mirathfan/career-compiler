import {it,expect} from "vitest";
import initSqlJs from "sql.js/dist/sql-asm.js";
import type TauriDatabase from "@tauri-apps/plugin-sql";
import {SqliteRepository} from "../database/sqliteRepository";
import {createImportDraft,correctImportDraft,previewJobImport,saveJobImport} from "./jobImport";
import {populateFitFixtures} from "./fitFixtures";
it("rolls back an interrupted SQLite save and persists reviewed provenance across repository reopen",async()=>{
 const SQL=await initSqlJs();let db=new SQL.Database();let fail=false;
 const adapter={execute:async(sql:string,values:unknown[]=[])=>{db.run(sql,values as (string|number|null)[]);if(fail&&/INSERT INTO jobs/i.test(sql)){fail=false;throw Error("injected interruption after row write");}return {rowsAffected:db.getRowsModified(),lastInsertId:0};},select:async(sql:string,values:unknown[]=[])=>{const s=db.prepare(sql);s.bind(values as (string|number|null)[]);const rows=[];while(s.step())rows.push(s.getAsObject());s.free();return rows;}} as unknown as TauriDatabase;
 let repo=new SqliteRepository(adapter);await repo.initialize();await populateFitFixtures(repo);const draft=correctImportDraft(createImportDraft({mode:"fixture",value:"greenhouse"}),{company:"Reviewed Synthetic Labs"});const preview=await previewJobImport(repo,draft);
 fail=true;await expect(saveJobImport(repo,draft,preview.reviewFingerprint!,true,false)).rejects.toThrow(/injected/);expect(await repo.getJob(draft.id)).toBeNull();expect(await repo.listJobs()).toHaveLength(20);
 const bytes=db.export();db.close();db=new SQL.Database(bytes);repo=new SqliteRepository(adapter);const restored=await previewJobImport(repo,draft);const saved=await saveJobImport(repo,draft,restored.reviewFingerprint!,true,false);expect(saved.company).toBe("Reviewed Synthetic Labs");
 const reopenedBytes=db.export();db.close();db=new SQL.Database(reopenedBytes);repo=new SqliteRepository(adapter);expect((await repo.getJob(saved.id))?.sourcePayloadJson).toEqual(saved.sourcePayloadJson);expect(await repo.listApplicationPackages()).toHaveLength(0);expect(await repo.listApplications()).toHaveLength(1);expect(await repo.listSafetyRecords("ai_budget")).toHaveLength(0);expect(db.exec("pragma integrity_check")[0].values[0][0]).toBe("ok");db.close();
});
