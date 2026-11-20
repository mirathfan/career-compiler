import { z } from "zod";
import { localDay } from "../dashboard/workspace";
import { containsProbableSecret } from "../import/careerIntake";
import { containsPromptInjectionText } from "../import/evidenceImport";

export const APPLICATION_NEXT_ACTION = "set_application_next_action" as const;
export const APPLICATION_NEXT_ACTION_AUDIT = "application_next_action";
export const ApplicationActionId = z.string().min(1).max(160).regex(/^[\w:-]+$/);
export const RecordedDay = z.string().refine(value => value === "" || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value), "Use a real YYYY-MM-DD date.");
const text = z.string().trim().min(1).max(500).refine(value => /[\p{L}\p{N}]/u.test(value) && !/[\u0000-\u001f\u007f]/.test(value) && !containsPromptInjectionText(value) && !containsProbableSecret(value), "Use a short tracker action without instructions, secrets or control characters.");
export const NextActionSuggestion = z.object({ operation: z.literal(APPLICATION_NEXT_ACTION), nextAction: text, followUpDate: RecordedDay }).strict();
export const TrackingValues = z.object({ nextAction: z.string().max(12000), followUpDate: RecordedDay }).strict();
export const NextActionBefore = z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/), values: TrackingValues }).strict();
export const NextActionAfter = z.object({
  operation: z.literal(APPLICATION_NEXT_ACTION), applicationId: ApplicationActionId,
  values: TrackingValues, reason: z.literal("User requested this local tracker update."), instruction: z.string().min(1).max(1000),
  time: z.object({ today: RecordedDay, timeZone: z.string().min(1).max(100), capturedAt: z.iso.datetime(), expression: z.string().max(80), resolvedDate: RecordedDay }).strict(),
  undoOf: ApplicationActionId.optional(),
}).strict();

// Only user-authored instructions call this parser. Imported text/model output is never authority.
export function parseNextActionInstruction(instruction: string, currentDate: string, now = new Date()) {
  const match = instruction.trim().match(/^set (?:my |the )?next action(?: for this application)? to (.+?)[.!]?$/i);
  if (!match || instruction.length > 1000) throw new Error("Say ‘Set my next action to <task>’, optionally ‘on YYYY-MM-DD’.");
  let action = match[1]; const suffix = action.match(/ (?:on|by|due) (.+)$/i) ?? action.match(/ ((?:next |this )?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|week)|today|tomorrow|\d{4}-\d{2}-\d{2})$/i);
  const today = localDay(now); const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let date = RecordedDay.parse(currentDate); const expression = suffix?.[1] ?? "";
  if (suffix) {
    action = action.slice(0, suffix.index);
    if (/^\d{4}-\d{2}-\d{2}$/.test(expression)) date = RecordedDay.parse(expression);
    else {
      const value = expression.toLowerCase(); const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const offset = value === "today" ? 0 : value === "tomorrow" ? 1 : days.includes(value) ? (days.indexOf(value) - now.getDay() + 7) % 7 : -1;
      if (offset < 0 || (offset === 0 && value !== "today")) throw new Error("That date is ambiguous. Give an exact YYYY-MM-DD date (or today/tomorrow) before preparing a proposal.");
      const resolved = new Date(now); resolved.setDate(resolved.getDate() + offset); date = localDay(resolved);
    }
  }
  return { suggestion: NextActionSuggestion.parse({ operation: APPLICATION_NEXT_ACTION, nextAction: action, followUpDate: date }), time: { today, timeZone, capturedAt: now.toISOString(), expression, resolvedDate: date } };
}
