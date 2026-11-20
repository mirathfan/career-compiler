import { isHistoryApplication, readHistoryMarker, type HistoryProof } from "../applications/historyContract";
import { requirementClauses, positiveEquivalence, professionalCategory } from "./requirementClauses";
import { z } from "zod";
import type { ApplicationRecord, CandidateClaim, CareerFact, CareerItem, Job, JobSearchPreferences, Skill } from "../../types/domain";
import { scoreJob } from "../job-automation/scoring";
import { buildLocalFitEvidencePacket } from "../job-automation/evidencePacket";
import { canonicalizeUrl, htmlToText } from "../job-automation/normalize";
import { jobFingerprint } from "../job-automation/safety";

export const eligibilityLabel = { ELIGIBLE:"Eligible", NEEDS_CONFIRMATION:"Needs confirmation", DISQUALIFIED:"Excluded · disqualified" };
export type Eligibility = "ELIGIBLE" | "NEEDS_CONFIRMATION" | "DISQUALIFIED";
export type FitDimension = "role" | "experience" | "education" | "arrangement" | "authorization" | "skills";
export interface FitReason { id: string; dimension: FitDimension; requirement: string; status: Eligibility; code: string; explanation: string; evidenceIds: string[]; preferred?: boolean; trainable?: boolean }
export const FIT_ASSESSMENT_VERSION = "cc-job-fit-v2" as const;
export interface FitAssessment {
  version: typeof FIT_ASSESSMENT_VERSION; source: "deterministic"; freshness: "current"; assessedAt: string;
  jobFingerprint: string; evidenceFingerprint: string; score: number | null; eligibility: Eligibility;
  reasons: FitReason[]; evidence: Array<{ id: string; text: string; category: string }>;
}
// Explicit reviewed, jurisdiction-scoped assertions. No legal inference from profile/location.
export const FitCandidateSchema = z.object({
  version: z.literal("cc-fit-candidate-v1"), workHistoryComplete: z.boolean().optional(),
  graduationDate: z.iso.date().optional(), student: z.boolean().optional(),
  degree: z.enum(["none", "associate", "bachelor", "master", "doctorate"]).optional(), field: z.string().optional(),
  locations: z.array(z.string()).optional(), remoteRegions: z.array(z.string()).optional(), relocation: z.boolean().optional(), availableFrom: z.iso.date().optional(),
  authorization: z.array(z.object({ jurisdiction: z.string(), authorized: z.boolean(), permanentUnrestricted: z.boolean().optional() })).optional(),
  futureSponsorship: z.boolean().optional(),
}).strict();
export interface FitCandidate { items: CareerItem[]; facts: CareerFact[]; skills: Skill[]; claims: CandidateClaim[]; preferences: JobSearchPreferences }
const normalize = (value: string) => htmlToText(value).replace(/\s+/g," ").trim().toLowerCase();
const techs = ["React", "TypeScript", "JavaScript", "Python", "SQL", "Rust", "Java", "Kubernetes", "PyTorch", "Docker", "AWS", "TensorFlow", "PostgreSQL"];
const term = (text: string, value: string) => new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
function months(items: CareerItem[], now: Date) {
  const occupied = new Set<number>(); let incomplete = false;
  for (const item of items) {
    if (!/^\d{4}-\d{2}/.test(item.startDate) || (!item.isCurrent && !/^\d{4}-\d{2}/.test(item.endDate))) { incomplete = true; continue; }
    const start = new Date(item.startDate.slice(0,7)+"-01"); const end = item.isCurrent ? now : new Date(item.endDate.slice(0,7)+"-01");
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end < start || start.getFullYear() < 1900) { incomplete = true; continue; }
    for (let month = start.getUTCFullYear()*12+start.getUTCMonth(); month < Math.min(end.getUTCFullYear()*12+end.getUTCMonth(), now.getUTCFullYear()*12+now.getUTCMonth()); month++) occupied.add(month);
  }
  return { years: occupied.size/12, incomplete };
}
export function assessJobFit(job: Job, candidate: FitCandidate, evidenceFingerprint: string, now = new Date()): FitAssessment {
  const packet = buildLocalFitEvidencePacket({ job, preferences: candidate.preferences, careerItems: candidate.items, careerFacts: candidate.facts, skills: candidate.skills });
  const ids = new Set(packet.items.map(item => item.id));
  const claims = candidate.claims.filter(claim => claim.category === "job_fit_eligibility" && ["verified","user_confirmed"].includes(claim.verificationStatus) && claim.locked);
  const parsed = claims.length === 1 ? FitCandidateSchema.safeParse(claims[0].value) : null;
  const reviewed = parsed?.success ? parsed.data : undefined; const claimIds = reviewed ? [claims[0].id] : [];
  const reasons: FitReason[] = [];
  const add = (dimension: FitDimension, requirement: string, status: Eligibility, code: string, explanation: string, evidenceIds: string[] = [], extra: {preferred?:boolean;trainable?:boolean} = {}) => reasons.push({ id: `requirement-${reasons.length+1}`, dimension, requirement, status, code, explanation, evidenceIds, ...extra });
  const description = htmlToText(job.descriptionText || job.rawDescription);
  const clauses = requirementClauses(description);
  const eligibleItems = candidate.items.filter(item => ids.has(item.id));
  const jobs = eligibleItems.filter(item=>item.type === "employment" && !/intern/i.test(item.title));
  const professional = months(jobs, now);
  if (candidate.items.some(item => item.type === "employment" && !/intern/i.test(item.title) && !ids.has(item.id))) professional.incomplete = true;
  if (!job.company.trim() || !job.roleTitle.trim() || description.length < 40) add("role", description || "Posting content", "NEEDS_CONFIRMATION", "posting_incomplete", "A complete employer, title and full description are needed.");
  if (["closed","archived"].includes(job.status)) add("role", `Posting status: ${job.status}`, "DISQUALIFIED", "posting_unavailable", "This locally recorded posting is unavailable; no live availability was checked.");
  const posted = Date.parse(job.postedAt);
  if (Number.isFinite(posted) && now.getTime()-posted > candidate.preferences.maximumJobAgeDays*86400000) add("role", `Posted ${job.postedAt}`, "NEEDS_CONFIRMATION", "posting_stale", "Confirm that this older posting is still open.");
  const roleFacts = packet.items.filter(item=>item.category === "fact");
  add("role", job.roleTitle || "Role title", roleFacts.length ? "ELIGIBLE" : "NEEDS_CONFIRMATION", "role_evidence", roleFacts.length ? "Reviewed career evidence is available for comparison; this does not verify all responsibilities." : "No eligible career facts support a role comparison.", roleFacts.slice(0,3).map(item=>item.id));
  let authorizationSeen = false;
  for (const {text:clause,section} of clauses) {
    const preferred = section === "preferred" || /preferred|nice.to.have|bonus|helpful/i.test(clause); let handled = false;
    if ((preferred && /must|required|minimum/i.test(clause)) || (/\bor\b/i.test(clause) && /degree/i.test(clause) && /experience|years/i.test(clause))) { add("role",clause,"NEEDS_CONFIRMATION","compound_requirement","Mixed mandatory/preferred or conditional alternatives need manual review; no eligibility is inferred."); continue; }
    const durationText = clause.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b(?=\s+years?)/gi,word=>String(["zero","one","two","three","four","five","six","seven","eight","nine","ten"].indexOf(word.toLowerCase())));
    const years = durationText.match(/(\d+)(?:\s*(?:-|–|to)\s*\d+)?\+?\s*(?:years?|yrs?)\s+(?:of\s+)?([^.;:]*?)experience\b/i);
    if (years && !preferred && !professionalCategory(years[2])) { handled=true; add("experience",clause,"NEEDS_CONFIRMATION","experience_category_ambiguous","The duration is explicit but its category does not establish professional employment. Review the original wording; coursework and projects are not converted into employment years."); }
    if (years && !preferred && professionalCategory(years[2])) {
      handled = true; let experience = professional; let relevant = jobs;
      if (clauses.some(({text})=>positiveEquivalence(text,"internship"))) { relevant = eligibleItems.filter(item=>item.type === "employment"); experience = months(relevant,now); }
      if (/engineering|software development/i.test(years[2])) { const before=relevant.length; relevant=relevant.filter(item=>(/software/i.test(years[2])?/software|developer|programmer/i:/engineer|software|developer|programmer/i).test(item.title)); const scoped=months(relevant,now); scoped.incomplete ||= experience.incomplete || relevant.length!==before; experience=scoped; }
      const required = Number(years[1]); const satisfies = experience.years >= required;
      const projectAlternative = clauses.some(({text})=>positiveEquivalence(text,"project"));
      add("experience", clause, satisfies ? "ELIGIBLE" : projectAlternative ? "NEEDS_CONFIRMATION" : reviewed?.workHistoryComplete && !experience.incomplete ? "DISQUALIFIED" : "NEEDS_CONFIRMATION", "professional_years", projectAlternative && !satisfies ? `The posting explicitly permits project equivalence. Review it manually; no conversion to ${required} professional years is assumed.` : `${experience.years.toFixed(1)} documented non-overlapping employment years; ${required} required. Projects are not professional employment.`, relevant.map(item=>item.id).concat(reviewed?.workHistoryComplete ? claimIds : []));
      if (/full[- ]time/i.test(years[2]) && satisfies) add("experience",clause,"NEEDS_CONFIRMATION","employment_schedule_review","Dated employment does not establish full-time hours; review explicit schedule evidence before applying.",relevant.map(item=>item.id));
    }
    if (/entry.level|new.grad|graduate.engineer/i.test(clause) && !years) { handled = true; add("experience",clause,"ELIGIBLE","entry_level","Posting explicitly describes entry-level work; other constraints remain separate."); }
    if (positiveEquivalence(clause,"project") && !years) { handled = true; const projects=eligibleItems.filter(item=>item.type==="project");add("experience",clause,projects.length?"ELIGIBLE":"NEEDS_CONFIRMATION","explicit_project_equivalence","Project evidence is considered only because the posting explicitly permits it.",projects.map(item=>item.id)); }
    const window = clause.match(/graduat\w*.*?between\s+(\d{4}-\d{2}-\d{2})\s+and\s+(\d{4}-\d{2}-\d{2})/i);
    if (window) { handled=true;const date=reviewed?.graduationDate;add("education",clause,!date?"NEEDS_CONFIRMATION":date>=window[1]&&date<=window[2]?"ELIGIBLE":"DISQUALIFIED","graduation_window",date?`Reviewed graduation date: ${date}.`:"A reviewed graduation date is missing.",claimIds); }
    else if (/graduat\w*.*(?:between|by|after|before|20\d{2})/i.test(clause)) { handled=true;add("education",clause,"NEEDS_CONFIRMATION","graduation_window_ambiguous","Confirm the exact graduation window and reviewed candidate date."); }
    if (/must be.*(?:student|enrolled)|currently enrolled.*required/i.test(clause)) {handled=true;add("education",clause,reviewed?.student===undefined?"NEEDS_CONFIRMATION":reviewed.student?"ELIGIBLE":"DISQUALIFIED","student_status","Use explicitly reviewed enrollment status, not school location or age.",claimIds);}
    if (/bachelor|master|doctorate|ph\.?d/i.test(clause) && !preferred) {
      handled=true; const levels=["none","associate","bachelor","master","doctorate"];const required=/bachelor.*\bor\b.*(?:master|doctorate|ph\.?d)/i.test(clause)?2:/master.*\bor\b.*(?:doctorate|ph\.?d)/i.test(clause)?3:/ph\.?d|doctorate/i.test(clause)?4:/master/i.test(clause)?3:2;
      const degree=reviewed?.degree; const equivalent=/or equivalent|equivalent experience/i.test(clause);
      const satisfied=degree&&levels.indexOf(degree)>=required;
      add("education",clause,satisfied?"ELIGIBLE":!degree||equivalent?"NEEDS_CONFIRMATION":"DISQUALIFIED","degree",satisfied?`Reviewed degree: ${degree}.`:equivalent?"Equivalent-experience wording needs explicit review.":"Confirm the required degree against reviewed education.",claimIds);
      if (/computer science/i.test(clause)) add("education",clause,!reviewed?.field?"NEEDS_CONFIRMATION":/computer science/i.test(reviewed.field)?"ELIGIBLE":/related field/i.test(clause)?"NEEDS_CONFIRMATION":"DISQUALIFIED","field_of_study","Field of study must be explicitly reviewed; related-field equivalence is not assumed.",claimIds);
    }
    if (/work authori[sz]|sponsorship|citizenship|visa|security clearance/i.test(clause)) {
      handled=true;
      const jurisdiction = /United States|\bU\.?S\.?\b/i.test(clause)?"United States":/Canada/i.test(clause)?"Canada":null;
      const auth=reviewed?.authorization?.find(item=>normalize(item.jurisdiction)===normalize(jurisdiction??""));
      if (/work authori[sz]/i.test(clause)) {
        authorizationSeen = true;
        const permanent=/permanent|unrestricted|without restrictions/i.test(clause);
        add("authorization",clause,!jurisdiction||!auth?"NEEDS_CONFIRMATION":!auth.authorized?"DISQUALIFIED":permanent&&auth.permanentUnrestricted!==true?(auth.permanentUnrestricted===false?"DISQUALIFIED":"NEEDS_CONFIRMATION"):"ELIGIBLE","authorization_scoped",auth?`Explicit reviewed authorization for ${jurisdiction}; no inference from location or nationality.`:"Jurisdiction-specific reviewed legal evidence is missing.",claimIds);
      }
      if (/sponsorship/i.test(clause)) {const prohibited=/no (?:visa )?sponsorship|cannot sponsor|will not sponsor|without.*sponsorship|sponsorship (?:is )?(?:not available|unavailable|not provided)/i.test(clause);const allowed=/sponsorship (?:is )?(?:available|provided|supported)/i.test(clause);add("authorization",clause,reviewed?.futureSponsorship===undefined?"NEEDS_CONFIRMATION":prohibited&&reviewed.futureSponsorship?"DISQUALIFIED":prohibited||allowed?"ELIGIBLE":"NEEDS_CONFIRMATION","future_sponsorship",prohibited?"Employer explicitly restricts sponsorship; current authorization and future need are separate.":allowed?"Posting explicitly permits sponsorship; this is not immigration advice or a legal guarantee.":"Employer sponsorship wording is ambiguous.",claimIds);}
      if (/citizenship|visa|security clearance/i.test(clause) && !/sponsorship/i.test(clause)) add("authorization",clause,"NEEDS_CONFIRMATION","legal_manual_review","This legal restriction requires separately reviewed evidence; no inference is permitted.");
    }
    const remote=clause.match(/remote (?:only |roles? )?(?:within|in|restricted to)\s+([^.;]+)/i);
    if(remote){handled=true;const region=normalize(remote[1]);const known=reviewed?.remoteRegions;add("arrangement",clause,!known?"NEEDS_CONFIRMATION":known.some(value=>normalize(value)===region)?"ELIGIBLE":"DISQUALIFIED","remote_region","Remote work still has an explicit geographic restriction.",claimIds);}
    const start=clause.match(/start by\s+(\d{4}-\d{2}-\d{2})/i);if(start){handled=true;add("arrangement",clause,!reviewed?.availableFrom?"NEEDS_CONFIRMATION":reviewed.availableFrom<=start[1]?"ELIGIBLE":"DISQUALIFIED","start_date","Start-date availability is compared only with an explicit reviewed date.",claimIds);}
    for (const technology of techs.filter(technology=>term(clause,technology))) {
      handled=true;const supporting=packet.items.filter(item=>["skill","fact"].includes(item.category)&&term(`${item.text} ${item.normalizedSkills.join(" ")}`,technology));const trainable=/train|learn|mentorship/i.test(clause);
      add("skills",clause,supporting.length?"ELIGIBLE":"NEEDS_CONFIRMATION",preferred?"preferred_skill":trainable?"trainable_gap":"required_skill_evidence",supporting.length?`${technology} is supported by enabled evidence.`:`${technology}: ${trainable?"training is explicitly offered":preferred?"preferred qualification":"candidate evidence is missing; this alone is not a legal disqualifier"}.`,supporting.map(item=>item.id),{preferred,trainable});
    }
    if ((!handled || /fluen|certification|licen[cs]e|background check|travel required|language proficiency/i.test(clause) || (!years && /(?:professional|industry|commercial) experience/i.test(clause) && !/internships? count toward professional experience/i.test(clause))) && !preferred && (section === "required" || /must|required|requirements|eligible only/i.test(clause))) add("role",clause,"NEEDS_CONFIRMATION","requirement_manual_review","This explicit requirement is outside the supported deterministic rules; inspect it manually.");
    if (!handled && preferred && section === "preferred") add("role",clause,"NEEDS_CONFIRMATION","preferred_manual_review","Review this preferred qualification against available evidence.",[],{preferred:true});
  }
  if (!authorizationSeen) add("authorization","Employer legal eligibility terms not stated","NEEDS_CONFIRMATION","legal_terms_missing","Confirm authorization and sponsorship requirements explicitly; location is not legal evidence.");
  if (job.workplaceType === "hybrid" || job.workplaceType === "on_site") {const known=reviewed?.locations;const fits=known?.some(value=>normalize(value)===normalize(job.location));add("arrangement",`${job.workplaceType}: ${job.location||"location missing"}`,fits?"ELIGIBLE":!known||reviewed?.relocation!==false?"NEEDS_CONFIRMATION":"DISQUALIFIED","onsite_location",fits?"Reviewed availability explicitly includes this location.":"Confirm required attendance and relocation; home city is not assumed availability.",claimIds);}
  const decisive=reasons.filter(reason=>!reason.preferred&&!reason.trainable);
  const eligibility: Eligibility=decisive.some(reason=>reason.status==="DISQUALIFIED")?"DISQUALIFIED":decisive.some(reason=>reason.status==="NEEDS_CONFIRMATION")?"NEEDS_CONFIRMATION":"ELIGIBLE";
  const scoring=scoreJob(job,candidate.preferences,{careerItems:candidate.items,careerFacts:candidate.facts,skills:candidate.skills},now);
  return {version:FIT_ASSESSMENT_VERSION,source:"deterministic",freshness:"current",assessedAt:now.toISOString(),jobFingerprint:jobFingerprint(job),evidenceFingerprint,score:description.length>=40&&job.company.trim()&&job.roleTitle.trim()&&(roleFacts.length||packet.items.some(item=>item.category==="skill"))?scoring.deterministicScore:null,eligibility,reasons,evidence:[...packet.items.map(item=>({id:item.id,text:item.text,category:item.category})),...claims.filter(()=>reviewed).map(claim=>({id:claim.id,text:JSON.stringify(claim.value),category:"reviewed eligibility"}))]};
}
export interface ApplicationMatch { state: "EXACT"|"POSSIBLE_MATCH"|"NONE"; records: ApplicationRecord[] }
const cleanUrl=(value:string)=>{try{const url=new URL(value);return canonicalizeUrl(url.href);}catch{return "";}};
export function reconcileApplication(job:Job,applications:ApplicationRecord[],historyProofs:HistoryProof[]=[]):ApplicationMatch {
  const canonical = cleanUrl(job.canonicalUrl);
  const exact=applications.filter(record=> {
    if (normalize(record.company)!==normalize(job.company)||normalize(record.role)!==normalize(job.roleTitle)) return false;
    const imported=readHistoryMarker(record.source);
    if(isHistoryApplication(record.source)){
      if(!imported||imported.evidenceState!=="CONFIRMED_APPLICATION")return false;
      const proof=historyProofs.find(p=>p.id===imported.entryId&&p.applicationId===record.id&&p.evidenceState===imported.evidenceState);
      if(!proof||normalize(proof.normalized.employer)!==normalize(record.company)||normalize(proof.normalized.role)!==normalize(record.role)||proof.normalized.requisition!==imported.requisition||proof.normalized.sourceId!==imported.sourceId||proof.normalized.postingUrl!==imported.postingUrl||(proof.choice.jobId||"")!==imported.reviewedJobId)return false;
      if(imported.requisition&&job.externalId&&imported.requisition!==job.externalId)return false;
      return Boolean(imported.reviewedJobId===job.id||imported.postingUrl&&cleanUrl(imported.postingUrl)===canonical||imported.sourceId&&imported.sourceId===job.sourceId&&imported.requisition&&imported.requisition===job.externalId);
    }
    const snapshot=record.jobSnapshotJson;
    if (snapshot?.sourceId && snapshot.sourceId === job.sourceId && snapshot.externalId && job.externalId && snapshot.externalId !== job.externalId) return false;
    return record.jobId===job.id || Boolean(canonical&&[record.jobUrl,record.applicationUrl,snapshot?.canonicalUrl??""].some(url=>cleanUrl(url)===canonical)) || Boolean(job.sourceId&&snapshot&&snapshot.company.toLowerCase()===job.company.toLowerCase()&&snapshot.roleTitle.toLowerCase()===job.roleTitle.toLowerCase()&&snapshot.sourceId===job.sourceId&&snapshot.externalId&&snapshot.externalId===job.externalId);
  });
  if(exact.length)return {state:"EXACT",records:exact};
  const possible=applications.filter(record=>(!isHistoryApplication(record.source)||["CONFIRMED_APPLICATION","POSSIBLE_APPLICATION"].includes(readHistoryMarker(record.source)?.evidenceState??""))&&normalize(record.company)===normalize(job.company)&&normalize(record.role)===normalize(job.roleTitle));
  return {state:possible.length?"POSSIBLE_MATCH":"NONE",records:possible};
}
