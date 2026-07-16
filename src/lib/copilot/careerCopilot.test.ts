import { describe, expect, it } from "vitest";
import { deterministicFallback } from "../ai/generationPipeline";
import { createGenerationFixture } from "../../test/generationFixture";
import { sendCareerCopilotMessage } from "./careerCopilot";

describe("Career Copilot", () => {
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
