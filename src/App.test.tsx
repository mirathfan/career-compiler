import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { MemoryRepository } from "./lib/database/memoryRepository";
import { RepositoryContext } from "./lib/database/repositoryContext";
import { resolveStartupRoute } from "./lib/desktop/navigation";

// Route wiring is tested independently from existing real-screen regression suites.
vi.mock("./features/dashboard/DashboardPage", () => ({ DashboardPage: () => <h1>Home screen</h1> }));
vi.mock("./features/jobs/JobsPage", () => ({ JobsPage: () => <h1>Jobs screen</h1> }));
vi.mock("./features/applications/ApplicationsPage", () => ({ ApplicationsPage: () => <h1>Applications screen</h1> }));
vi.mock("./features/resume-library/ResumeLibraryPage", () => ({ ResumeLibraryPage: () => <h1>Resumes screen</h1> }));
vi.mock("./features/profile/ProfilePage", () => ({ ProfilePage: () => <h1>Profile screen</h1> }));
vi.mock("./features/activity/ActivityPage", () => ({ ActivityPage: () => <h1>Activity screen</h1> }));
vi.mock("./features/copilot/CareerCopilotPage", () => ({ CareerCopilotPage: () => <h1>Copilot screen</h1> }));
vi.mock("./features/settings/SettingsPage", () => ({ SettingsPage: () => <h1>Settings screen</h1> }));
vi.mock("./features/jobs/SampleWorkspacePage", () => ({ SampleWorkspacePage: () => <h1>Preview screen</h1> }));
vi.mock("./features/candidate-brain/CandidateBrainPage", () => ({ CandidateBrainPage: () => <h1>Candidate screen</h1> }));
vi.mock("./features/career-memory/CareerMemoryPage", () => ({ CareerMemoryPage: () => <h1>Evidence screen</h1> }));
vi.mock("./features/tailoring/TailorResumePage", () => ({ TailorResumePage: () => <h1>Builder screen</h1> }));
vi.mock("./features/job-radar/JobRadarPage", () => ({ JobRadarPage: () => <h1>Radar screen</h1> }));
vi.mock("./features/match-inbox/MatchInboxPage", () => ({ MatchInboxPage: () => <h1>Matches screen</h1> }));
vi.mock("./features/application-queue/ApplicationQueuePage", () => ({ ApplicationQueuePage: () => <h1>Queue screen</h1> }));
vi.mock("./features/browser-extension/BrowserExtensionPage", () => ({ BrowserExtensionPage: () => <h1>Extension screen</h1> }));
vi.mock("./features/evaluation/EvaluationPage", () => ({ EvaluationPage: () => <h1>Evaluation screen</h1> }));

beforeEach(() => {
  localStorage.clear(); window.location.hash = "#/";
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
});
function setup() {
  return render(<QueryClientProvider client={new QueryClient()}><RepositoryContext.Provider value={{ repository: new MemoryRepository(), ready: true, error: null }}><App /></RepositoryContext.Provider></QueryClientProvider>);
}
const routes = [
  ["dashboard", "Home"], ["jobs", "Jobs"], ["applications", "Applications"], ["library", "Resumes"], ["profile", "Profile"], ["activity", "Activity"], ["copilot", "Copilot"], ["settings", "Settings"],
  ["preview", "Preview"], ["candidate-brain", "Candidate"], ["career-memory", "Evidence"], ["tailor", "Builder"], ["job-radar", "Radar"], ["match-inbox", "Matches"], ["application-queue", "Queue"], ["browser-extension", "Extension"], ["evaluation", "Evaluation"], ["privacy-data", "Settings"],
];
it.each(routes)("preserves /%s route resolution", async (route, label) => {
  window.location.hash = `#/${route}`; setup();
  expect(await screen.findByRole("heading", { name: `${label} screen` })).toBeVisible();
});
it("starts on Home for a new workspace and retains saved deep links", async () => {
  const first = setup(); expect(await screen.findByRole("heading", { name: "Home screen" })).toBeVisible(); first.unmount();
  localStorage.setItem("careercompiler-last-route", "/library?resumeId=exact-version"); window.location.hash = "#/"; setup();
  expect(await screen.findByRole("heading", { name: "Resumes screen" })).toBeVisible();
  expect(window.location.hash).toBe("#/library?resumeId=exact-version");
});
it("keeps primary destinations ordered, active state and browser Back", async () => {
  setup(); const user = userEvent.setup(); await screen.findByRole("heading", { name: "Home screen" });
  const links = screen.getAllByRole("link").map(link => link.getAttribute("aria-label"));
  expect(links.filter(label => ["Home", "Jobs", "Applications", "Résumés", "Profile"].includes(label ?? ""))).toEqual(["Home", "Jobs", "Applications", "Résumés", "Profile"]);
  await user.click(screen.getByRole("link", { name: "Jobs" }));
  expect(await screen.findByRole("heading", { name: "Jobs screen" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Jobs" })).toHaveAttribute("aria-current", "page");
  window.history.back();
  await waitFor(() => expect(window.location.hash).toBe("#/dashboard"));
  expect(await screen.findByRole("heading", { name: "Home screen" })).toBeVisible();
});
it("persists compact chrome and restores navigator focus on Escape", async () => {
  setup(); const user = userEvent.setup(); await screen.findByRole("heading", { name: "Home screen" });
  await user.click(screen.getByRole("button", { name: "Compact sidebar" }));
  expect(localStorage.getItem("careercompiler-sidebar-compact")).toBe("true");
  const opener = screen.getByRole("button", { name: "Go to a screen" });
  await user.click(opener); expect(screen.getByRole("textbox", { name: "Find a screen" })).toHaveFocus();
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(opener).toHaveFocus(); expect(window.location.hash).toBe("#/dashboard");
});
it("rejects invalid stored routes while preserving old query and anchor context", () => {
  for (const value of [null, "", "/", "//example.invalid", "https://example.invalid", "/unknown"]) expect(resolveStartupRoute(value)).toBe("/dashboard");
  expect(resolveStartupRoute("/applications?historyApplication=one#history-import")).toBe("/applications?historyApplication=one#history-import");
  expect(resolveStartupRoute("/career-memory?intake=1")).toBe("/career-memory?intake=1");
});
