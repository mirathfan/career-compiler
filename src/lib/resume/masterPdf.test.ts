import { expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { MemoryRepository } from "../database/memoryRepository";
import { resumeAuditFixture } from "../../test/resumeAuditFixture";
import { prepareProfileMaster, saveProfileMaster } from "../tailoring/profileMaster";
import { renderMasterPdf } from "./masterPdf";
import { renderResumePdfBytes } from "./pdf";
vi.mock('./pdf',async importOriginal=>({...await importOriginal<typeof import('./pdf')>(),renderResumePdfBytes:vi.fn()}));
async function setup(){const f=await resumeAuditFixture(),repo=new MemoryRepository();await repo.initialize();await repo.saveProfile(f.profile);for(const x of f.items)await repo.saveCareerItem(x);for(const x of f.facts)await repo.saveCareerFact(x);for(const x of f.skills)await repo.saveSkill(x);return{repo,f,draft:await prepareProfileMaster(repo)};}
async function pdf(pages:number){const d=await PDFDocument.create();for(let i=0;i<pages;i++)d.addPage();return new Uint8Array(await d.save());}
it('renders the exact reviewed jobless Master through the existing PDF renderer without writes',async()=>{
  const {repo,draft}=await setup();const master=await saveProfileMaster(repo,draft,true);vi.mocked(renderResumePdfBytes).mockResolvedValue(await pdf(1));const before=await repo.exportBackup();
  const result=await renderMasterPdf(repo,{versionId:master.id},true);expect(result.versionId).toBe(master.id);expect(result.pageCount).toBe(1);expect(renderResumePdfBytes).toHaveBeenLastCalledWith(master.contentJson,master.templateSettingsJson);expect(await repo.getResumeVersion(master.id)).toEqual(master);expect(await repo.listJobs()).toEqual([]);expect((await repo.exportBackup()).resumes).toEqual(before.resumes);
});
it('blocks unreviewed, stale, changed-during-render and multipage previews without mutation',async()=>{
  const {repo,draft,f}=await setup();vi.mocked(renderResumePdfBytes).mockClear();await expect(renderMasterPdf(repo,{draft},false)).rejects.toThrow('Review');expect(renderResumePdfBytes).not.toHaveBeenCalled();
  vi.mocked(renderResumePdfBytes).mockResolvedValue(await pdf(2));await expect(renderMasterPdf(repo,{draft},true)).rejects.toThrow('not one page');expect(await repo.listResumeVersions()).toEqual([]);
  const one=await pdf(1);vi.mocked(renderResumePdfBytes).mockImplementationOnce(async()=>{await repo.saveCareerFact({...f.facts[0],evidenceStatus:'prohibited'});return one;});await expect(renderMasterPdf(repo,{draft},true)).rejects.toThrow('Profile evidence changed');expect(await repo.listResumeVersions()).toEqual([]);
});
