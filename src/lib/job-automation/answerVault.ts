import type { ApplicationAnswerVaultEntry } from "../../types/domain";

const ALWAYS_CONFIRM = new Set([
  "work_authorization", "future_sponsorship", "citizenship", "security_clearance", "salary",
  "disability_status", "veteran_status", "gender", "race_ethnicity", "criminal_history",
  "legal_attestation", "signature",
]);

export function protectAnswerVaultEntry(entry: ApplicationAnswerVaultEntry): ApplicationAnswerVaultEntry {
  const consequential = ALWAYS_CONFIRM.has(entry.key.toLowerCase()) || ALWAYS_CONFIRM.has(entry.category.toLowerCase());
  return {
    ...entry,
    sensitive: entry.sensitive || consequential,
    requiresManualConfirmation: entry.requiresManualConfirmation || consequential,
  };
}

export function answerVaultContextForAi(entries: ApplicationAnswerVaultEntry[], explicitlyApprovedKeys: string[] = []) {
  const approved = new Set(explicitlyApprovedKeys);
  return entries
    .filter((entry) => entry.verified && (!entry.sensitive || approved.has(entry.key)))
    .map((entry) => ({ key: entry.key, value: entry.value, category: entry.category }));
}
