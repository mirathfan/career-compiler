import { describe, expect, it } from "vitest";
import { hasUnsavedResumeDraft } from "./windowState";

describe("desktop draft protection", () => {
  it("detects only a valid dirty persisted resume draft", () => {
    expect(hasUnsavedResumeDraft({ getItem: () => JSON.stringify({ state: { dirty: true } }) })).toBe(true);
    expect(hasUnsavedResumeDraft({ getItem: () => JSON.stringify({ state: { dirty: false } }) })).toBe(false);
    expect(hasUnsavedResumeDraft({ getItem: () => "not-json" })).toBe(false);
    expect(hasUnsavedResumeDraft({ getItem: () => null })).toBe(false);
  });
});
