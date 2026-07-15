import { HashRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { BarChart3, BriefcaseBusiness, Library, Settings, Sparkles } from "lucide-react";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { CareerMemoryPage } from "./features/career-memory/CareerMemoryPage";
import { ResumeLibraryPage } from "./features/resume-library/ResumeLibraryPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { TailorResumePage } from "./features/tailoring/TailorResumePage";

const navigation = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/career-memory", label: "Career Memory", icon: BriefcaseBusiness },
  { to: "/tailor", label: "Tailor Resume", icon: Sparkles },
  { to: "/library", label: "Resume Library", icon: Library },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function App() {
  return (
    <HashRouter>
      <div className="flex min-h-screen bg-[#f6f7f9] text-slate-900">
        <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-5">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
              CareerCompiler
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-normal text-slate-950">
              Resume evidence, compiled
            </h1>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-3 py-4" aria-label="Primary">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                      isActive
                        ? "bg-blue-50 text-blue-800"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                    ].join(" ")
                  }
                >
                  <Icon aria-hidden="true" size={18} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
          <div className="border-t border-slate-200 px-5 py-4 text-xs leading-5 text-slate-500">
            Private local desktop app. Mock AI is enabled by default.
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/career-memory" element={<CareerMemoryPage />} />
            <Route path="/tailor" element={<TailorResumePage />} />
            <Route path="/library" element={<ResumeLibraryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
