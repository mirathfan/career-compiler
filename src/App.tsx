import { lazy, useEffect } from "react";
import { HashRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  BookOpenCheck,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  ClipboardList,
  Database,
  FileStack,
  FlaskConical,
  Globe,
  Library,
  LockKeyhole,
  Settings,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ExtensionRequestProcessor } from "./lib/extension/ExtensionRequestProcessor";

const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const CandidateBrainPage = lazy(() => import("./features/candidate-brain/CandidateBrainPage").then((module) => ({ default: module.CandidateBrainPage })));
const CareerMemoryPage = lazy(() => import("./features/career-memory/CareerMemoryPage").then((module) => ({ default: module.CareerMemoryPage })));
const TailorResumePage = lazy(() => import("./features/tailoring/TailorResumePage").then((module) => ({ default: module.TailorResumePage })));
const ResumeLibraryPage = lazy(() => import("./features/resume-library/ResumeLibraryPage").then((module) => ({ default: module.ResumeLibraryPage })));
const ApplicationsPage = lazy(() => import("./features/applications/ApplicationsPage").then((module) => ({ default: module.ApplicationsPage })));
const BrowserExtensionPage = lazy(() => import("./features/browser-extension/BrowserExtensionPage").then((module) => ({ default: module.BrowserExtensionPage })));
const CareerCopilotPage = lazy(() => import("./features/copilot/CareerCopilotPage").then((module) => ({ default: module.CareerCopilotPage })));
const EvaluationPage = lazy(() => import("./features/evaluation/EvaluationPage").then((module) => ({ default: module.EvaluationPage })));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })));

interface NavigationItem {
  to: string;
  label: string;
  ariaLabel?: string;
  icon: LucideIcon;
  shortcut?: string;
}

const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: "Main",
    items: [
      { to: "/dashboard", label: "Home", icon: BarChart3 },
      { to: "/tailor", label: "Jobs", ariaLabel: "Tailor Resume", icon: BriefcaseBusiness, shortcut: "⌘⌥T" },
      { to: "/applications", label: "Applications", icon: ClipboardList },
      { to: "/library", label: "Resume Library", icon: Library },
      { to: "/copilot", label: "Career Copilot", icon: Bot },
    ],
  },
  {
    label: "Profile",
    items: [
      { to: "/candidate-brain", label: "Candidate Brain", icon: BrainCircuit },
      { to: "/candidate-brain?tab=stories", label: "Career Stories", icon: BookOpenCheck },
      { to: "/candidate-brain?tab=answers", label: "Answer Library", icon: FileStack },
      { to: "/career-memory?intake=1", label: "Smart Career Intake", icon: Sparkles },
      { to: "/career-memory", label: "Evidence Database", icon: Database },
    ],
  },
  {
    label: "Tools",
    items: [
      { to: "/browser-extension", label: "Browser Extension", icon: Globe },
      { to: "/evaluation", label: "Evaluation", icon: FlaskConical },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/settings", label: "Settings", icon: Settings },
      { to: "/privacy-data", label: "Privacy and Data", icon: LockKeyhole },
    ],
  },
];

function WorkspaceState() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    localStorage.setItem("careercompiler-last-route", `${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.altKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        navigate("/tailor");
      }
      if (event.metaKey && event.key.toLowerCase() === "f") {
        const search = document.querySelector<HTMLInputElement>("[data-search-input]");
        if (search) {
          event.preventDefault();
          search.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);
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
    location.pathname === targetPath &&
    (targetSearch ? location.search === targetSearch : !exactSearchMatch);
  const className = [
    "group flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
    isActive
      ? "bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-100"
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
  const initialRoute = localStorage.getItem("careercompiler-last-route") || "/dashboard";
  return (
    <>
      <WorkspaceState />
      <ExtensionRequestProcessor />
      <div className="app-shell">
        <aside className="app-sidebar">
          <div className="border-b border-slate-200 px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-white">
                <Sparkles aria-hidden="true" size={18} />
              </div>
              <div className="app-sidebar-heading min-w-0">
                <p className="text-sm font-semibold text-slate-950">CareerCompiler</p>
                <p className="truncate text-xs text-slate-500">Evidence-grounded job search</p>
              </div>
            </div>
          </div>
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
          </nav>
          <div className="app-sidebar-copy border-t border-slate-200 px-4 py-4 text-xs leading-5 text-slate-500">
            Local-first by default. Paid OpenAI calls only run after explicit user action.
          </div>
        </aside>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Navigate to={initialRoute} replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/candidate-brain" element={<CandidateBrainPage />} />
            <Route path="/career-memory" element={<CareerMemoryPage />} />
            <Route path="/tailor" element={<TailorResumePage />} />
            <Route path="/library" element={<ResumeLibraryPage />} />
            <Route path="/applications" element={<ApplicationsPage />} />
            <Route path="/browser-extension" element={<BrowserExtensionPage />} />
            <Route path="/copilot" element={<CareerCopilotPage />} />
            <Route path="/evaluation" element={<EvaluationPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/privacy-data" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </>
  );
}

export function App() {
  return <HashRouter><AppShell /></HashRouter>;
}
