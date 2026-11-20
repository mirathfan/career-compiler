import { useCareerAI } from "./components/careerAIContext";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { HashRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  ClipboardList,
  Database,
  FlaskConical,
  Globe,
  Inbox,
  Library,
  PackageCheck,
  Radar,
  Settings,
  Search,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LoadingState } from "./components/States";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CareerAIPanel } from "./components/CareerAIPanel";
import { CareerAIWorkspaceProvider } from "./components/CareerAIWorkspace";
import { WorkspaceNavigator } from "./components/WorkspaceNavigator";
import { resolveStartupRoute } from "./lib/desktop/navigation";
import { ExtensionRequestProcessor } from "./lib/extension/ExtensionRequestProcessor";
import { JobAutomationLaunchScheduler } from "./lib/job-automation/JobAutomationLaunchScheduler";

const JobsPage = lazy(() => import("./features/jobs/JobsPage").then((module) => ({ default: module.JobsPage })));
const ProfilePage = lazy(() => import("./features/profile/ProfilePage").then((module) => ({ default: module.ProfilePage })));
const SampleWorkspacePage = lazy(() => import("./features/jobs/SampleWorkspacePage").then((module) => ({ default: module.SampleWorkspacePage })));

const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const ActivityPage = lazy(() => import("./features/activity/ActivityPage").then((module) => ({ default: module.ActivityPage })));
const CandidateBrainPage = lazy(() => import("./features/candidate-brain/CandidateBrainPage").then((module) => ({ default: module.CandidateBrainPage })));
const CareerMemoryPage = lazy(() => import("./features/career-memory/CareerMemoryPage").then((module) => ({ default: module.CareerMemoryPage })));
const TailorResumePage = lazy(() => import("./features/tailoring/TailorResumePage").then((module) => ({ default: module.TailorResumePage })));
const ResumeLibraryPage = lazy(() => import("./features/resume-library/ResumeLibraryPage").then((module) => ({ default: module.ResumeLibraryPage })));
const ApplicationsPage = lazy(() => import("./features/applications/ApplicationsPage").then((module) => ({ default: module.ApplicationsPage })));
const BrowserExtensionPage = lazy(() => import("./features/browser-extension/BrowserExtensionPage").then((module) => ({ default: module.BrowserExtensionPage })));
const EvaluationPage = lazy(() => import("./features/evaluation/EvaluationPage").then((module) => ({ default: module.EvaluationPage })));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const JobRadarPage = lazy(() => import("./features/job-radar/JobRadarPage").then((module) => ({ default: module.JobRadarPage })));
const MatchInboxPage = lazy(() => import("./features/match-inbox/MatchInboxPage").then((module) => ({ default: module.MatchInboxPage })));
const ApplicationQueuePage = lazy(() => import("./features/application-queue/ApplicationQueuePage").then((module) => ({ default: module.ApplicationQueuePage })));

interface NavigationItem {
  to: string;
  label: string;
  ariaLabel?: string;
  icon: LucideIcon;
  shortcut?: string;
  paths?: string[];
}

const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  { label: "Workspace", items: [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/jobs", label: "Jobs", icon: BriefcaseBusiness, paths: ["/jobs", "/preview", "/job-radar", "/match-inbox", "/tailor"] },
    { to: "/applications", label: "Applications", icon: ClipboardList, paths: ["/applications", "/application-queue"] },
    { to: "/library", label: "Résumés", icon: Library, paths: ["/library"] },
    { to: "/profile", label: "Profile", icon: BrainCircuit, paths: ["/profile", "/career-memory", "/candidate-brain"] },
  ] },
  { label: "Support", items: [
    { to: "/activity", label: "Activity", icon: History },
    { to: "/copilot", label: "Career Copilot", icon: Bot },
    { to: "/settings", label: "Settings", icon: Settings },
  ] },
];
const additionalNavigation: NavigationItem[] = [
  { to: "/tailor", label: "Resume Builder", icon: Sparkles, shortcut: "⌘⌥T" },
  { to: "/job-radar", label: "Source & AI settings", icon: Radar },
  { to: "/match-inbox", label: "Detailed match analysis", icon: Inbox },
  { to: "/application-queue", label: "Application packages", icon: PackageCheck },
  { to: "/career-memory", label: "Evidence Database", icon: Database },
  { to: "/browser-extension", label: "Browser Extension", icon: Globe },
  { to: "/evaluation", label: "Evaluation", icon: FlaskConical },
];

function WorkspaceState({ onOpenNavigator }: { onOpenNavigator: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (location.pathname !== "/") localStorage.setItem("careercompiler-last-route", `${location.pathname}${location.search}${location.hash}`);
  }, [location.pathname, location.search, location.hash]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenNavigator();
        return;
      }
      if (document.querySelector("dialog[open]")) return;
      if (event.metaKey && event.altKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        navigate("/tailor");
      }
      if (event.metaKey && event.key.toLowerCase() === "f") {
        const search = Array.from(document.querySelectorAll<HTMLInputElement>("[data-search-input]")).find((input) => !input.closest("[hidden]") && input.getClientRects().length > 0);
        if (search) {
          event.preventDefault();
          search.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, onOpenNavigator]);
  return null;
}

function SidebarLink({ item }: { item: NavigationItem }) {
  const Icon = item.icon;
  const location = useLocation();
  const [targetPath, targetQuery] = item.to.split("?");
  const targetSearch = targetQuery ? `?${targetQuery}` : "";
  const exactSearchMatch = navigationGroups.some((group) =>
    group.items.some((candidate) => {
      const [candidatePath, candidateQuery] = candidate.to.split("?");
      return candidatePath === location.pathname && candidateQuery && `?${candidateQuery}` === location.search;
    }),
  );
  const isActive =
    item.paths ? item.paths.includes(location.pathname) : location.pathname === targetPath &&
    (targetSearch ? location.search === targetSearch : !exactSearchMatch);
  const className = [
    "app-nav-link group flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
    isActive
      ? "app-nav-active"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
  ].join(" ");
  return (
    <Link
      key={item.to}
      to={item.to}
      aria-label={item.ariaLabel ?? item.label}
      aria-current={isActive ? "page" : undefined}
      title={item.label}
      className={className}
    >
      <Icon aria-hidden="true" size={18} className="shrink-0" />
      <span className="app-sidebar-label min-w-0 truncate">{item.label}</span>
      {item.shortcut ? <kbd className="app-sidebar-kbd ml-auto text-[10px] font-semibold text-slate-400">{item.shortcut}</kbd> : null}
    </Link>
  );
}

function AppShell() {
  const ai = useCareerAI()!;
  const location = useLocation();
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [compact, setCompact] = useState(() => localStorage.getItem("careercompiler-sidebar-compact") === "true");
  const openNavigator = useCallback(() => setNavigatorOpen(true), []);
  const [initialRoute] = useState(() => resolveStartupRoute(localStorage.getItem("careercompiler-last-route")));
  return (
    <>
      <WorkspaceState onOpenNavigator={openNavigator} />
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>Skip to content</a>
      {navigatorOpen ? <WorkspaceNavigator onClose={() => setNavigatorOpen(false)} /> : null}
      <ExtensionRequestProcessor />
      <JobAutomationLaunchScheduler />
      <div className={`app-shell${compact ? " app-shell-compact" : ""}${ai.open && location.pathname !== "/copilot" ? " app-shell-ai-open" : ""}`}>
        <aside className="app-sidebar">
          <div className="border-b border-slate-200 px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="app-brand-mark grid size-10 shrink-0 place-items-center rounded-lg text-white">
                <Sparkles aria-hidden="true" size={18} />
              </div>
              <div className="app-sidebar-heading min-w-0">
                <p className="text-sm font-semibold text-slate-950">CareerCompiler</p>
                <p className="truncate text-xs text-slate-500">Your career, with confidence</p>
              </div>
            </div>
          </div>
          <div className="px-3 pt-3">
            <button className="button w-full justify-start" type="button" aria-label="Go to a screen" title="Go to a screen (⌘K)" onClick={(event) => { event.currentTarget.focus(); openNavigator(); }}>
              <Search size={17} aria-hidden="true" />
              <span className="app-sidebar-label">Go to…</span>
              <kbd className="app-sidebar-kbd ml-auto text-xs text-slate-500">⌘K</kbd>
            </button>
          </div>
          <button data-career-ai-trigger className="button career-ai-trigger" type="button" title="Career AI (⌘⇧.)" aria-label="Open Career AI" aria-expanded={ai.open} onClick={event => { event.currentTarget.focus(); ai.openPanel(ai.visited ? undefined : ai.selection); }}><Bot size={17} aria-hidden="true" /><span className="app-sidebar-label">Career AI</span></button>
          <button type="button" className="sidebar-toggle button" aria-label={compact ? "Expand sidebar" : "Compact sidebar"} aria-pressed={compact} onClick={() => { const next = !compact; setCompact(next); localStorage.setItem("careercompiler-sidebar-compact", String(next)); }}>
            {compact ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}<span className="app-sidebar-label">Compact sidebar</span>
          </button>
          <nav className="app-sidebar-nav flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4" aria-label="Primary">
            {navigationGroups.map((group) => (
              <div key={group.label}>
                <p className="app-sidebar-section-title px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <SidebarLink key={item.to} item={item} />
                  ))}
                </div>
              </div>
            ))}
            <details className="sidebar-more">
              <summary aria-label="More tools"><span className="app-sidebar-label">More tools</span><span className="sidebar-more-icon" aria-hidden="true">•••</span></summary>
              <div className="space-y-1">{additionalNavigation.map((item) => <SidebarLink key={item.to} item={item} />)}</div>
            </details>
          </nav>
          <div className="app-sidebar-copy border-t border-slate-200 px-4 py-4 text-xs leading-5 text-slate-500">
            Your data stays local.
            AI requests are always your choice.
          </div>
        </aside>
        <main hidden={location.pathname === "/copilot"} className="app-main" id="main-content" tabIndex={-1}>
          <ErrorBoundary key={location.pathname}><Suspense fallback={<LoadingState label="Opening workspace…" />}><Routes>
            <Route path="/" element={<Navigate to={initialRoute} replace />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/preview" element={<SampleWorkspacePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/candidate-brain" element={<CandidateBrainPage />} />
            <Route path="/career-memory" element={<CareerMemoryPage />} />
            <Route path="/tailor" element={<TailorResumePage />} />
            <Route path="/library" element={<ResumeLibraryPage />} />
            <Route path="/applications" element={<ApplicationsPage />} />
            <Route path="/job-radar" element={<JobRadarPage />} />
            <Route path="/match-inbox" element={<MatchInboxPage />} />
            <Route path="/application-queue" element={<ApplicationQueuePage />} />
            <Route path="/browser-extension" element={<BrowserExtensionPage />} />
            <Route path="/copilot" element={null} />
            <Route path="/evaluation" element={<EvaluationPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/privacy-data" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/jobs" replace />} />
          </Routes></Suspense></ErrorBoundary>
        </main>
        <CareerAIPanel />
      </div>
    </>
  );
}

export function App() {
  return <HashRouter><CareerAIWorkspaceProvider><AppShell /></CareerAIWorkspaceProvider></HashRouter>;
}
