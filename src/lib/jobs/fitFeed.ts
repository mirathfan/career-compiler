import { readHistoryProofs } from "../applications/historyContract";
import { canonicalDigest } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
import type { AppRepository } from "../database/repository";
import { fingerprintEvidenceInput } from "../job-automation/evidenceFreshness";
import { jobFingerprint } from "../job-automation/safety";
import { FIT_ASSESSMENT_VERSION, assessJobFit, reconcileApplication, type FitAssessment, type ApplicationMatch } from "./fitAssessment";
import { readRefinement, preferenceRevision, rankPreferences, type PreferenceRanking } from "./preferenceRefinement";
import type { Job } from "../../types/domain";
export type FitFeedView = "recommended"|"confirmation"|"applied"|"saved"|"excluded"|"skipped"|"all";
export interface FitFeedRow { job: Job; assessment: FitAssessment; application: ApplicationMatch; ranking?: PreferenceRanking }
export function hasApplied(row:FitFeedRow) {return row.application.state==="EXACT"&&row.application.records.some(record=>Boolean(record.submittedAt||record.appliedDate)||["applied","interview","offer","rejected","withdrawn"].includes(record.status));}
export function filterFitFeed(rows:FitFeedRow[],view:FitFeedView,search="",workplace="",sort="fit") {
  const terms=search.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(row=> {
    const excluded=row.assessment.eligibility==="DISQUALIFIED"||["rejected","archived","closed"].includes(row.job.status);
    if(view==="recommended"&&(excluded||row.assessment.eligibility!=="ELIGIBLE"||row.application.state==="POSSIBLE_MATCH"||hasApplied(row)))return false;
    if(view==="confirmation"&&(excluded||(row.assessment.eligibility!=="NEEDS_CONFIRMATION"&&row.application.state!=="POSSIBLE_MATCH")||hasApplied(row)))return false;
    if(view==="excluded"&&!excluded)return false;
    if(view==="skipped"&&row.job.status!=="rejected")return false;
    if(view==="applied"&&!hasApplied(row))return false;
    if(view==="saved"&&!["saved","resume_pending","resume_ready","ready_to_apply"].includes(row.job.status))return false;
    return (!workplace||row.job.workplaceType===workplace)&&terms.every(term=>`${row.job.company} ${row.job.roleTitle} ${row.job.location}`.toLowerCase().includes(term));
  }).sort((a,b)=>(sort==="fit"?(b.ranking?.priority??b.assessment.score??-1)-(a.ranking?.priority??a.assessment.score??-1):0)||(b.job.postedAt||b.job.createdAt).localeCompare(a.job.postedAt||a.job.createdAt)||a.job.id.localeCompare(b.job.id));
}
export async function loadFitFeed(repository:AppRepository,now=new Date()):Promise<FitFeedRow[]> {
  return repository.transaction(async repo=> {
    const [jobs,items,facts,skills,claims,preferences,applications,records]=await Promise.all([repo.listJobs(),repo.listCareerItems(),repo.listCareerFacts(),repo.listSkills(),repo.listCandidateClaims(),repo.getJobSearchPreferences(),repo.listApplications(),repo.listSafetyRecords("job_fit")]);
    const historyProofs=await readHistoryProofs(repo);
    const refinement=await readRefinement(repo);const revision=await preferenceRevision(refinement.preferences);
    const byId=new Map(records.map(record=>[record.id,record]));
    const candidate={items,facts,skills,claims,preferences};const result:FitFeedRow[]=[];
    const reviewed=claims.filter(claim=>claim.category==="job_fit_eligibility");
    for(const job of jobs){
      const base=await fingerprintEvidenceInput({job,preferences,careerItems:items,careerFacts:facts,skills});
      const withoutCosmetic = <T extends { createdAt?: string; updatedAt?: string; displayOrder?: number }>(records:T[]) => records.map(({createdAt:_created,updatedAt:_updated,displayOrder:_order,...value})=>value).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
      const fingerprint=await canonicalDigest({base,items:withoutCosmetic(items),facts:withoutCosmetic(facts),skills,reviewed,preferences,version:FIT_ASSESSMENT_VERSION});
      const context = await canonicalDigest([job.status,job.postedAt]);
      const cached=byId.get(job.id)?.value.assessment as FitAssessment|undefined;
      // Date affects experience duration and posting freshness; day-key forces reassessment.
      const assessment=byId.get(job.id)?.value.context===context&&cached?.version===FIT_ASSESSMENT_VERSION&&cached.evidenceFingerprint===fingerprint&&cached.jobFingerprint===jobFingerprint(job)&&cached.assessedAt.slice(0,10)===now.toISOString().slice(0,10)?cached:assessJobFit(job,candidate,fingerprint,now);
      if(assessment!==cached)await repo.saveSafetyRecord({id:job.id,kind:"job_fit",value:{assessment,context},createdAt:now.toISOString()});
      result.push({job,assessment,application:reconcileApplication(job,applications,historyProofs),ranking:rankPreferences(job,assessment.score,refinement.preferences,revision)});
    }
    return result;
  });
}
