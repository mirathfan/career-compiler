import { lazy, useEffect } from "react";
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, BriefcaseBusiness, ClipboardList, FlaskConical, Library, Settings, Sparkles } from "lucide-react";

const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const CareerMemoryPage = lazy(() => import("./features/career-memory/CareerMemoryPage").then((module) => ({ default: module.CareerMemoryPage })));
const TailorResumePage = lazy(() => import("./features/tailoring/TailorResumePage").then((module) => ({ default: module.TailorResumePage })));
const ResumeLibraryPage = lazy(() => import("./features/resume-library/ResumeLibraryPage").then((module) => ({ default: module.ResumeLibraryPage })));
const ApplicationsPage = lazy(() => import("./features/applications/ApplicationsPage").then((module) => ({ default: module.ApplicationsPage })));
const EvaluationPage = lazy(() => import("./features/evaluation/EvaluationPage").then((module) => ({ default: module.EvaluationPage })));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })));

const navigation = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/career-memory", label: "Career Memory", icon: BriefcaseBusiness },
  { to: "/tailor", label: "Tailor Resume", icon: Sparkles, shortcut: "⌘⌥T" },
  { to: "/library", label: "Resume Library", icon: Library },
  { to: "/applications", label: "Applications", icon: ClipboardList },
  { to: "/evaluation", label: "Evaluation Lab", icon: FlaskConical },
  { to: "/settings", label: "Settings", icon: Settings },
];

function WorkspaceState() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    localStorage.setItem("careercompiler-last-route", location.pathname);
  }, [location.pathname]);
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

function AppRoutes() {
  const initialRoute = localStorage.getItem("careercompiler-last-route") || "/dashboard";
  return (
    <>
      <WorkspaceState />
      <div className="flex min-h-screen bg-[#f6f7f9] text-slate-900">
        <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-5">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">CareerCompiler</p>
            <h1 className="mt-2 text-xl font-semibold tracking-normal text-slate-950">Resume evidence, compiled</h1>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-3 py-4" aria-label="Primary">
            {navigation.map((item) => {
              const Icon = item.icon;
              return <NavLink key={item.to} to={item.to} className={({ isActive }) => ["flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors", isActive ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"].join(" ")}><Icon aria-hidden="true" size={18} /><span>{item.label}</span>{item.shortcut ? <kbd className="ml-auto text-[10px] font-semibold text-slate-400">{item.shortcut}</kbd> : null}</NavLink>;
            })}
          </nav>
          <div className="border-t border-slate-200 px-5 py-4 text-xs leading-5 text-slate-500">Private local desktop app. Mock AI remains available offline.</div>
        </aside>
        <main className="min-w-0 flex-1">
          <Routes>
            <Route path="/" element={<Navigate to={initialRoute} replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/career-memory" element={<CareerMemoryPage />} />
            <Route path="/tailor" element={<TailorResumePage />} />
            <Route path="/library" element={<ResumeLibraryPage />} />
            <Route path="/applications" element={<ApplicationsPage />} />
            <Route path="/evaluation" element={<EvaluationPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </>
  );
}

export function App() {
  return <HashRouter><AppRoutes /></HashRouter>;
}
