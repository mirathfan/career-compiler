import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import { MemoryRepository } from "../../lib/database/memoryRepository";
import { serializeCareerImportPackage } from "../../lib/import/careerIntake";
import { PROMPT_VERSIONS } from "../../lib/ai/prompts";
import type { CareerImportProposal } from "../../types/domain";
import { SmartCareerIntake } from "./SmartCareerIntake";

const providerMocks = vi.hoisted(() => ({
  extractCareerInformation: vi.fn(),
}));

vi.mock("../../lib/ai/providerFactory", () => ({
  createAIProvider: () => ({
    mode: "mock",
    extractCareerInformation: providerMocks.extractCareerInformation,
  }),
}));

function proposal(): CareerImportProposal {
  return {
    importId: "career-import-bulk-test",
    sourceType: "paste_anything",
    sourceTitle: "Bulk test package",
    sourceReference: "unit test",
    profileChanges: [],
    careerItemChanges: [
      {
        proposalId: "proposal-safe-item",
        operation: "add",
        targetType: "career_item",
        existingRecordId: "",
        confidence: 0.9,
        reason: "Project was stated explicitly.",
        sourceExcerpt: "Project: Bulk Test Project",
        validationStatus: "pending",
        validationIssues: [],
        duplicateCandidates: [],
        conflictDetails: [],
        userDecision: "pending",
        proposedValue: {
          type: "project",
          title: "Bulk Test Project",
          organization: "Independent project",
          location: "",
          startDate: "",
          endDate: "",
          isCurrent: false,
          shortDescription: "Project imported to test bulk review.",
          url: "",
          repositoryUrl: "",
          enabled: true,
        },
        existingValue: null,
      },
    ],
    careerFactChanges: [
      {
        proposalId: "proposal-invalid-fact",
        operation: "add",
        targetType: "career_fact",
        existingRecordId: "",
        confidence: 0.8,
        reason: "Fact was stated explicitly.",
        sourceExcerpt: "Built an orphaned fact.",
        validationStatus: "pending",
        validationIssues: [],
        duplicateCandidates: [],
        conflictDetails: [],
        userDecision: "pending",
        proposedValue: {
          statement: "Built an orphaned fact for bulk review.",
          careerItemId: "",
          careerItemTitle: "Missing Career Item",
          evidenceStatus: "user_provided",
          sourceType: "user_statement",
          sourceReference: "unit test",
          skillTags: [],
          roleTags: [],
          metricTokens: [],
          importance: 3,
          enabled: true,
        },
        existingValue: null,
      },
    ],
    skillChanges: [
      {
        proposalId: "proposal-duplicate-skill",
        operation: "add",
        targetType: "skill",
        existingRecordId: "",
        confidence: 0.8,
        reason: "Skill was stated explicitly.",
        sourceExcerpt: "TypeScript",
        validationStatus: "pending",
        validationIssues: [],
        duplicateCandidates: [],
        conflictDetails: [],
        userDecision: "pending",
        proposedValue: {
          name: "TypeScript",
          category: "Languages",
          proficiencyNote: "",
          enabled: true,
        },
        existingValue: null,
      },
    ],
    relationshipChanges: [],
    warnings: [],
    unresolvedQuestions: [],
    extractionMetadata: {
      provider: "package",
      model: "",
      promptVersion: PROMPT_VERSIONS.careerIntake,
      classifiedAs: "paste_anything",
      createdAt: "2026-07-17T00:00:00.000Z",
    },
  };
}

beforeEach(() => {
  localStorage.removeItem("careercompiler-smart-intake-test");
  providerMocks.extractCareerInformation.mockReset();
});

async function renderIntake() {
  const repository = new MemoryRepository(undefined, "careercompiler-smart-intake-test");
  await repository.initialize();
  await repository.seedSampleData();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RepositoryContext.Provider value={{ repository, error: null, ready: true }}>
        <SmartCareerIntake
          items={await repository.listCareerItems()}
          facts={await repository.listCareerFacts()}
          skills={await repository.listSkills()}
          selectedItemId={null}
          onDone={() => undefined}
        />
      </RepositoryContext.Provider>
    </QueryClientProvider>,
  );
  return { repository, view };
}

describe("SmartCareerIntake bulk review", () => {
  it("shows progress while provider extraction is still running", async () => {
    const user = userEvent.setup();
    let resolveExtraction: (value: { data: CareerImportProposal }) => void = () => undefined;
    providerMocks.extractCareerInformation.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveExtraction = resolve;
      }),
    );
    await renderIntake();

    await user.type(await screen.findByPlaceholderText("Source title or reference"), "Slow intake prompt");
    fireEvent.change(screen.getByPlaceholderText("Paste career information, project notes, resume text, or interview answers"), {
      target: { value: "Project: Slow extraction\nBuilt a visible extraction loading state." },
    });
    await user.click(screen.getByRole("button", { name: "Generate proposal" }));

    expect(screen.getByRole("button", { name: "Generating proposal..." })).toBeDisabled();
    expect(screen.getByText("Generating local proposal...")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Paste career information, project notes, resume text, or interview answers"),
    ).toBeDisabled();

    resolveExtraction({ data: proposal() });

    expect(await screen.findByText("Mock extraction is ready for review.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate proposal" })).toBeEnabled();
  });

  it("lets users resolve repetitive proposal decisions with bulk buttons", async () => {
    const user = userEvent.setup();
    await renderIntake();

    await user.selectOptions(await screen.findByRole("combobox"), "structured_package");
    await user.type(screen.getByPlaceholderText("Source title or reference"), "Bulk test package");
    fireEvent.change(screen.getByPlaceholderText("Paste a CareerCompiler import package JSON"), {
      target: { value: serializeCareerImportPackage(proposal()) },
    });
    await user.click(screen.getByRole("button", { name: "Generate proposal" }));

    expect(await screen.findByText("3 pending decisions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve saveable (1)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject duplicates (1)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject invalid/conflicts (1)" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Approve saveable (1)" }));
    await waitFor(() => expect(screen.getByText("2 pending decisions")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Reject duplicates (1)" }));
    await waitFor(() => expect(screen.getByText("1 pending decisions")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Reject invalid/conflicts (1)" }));
    await waitFor(() => expect(screen.getByText("0 pending decisions")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save approved changes" })).toBeEnabled();
  });
});
