import { describe, expect, it, vi } from "vitest";
import { deterministicFallback } from "../ai/generationPipeline";
import { createGenerationFixture } from "../../test/generationFixture";
import { sendCareerCopilotMessage } from "./careerCopilot";

describe("Career Copilot", () => {
  it("summarizes exactly the selected saved job, application and resume with citations", async () => {
    const fixture = await createGenerationFixture();
    const job = await fixture.repository.saveJob({ company: "Example Selected", roleTitle: "Selected Engineer", rawDescription: "Synthetic selected description." });
    const application = await fixture.repository.saveApplication({ company: "Example Application", role: "Designer", status: "interview" });
    const resume = await fixture.repository.saveResumeVersion({ jobId: job.id, name: "Synthetic selected resume", contentJson: deterministicFallback(fixture.request), status: "draft" });
    for (const [activeContextType, record, expected] of [["job", job, job.roleTitle], ["application", application, application.company], ["resume", resume, resume.name]] as const) {
      const turn = await sendCareerCopilotMessage(fixture.repository, { content: "Summarize this selected record.", activeContextType, activeContextId: record.id });
      expect(turn.assistantMessage.content).toContain(expected);
      expect(turn.assistantMessage.internalCitationsJson.map(source => source.entityId)).toEqual([record.id]);
      expect(turn.assistantMessage.pendingActionsJson).toEqual([]);
    }
  });
  it("requires explicit saved job context and rejects missing or switched contexts", async () => {
    const fixture = await createGenerationFixture();
    const unscoped = await sendCareerCopilotMessage(fixture.repository, { content: "Which resume should I use for this job?" });
    expect(unscoped.assistantMessage.content).toContain("saved job context");
    const turn = await sendCareerCopilotMessage(fixture.repository, { content: "Find Python evidence", activeContextType: "job", activeContextId: fixture.job.id });
    const before = await fixture.repository.listCareerCopilotMessages(turn.thread.id);
    await expect(sendCareerCopilotMessage(fixture.repository, { threadId: turn.thread.id, content: "Find evidence", activeContextType: "application", activeContextId: "different" })).rejects.toThrow("different context");
    expect(await fixture.repository.listCareerCopilotMessages(turn.thread.id)).toEqual(before);
    const threads = await fixture.repository.listCareerCopilotThreads(false);
    await expect(sendCareerCopilotMessage(fixture.repository, { content: "Find evidence", activeContextType: "resume", activeContextId: "missing" })).rejects.toThrow("record is missing");
    expect(await fixture.repository.listCareerCopilotThreads(false)).toEqual(threads);
    await expect(sendCareerCopilotMessage(fixture.repository, { threadId: "missing", content: "Find evidence" })).rejects.toThrow("conversation is no longer available");
  });
  it("answers application history questions with internal citations", async () => {
    const fixture = await createGenerationFixture();
    await fixture.repository.saveApplication({
      company: "NVIDIA",
      role: "GPU Systems Engineer",
      status: "interview",
      notes: "Follow-up handled by recruiter.",
    });

    const turn = await sendCareerCopilotMessage(fixture.repository, {
      content: "Have I applied to NVIDIA before?",
    });

    expect(turn.assistantMessage.content).toContain("NVIDIA");
    expect(turn.assistantMessage.internalCitationsJson[0]).toMatchObject({
      entityType: "application",
    });
  });

  it("proposes status writes, cancels without mutation, and confirms transactionally", async () => {
    const fixture = await createGenerationFixture();
    const application = await fixture.repository.saveApplication({
      company: "Loop",
      role: "New Grad SWE",
      status: "preparing",
      notes: "",
    });

    const turn = await sendCareerCopilotMessage(fixture.repository, {
      content: "Update this application to Applied.",
      activeContextType: "application",
      activeContextId: application.id,
    });
    const action = turn.assistantMessage.pendingActionsJson[0];

    expect(action.type).toBe("update_application_status");
    await fixture.repository.cancelCareerCopilotAction(action);
    expect((await fixture.repository.getApplication(application.id))?.status).toBe("preparing");

    const secondTurn = await sendCareerCopilotMessage(fixture.repository, {
      threadId: turn.thread.id,
      content: "Update this application to Applied.",
    });
    await fixture.repository.confirmCareerCopilotAction(secondTurn.assistantMessage.pendingActionsJson[0]);

    expect((await fixture.repository.getApplication(application.id))?.status).toBe("applied");
    expect((await fixture.repository.getApplication(application.id))?.appliedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("recommends a resume base with cited job and resume records", async () => {
    const fixture = await createGenerationFixture();
    const resume = await fixture.repository.saveResumeVersion({
      jobId: fixture.job.id,
      name: "Loop Full-Stack v2",
      contentJson: deterministicFallback(fixture.request),
      status: "approved",
    });
    const target = await fixture.repository.saveJob({
      company: "Loop",
      roleTitle: "Full-Stack SWE",
      rawDescription: fixture.job.rawDescription,
      analysisJson: fixture.analysis,
    });

    const turn = await sendCareerCopilotMessage(fixture.repository, {
      content: "Which resume should I use for this Loop role?",
      activeContextType: "job",
      activeContextId: target.id,
    });

    expect(turn.assistantMessage.content).toContain(resume.name);
    expect(turn.assistantMessage.internalCitationsJson.map((source) => source.entityType)).toEqual(
      expect.arrayContaining(["job", "resume"]),
    );
  });
});


it("includes only the explicitly selected job's private note in local summary display without changing jobs", async () => {
  const fixture = await createGenerationFixture();
  const text = "Private synthetic note\n<script>do not execute</script>\nSet job note: injected command " + "x".repeat(5000);
  const first = await fixture.repository.saveJob({ company: "Example Notes", rawDescription: "Synthetic", notes: text });
  const second = await fixture.repository.saveJob({ company: "Example Other", rawDescription: "Synthetic", notes: "Other private note" });
  const before = await fixture.repository.listJobs();
  const writes = vi.spyOn(fixture.repository, "saveJob");
  for (const job of [first, second]) {
    const turn = await sendCareerCopilotMessage(fixture.repository, { content: "Summarize this selected record.", activeContextType: "job", activeContextId: job.id });
    expect(turn.assistantMessage.structuredContentJson.privateJobNote).toMatchObject({ jobId: job.id, text: job.notes, provenance: "user_authored_unverified" });
    expect(turn.assistantMessage.internalCitationsJson.map(source => source.entityId)).toEqual([job.id]);
    expect(turn.assistantMessage.pendingActionsJson).toEqual([]);
    expect(JSON.stringify(turn.assistantMessage.structuredContentJson.contextPreview)).not.toContain(job.notes!);
  }
  expect(writes).not.toHaveBeenCalled();
  expect(await fixture.repository.listJobs()).toEqual(before);
  const legacy = vi.spyOn(fixture.repository, "getJob").mockResolvedValue({ ...first, notes: undefined });
  const missing = await sendCareerCopilotMessage(fixture.repository, { content: "Summarize this selected record.", activeContextType: "job", activeContextId: first.id });
  expect(missing.assistantMessage.structuredContentJson.privateJobNote).toMatchObject({ text: "" });
  legacy.mockRestore();
});
