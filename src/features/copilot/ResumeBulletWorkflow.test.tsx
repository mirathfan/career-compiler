import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import { resumeBulletFixture } from "../../test/resumeBulletFixture";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import type { AppRepository } from "../../lib/database/repository";
import { CareerCopilotPage } from "./CareerCopilotPage";
import { MockAIProvider } from "../../lib/ai/mockProvider";
import { RESUME_BULLET_AUDIT } from "../../lib/copilot/resumeBulletContract";
import { renderResumeLatex } from "../../lib/resume/latex";

beforeEach(() => localStorage.clear());
function mount(repo: AppRepository, jobId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}><RepositoryContext.Provider value={{ repository: repo, ready: true, error: null }}><MemoryRouter><CareerCopilotPage embedded contextType="job" recordId={jobId}/></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>) };
}
it("reviews two mocked requests, rejects, accepts via keyboard, reopens exact child and reviews archival reversal", async () => {
  const f = await resumeBulletFixture(true); const user = userEvent.setup(); const calls = vi.spyOn(MockAIProvider.prototype,"converseWorkspace"); let view = mount(f.repo,f.job.id);
  try {
    const before = await f.repo.listResumeVersions(), apps = await f.repo.listApplications();
    await user.click(await screen.findByRole("button",{name:"Review one résumé bullet"}));
    await user.selectOptions(await screen.findByLabelText("Source résumé version"),f.source.id); await user.selectOptions(screen.getByLabelText("Target bullet"),f.target.bulletId);
    await user.click(screen.getByRole("button",{name:"Read across selected records"}));
    const option = screen.getByRole("checkbox",{name:"Allow one evidence-backed résumé bullet proposal"}); expect(option).not.toBeChecked(); await user.click(option);
    await user.click(screen.getByRole("checkbox",{name:"Verified career evidence"})); await user.click(await screen.findByRole("checkbox",{name:f.fact.statement}));
    fireEvent.change(screen.getByLabelText("Connected workspace question"),{target:{value:"Improve my AURA bullet using verified evidence."}});
    expect(calls).not.toHaveBeenCalled(); await user.click(screen.getByRole("button",{name:"Review tool-selection request"})); await screen.findByLabelText("Exact connected outbound context");
    await user.click(screen.getByRole("button",{name:"Run reviewed workspace mock"})); await waitFor(()=>expect(screen.getByLabelText("Exact connected outbound context").textContent).toContain('"phase": "answer"'));
    expect(screen.getByLabelText("Exact connected outbound context").textContent).not.toMatch(/PRIVATE_|preserved-master|original-aura|resumeDocumentJson/);
    await user.click(screen.getByRole("button",{name:"Run reviewed workspace mock"})); await screen.findByRole("button",{name:"Reject proposal"});
    const review = screen.getByLabelText("Review changes and sources"); expect(within(review).getByText("Current bullet")).toBeVisible(); expect(within(review).getByText(f.originalFact.statement)).toBeVisible(); expect(within(review).getByText(f.fact.statement)).toBeVisible(); expect(within(review).getByText(/Projects → AURA/)).toBeVisible();
    expect(await f.repo.listResumeVersions()).toEqual(before); await user.click(screen.getByRole("button",{name:"Reject proposal"})); await screen.findByText("Proposal rejected. No domain record was changed."); expect(await f.repo.listResumeVersions()).toEqual(before);
    await user.click(screen.getByRole("button",{name:"Review one résumé bullet"})); await user.selectOptions(screen.getByLabelText("Source résumé version"),f.source.id); await user.selectOptions(screen.getByLabelText("Target bullet"),f.target.bulletId); await user.selectOptions(screen.getByLabelText("Verified evidence for local draft"),f.fact.id);
    await user.click(screen.getByRole("button",{name:"Prepare local evidence draft"})); const accept = await screen.findByRole("button",{name:"Accept change"}); accept.focus(); await user.keyboard("{Enter}");
    await screen.findByText("New résumé child saved. Source and submitted versions preserved; PDF not yet rendered.");
    const action = (await f.repo.listCareerCopilotThreads()).length ? (await f.repo.listSafetyRecords(RESUME_BULLET_AUDIT))[0] : null; expect(action).not.toBeNull();
    const childId = (action!.value.after as {childId:string}).childId; const child = (await f.repo.getResumeVersion(childId))!;
    expect(child.contentJson.projects[0].bullets[0].text).toBe(f.fact.statement); expect(await f.repo.listApplications()).toEqual(apps); for(const v of before) expect(await f.repo.getResumeVersion(v.id)).toEqual(v);
    if (process.env.CC_INTELLIGENCE_EVIDENCE) {
      await writeFile(`${process.env.CC_INTELLIGENCE_EVIDENCE}/resume-child.tex`,renderResumeLatex(child.contentJson,child.templateSettingsJson));
      await writeFile(`${process.env.CC_INTELLIGENCE_EVIDENCE}/resume-bullet-ui-acceptance.json`,JSON.stringify({status:"PASS",harness:"React/jsdom + synthetic SQL.js SQLite export/reopen, not native",sourceId:f.source.id,childId,parentId:child.parentResumeVersionId,approvedText:f.fact.statement,sourcePreserved:true,submittedAssociationsPreserved:true,child,pdfGenerated:false},null,2));
    }
    view.unmount(); view.client.clear(); await f.reopen(); view=mount(f.repo,f.job.id); await user.click(await screen.findByText("Accepted changes (1)"));
    expect(await screen.findByRole("link",{name:"Open exact child"})).toHaveAttribute("href",`/library?resumeId=${childId}`);
    await user.click(screen.getByText("Show what changed")); expect(screen.getAllByText(f.fact.statement).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button",{name:"Review undo"})); await screen.findByRole("button",{name:"Accept change"}); expect(await f.repo.listResumeArchives()).toEqual([]);
    await user.click(screen.getByRole("button",{name:"Accept change"})); await screen.findByText("Generated child archived. Version content and audit are retained.");
    expect(await f.repo.getResumeVersion(childId)).toEqual(child); expect(await f.repo.listApplications()).toEqual(apps); expect(await f.repo.listSafetyRecords(RESUME_BULLET_AUDIT)).toHaveLength(2); expect(calls).toHaveBeenCalledTimes(2);
    if (process.env.CC_INTELLIGENCE_EVIDENCE) await writeFile(`${process.env.CC_INTELLIGENCE_EVIDENCE}/resume-bullet-ui-reversal.json`,JSON.stringify({status:"PASS",childId,childPreserved:true,applicationsPreserved:true,archives:await f.repo.listResumeArchives(),audit:await f.repo.listSafetyRecords(RESUME_BULLET_AUDIT),mockRequests:calls.mock.calls.length,native:false},null,2));
  } finally { view.unmount();view.client.clear();calls.mockRestore();f.close(); }
},20000);

it("keeps navigation local and explains ambiguous natural-language targets without making proposals",async()=>{
  const f=await resumeBulletFixture();const user=userEvent.setup();const calls=vi.spyOn(MockAIProvider.prototype,"converseWorkspace");const view=mount(f.repo,f.job.id);
  try {
    await user.click(await screen.findByRole("button",{name:"Read across selected records"})); expect(screen.getByRole("checkbox",{name:"Allow one evidence-backed résumé bullet proposal"})).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox",{name:"Message Career Copilot"}),{target:{value:"Improve my AURA bullet for this job using only verified evidence."}});await user.click(screen.getByRole("button",{name:"Send"}));await screen.findByText(/I will not guess an ambiguous bullet/);
    expect(screen.queryByRole("button",{name:"Accept change"})).not.toBeInTheDocument();expect(calls).not.toHaveBeenCalled();
  }finally{view.unmount();view.client.clear();calls.mockRestore();f.close();}
});
