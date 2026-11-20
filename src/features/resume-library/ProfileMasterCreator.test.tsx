import { expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRepository } from "../../lib/database/memoryRepository";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import { resumeAuditFixture } from "../../test/resumeAuditFixture";
import { ProfileMasterCreator } from "./ProfileMasterCreator";
import { prepareProfileMaster, saveProfileMaster } from "../../lib/tailoring/profileMaster";
import { renderMasterPdf } from "../../lib/resume/masterPdf";
vi.mock('../../lib/resume/masterPdf',()=>({renderMasterPdf:vi.fn().mockResolvedValue({dataUrl:'data:application/pdf;base64,c3ludGhldGlj',pageCount:1})}));
async function fixture() {
  const f=await resumeAuditFixture(),repo=new MemoryRepository();await repo.initialize();await repo.saveProfile(f.profile);for(const x of f.items)await repo.saveCareerItem(x);for(const x of f.facts)await repo.saveCareerFact(x);for(const x of f.skills)await repo.saveSkill(x);return repo;
}
function mount(repo:MemoryRepository){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><RepositoryContext.Provider value={{repository:repo,ready:true,error:null}}><ProfileMasterCreator onClose={()=>{}}/></RepositoryContext.Provider></QueryClientProvider>);}
it('reviews and saves a standalone Master without a job selector, preserves the existing Master, and previews the exact saved version',async()=>{
  const repo=await fixture(),original=await saveProfileMaster(repo,await prepareProfileMaster(repo),true), user=userEvent.setup();vi.mocked(renderMasterPdf).mockClear();mount(repo);
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Preview profile résumé'}));
  const save=await screen.findByRole('button',{name:'Save new Master'});expect(save).toBeDisabled();expect(screen.getByRole('button',{name:'Generate Master PDF preview'})).toBeDisabled();expect(await repo.listResumeVersions()).toHaveLength(1);
  await user.click(screen.getByRole('checkbox',{name:'I reviewed this new Master résumé.'}));await user.click(save);await screen.findByText('Master saved without a job. Existing Masters are unchanged.');
  const all=await repo.listResumeVersions(),fresh=all.find(v=>v.id!==original.id)!;expect(all).toHaveLength(2);expect(fresh.jobId).toBe('');expect(await repo.listJobs()).toEqual([]);expect(await repo.getResumeVersion(original.id)).toEqual(original);
  await user.click(screen.getByRole('button',{name:'Generate Master PDF preview'}));await screen.findByTitle('Master résumé PDF');expect(renderMasterPdf).toHaveBeenCalledWith(repo,{versionId:fresh.id},true);
});
it('allows jobless review and PDF preview on the old schema but clearly disables saving',async()=>{
  const repo=await fixture();vi.spyOn(repo,'supportsStandaloneMaster').mockResolvedValue(false);const user=userEvent.setup();mount(repo);await screen.findByText(/Saving a standalone Master is waiting/);await user.click(screen.getByRole('button',{name:'Preview profile résumé'}));await user.click(await screen.findByRole('checkbox',{name:'I reviewed this new Master résumé.'}));expect(screen.getByRole('button',{name:'Save new Master'})).toBeDisabled();await user.click(screen.getByRole('button',{name:'Generate Master PDF preview'}));await waitFor(()=>expect(screen.getByTitle('Master résumé PDF')).toBeInTheDocument());expect(await repo.listJobs()).toEqual([]);expect(await repo.listResumeVersions()).toEqual([]);
});
