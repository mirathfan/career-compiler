import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { MemoryRepository } from "../../lib/database/memoryRepository";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import { MockAIProvider } from "../../lib/ai/mockProvider";
import { ModelJobConversation } from "./ModelJobConversation";

async function fixture() {
  const repo=new MemoryRepository(); await repo.initialize();
  await repo.saveJobSearchPreferences({aiMatchEnabled:true,aiMatchMockMode:true,maximumAiAnalysesPerDay:10});
  const job=await repo.saveJob({company:"Example",roleTitle:"Engineer",rawDescription:"Synthetic job",notes:"PRIVATE_SECRET_NOTE"});
  return {repo,job};
}
it("requires exact context review and explicit send, supports follow-up, and cancels unsent reviews",async()=>{
  const {repo,job}=await fixture(); const user=userEvent.setup();
  const call=vi.spyOn(MockAIProvider.prototype,"converseJob");
  const view=render(<QueryClientProvider client={new QueryClient()}><RepositoryContext.Provider value={{repository:repo,ready:true,error:null}}><MemoryRouter><ModelJobConversation jobId={job.id} label="Example · Engineer"/></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>);
  try {
    expect(call).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button",{name:"Ask AI about this job"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Question for AI"}),{target:{value:"What role?"}});
    await user.click(screen.getByRole("button",{name:"Review AI request"}));
    const preview=await screen.findByLabelText("Exact outbound AI context");
    expect(preview.textContent).toContain("What role?"); expect(preview.textContent).not.toContain("PRIVATE_SECRET_NOTE");
    expect(call).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button",{name:"Cancel AI request"}));
    expect(call).not.toHaveBeenCalled(); expect(await repo.listSafetyRecords("ai_budget")).toEqual([]);
    await user.click(screen.getByRole("button",{name:"Review AI request"}));
    await user.click(await screen.findByRole("button",{name:"Run reviewed mock request"}));
    expect(await screen.findByText(/fixed field echo, no model reasoning/)).toBeVisible();
    expect(screen.getByRole("link",{name:/Source: selected job/})).toHaveAttribute("href",`/jobs?jobId=${encodeURIComponent(job.id)}`);
    fireEvent.change(screen.getByRole("textbox",{name:"Question for AI"}),{target:{value:"And where?"}});
    await user.click(screen.getByRole("button",{name:"Review AI request"}));
    expect((await screen.findByLabelText("Exact outbound AI context")).textContent).toContain("What role?");
    await user.click(screen.getByRole("button",{name:"End AI conversation"}));
    expect(screen.queryByText(/Source: selected job/)).not.toBeInTheDocument();
    expect((await repo.getJob(job.id))?.notes).toBe("PRIVATE_SECRET_NOTE");
  } finally {view.unmount();call.mockRestore();}
});

it("discards in-flight output on context unmount and never shows it for another job",async()=>{
  const {repo,job}=await fixture();const other=await repo.saveJob({company:"Other",rawDescription:"Synthetic"});
  const original=MockAIProvider.prototype.converseJob;
  let finish!:()=>void;
  const call=vi.spyOn(MockAIProvider.prototype,"converseJob").mockImplementation(async function(this: MockAIProvider, input){await new Promise<void>(resolve=>{finish=resolve;});return original.call(this,input);});
  const client=new QueryClient();
  const tree=(id:string)=><QueryClientProvider client={client}><RepositoryContext.Provider value={{repository:repo,ready:true,error:null}}><MemoryRouter><ModelJobConversation key={id} jobId={id} label={id}/></MemoryRouter></RepositoryContext.Provider></QueryClientProvider>;
  const view=render(tree(job.id));const user=userEvent.setup();
  try {
    await user.click(screen.getByRole("button",{name:"Ask AI about this job"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Question for AI"}),{target:{value:"Question"}});
    await user.click(screen.getByRole("button",{name:"Review AI request"}));
    await user.click(await screen.findByRole("button",{name:"Run reviewed mock request"}));
    await waitFor(()=>expect(call).toHaveBeenCalledTimes(1));
    view.rerender(tree(other.id));finish();
    await waitFor(async()=>expect((await repo.listSafetyRecords("ai_budget"))[0].value.state).toBe("finished"));
    expect(screen.queryByRole("link",{name:/Source: selected job/})).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Ask AI about this job"})).toBeVisible();
  }finally{view.unmount();call.mockRestore();}
});
