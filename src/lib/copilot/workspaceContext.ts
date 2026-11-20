import type { CareerCopilotContextType } from "../../types/domain";

// Presentation metadata only. This object is never an AI request or a read-tool grant.
export interface WorkspaceSelection {
  type: "job" | "application" | "resume";
  id: string;
  label: string;
}
export interface CopilotContextRequest { type: CareerCopilotContextType; id: string; token: string }
export function copilotRouteContext(search: string): CopilotContextRequest | undefined {
  const params = new URLSearchParams(search);
  const type = params.get("contextType");
  if (!type || !["all", "career_memory", "job_search", "resume_library", "job", "application", "resume"].includes(type)) return;
  return { type: type as CareerCopilotContextType, id: params.get("contextId") ?? "", token: search };
}
export function workspaceView(path: string) {
  return ({ "/dashboard": "Home", "/jobs": "Jobs", "/applications": "Applications", "/library": "Résumés", "/profile": "Profile", "/activity": "Activity", "/copilot": "Career Copilot", "/tailor": "Resume Builder", "/career-memory": "Evidence Database" } as Record<string, string>)[path] ?? "Workspace";
}
