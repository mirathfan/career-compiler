import { invoke } from "@tauri-apps/api/core";
import type { AppRepository } from "../database/repository";

export interface ReadinessIndicator {
  complete: boolean;
  warning?: boolean;
  statusLabel: string;
}

export async function loadDashboardReadiness(repository: AppRepository): Promise<ReadinessIndicator[]> {
  const [answers, applications, extension] = await Promise.allSettled([
    repository.listSensitiveAnswers(),
    repository.listApplications(),
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
      ? invoke<{ setupState: string; pingOk: boolean }>("extension_get_status", {
          extensionId: localStorage.getItem("careercompiler-extension-id") || null,
        })
      : Promise.reject(new Error("Native status unavailable")),
  ]);
  const sensitive: ReadinessIndicator = answers.status === "fulfilled"
    ? {
        complete: answers.value.length > 0 && answers.value.every((answer) => answer.locked && !answer.requiresReview),
        warning: answers.value.some((answer) => answer.requiresReview),
        statusLabel: answers.value.length
          ? `${answers.value.filter((answer) => answer.locked && !answer.requiresReview).length} of ${answers.value.length} saved answers locked`
          : "No answers saved",
      }
    : { complete: false, statusLabel: "Not checked" };
  const connected = extension.status === "fulfilled" && extension.value.setupState === "paired_and_connected" && extension.value.pingOk;
  return [
    sensitive,
    { complete: connected, statusLabel: extension.status === "rejected" ? "Not checked" : connected ? "Connected" : "Not connected" },
    { complete: applications.status === "fulfilled" && applications.value.length > 0,
      statusLabel: applications.status === "rejected" ? "Not checked" : `${applications.value.length} application${applications.value.length === 1 ? "" : "s"} saved` },
  ];
}
