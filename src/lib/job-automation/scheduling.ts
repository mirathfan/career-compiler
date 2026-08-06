import type { JobAutomationRun, JobSearchPreferences, JobSource } from "../../types/domain";

export function shouldRunOnLaunch(
  preferences: JobSearchPreferences,
  sources: JobSource[],
  runs: JobAutomationRun[],
  now = new Date(),
) {
  if (!preferences.automationEnabled || !sources.some((source) => source.enabled)) return false;
  if (runs.some((run) => run.status === "running")) return false;
  const latest = [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!latest) return true;
  const elapsedHours = (now.getTime() - new Date(latest.startedAt).getTime()) / 3_600_000;
  return Number.isFinite(elapsedHours) && elapsedHours >= preferences.pollingIntervalHours;
}

export function groupedAutomationNotifications(run: JobAutomationRun) {
  const notifications: Array<{ kind: "matches" | "source_failure" | "packages"; title: string; body: string }> = [];
  if (run.summary.highMatchJobIds.length) notifications.push({ kind: "matches", title: "New strong job matches", body: `${run.summary.highMatchJobIds.length} job${run.summary.highMatchJobIds.length === 1 ? " is" : "s are"} ready in Match Inbox.` });
  if (run.summary.sourceFailureCount) notifications.push({ kind: "source_failure", title: "Job source check incomplete", body: `${run.summary.sourceFailureCount} source${run.summary.sourceFailureCount === 1 ? "" : "s"} failed; other sources continued.` });
  if (run.resumesGenerated) notifications.push({ kind: "packages", title: "Application packages ready", body: `${run.resumesGenerated} package${run.resumesGenerated === 1 ? " is" : "s are"} ready for review.` });
  return notifications;
}
