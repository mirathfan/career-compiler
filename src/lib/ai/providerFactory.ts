import { acceptanceAIResponse, isIsolatedRuntime } from "../acceptance/runtime";
import type { AIProviderMode } from "../../types/domain";
import { MockAIProvider } from "./mockProvider";
import { OpenAIProvider } from "./openAIProvider";
import type { AIProvider } from "./provider";

export function createAIProvider(mode: AIProviderMode): AIProvider {
  if (isIsolatedRuntime()) {
    const scenario = acceptanceAIResponse();
    const provider = new MockAIProvider("valid", scenario === "response_error" ? "valid" : scenario);
    if (scenario === "response_error") {
      provider.analyzeJobMatch = async () => { throw new Error("Synthetic provider response error"); };
      provider.repairJobMatch = async () => { throw new Error("Synthetic provider response error"); };
    }
    return provider;
  }
  return !isIsolatedRuntime() && mode === "openai" ? new OpenAIProvider() : new MockAIProvider();
}
