import type { AppRepository } from "../database/repository";
export const FIT_FIXTURE_DATE=new Date("2026-10-15T12:00:00Z");
export const BASE_JD="Build accessible React and TypeScript interfaces with tested Python APIs. Bachelor's degree in Computer Science required. Current work authorization in the United States required. Sponsorship is available. Entry-level engineers are welcome. Graduation date between 2026-05-01 and 2027-08-31.";
export async function populateFitFixtures(repo:AppRepository,compact=false) {
  await repo.saveProfile({id:"synthetic-profile",fullName:"Alex Example",headline:"Software Engineer",city:"Seattle",region:"WA",email:"alex@example.invalid",phone:"",portfolioUrl:"",linkedInUrl:"",githubUrl:"",workAuthorizationNote:"",updatedAt:FIT_FIXTURE_DATE.toISOString()});
  const project=await repo.saveCareerItem({id:"synthetic-project",type:"project",title:"Accessible community planner",shortDescription:"React and TypeScript application with Python APIs"});
  await repo.saveCareerFact({id:"synthetic-fact",careerItemId:project.id,statement:"Built a React and TypeScript planner with tested Python APIs.",skillTags:["React","TypeScript","Python"],evidenceStatus:"verified",sourceReference:"Synthetic project review"});
  const aiProject=await repo.saveCareerItem({id:"synthetic-ai-project",type:"project",title:"Documentation retrieval evaluator",shortDescription:"Python retrieval and model evaluation"});
  await repo.saveCareerFact({id:"synthetic-ai-fact",careerItemId:aiProject.id,statement:"Built a Python documentation retrieval evaluator and reviewed grounded model answers.",skillTags:["Python"],roleTags:["AI Engineer"],evidenceStatus:"verified"});
  const internship=await repo.saveCareerItem({id:"synthetic-internship",type:"employment",title:"Software Engineering Intern",startDate:"2026-05-01",endDate:"2026-08-01"});
  await repo.saveCareerFact({id:"synthetic-intern-fact",careerItemId:internship.id,statement:"Tested Python APIs during a software engineering internship.",skillTags:["Python"],evidenceStatus:"verified"});
  await repo.saveCandidateClaim({id:"synthetic-reviewed-eligibility",category:"job_fit_eligibility",verificationStatus:"user_confirmed",locked:true,evidenceIds:[project.id],value:{version:"cc-fit-candidate-v1",workHistoryComplete:true,graduationDate:"2027-05-20",student:true,degree:"bachelor",field:"Computer Science",locations:["Seattle, WA"],remoteRegions:["United States"],relocation:false,availableFrom:"2027-06-01",authorization:[{jurisdiction:"United States",authorized:true,permanentUnrestricted:false}],futureSponsorship:true}});
  for(const name of ["React","TypeScript","Python"])await repo.saveSkill({id:`synthetic-skill-${name}`,name,category:"Technology"});
  await repo.saveJobSearchPreferences({targetRoleTitles:["Software Engineer","AI Engineer"],preferredSkills:["React","Python"],automationEnabled:false});
  const variants=[
    ["Example Studio","Software Engineer",BASE_JD],
    ["Example Systems","AI Engineer",BASE_JD+" Build Python retrieval workflows and evaluate grounded model answers. Project experience is accepted. PyTorch is preferred."],
    ["Example Health","AI Application Engineer",BASE_JD+" Docker training is provided."],
    ["Project Labs","Software Engineer",BASE_JD+" 3 years of professional experience required."],
    ["Senior Systems","Senior Software Engineer",BASE_JD+" 7+ years of professional experience required."],
    ["Graduate Works","Graduate Engineer",BASE_JD.replace("2026-05-01 and 2027-08-31","2025-05-01 and 2026-08-31")],
    ["Ambiguous AI","Software Engineer",BASE_JD.replace("Sponsorship is available.","Sponsorship may be considered case by case.")],
    ["Restricted Labs","Software Engineer",BASE_JD.replace("Current work authorization","Permanent unrestricted work authorization").replace("Sponsorship is available.","No sponsorship.")],
    ["Hybrid Coast","Software Engineer",BASE_JD],
    ["Remote North","Software Engineer",BASE_JD+" Remote within Canada."],
    ["Quiet Compensation","Software Engineer",BASE_JD],
    ["Rust Studio","Rust Engineer",BASE_JD+" Rust required."],
    ["Learning Labs","Software Engineer",BASE_JD+" Kubernetes training is provided."],
    ["Past Employer","Software Engineer",BASE_JD],
    ["Past Employer","AI Engineer",BASE_JD],
    ["Past Employer","Software Engineer",BASE_JD],
    ["Closed Studio","Software Engineer",BASE_JD],
    ["Stale Studio","Software Engineer",BASE_JD],
    ["Unknown Studio","Engineer",""],
    ["Start Studio","Software Engineer",BASE_JD+" Must start by 2027-01-01."],
  ];
  const jobs=[];
  for(const [index,[company,roleTitle,description]] of variants.entries()) {
    if(compact&&index>=3)break;
    const sourceType=index===15?"ashby":(["greenhouse","lever","ashby"] as const)[index%3];
    const job=await repo.saveJob({id:`fit-job-${index}`,company,roleTitle,rawDescription:description,descriptionText:description,location:index===8?"Boston, MA":"Seattle, WA",workplaceType:index===8?"hybrid":"remote",externalId:index===15?"repost-13":`req-${index}`,sourceId:`synthetic-${sourceType}`,applicationUrl:`https://example.invalid/${index}`,sourceUrl:`https://example.invalid/${index}`,canonicalUrl:`https://example.invalid/${index===15?13:index}`,postedAt:index===17?"2026-01-01":FIT_FIXTURE_DATE.toISOString(),status:index===16?"closed":"matched",salaryMin:index===0?90000:null,salaryMax:index===0?120000:null,salaryCurrency:index===0?"USD":""});jobs.push(job);
  }
  if(!compact)await repo.saveApplication({id:"synthetic-applied",jobId:jobs[13].id,company:jobs[13].company,role:jobs[13].roleTitle,status:"applied",appliedDate:"2026-10-14",submittedAt:"2026-10-14T12:00:00Z",jobUrl:jobs[13].applicationUrl,applicationUrl:jobs[13].applicationUrl,jobSnapshotJson:jobs[13]});
  return jobs;
}
