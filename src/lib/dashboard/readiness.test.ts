import { describe, expect, it } from "vitest";
import { MemoryRepository } from "../database/memoryRepository";
import { loadDashboardReadiness } from "./readiness";

describe("dashboard readiness", () => {
  it("keeps missing setup neutral and unavailable native status unchecked", async () => {
    const result = await loadDashboardReadiness(new MemoryRepository());
    expect(result).toEqual([
      { complete: false, warning: false, statusLabel: "No answers saved" },
      { complete: false, statusLabel: "Not checked" },
      { complete: false, statusLabel: "0 applications saved" },
    ]);
  });

  it("updates readiness when answers are reviewed and an application is saved", async () => {
    const repository = new MemoryRepository();
    const answer = await repository.saveSensitiveAnswer({
      key: "current_work_authorization", label: "Work authorization", value: "Yes",
      locked: false, requiresReview: true,
    });
    expect((await loadDashboardReadiness(repository))[0]).toEqual({ complete: false, warning: true, statusLabel: "0 of 1 saved answers locked" });
    await repository.saveSensitiveAnswer({ ...answer, locked: true, requiresReview: false });
    await repository.saveApplication({ company: "Example", role: "Engineer" });
    const result = await loadDashboardReadiness(repository);
    expect(result[0]).toEqual({ complete: true, warning: false, statusLabel: "1 of 1 saved answers locked" });
    expect(result[2]).toEqual({ complete: true, statusLabel: "1 application saved" });
  });
});
