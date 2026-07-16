import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { testOpenAIConnectivity } from "./connectivity";

describe("development-only OpenAI connectivity test", () => {
  beforeEach(() => invokeMock.mockReset());

  it("returns a safe missing-key result without making a model request", async () => {
    invokeMock.mockResolvedValueOnce({ exists: false, source: "none", maskedSuffix: "" });
    const result = await testOpenAIConnectivity("configured-model");
    expect(result.errorCode).toBe("missing_api_key");
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("get_openai_key_status");
  });

  it("validates the minimal structured response and reports usage", async () => {
    invokeMock
      .mockResolvedValueOnce({ exists: true, source: "keychain", maskedSuffix: "1234" })
      .mockResolvedValueOnce({
        outputText: JSON.stringify({ ok: true, message: "Connection ready." }),
        durationMs: 120,
        inputTokens: 20,
        outputTokens: 5,
        totalTokens: 25,
      });
    const result = await testOpenAIConnectivity("configured-model");
    expect(result).toMatchObject({
      success: true,
      keyAvailable: true,
      provider: "openai",
      model: "configured-model",
      totalTokens: 25,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "run_openai_structured",
      expect.objectContaining({ request: expect.objectContaining({ model: "configured-model" }) }),
    );
  });

  it("redacts sensitive provider errors", async () => {
    invokeMock
      .mockResolvedValueOnce({ exists: true, source: "keychain", maskedSuffix: "1234" })
      .mockRejectedValueOnce(new Error("provider_error|Request exposed sk-private123456"));
    const result = await testOpenAIConnectivity("configured-model");
    expect(result.success).toBe(false);
    expect(result.message).toContain("redacted");
    expect(result.message).not.toContain("sk-private");
  });
});
