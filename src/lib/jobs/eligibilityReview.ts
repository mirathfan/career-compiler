import type { CandidateClaim } from "../../types/domain";
import type { AppRepository } from "../database/repository";
import { canonicalDigest } from "../../../apps/careercompiler-extension/src/authorizationContract.js";
import { FitCandidateSchema } from "./fitAssessment";
export const reviewedBoolean=(value:string)=>value==="yes"?true:value==="no"?false:undefined;
export async function saveEligibilityReview(repository:AppRepository,fields:Record<string,string>,original:CandidateClaim|undefined,confirmed:boolean){
 if(!confirmed)throw new Error("Confirm the reviewed statements before saving.");
 const value:Record<string,unknown>={version:"cc-fit-candidate-v1"};
 for(const key of ["workHistoryComplete","student","relocation","futureSponsorship"])if(reviewedBoolean(fields[key])!==undefined)value[key]=reviewedBoolean(fields[key]);
 for(const key of ["graduationDate","availableFrom","degree","field"])if(fields[key])value[key]=fields[key];
 for(const key of ["locations","remoteRegions"])if(fields[key]?.trim())value[key]=fields[key].split(";").map(s=>s.trim()).filter(Boolean);
 if(Boolean(fields.jurisdiction?.trim())!==Boolean(fields.authorized))throw new Error("Provide both authorization jurisdiction and current authorization, or leave both unknown.");
 if(fields.jurisdiction&&fields.authorized)value.authorization=[{jurisdiction:fields.jurisdiction.trim(),authorized:reviewedBoolean(fields.authorized),...(reviewedBoolean(fields.permanentUnrestricted)===undefined?{}:{permanentUnrestricted:reviewedBoolean(fields.permanentUnrestricted)})}];
 const parsed=FitCandidateSchema.parse(value);
 return repository.transaction(async repo=>{
  const records=(await repo.listCandidateClaims()).filter(item=>item.category==="job_fit_eligibility");
  if(records.length>1||await canonicalDigest(records[0]??null)!==await canonicalDigest(original??null))throw new Error("Eligibility changed while this review was open. Reopen and review the current statements.");
  const current=records[0];if(current?.locked)await repo.saveCandidateClaim({...current,locked:false});
  return repo.saveCandidateClaim({id:current?.id,category:"job_fit_eligibility",value:parsed,verificationStatus:"user_confirmed",locked:true,evidenceIds:current?.evidenceIds??[]});
 });
}
