let isolated = false;
export function configureIsolatedRuntime() { isolated = true; }
export function isIsolatedRuntime() { return isolated; }

// Synthetic response injection is available only after native isolation verification.
export type AcceptanceAIResponse = "valid" | "invalid_evidence_then_repair" | "permanent_invalid" | "response_error";
let response: AcceptanceAIResponse = "valid";
export function setAcceptanceAIResponse(value: AcceptanceAIResponse) {
  if (!isolated) throw new Error("Verified isolated runtime required.");
  response = value;
}
export function acceptanceAIResponse() { return response; }
