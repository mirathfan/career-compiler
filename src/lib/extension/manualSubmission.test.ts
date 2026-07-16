import { describe, expect, it } from "vitest";
import backgroundSource from "../../../apps/careercompiler-extension/src/background.js?raw";
import contentSource from "../../../apps/careercompiler-extension/src/content.js?raw";
import popupSource from "../../../apps/careercompiler-extension/src/popup.js?raw";

describe("extension manual submission boundary", () => {
  it("does not contain form submission APIs or synthetic submit-button automation", () => {
    const source = [backgroundSource, contentSource, popupSource].join("\n");
    expect(source).not.toMatch(/\.submit\s*\(/);
    expect(source).not.toMatch(/requestSubmit\s*\(/);
    expect(source).not.toMatch(/dispatchEvent\s*\(\s*new\s+SubmitEvent/);
    expect(source).not.toMatch(/querySelector\([^)]*submit[^)]*\)\.click\s*\(/);
    expect(source).not.toMatch(/fetch\s*\([^)]*(?:apply|submit|application)/i);
  });
});
