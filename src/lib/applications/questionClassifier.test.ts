import { describe, expect, it } from "vitest";
import { classifyApplicationField, normalizeDetectedField } from "./questionClassifier";

describe("application question classifier", () => {
  it("uses deterministic mappings before fallback", () => {
    expect(classifyApplicationField({ label: "Email", inputType: "email" }).normalizedQuestionType).toBe("email");
    expect(classifyApplicationField({ label: "Will you now or in the future require sponsorship?" }).normalizedQuestionType).toBe("future_sponsorship");
    expect(classifyApplicationField({ label: "Why are you a strong fit for this role?" }).normalizedQuestionType).toBe("candidate_fit");
  });

  it("keeps unknown fields low-confidence", () => {
    const result = classifyApplicationField({ label: "Favorite keyboard switch" });
    expect(result.normalizedQuestionType).toBe("unknown");
    expect(result.confidence).toBeLessThan(0.65);
  });

  it("normalizes extension fields into the shared app contract", () => {
    const field = normalizeDetectedField({
      id: "field-1",
      label: "LinkedIn URL",
      elementName: "urls[LinkedIn]",
      atsPlatform: "lever",
    });
    expect(field.normalizedQuestionType).toBe("linkedin");
    expect(field.atsPlatform).toBe("lever");
  });
});
