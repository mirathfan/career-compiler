import { expect, it } from "vitest";
import { resumeAuditFixture } from "../../test/resumeAuditFixture";
import { createMasterResumeFromProfile } from "./masterResume";
import { createJobSpecificVariant } from "./jobSpecificVariant";
import { semanticResumeDiff } from "../resume/diff";
import { saveReviewedTailoredChild } from "./reviewedChild";
import { prepareProfileMaster, saveProfileMaster } from "./profileMaster";

it("carries job-ranked order into review and the child while preserving locked sections and factual content", async () => {
  const f = await resumeAuditFixture();const base = createMasterResumeFromProfile({...f,settings:f.settings.templateSettings});const before=structuredClone(base);
  const proposed=structuredClone(base);proposed.projects.reverse();proposed.skills=["OpenAI","Python","invented keyword"];
  const next=createJobSpecificVariant(base,proposed);
  expect(next.projects.map(x=>x.careerItemId)).toEqual(proposed.projects.map(x=>x.careerItemId));
  expect(next.skills).not.toContain("invented keyword");expect(next.projects.flatMap(x=>x.bullets).every(b=>!b.approved)).toBe(true);
  expect(semanticResumeDiff(base,next).some(x=>x.category==="reordered")).toBe(true);expect(base).toEqual(before);
  base.projects[0].locked=true;expect(createJobSpecificVariant(base,proposed).projects[0].careerItemId).toBe(base.projects[0].careerItemId);
  expect(createJobSpecificVariant(base,base).projects.map(x=>x.careerItemId)).toEqual(base.projects.map(x=>x.careerItemId));
  const extra=structuredClone(base);extra.projects.push({...extra.projects[0],careerItemId:"another-project"});
  expect(semanticResumeDiff(base,extra).filter(x=>x.section==="experience")).toEqual([]);
});
it("rejects stale profile previews without creating a Master", async () => {
  const f=await resumeAuditFixture();
  const draft=await prepareProfileMaster(f.repo);
  await f.repo.saveCareerFact({...f.facts[0],statement:f.facts[0].statement+" Updated."});
  await expect(saveProfileMaster(f.repo,draft,true)).rejects.toThrow("Profile evidence changed");
  expect(await f.repo.listResumeVersions()).toEqual([]);
});
it("requires review and current evidence before saving a new child; failures create no orphan", async()=>{
  const f=await resumeAuditFixture();const content=createMasterResumeFromProfile({...f,settings:f.settings.templateSettings});const base=await f.repo.saveResumeVersion({jobId:"",kind:"master",contentJson:content});
  const input={jobId:f.jobs[0].id,contentJson:content};
  await expect(saveReviewedTailoredChild(f.repo,base,input,false)).rejects.toThrow("Review");expect(await f.repo.listResumeVersions()).toHaveLength(1);
  const child=await saveReviewedTailoredChild(f.repo,base,input,true);expect(child.id).not.toBe(base.id);expect(child.parentResumeVersionId).toBe(base.id);expect(await f.repo.getResumeVersion(base.id)).toEqual(base);
  await f.repo.saveResumeVersion({...base,name:"Changed"});await expect(saveReviewedTailoredChild(f.repo,base,input,true)).rejects.toThrow("changed");expect(await f.repo.listResumeVersions()).toHaveLength(2);
});
