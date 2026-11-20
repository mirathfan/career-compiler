import { describe, expect, it } from "vitest";
import { MockAIProvider } from "../ai/mockProvider";
import { createAIProvider } from "../ai/providerFactory";
import { configureIsolatedRuntime, setAcceptanceAIResponse } from "./runtime";

describe("acceptance response injection boundary", () => {
  it("is unavailable before verified isolation and forces a mock afterward", async () => {
    expect(() => setAcceptanceAIResponse("response_error")).toThrow("Verified isolated runtime required");
    configureIsolatedRuntime();
    expect(createAIProvider("openai")).toBeInstanceOf(MockAIProvider);
    setAcceptanceAIResponse("response_error");
    const provider = createAIProvider("openai");
    // Error fixture throws without evaluating or transmitting input.
    await expect(provider.analyzeJobMatch({ request: {} as never, modelName: "synthetic" })).rejects.toThrow("Synthetic provider response error");
    setAcceptanceAIResponse("valid");
  });
});
