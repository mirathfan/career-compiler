import { invoke } from "@tauri-apps/api/core";

interface KeyStatus {
  exists: boolean;
  source: "keychain" | "env" | "none";
  maskedSuffix: string;
}

interface StructuredResponse {
  outputText: string;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface OpenAIConnectivityResult {
  success: boolean;
  keyAvailable: boolean;
  provider: "openai";
  model: string;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  errorCode: string;
  message: string;
}

function safeError(caught: unknown) {
  const raw = caught instanceof Error ? caught.message : String(caught);
  const separator = raw.indexOf("|");
  const code = separator === -1 ? "provider_error" : raw.slice(0, separator);
  const message = separator === -1 ? raw : raw.slice(separator + 1);
  return {
    code: code.replace(/[^a-z0-9_-]/gi, "").slice(0, 64) || "provider_error",
    message: /sk-[A-Za-z0-9_-]+/.test(message)
      ? "OpenAI connectivity failed. The sensitive provider response was redacted."
      : message.slice(0, 240),
  };
}

export async function testOpenAIConnectivity(model: string): Promise<OpenAIConnectivityResult> {
  const status = await invoke<KeyStatus>("get_openai_key_status");
  if (!status.exists) {
    return {
      success: false,
      keyAvailable: false,
      provider: "openai",
      model,
      durationMs: 0,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      errorCode: "missing_api_key",
      message: "Add an OpenAI API key in Settings before running the connectivity test.",
    };
  }
  try {
    const response = await invoke<StructuredResponse>("run_openai_structured", {
      request: {
        model,
        requestType: "job_analysis",
        instructions: "Return the exact structured connectivity acknowledgement. Do not include any other text.",
        input: { action: "CareerCompiler development connectivity test", expected: "ok" },
        schemaName: "careercompiler_connectivity",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["ok", "message"],
          properties: { ok: { type: "boolean" }, message: { type: "string" } },
        },
      },
    });
    const parsed = JSON.parse(response.outputText) as { ok?: unknown; message?: unknown };
    if (parsed.ok !== true || typeof parsed.message !== "string") {
      throw new Error("structured_response_rejected|The connectivity response failed local validation.");
    }
    return {
      success: true,
      keyAvailable: true,
      provider: "openai",
      model,
      durationMs: response.durationMs,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      totalTokens: response.totalTokens,
      errorCode: "",
      message: parsed.message.slice(0, 160),
    };
  } catch (caught) {
    const error = safeError(caught);
    return {
      success: false,
      keyAvailable: true,
      provider: "openai",
      model,
      durationMs: 0,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      errorCode: error.code,
      message: error.message,
    };
  }
}
