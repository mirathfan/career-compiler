import { beforeAll } from "vitest";
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};});
import {it,expect,vi} from "vitest";
import {render,screen,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {RepositoryContext} from "../../lib/database/repositoryContext";
import {MemoryRepository} from "../../lib/database/memoryRepository";
import {populateFitFixtures} from "../../lib/jobs/fitFixtures";
import {JobImportDialog} from "./JobImportDialog";
async function setup(){const repo=new MemoryRepository();await populateFitFixtures(repo);const onSaved=vi.fn(),onClose=vi.fn();const result=render(<QueryClientProvider client={new QueryClient()}><RepositoryContext.Provider value={{repository:repo,ready:true,error:null}}><JobImportDialog open onClose={onClose} onSaved={onSaved}/></RepositoryContext.Provider></QueryClientProvider>);return {repo,onSaved,onClose,...result};}
it("keeps fixture preview transient and requires explicit save after evidence and duplicate review",async()=>{
 const {repo,onSaved}=await setup();const user=userEvent.setup();await user.selectOptions(screen.getByRole("combobox",{name:"Input type"}),"fixture");await user.click(screen.getByRole("button",{name:"Preview job"}));await screen.findByRole("heading",{name:"Review the complete posting"});expect(screen.getAllByText(/Current work authorization.*required\./).length).toBeGreaterThan(0);await user.click(screen.getByRole("button",{name:"Review fit and evidence"}));await screen.findByRole("heading",{name:"Understand your fit"});expect(screen.queryByRole("button",{name:"Review eligibility information"})).not.toBeInTheDocument();await user.click(screen.getByRole("button",{name:"Review duplicates"}));expect(screen.getByRole("button",{name:"Save job"})).toBeDisabled();expect(await repo.listJobs()).toHaveLength(20);await user.click(screen.getByRole("checkbox",{name:/I reviewed the full description/}));await user.click(screen.getByRole("button",{name:"Save job"}));await vi.waitFor(()=>expect(onSaved).toHaveBeenCalledTimes(1));expect(await repo.listJobs()).toHaveLength(21);expect(await repo.listApplications()).toHaveLength(1);expect(await repo.listApplicationPackages()).toHaveLength(0);
});
it("rejects unsafe URLs, offers manual input for missing content and cancels without persistence",async()=>{
 const {repo,onClose}=await setup();const user=userEvent.setup();const value=screen.getByRole("textbox",{name:"Job URL"});await user.type(value,"https://user:secret@example.com/job");await user.click(screen.getByRole("button",{name:"Preview job"}));expect(await screen.findByRole("alert")).not.toHaveTextContent("secret");await user.clear(value);await user.type(value,"https://careers.example.com/no-fixture");await user.click(screen.getByRole("button",{name:"Preview job"}));expect(await screen.findByRole("alert")).toHaveTextContent("Content unavailable");await user.click(screen.getByRole("button",{name:"Cancel import"}));expect(onClose).toHaveBeenCalled();expect(await repo.listJobs()).toHaveLength(20);expect(await repo.listSafetyRecords("ai_budget")).toHaveLength(0);
});
it("supports cancel at every preview stage and renders hostile source text without execution",async()=>{
 const {repo,onClose}=await setup();const user=userEvent.setup();await user.selectOptions(screen.getByRole("combobox",{name:"Input type"}),"text");await user.type(screen.getByRole("textbox",{name:"Complete job description"}),"Company: Synthetic Text\nTitle: Engineer\n<script>window.executedImport=true</script>\nRequired: React.");await user.click(screen.getByRole("button",{name:"Preview job"}));await screen.findByRole("heading",{name:"Review the complete posting"});expect(document.querySelector("script")).toBeNull();for(const step of ["Review fit and evidence","Review duplicates"]){await user.click(screen.getByRole("button",{name:"Cancel import"}));await user.click(screen.getByRole("button",{name:step}));}await user.click(screen.getByRole("button",{name:"Cancel import"}));expect(onClose).toHaveBeenCalledTimes(3);expect(await repo.listJobs()).toHaveLength(20);expect(await repo.listSafetyRecords("ai_budget")).toHaveLength(0);expect(within(screen.getByRole("dialog")).getByRole("button",{name:"Save job"})).toBeDisabled();
});
it("shows correction validation errors without advancing to a stale fit preview",async()=>{
 await setup();const user=userEvent.setup();await user.selectOptions(screen.getByRole("combobox",{name:"Input type"}),"fixture");await user.click(screen.getByRole("button",{name:"Preview job"}));await screen.findByRole("heading",{name:"Review the complete posting"});await user.clear(screen.getByRole("textbox",{name:"Currency (explicit ISO code only)"}));await user.type(screen.getByRole("textbox",{name:"Currency (explicit ISO code only)"}),"invented-currency");await user.click(screen.getByRole("button",{name:"Review fit and evidence"}));expect(screen.getByRole("alert")).toBeInTheDocument();expect(screen.getByRole("heading",{name:"Review the complete posting"})).toBeInTheDocument();
});

it("keeps the LinkedIn URL when falling back to pasted text and saves only after review",async()=>{
 const {repo,onSaved}=await setup();const user=userEvent.setup();const network=vi.spyOn(globalThis,"fetch");
 await user.type(screen.getByRole("textbox",{name:"Job URL"}),"https://www.linkedin.com/jobs/view/123456789?utm_source=test");
 await user.click(screen.getByRole("button",{name:"Preview job"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("Paste the job description to import it for review");
 expect(screen.getByRole("alert")).toHaveTextContent("no request was made");
 await user.click(screen.getByRole("button",{name:"Paste description instead"}));
 expect(screen.getByRole("textbox",{name:"Source URL (optional)"})).toHaveValue("https://www.linkedin.com/jobs/view/123456789");
 await user.type(screen.getByRole("textbox",{name:"Complete job description"}),"Company: Synthetic LinkedIn Import\nTitle: Backend Engineer\nRequired: Build PostgreSQL services.");
 await user.click(screen.getByRole("button",{name:"Preview job"}));await screen.findByRole("heading",{name:"Review the complete posting"});
 expect(screen.getByText(/Retrieval: manually pasted text/)).toBeInTheDocument();
 await user.click(screen.getByRole("button",{name:"Review fit and evidence"}));await screen.findByRole("heading",{name:"Understand your fit"});
 await user.click(screen.getByRole("button",{name:"Review duplicates"}));expect(await repo.listJobs()).toHaveLength(20);
 await user.click(screen.getByRole("checkbox",{name:/I reviewed the full description/}));await user.click(screen.getByRole("button",{name:"Save job"}));
 await vi.waitFor(()=>expect(onSaved).toHaveBeenCalledTimes(1));
 expect((await repo.getJob(onSaved.mock.calls[0][0]))?.sourceUrl).toBe("https://www.linkedin.com/jobs/view/123456789");
 expect(network).not.toHaveBeenCalled();network.mockRestore();
});
