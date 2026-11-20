import { expect,it } from "vitest";
import initSqlJs from "sql.js/dist/sql-asm.js";
import type TauriDatabase from "@tauri-apps/plugin-sql";
import { SqliteRepository } from "../database/sqliteRepository";
import { populateFitFixtures,FIT_FIXTURE_DATE } from "./fitFixtures";
import { loadFitFeed,filterFitFeed } from "./fitFeed";
it("persists synthetic feed, reviewed eligibility and freshness across SQLite repository restart",async()=>{
 const SQL=await initSqlJs();const db=new SQL.Database();const adapter={execute:async(sql:string,values:unknown[]=[])=>{db.run(sql,values as (string|number|null)[]);return {rowsAffected:db.getRowsModified(),lastInsertId:0};},select:async(sql:string,values:unknown[]=[])=>{const statement=db.prepare(sql);statement.bind(values as (string|number|null)[]);const rows=[];while(statement.step())rows.push(statement.getAsObject());statement.free();return rows;}} as unknown as TauriDatabase;
 const repo=new SqliteRepository(adapter);await repo.initialize();await repo.transaction(repository=>populateFitFixtures(repository));const first=await loadFitFeed(repo,FIT_FIXTURE_DATE);expect(first).toHaveLength(20);expect(filterFitFeed(first,"recommended").length).toBeGreaterThan(0);
 const reopened=new SqliteRepository(adapter);const restored=await loadFitFeed(reopened,FIT_FIXTURE_DATE);expect(restored.map(row=>row.assessment)).toEqual(first.map(row=>row.assessment));
 const item=(await reopened.listCareerItems()).find(item=>item.id==="synthetic-project")!;await reopened.saveCareerItem({...item,enabled:false});const changed=await loadFitFeed(reopened,FIT_FIXTURE_DATE);expect(changed.find(row=>row.job.id==="fit-job-0")?.assessment.evidenceFingerprint).not.toBe(first.find(row=>row.job.id==="fit-job-0")?.assessment.evidenceFingerprint);expect(await reopened.listSafetyRecords("ai_budget")).toHaveLength(0);
});
