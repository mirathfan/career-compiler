import { z } from "zod";
import type { AppRepository } from "../database/repository";
import type { Job } from "../../types/domain";
import { stableContentHash } from "../job-automation/normalize";
import { jobFingerprint } from "../job-automation/safety";
import { canonicalDigest } from "../../../apps/careercompiler-extension/src/authorizationContract.js";

export const skipReasons = ["Not interested in this role", "Location does not work", "Work arrangement does not work", "Compensation is too low", "Not interested in this technology/domain", "Already applied", "Not ready to apply", "Other"] as const;
const Categories = z.enum(["city", "region", "arrangement", "role", "compensation", "technology"]);
export const PreferenceInput = z.object({ category: Categories, value: z.string().trim().min(1).max(160), effect: z.enum(["prefer", "avoid"]), currency: z.string().default("") }).strict().superRefine((p,ctx)=>{
 if(p.category==="arrangement"&&!["remote","hybrid","on_site"].includes(p.value))ctx.addIssue({code:"custom",message:"Choose a known work arrangement."});
 if(p.category==="compensation"&&(!Number.isFinite(Number(p.value))||Number(p.value)<=0||!/^\d+(?:\.\d{1,2})?$/.test(p.value)||! /^(USD|CAD|GBP|EUR|AUD|NZD|CHF|JPY)$/.test(p.currency)||p.effect!=="prefer"))ctx.addIssue({code:"custom",message:"Enter a positive annual minimum and supported explicit currency."});
});
export type PreferenceDraft=z.input<typeof PreferenceInput>;
export type ScopedPreference=z.output<typeof PreferenceInput>&{version:"cc-job-preference-v1";id:string;revision:string;createdAt:string;updatedAt:string;sourceDecisionId?:string;confirmed:true;enabled:boolean;removed:boolean;provenance:"explicit_jobs_confirmation"};
export interface SkipDecision {version:"cc-job-skip-v1";id:string;jobId:string;reason:typeof skipReasons[number];note:string;jobRevision:string;previousStatus:Job["status"];active:boolean;createdAt:string;updatedAt:string;revision:string;preferenceId?:string;confirmation:"job_only"|"confirmed_preference";provenance:"explicit_jobs_skip"}
const normalize=(s:string)=>s.normalize("NFKC").replace(/\s+/g," ").trim().toLowerCase();
export const skipJobRevision=(job:Job)=>stableContentHash(JSON.stringify(["cc-job-skip-content-v1",jobFingerprint(job),job.sourceId,job.externalId,job.canonicalUrl||job.sourceUrl]));
const uid=()=>crypto.randomUUID();
const allowed=new Set<Job["status"]>(["new","matched","saved","filtered_out","analysis_pending"]);
export async function readRankingPreferences(repo:AppRepository){
 const prefs=await repo.listSafetyRecords("job_preference");
 const parsed=prefs.map(r=>{
  const v=r.value;
  const input=PreferenceInput.parse({category:v.category,value:v.value,effect:v.effect,currency:v.currency});
  if(v.version!=="cc-job-preference-v1"||v.confirmed!==true||v.provenance!=="explicit_jobs_confirmation"||typeof v.enabled!=="boolean"||typeof v.removed!=="boolean"||typeof v.revision!=="string"||typeof v.createdAt!=="string"||typeof v.updatedAt!=="string"||v.id!==r.id)throw new Error("A ranking preference is invalid; no preference changes were applied.");
  return {...v,...input} as unknown as ScopedPreference;
 });
 return {preferences:parsed.filter(p=>!p.removed),removedPreferences:parsed.filter(p=>p.removed)};
}
export async function readRefinement(repo:AppRepository){
 const [skips,preferences]=await Promise.all([repo.listSafetyRecords("job_skip"),readRankingPreferences(repo)]);
 return {skips:skips.map(r=>r.value as unknown as SkipDecision),...preferences};
}
async function audit(repo:AppRepository,operation:string,before:unknown,after:unknown){await repo.saveSafetyRecord({id:uid(),kind:"job_preference_audit",value:{version:"cc-job-preference-v1",operation,before,after,provenance:"explicit_jobs_action"},createdAt:new Date().toISOString()});}
async function writePreference(repo:AppRepository,input:PreferenceDraft,expected?:ScopedPreference,sourceDecisionId?:string){
 const parsed=PreferenceInput.parse(input);if(parsed.category!=="compensation")parsed.currency="";const now=new Date().toISOString();const all=(await readRefinement(repo)).preferences;
 const duplicate=all.find(p=>p.id!==expected?.id&&p.category===parsed.category&&normalize(p.value)===normalize(parsed.value)&&p.currency===parsed.currency);
 if(duplicate)throw new Error("This scope already has a preference. Edit the existing preference to resolve a conflict.");
 const current=expected?all.find(p=>p.id===expected.id):undefined;
 if(expected){if(!current||current.revision!==expected.revision)throw new Error("Preferences changed. Reopen and review before saving.");}
 const value:ScopedPreference={version:"cc-job-preference-v1",...parsed,id:expected?.id??uid(),revision:uid(),createdAt:current?.createdAt??now,updatedAt:now,sourceDecisionId:current?.sourceDecisionId??sourceDecisionId,confirmed:true,enabled:current?.enabled??true,removed:false,provenance:"explicit_jobs_confirmation"};
 await repo.saveSafetyRecord({id:value.id,kind:"job_preference",value:{...value},createdAt:value.createdAt});await audit(repo,expected?"edit_preference":"confirm_preference",current??null,value);return value;
}
export async function saveScopedPreference(repo:AppRepository,input:PreferenceDraft,confirmed:boolean,expected?:ScopedPreference){if(!confirmed)throw new Error("Explicit confirmation is required.");return repo.transaction(tx=>writePreference(tx,input,expected));}
export async function changeScopedPreference(repo:AppRepository,expected:ScopedPreference,action:"disable"|"enable"|"remove"|"restore"){
 return repo.transaction(async tx=>{const state=await readRefinement(tx);const current=[...state.preferences,...state.removedPreferences].find(p=>p.id===expected.id);if(!current||current.revision!==expected.revision)throw new Error("Preferences changed. Refresh before retrying.");if(current.removed&&action!=="restore"||!current.removed&&action==="restore")throw new Error("Preference state changed. Use the current restore or management action.");if(action==="restore"&&state.preferences.some(p=>p.category===current.category&&normalize(p.value)===normalize(current.value)&&p.currency===current.currency))throw new Error("This scope already has a preference. Resolve the active preference before restoring.");const next={...current,enabled:action==="enable"?true:action==="disable"?false:current.enabled,removed:action==="remove",updatedAt:new Date().toISOString(),revision:uid()};await tx.saveSafetyRecord({id:next.id,kind:"job_preference",value:next,createdAt:next.createdAt});await audit(tx,action,current,next);});
}
export async function skipJob(repo:AppRepository,expected:Job,reason:typeof skipReasons[number],note:string,preference?:PreferenceDraft){
 if(!skipReasons.includes(reason)||note.length>2000)throw new Error("Choose a skip reason and a note of at most 2000 characters.");
 return repo.transaction(async tx=>{
  const job=(await tx.listJobs()).find(j=>j.id===expected.id);if(!job||skipJobRevision(job)!==skipJobRevision(expected)||job.status!==expected.status)throw new Error("Job changed. Review the current posting before skipping.");
  const old=(await readRefinement(tx)).skips.find(s=>s.jobId===job.id);
  if(job.status==="rejected"&&old?.active&&old.reason===reason&&old.note===note&&!preference)return old;
  if(!allowed.has(job.status))throw new Error("Restore this job first, or review its current workflow state.");
  const now=new Date().toISOString();const decision:SkipDecision={version:"cc-job-skip-v1",id:uid(),jobId:job.id,reason,note,jobRevision:skipJobRevision(job),previousStatus:job.status,active:true,createdAt:now,updatedAt:now,revision:uid(),confirmation:preference?"confirmed_preference":"job_only",provenance:"explicit_jobs_skip"};
  if(preference){if(skipReasons.indexOf(reason)>=5)throw new Error("This reason supports only a job-specific skip.");decision.preferenceId=(await writePreference(tx,preference,undefined,decision.id)).id;}
  await tx.saveJob({...job,status:"rejected"});await tx.saveSafetyRecord({id:job.id,kind:"job_skip",value:{...decision},createdAt:now});await audit(tx,"skip_job",old??null,decision);return decision;
 });
}
export async function restoreSkippedJob(repo:AppRepository,expected:Job){return repo.transaction(async tx=>{
 const job=(await tx.listJobs()).find(j=>j.id===expected.id);if(!job||job.status!=="rejected"||skipJobRevision(job)!==skipJobRevision(expected))throw new Error("Job changed. Refresh before restoring.");
 const old=(await readRefinement(tx)).skips.find(s=>s.jobId===job.id);const next={...old,active:false,updatedAt:new Date().toISOString(),revision:uid()};
 await tx.saveJob({...job,status:old?.active&&allowed.has(old.previousStatus)?old.previousStatus:"matched"});if(old)await tx.saveSafetyRecord({id:job.id,kind:"job_skip",value:next,createdAt:old.createdAt});await audit(tx,"restore_job",old??{jobId:job.id,status:"rejected"},next);
 });}
export interface PreferenceRanking {baseScore:number|null;adjustment:number;priority:number|null;explanations:string[];preferenceRevision:string}
function matches(job:Job,p:ScopedPreference):boolean|null {
 const value=normalize(p.value);
 if(p.category==="arrangement")return job.workplaceType==="unspecified"?null:job.workplaceType===value;
 if(p.category==="city"||p.category==="region"){
  // Exact explicit comma-separated components only. No city/region/country geocoding or inference.
  if(!job.location.trim()||/\bor\b|\bmultiple\b|\bvarious\b|[;/]/i.test(job.location))return null;
  const parts=job.location.split(",").map(normalize);return p.category==="city"?parts[0]===value:parts.length>1?parts.slice(1).includes(value):null;
 }
 if(p.category==="role")return job.roleTitle.trim()?normalize(job.roleTitle)===value:null;
 if(p.category==="compensation"){
  if(job.salaryCurrency!==p.currency||! /^(year|yearly|annual|annually)$/i.test(job.salaryInterval)||job.salaryMax===null||job.salaryMin===null||job.salaryMin<0||job.salaryMax<job.salaryMin)return null;
  if(/estimate|estimated|prediction/i.test(JSON.stringify(job.sourcePayloadJson)))return null;
  return job.salaryMin>=Number(p.value)?true:job.salaryMax<Number(p.value)?false:null;
 }
 const text=normalize(job.descriptionText||job.rawDescription);if(!text)return null;
 // Absence of a technology in a JD is unknown; never infer a missing preference match.
 const escaped=value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`,"u").test(text)?true:null;
}
export function rankPreferences(job:Job,baseScore:number|null,preferences:ScopedPreference[],preferenceRevision:string):PreferenceRanking {
 const byCategory=new Map<string,ScopedPreference[]>();for(const p of preferences.filter(p=>p.confirmed&&p.enabled&&!p.removed))byCategory.set(p.category,[...(byCategory.get(p.category)??[]),p]);
 const explanations:string[]=[];let total=0;
 for(const [category,values]of byCategory){const preferred=values.filter(p=>p.effect==="prefer");const avoided=values.filter(p=>p.effect==="avoid");const positive=preferred.map(p=>matches(job,p));const negative=avoided.filter(p=>matches(job,p)===true);
  if(negative.length){total-=6;explanations.push(`Lower priority: ${category} matches an avoided scope (${negative.map(p=>p.value).join(", ")}).`);}
  else if(positive.includes(true)){total+=3;explanations.push(`Higher priority: matches a confirmed ${category} preference (${preferred.filter(p=>matches(job,p)===true).map(p=>p.value).join(", ")}).`);}
  else if(positive.length&&positive.every(v=>v===false)){total-=6;explanations.push(`Lower priority: outside confirmed preferred ${category} scopes (${preferred.map(p=>p.value).join(", ")}).`);}
 }
 const adjustment=Math.max(-18,Math.min(9,total));return {baseScore,adjustment,priority:baseScore===null?null:Math.max(0,Math.min(100,baseScore+adjustment)),explanations,preferenceRevision};
}
export async function preferenceRevision(preferences:ScopedPreference[]){return canonicalDigest({version:"cc-job-preference-v1",preferences:[...preferences].sort((a,b)=>a.id.localeCompare(b.id))});}
