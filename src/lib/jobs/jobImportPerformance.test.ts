import {it,expect} from "vitest";
import {writeFileSync} from "node:fs";
import {cpus,platform,arch} from "node:os";
import {MemoryRepository} from "../database/memoryRepository";
import {populateFitFixtures} from "./fitFixtures";
import {createImportDraft,previewJobImport,requirementSections,importDuplicates} from "./jobImport";
import {IMPORT_FIXTURE_JD} from "./jobImportFixtures";
it("records local import parsing, deduplication and preview observations without native-paint claims",async()=>{
 const repo=new MemoryRepository();await populateFitFixtures(repo);const draft=createImportDraft({mode:"text",value:IMPORT_FIXTURE_JD});const first=await previewJobImport(repo,draft);if(!first.job)throw Error("fixture");const jobs=await repo.listJobs();const large=Array.from({length:500},(_,i)=>({...jobs[i%jobs.length],id:`perf-import-${i}`}));const milliseconds:{sections100k:number[];duplicates500:number[];preview20:number[]}={sections100k:[],duplicates500:[],preview20:[]};
 const text=IMPORT_FIXTURE_JD.repeat(150).slice(0,100000);
 for(let i=0;i<5;i++){let start=performance.now();requirementSections(text);milliseconds.sections100k.push(performance.now()-start);start=performance.now();importDuplicates(first.job,large);milliseconds.duplicates500.push(performance.now()-start);start=performance.now();await previewJobImport(repo,draft);milliseconds.preview20.push(performance.now()-start);}
 writeFileSync("/tmp/cc-2f2-performance.json",JSON.stringify({environment:{platform:platform(),arch:arch(),cpu:cpus()[0].model},method:"5 warm observations in Vitest/jsdom with MemoryRepository. Section grouping of 100k text; duplicate scan against 500 synthetic records; complete preview against 20. Excludes native paint, actual SQLite IPC and GUI latency. No speedup claim.",milliseconds},null,2));expect(await repo.listJobs()).toHaveLength(20);expect(await repo.listSafetyRecords("ai_budget")).toHaveLength(0);
});
