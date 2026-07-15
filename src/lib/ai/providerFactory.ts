import type { AIProviderMode } from "../../types/domain";
import { MockAIProvider } from "./mockProvider";
import { OpenAIProvider } from "./openAIProvider";
import type { AIProvider } from "./provider";

export function createAIProvider(mode: AIProviderMode): AIProvider {
  return mode === "openai" ? new OpenAIProvider() : new MockAIProvider();
}
