export const workspaceDestinations = [
  { to: "/dashboard", label: "Home", description: "Next actions and recent activity across your workspace", keywords: "dashboard overview today start" },
  { to: "/jobs", label: "Jobs", description: "Discover roles and prepare each application in one workspace", keywords: "matches search feed saved" },
  { to: "/activity", label: "Activity", description: "Recorded application changes, resume versions, and reviewed imports", keywords: "history events recent" },
  { to: "/profile?section=import&intake=1", label: "Import profile data", description: "Bring in career evidence for review", keywords: "upload paste intake resume experience" },
  { to: "/profile", label: "My profile data", description: "Contact details, preferences, and application answers", keywords: "candidate brain salary sponsorship authorization sensitive" },
  { to: "/profile?section=evidence", label: "Career evidence", description: "Review the facts your resumes can use", keywords: "career memory projects skills education facts" },
  { to: "/tailor", label: "Resume Builder", description: "Add a job and create a tailored resume", keywords: "tailor generate job description pdf" },
  { to: "/library", label: "Resumes", description: "Open, compare, and reuse saved resumes", keywords: "versions master export pdf" },
  { to: "/jobs?view=sources", label: "Company sources", description: "Choose sources and discover roles", keywords: "search companies sources" },
  { to: "/match-inbox", label: "Match Inbox", description: "Review jobs matched to your experience", keywords: "matches approve reject" },
  { to: "/application-queue", label: "Application Queue", description: "Prepare applications for selected matches", keywords: "package answers ready" },
  { to: "/applications", label: "Applications", description: "Track submissions and follow-ups", keywords: "status interview offer history" },
  { to: "/copilot", label: "Career Copilot", description: "Ask questions about your saved career records", keywords: "chat assistant help" },
  { to: "/browser-extension", label: "Browser Extension", description: "Connect your browser to fill application forms", keywords: "setup pair autofill" },
  { to: "/evaluation", label: "Evaluation", description: "Compare resume generation quality", keywords: "test metrics fixtures" },
  { to: "/preview", label: "Sample workspace", description: "Try the design with fictional jobs and sample data", keywords: "demo preview prototype" },
  { to: "/profile?section=preferences", label: "Job preferences", description: "Choose target roles, locations, and work arrangement", keywords: "salary remote goals" },
  { to: "/settings", label: "Settings", description: "AI provider, resume templates, privacy, and backups", keywords: "openai key data restore preferences" },
];

export function findWorkspaceDestinations(query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return workspaceDestinations.filter((destination) => {
    const text = `${destination.label} ${destination.description} ${destination.keywords}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

// Keep historical routes and their query/hash context; reject unknown or external destinations.
const persistedPaths = new Set([
  ...workspaceDestinations.map(destination => destination.to.split("?")[0]),
  "/candidate-brain", "/career-memory", "/job-radar", "/privacy-data",
]);
export function resolveStartupRoute(stored: string | null): string {
  if (!stored || !stored.startsWith("/") || stored.startsWith("//")) return "/dashboard";
  return persistedPaths.has(stored.split(/[?#]/)[0]) ? stored : "/dashboard";
}
