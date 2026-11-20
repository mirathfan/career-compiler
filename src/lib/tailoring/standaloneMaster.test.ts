import { expect, it } from "vitest";
import { MemoryRepository } from "../database/memoryRepository";
import { resumeAuditFixture } from "../../test/resumeAuditFixture";
import { prepareProfileMaster, saveProfileMaster } from "./profileMaster";

it("prepares and saves a reviewed Master from profile evidence with zero saved jobs", async () => {
  const f=await resumeAuditFixture(), repo=new MemoryRepository();await repo.initialize();
  await repo.saveProfile(f.profile);for(const item of f.items)await repo.saveCareerItem(item);for(const fact of f.facts)await repo.saveCareerFact(fact);for(const skill of f.skills)await repo.saveSkill(skill);
  const draft=await prepareProfileMaster(repo);
  expect(await repo.listJobs()).toEqual([]);expect(await repo.listResumeVersions()).toEqual([]);
  await expect(saveProfileMaster(repo,draft,false)).rejects.toThrow("Review");
  const master=await saveProfileMaster(repo,draft,true);
  expect(master).toMatchObject({kind:"master",jobId:"",parentResumeVersionId:"",baseResumeVersionId:""});
  expect(await repo.listJobs()).toEqual([]);
  const second=await saveProfileMaster(repo,await prepareProfileMaster(repo),true);
  expect(second.id).not.toBe(master.id);expect(await repo.getResumeVersion(master.id)).toEqual(master);
});
