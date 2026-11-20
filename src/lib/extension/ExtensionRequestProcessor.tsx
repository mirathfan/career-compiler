import { isIsolatedRuntime } from "../acceptance/runtime";
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRepositoryStatus } from "../database/repositoryContext";
import { handleExtensionRequest } from "./requestProcessor";
import { extensionError, type ExtensionRequest, type ExtensionResponse } from "./protocol";

interface PendingExtensionRequest {
  bridgeRequestId: string;
  receivedAtMs: number;
  request: ExtensionRequest;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function ExtensionRequestProcessor() {
  const { repository, ready } = useRepositoryStatus();
  const inFlight = useRef(false);

  useEffect(() => {
    if (isIsolatedRuntime() || !ready || !repository || !isTauriRuntime()) return undefined;
    let cancelled = false;

    const tick = async () => {
      if (inFlight.current || cancelled) return;
      inFlight.current = true;
      try {
        const pending = await invoke<PendingExtensionRequest | null>("extension_next_pending_request");
        if (!pending) return;
        let response: ExtensionResponse;
        try {
          response = await handleExtensionRequest({ repository, request: pending.request });
        } catch (error) {
          response = extensionError(
            "requestId" in pending.request ? pending.request.requestId : undefined,
            "desktop_processor_failed",
            error instanceof Error ? error.message : String(error),
            true,
          );
        }
        await invoke("extension_complete_pending_request", {
          bridgeRequestId: pending.bridgeRequestId,
          response,
        });
      } catch {
        // The setup page surfaces bridge diagnostics; background polling stays quiet.
      } finally {
        inFlight.current = false;
      }
    };

    const interval = window.setInterval(() => void tick(), 350);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [ready, repository]);

  return null;
}

