import { lazy, Suspense } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, FileInput } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRepository } from "../../lib/database/repositoryContext";
import { LoadingState } from "../../components/States";
import { SearchPreferencesForm } from "./SearchPreferencesForm";

const CandidateBrainPage = lazy(() => import("../candidate-brain/CandidateBrainPage").then((module) => ({ default: module.CandidateBrainPage })));
const CareerMemoryPage = lazy(() => import("../career-memory/CareerMemoryPage").then((module) => ({ default: module.CareerMemoryPage })));

export function ProfilePage() {
  const [params] = useSearchParams();
  const repo = useRepository();
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => repo.getProfile() });
  const section = params.get("section") ?? "about";
  const sections = [{ id: "about", label: "About you" }, { id: "evidence", label: "Career evidence" }, { id: "import", label: "Import experience" }, { id: "preferences", label: "Job preferences" }];
  return <div className="profile-page"><header className="workspace-page-header"><div><span className="section-kicker">Your career foundation</span><h1>{profile.data?.fullName ? `${profile.data.fullName.split(" ")[0]}’s profile` : "Let’s get to know you."}</h1><p>Your background, preferences, and reusable answers. Review once, use with confidence.</p></div><Link className="button" to="/profile?section=import&intake=1"><FileInput size={15} aria-hidden="true" />Import experience</Link></header>
    <nav className="section-navigation" aria-label="Profile sections">{sections.map((item) => <Link key={item.id} to={`/profile?section=${item.id}${item.id === "import" ? "&intake=1" : ""}`} aria-current={section === item.id ? "page" : undefined}>{item.label}</Link>)}</nav>
    <div className="profile-content"><Suspense fallback={<LoadingState label="Opening your profile…" />}>
      {section === "preferences" ? <section className="surface-section"><SearchPreferencesForm /></section> : section === "import" ? <><section className="workspace-note"><h3>Bring your experience together</h3><p>Select a PDF/DOCX or paste résumé text below. Local extraction proposes career records for your review; it does not replace your Master or preserve the original layout.</p><Link className="text-link" to="/profile?section=evidence">Import a supported text evidence file or review saved evidence <ArrowRight size={14} aria-hidden="true" /></Link></section><CareerMemoryPage key="import" embedded intakeOnly /></> : section === "evidence" ? <CareerMemoryPage key="evidence" embedded /> : <CandidateBrainPage embedded />}
    </Suspense></div></div>;
}
