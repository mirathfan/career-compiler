import { expect,it } from "vitest";
import { writeFileSync } from "node:fs";
import { cpus,platform,arch } from "node:os";
import { renderToString } from "react-dom/server";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { RepositoryContext } from "../database/repositoryContext";
import { MemoryRepository } from "../database/memoryRepository";
import { populateFitFixtures,FIT_FIXTURE_DATE } from "./fitFixtures";
import { loadFitFeed,filterFitFeed } from "./fitFeed";
import { FitExplanation } from "../../features/jobs/FitExplanation";
it("records synthetic 500-posting assessment/filter/select/detail timings without network",async()=>{
 const repo=new MemoryRepository();await populateFitFixtures(repo);const templates=await repo.listJobs();
 for(let i=20;i<500;i++){const job=templates[i%20];await repo.saveJob({...job,id:`performance-${i}`,externalId:`performance-${i}`,canonicalUrl:`https://example.invalid/performance-${i}`,company:`${job.company} ${i}`,rawDescription:job.rawDescription});}
 let start=performance.now();const rows=await loadFitFeed(repo,FIT_FIXTURE_DATE);const initialize=performance.now()-start;
 start=performance.now();const filtered=filterFitFeed(rows,"recommended","","","fit");const filterSort=performance.now()-start;
 start=performance.now();const selected=rows.find(row=>row.job.id===filtered[0].job.id)!;const selection=performance.now()-start;
 start=performance.now();const html=renderToString(<QueryClientProvider client={new QueryClient()}><RepositoryContext.Provider value={{repository:repo,ready:true,error:null}}><FitExplanation assessment={selected.assessment} application={selected.application}/></RepositoryContext.Provider></QueryClientProvider>);const detail=performance.now()-start;
 start=performance.now();await loadFitFeed(repo,FIT_FIXTURE_DATE);const cached=performance.now()-start;
 const fact=(await repo.listCareerFacts())[0];await repo.saveCareerFact({...fact,enabled:false});start=performance.now();await loadFitFeed(repo,FIT_FIXTURE_DATE);const reassess=performance.now()-start;
 writeFileSync("/tmp/cc-2f1-performance.json",JSON.stringify({dataset:500,environment:{platform:platform(),arch:arch(),cpu:cpus()[0].model},method:"Single observed run, Vitest/jsdom, MemoryRepository; preparation excluded. Detail is React server rendering, not native paint. No speedup claimed.",milliseconds:{assessmentAndFeedInitialization:initialize,filterAndSort:filterSort,selectionLookup:selection,detailServerRender:detail,cachedValidation:cached,reassessmentAfterEvidenceEdit:reassess},renderedCharacters:html.length},null,2));
 expect(rows).toHaveLength(500);expect(html).toContain("Understand your fit");expect(await repo.listSafetyRecords("ai_budget")).toHaveLength(0);
},20000);
