import { readHistoryProofs } from "../applications/historyContract";
import { requirementHeading } from "./requirementClauses";
import { z } from "zod";
import type { Job, JobSource } from "../../types/domain";
import type { AppRepository } from "../database/repository";
import { canonicalDigest } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
import { createId, nowIso } from "../utils";
import { GreenhouseAdapter } from "../job-automation/adapters/greenhouse";
import { LeverAdapter } from "../job-automation/adapters/lever";
import { AshbyAdapter } from "../job-automation/adapters/ashby";
import { normalizedJob } from "../job-automation/adapters/shared";
import { canonicalizeUrl, normalizeTitle, normalizeLocation } from "../job-automation/normalize";
import { jobFingerprint } from "../job-automation/safety";
import { assessJobFit, reconcileApplication } from "./fitAssessment";
import { IMPORT_FIXTURE_JD, importFixtures } from "./jobImportFixtures";

export const MAX_IMPORT_JD = 100_000;
const InputSchema=z.discriminatedUnion("mode",[
 z.object({mode:z.literal("url"),value:z.string().max(2048)}),
 z.object({mode:z.literal("text"),value:z.string().min(20).max(MAX_IMPORT_JD).refine(value=>value.trim().length>=20,"Paste at least 20 characters of job description."),sourceUrl:z.string().max(2048).optional()}),
 z.object({mode:z.literal("fixture"),value:z.enum(["greenhouse","lever","ashby","employer"])}),
]);
export type ImportInput=z.infer<typeof InputSchema>;
const CorrectionsSchema=z.object({company:z.string().max(200).optional(),roleTitle:z.string().max(200).optional(),location:z.string().max(300).optional(),externalId:z.string().max(150).optional(),workplaceType:z.enum(["unspecified","remote","hybrid","on_site"]).optional(),salaryMin:z.number().min(0).max(1e9).nullable().optional(),salaryMax:z.number().min(0).max(1e9).nullable().optional(),salaryCurrency:z.string().regex(/^$|^[A-Z]{3}$/).optional(),requirementNotes:z.string().max(5000).optional()}).strict();
export type ImportCorrections=z.infer<typeof CorrectionsSchema>;
export type FieldCertainty="UNKNOWN"|"NOT_PROVIDED"|"AMBIGUOUS"|"EXPLICITLY_STATED";
export type ImportState="CONTENT_UNAVAILABLE"|"NEEDS_REVIEW"|"DUPLICATE_FOUND"|"READY_TO_SAVE";
export interface ImportDraft {id:string;input:ImportInput;importedAt:string;corrections:ImportCorrections;correctedAt:string}
export interface ImportDuplicate {job:Job;state:"EXACT_MATCH"|"POSSIBLE_MATCH";reason:string}

export function identifyImportUrl(value:string) {
 const error=()=>new Error("Use a public HTTPS job URL without credentials, sensitive parameters, private addresses or executable schemes. No URL was requested.");
 if(!value||value.length>2048||(/[\s\\]/.test(value)||Array.from(value).some(character=>character.charCodeAt(0)<32))||/(?:^|\/)(?:\.\.|%2e)(?:\/|%2e)/i.test(value))throw error();
 let url:URL;try{url=new URL(value);}catch{throw error();}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=="https:"||url.hash||url.username||url.password||(url.port&&url.port!=="443")||!host.includes(".")||host.includes(":")||/^[\d.]+$/.test(host)||/(^|\.)(localhost|local|internal|invalid|test|lan|home)$/.test(host)||host==="metadata.google.internal")throw error();
 if(/(?:token|secret|password|auth|credential|signature|session|api.?key|^key$|^code$|email|phone)/i.test(url.search)||/(?:bearer|eyJ[a-zA-Z0-9_-]{12}|sk-[a-zA-Z0-9]{12})/i.test(url.pathname+url.hash))throw error();
 for(const [key,item]of url.searchParams)if(/token|secret|password|auth|credential|signature|session|api.?key|^key$|^code$|email|phone/i.test(key)||item.length>128||/@/.test(item)||key.length>100)throw error();
 url.hash="";const canonical=new URL(canonicalizeUrl(url.toString()));canonical.searchParams.sort();
 let source="unknown";let account="";let requisition="";const segments=canonical.pathname.split("/").filter(Boolean);
 if(["boards.greenhouse.io","job-boards.greenhouse.io"].includes(host)&&segments.length===3&&segments[1]==="jobs"){source="greenhouse";[account,,requisition]=segments;}
 else if(host==="jobs.lever.co"&&segments.length>=2&&segments.length<=3){source="lever";[account,requisition]=segments;}
 else if(host==="jobs.ashbyhq.com"&&segments.length>=2&&segments.length<=3){source="ashby";[account,requisition]=segments;}
 else if(/(^|\.)linkedin\.com$/.test(host))source="linkedin";
 else if(/(^|\.)jobright\.ai$/.test(host))source="jobright";
 else if(/(^|\.)joinhandshake\.com$/.test(host))source="handshake";
 else if(/(^|\.)ycombinator\.com$/.test(host))source="yc";
 else if(/(^|\.)wellfound\.com$/.test(host))source="wellfound";
 else if(/^(careers|jobs)\./.test(host))source="employer_unverified";
 return {canonicalUrl:canonical.toString(),source,account,requisition};
}
const line=(text:string,name:string)=>text.match(new RegExp(`^${name}:\\s*(.+)$`,"im"))?.[1]?.trim()??"";
export function requirementSections(text:string) {
 let section="Unclassified source text";const groups:Record<string,string[]>={};
 for(const row of text.split(/\r?\n/)){if(requirementHeading(row))section=row.trim();else if(row.trim())(groups[section]??=[]).push(row);}
 return Object.entries(groups).map(([heading,lines])=>({heading,text:lines.join("\n")}));
}
function sourceFor(type:string,account:string):JobSource {return {id:`import:${type}:${account}`,name:"Explicit local import",companyName:"",sourceType:["greenhouse","lever","ashby"].includes(type)?type as "greenhouse"|"lever"|"ashby":"manual_url",sourceIdentifier:account||"manual",careersUrl:"",enabled:false,pollingIntervalHours:24,lastCheckedAt:"",lastSuccessAt:"",lastError:"",createdAt:"",updatedAt:""};}
async function content(input:ImportInput) {
 const identified=input.mode==="text"?(input.sourceUrl?.trim()?identifyImportUrl(input.sourceUrl.trim()):undefined):identifyImportUrl(input.mode==="url"?input.value:importFixtures.find(f=>f.id===input.value)!.url);
 const fixture=input.mode!=="text"&&identified?importFixtures.find(f=>identifyImportUrl(f.url).canonicalUrl===identified.canonicalUrl):undefined;
 if(input.mode!=="text"&&!fixture)return {identified};
 const originalText=input.mode==="text"?input.value:IMPORT_FIXTURE_JD.replaceAll("import-001",`import-00${(importFixtures.findIndex(f=>f.id===fixture!.id))+1}`);
 const source=sourceFor(identified?.source??"manual",identified?.account??"");source.companyName=line(originalText,"Company");
 const url=identified?.canonicalUrl??"";const title=line(originalText,"Title");const location=line(originalText,"Location");
 let normalized=normalizedJob({source,externalId:identified?.requisition||line(originalText,"Requisition"),title,descriptionText:originalText,location,employmentType:line(originalText,"Employment type"),postedAt:/^\d{4}-\d{2}-\d{2}$/.test(line(originalText,"Posted"))?line(originalText,"Posted"):"",applicationUrl:url,payload:{}});
 let payload:unknown={text:originalText};
 if(fixture?.id==="greenhouse") {payload={id:identified!.requisition,title,location:{name:location},absolute_url:url,content:originalText};normalized=new GreenhouseAdapter().normalizeJob({externalId:identified!.requisition,payload},source);}
 if(fixture?.id==="lever") {payload={id:identified!.requisition,text:title,descriptionPlain:originalText,categories:{location},hostedUrl:url,applyUrl:url};normalized=new LeverAdapter().normalizeJob({externalId:identified!.requisition,payload},source);}
 if(fixture?.id==="ashby") {payload={title,location,descriptionPlain:originalText,jobUrl:url,applyUrl:url};normalized=new AshbyAdapter().normalizeJob({externalId:identified!.requisition,payload},source);}
 normalized.employmentType ||= line(originalText,"Employment type");
 normalized.postedAt ||= /^\d{4}-\d{2}-\d{2}$/.test(line(originalText,"Posted"))?line(originalText,"Posted"):"";
 if(line(originalText,"Posting status").toLowerCase()==="closed")normalized.status="closed";
 const salary=line(originalText,"Compensation").match(/^([A-Z]{3})\s+(\d+)[–-](\d+)\s+(yearly|hourly)$/);
 if(salary)Object.assign(normalized,{salaryCurrency:salary[1],salaryMin:Number(salary[2]),salaryMax:Number(salary[3]),salaryInterval:salary[4]});
 return {identified,originalText,normalized,payload,fixtureId:fixture?.id??"",retrieval:input.mode==="text"?"manual_paste":"explicit_synthetic_fixture"};
}
export function importDuplicates(job:Job,existing:Job[]):ImportDuplicate[] {
 const same=(a:string,b:string)=>Boolean(a&&b&&normalizeTitle(a)===normalizeTitle(b));
 return existing.flatMap<ImportDuplicate>(other=>{
  if(other.id===job.id)return [];
  const identity=same(job.company,other.company)&&same(job.roleTitle,other.roleTitle);
  let urlScopeSame=false;try{const a=identifyImportUrl(job.canonicalUrl),b=identifyImportUrl(other.canonicalUrl);urlScopeSame=Boolean(a.account&&a.source===b.source&&a.account===b.account);}catch{/* Unparseable legacy URLs do not establish identity. */}
  const sourceSame=Boolean(job.sourceId&&job.sourceId===other.sourceId)||urlScopeSame;
  const conflict=sourceSame&&job.externalId&&other.externalId&&job.externalId!==other.externalId;
  const urlSame=Boolean(job.canonicalUrl&&other.canonicalUrl&&canonicalizeUrl(job.canonicalUrl)===canonicalizeUrl(other.canonicalUrl));
  const reqSame=sourceSame&&Boolean(job.externalId&&job.externalId===other.externalId)&&(urlScopeSame||identity);
  if(!conflict&&(reqSame||(identity&&urlSame)))return [{job:other,state:"EXACT_MATCH" as const,reason:reqSame?"Same source scope and requisition; inspect any metadata differences":"Same canonical URL, company and role"}];
  if(identity||urlSame||reqSame)return [{job:other,state:"POSSIBLE_MATCH" as const,reason:!identity?"Posting identity conflicts with company or role metadata; review before keeping distinct":conflict?"Conflicting requisition IDs; kept distinct":"Company and role match without authoritative requisition equivalence"}];
  return [];
 });
}
export function createImportDraft(input:ImportInput):ImportDraft{return {id:createId("job-import"),input:InputSchema.parse(input),importedAt:nowIso(),corrections:{},correctedAt:""};}
export function correctImportDraft(draft:ImportDraft,corrections:ImportCorrections):ImportDraft{return {...draft,corrections:CorrectionsSchema.parse(corrections),correctedAt:nowIso()};}
export async function previewJobImport(repository:AppRepository,draft:ImportDraft) {
 draft=z.object({id:z.string().regex(/^job-import-[a-zA-Z0-9-]+$/).max(150),input:InputSchema,importedAt:z.iso.datetime(),corrections:CorrectionsSchema,correctedAt:z.union([z.literal(""),z.iso.datetime()])}).parse(draft);
 const input=InputSchema.parse(draft.input);const corrections=CorrectionsSchema.parse(draft.corrections);const loaded=await content(input);
 if(!loaded.normalized)return {state:"CONTENT_UNAVAILABLE" as const,identified:loaded.identified};
 Object.assign(loaded.normalized,{discoveredAt:draft.importedAt,lastSeenAt:draft.importedAt});
 const {requirementNotes,...fields}=corrections;
 const effective=loaded.originalText+(requirementNotes?.trim()?`\n\nUser-reviewed additional constraints (original requirements retained):\n${requirementNotes.trim()}`:"");
 const job:Job={...loaded.normalized,...fields,id:draft.id,rawDescription:effective,descriptionText:effective,descriptionHtml:"",normalizedTitle:normalizeTitle(fields.roleTitle??loaded.normalized.roleTitle),normalizedLocation:normalizeLocation(fields.location??loaded.normalized.location),analysisJson:null,createdAt:draft.importedAt,updatedAt:draft.correctedAt||draft.importedAt};
 if(job.salaryMin!==null&&job.salaryMax!==null&&job.salaryMin>job.salaryMax)throw new Error("Compensation minimum cannot exceed maximum.");
 const correctionsAudit=Object.entries(corrections).filter(([key,value])=>key==="requirementNotes"?Boolean(String(value).trim()):value!==(loaded.normalized as unknown as Record<string,unknown>)[key]).map(([field,corrected])=>({field,parsed:(loaded.normalized as unknown as Record<string,unknown>)[field]??null,corrected,correctedAt:draft.correctedAt}));
 job.contentHash=jobFingerprint(job);
 job.sourcePayloadJson={version:"cc-job-import-v1",importId:draft.id,input,importedAt:draft.importedAt,retrieval:loaded.retrieval,fixtureId:loaded.fixtureId,originalText:loaded.originalText,parsed:loaded.normalized,sourcePayload:loaded.payload,corrections:correctionsAudit,fingerprint:job.contentHash,reviewStatus:"pending"};
 const values=await repository.transaction(async repo=>{
  const [jobs,applications,items,facts,skills,claims,preferences]=await Promise.all([repo.listJobs(),repo.listApplications(),repo.listCareerItems(),repo.listCareerFacts(),repo.listSkills(),repo.listCandidateClaims(),repo.getJobSearchPreferences()]);
  const historyProofs=await readHistoryProofs(repo);
  // Unsaved preference defaults receive fresh timestamps on every read. Compare
  // their actual values, not those timestamps, so first-time imports stay reviewable.
  return {jobs,applications,historyProofs,candidate:{items,facts,skills,claims,preferences:{...preferences,createdAt:"",updatedAt:""}}};
 });
 const duplicates=importDuplicates(job,values.jobs);const evidenceFingerprint=await canonicalDigest(values.candidate);
 const assessment=assessJobFit(job,values.candidate,evidenceFingerprint);
 const application=reconcileApplication(job,values.applications,values.historyProofs);
 const reviewFingerprint=await canonicalDigest({job:jobFingerprint(job),provenance:job.sourcePayloadJson,candidate:values.candidate,jobs:values.jobs.map(item=>[item.id,item.sourceId,item.externalId,item.canonicalUrl,jobFingerprint(item)]),applications:values.applications,historyProofs:values.historyProofs});
 const certainty:Record<string,FieldCertainty>={company:job.company?"EXPLICITLY_STATED":"NOT_PROVIDED",roleTitle:job.roleTitle?"EXPLICITLY_STATED":"NOT_PROVIDED",location:job.location?"EXPLICITLY_STATED":"NOT_PROVIDED",compensation:job.salaryMin===null&&job.salaryMax===null?"NOT_PROVIDED":"EXPLICITLY_STATED",authorization:assessment.reasons.some(r=>r.dimension==="authorization"&&r.status==="NEEDS_CONFIRMATION")?"AMBIGUOUS":assessment.reasons.some(r=>r.dimension==="authorization")?"EXPLICITLY_STATED":"UNKNOWN"};
 return {state:duplicates.length?"DUPLICATE_FOUND" as const:(!job.company||!job.roleTitle)?"NEEDS_REVIEW" as const:"READY_TO_SAVE" as const,identified:loaded.identified,job,assessment,application,duplicates,certainty,sections:requirementSections(effective),reviewFingerprint};
}
export type ImportPreview=Awaited<ReturnType<typeof previewJobImport>>;
export async function saveJobImport(repository:AppRepository,draft:ImportDraft,reviewFingerprint:string,confirmed:boolean,duplicateReviewed:boolean) {
 if(!confirmed)throw new Error("Confirm the complete description, requirements and provenance before saving.");
 return repository.transaction(async repo=>{
  const preview=await previewJobImport(repo,draft);
  if(!preview.job||!preview.job.company.trim()||!preview.job.roleTitle.trim())throw new Error("Provide the company, role and full job description before saving.");
  const existing=await repo.getJob(draft.id);
  if(existing){const provenance=existing.sourcePayloadJson as Record<string,unknown>;const before={...provenance},after={...preview.job.sourcePayloadJson as Record<string,unknown>};for(const key of ["reviewStatus","reviewedAt"]){delete before[key];delete after[key];}if(provenance?.version==="cc-job-import-v1"&&provenance.importId===draft.id&&jobFingerprint(existing)===jobFingerprint(preview.job)&&await canonicalDigest(before)===await canonicalDigest(after))return existing;throw new Error("Import identity already exists with different content. Start a new reviewed draft.");}
  if(preview.reviewFingerprint!==reviewFingerprint)throw new Error("Job, candidate evidence or local history changed. Refresh the preview and review again.");
  if(preview.duplicates.some(item=>item.state==="EXACT_MATCH"))throw new Error("This requisition already exists. Open the existing job; it was not overwritten.");
  if((preview.duplicates.length||preview.application.state!=="NONE")&&!duplicateReviewed)throw new Error("Review possible duplicate and application history before saving separately.");
  const provenance=preview.job.sourcePayloadJson as Record<string,unknown>;
  return repo.saveJob({...preview.job,status:preview.job.status==="closed"?"closed":"saved",sourcePayloadJson:{...provenance,reviewStatus:"confirmed",reviewedAt:nowIso()}});
 });
}
