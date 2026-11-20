import { expect, it } from "vitest";
import initSqlJs from "sql.js/dist/sql-asm.js";
import type TauriDatabase from "@tauri-apps/plugin-sql";
import { writeFile } from "node:fs/promises";
import { SqliteRepository } from "../database/sqliteRepository";
import { resumeAuditFixture } from "../../test/resumeAuditFixture";
import { proposeResumeIntake } from "../import/resumeIntake";
import { prepareCareerImportProposal } from "../import/careerIntake";
import { createImportDraft, previewJobImport, saveJobImport } from "../jobs/jobImport";
import { prepareProfileMaster, saveProfileMaster } from "./profileMaster";
import { MockAIProvider } from "../ai/mockProvider";
import { scoreCareerFacts } from "./evidence";
import { buildResumeGenerationRequest } from "../ai/generationRequest";
import { generateEvidenceGroundedResume } from "../ai/generationPipeline";
import { createJobSpecificVariant } from "./jobSpecificVariant";
import { saveReviewedTailoredChild } from "./reviewedChild";
import { semanticResumeDiff } from "../resume/diff";
import { renderResumeLatex } from "../resume/latex";
import { allResumeBullets } from "../resume/validation";
import { zipSync, strToU8 } from "fflate";
import { extractDocxXml, docxXmlToText } from "../import/docxText";

it("persists reviewed intake and two genuinely reordered job-specific children across SQLite reopen without altering Master/submission", async () => {
  const SQL=await initSqlJs();let db=new SQL.Database(),failSave=false,failImport=false;
  const adapter={execute:async(sql:string,values:unknown[]=[])=>{db.run(sql,values as (string|number|null)[]);if(failImport&&/INSERT INTO career_imports/i.test(sql)){failImport=false;throw Error("synthetic interrupted import");}if(failSave&&/INSERT INTO resume_versions/i.test(sql)){failSave=false;throw Error("synthetic interrupted save");}return {rowsAffected:db.getRowsModified(),lastInsertId:0};},select:async(sql:string,values:unknown[]=[])=>{const s=db.prepare(sql);s.bind(values as (string|number|null)[]);const rows=[];while(s.step())rows.push(s.getAsObject());s.free();return rows;}} as unknown as TauriDatabase;
  let repo=new SqliteRepository(adapter);await repo.initialize();const f=await resumeAuditFixture();await repo.saveProfile(f.profile);
  const text=`Projects\nBackend Platform | Synthetic Labs\n• Built Python and FastAPI services with PostgreSQL, Docker and automated tests.\nAgent Evaluation | Synthetic Labs\n• Built Python agent orchestration, tool calling and model evaluation using LangChain and OpenAI.\nExperience\nSoftware Engineer | Synthetic Company\n• Implemented TypeScript interfaces and reliability tests for API services.\nEducation\nBachelor of Computer Science | Synthetic University\nSkills\nPython, FastAPI, PostgreSQL, Docker, TypeScript, LangChain, OpenAI`;
  const docx = zipSync({"[Content_Types].xml":strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),"word/document.xml":strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+text.split("\n").map(line=>`<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join("")+'</w:body></w:document>')});
  const originalDocx=docx.slice();const extracted=docxXmlToText(extractDocxXml(docx));expect(extracted).toBe(text);expect(docx).toEqual(originalDocx);
  const context={profile:await repo.getProfile(),careerItems:[],careerFacts:[],skills:[]};let proposal=prepareCareerImportProposal(proposeResumeIntake(extracted,"resume-docx-sha256:synthetic"),context);
  for(const change of [...proposal.careerItemChanges,...proposal.careerFactChanges,...proposal.skillChanges])change.userDecision="approved";
  proposal=prepareCareerImportProposal(proposal,context);failImport=true;
  await expect(repo.applyCareerImportProposal(proposal)).rejects.toThrow("interrupted import");expect(await repo.listCareerItems()).toEqual([]);expect(await repo.listCareerFacts()).toEqual([]);expect(await repo.listCareerImportRecords()).toEqual([]);
  await repo.applyCareerImportProposal(proposal);await repo.undoLastCareerImport();expect(await repo.listCareerFacts()).toEqual([]);expect(await repo.listCareerItems()).toEqual([]);expect(await repo.listSkills()).toEqual([]);
  await repo.applyCareerImportProposal(proposal);
  expect((await repo.listCareerFacts()).every(f=>f.evidenceStatus==="needs_review")).toBe(true);
  // Separate, explicit synthetic verification step; file import does not do this.
  for(const fact of await repo.listCareerFacts())await repo.saveCareerFact({...fact,evidenceStatus:"verified"});

  const sourceJob=await repo.saveJob({...f.jobs[0],id:"recovery-source-job"});
  const draft=await prepareProfileMaster(repo);await expect(saveProfileMaster(repo,draft,false)).rejects.toThrow("Review");
  const altered=structuredClone(draft);altered.resume.projects[0].bullets[0].text="Invented 99 percent achievement";await expect(saveProfileMaster(repo,altered,true)).rejects.toThrow("Preview changed");expect(await repo.listResumeVersions()).toEqual([]);
  await expect(saveProfileMaster(repo,draft,true)).rejects.toThrow("approved database update");
  // Existing job-linked versions remain supported on the unchanged legacy schema.
  const master=await repo.saveResumeVersion({jobId:sourceJob.id,kind:"master",contentJson:draft.resume,status:"approved"});const submitted=await repo.saveResumeVersion({id:"recovery-submitted",jobId:sourceJob.id,contentJson:master.contentJson,kind:"tailored",parentResumeVersionId:master.id,baseResumeVersionId:master.id,status:"approved"});
  const application=await repo.saveApplication({id:"recovery-history",jobId:sourceJob.id,company:"Synthetic Past",role:"Engineer",status:"applied",submittedResumeVersionId:submitted.id,submittedPdfHash:"synthetic-preserved"});
  const children=[];
  for(const [name,role,requirements,first] of [
    ["backend","Backend Engineer","Python FastAPI PostgreSQL Docker API development databases reliability testing","Backend Platform"],
    ["ai","AI Engineer","Python LangChain OpenAI ML engineering agent orchestration tool calling model integration evaluation inference","Agent Evaluation"],
  ]){
    const jobDraft=createImportDraft({mode:"text",sourceUrl:`https://www.linkedin.com/jobs/view/synthetic-${name}`,value:`Company: Synthetic ${name}\nTitle: ${role}\nLocation: Austin\nRequired: ${requirements}`});
    const preview=await previewJobImport(repo,jobDraft);const job=await saveJobImport(repo,jobDraft,preview.reviewFingerprint!,true,false);expect(job.sourcePayloadJson).toMatchObject({retrieval:"manual_paste"});
    const provider=new MockAIProvider();const analysis=(await provider.analyzeJob({...job,modelName:"mock"})).data;
    const facts=await repo.listCareerFacts(),items=await repo.listCareerItems(),skills=await repo.listSkills();const evidence=scoreCareerFacts(analysis,facts,items);const settings=await repo.getSettings();
    const request=buildResumeGenerationRequest({job,analysis,profile:f.profile,items,skills,evidence,controls:{...settings.tailoringDefaults,projectCount:2,requiredFactIds:facts.map(f=>f.id)}});
    const generated=await generateEvidenceGroundedResume({provider,request,modelName:"mock"});expect(generated.validationIssues.filter(x=>x.severity==="error")).toEqual([]);
    const content=createJobSpecificVariant(master.contentJson,generated.resume);expect(content.projects[0].title).toBe(first);
    for(const {bullet} of allResumeBullets(content)){expect(facts.some(f=>bullet.sourceFactIds.includes(f.id)&&bullet.text===f.statement)).toBe(true);bullet.approved=true;}
    expect(await repo.getResumeVersion(master.id)).toEqual(master);
    const beforeCount=(await repo.listResumeVersions()).length;failSave=true;
    await expect(saveReviewedTailoredChild(repo,master,{jobId:job.id,contentJson:content},true)).rejects.toThrow("interrupted");expect(await repo.listResumeVersions()).toHaveLength(beforeCount);
    const child=await saveReviewedTailoredChild(repo,master,{jobId:job.id,name:`Synthetic ${role}`,contentJson:content},true);expect(child.parentResumeVersionId).toBe(master.id);
    const latex=renderResumeLatex(child.contentJson,settings.templateSettings);children.push({name,child,job,plan:generated.plan,diff:semanticResumeDiff(master.contentJson,child.contentJson),latex});
  }
  expect(children[0].latex).not.toBe(children[1].latex);expect(children[0].child.contentJson.projects.map(x=>x.title)).not.toEqual(children[1].child.contentJson.projects.map(x=>x.title));
  const bytes=db.export();db.close();db=new SQL.Database(bytes);repo=new SqliteRepository(adapter);
  expect(await repo.getResumeVersion(master.id)).toEqual(master);expect(await repo.getResumeVersion(submitted.id)).toEqual(submitted);expect(await repo.getApplication(application.id)).toEqual(application);
  for(const {child} of children)expect(await repo.getResumeVersion(child.id)).toEqual(child);
  expect(db.exec("pragma integrity_check")[0].values[0][0]).toBe("ok");
  if(process.env.CC_INTELLIGENCE_EVIDENCE){const out=process.env.CC_INTELLIGENCE_EVIDENCE;await writeFile(`${out}/recovery-pipeline.json`,JSON.stringify({master,submitted,application,children},null,2));await writeFile(`${out}/synthetic-recovery.sqlite3`,bytes);for(const child of children)await writeFile(`${out}/recovery-${child.name}.tex`,child.latex);}
  db.close();
});
