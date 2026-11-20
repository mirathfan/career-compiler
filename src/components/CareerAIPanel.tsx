import { useCareerAI } from "./careerAIContext";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Maximize2, PanelRightClose } from "lucide-react";

import { copilotRouteContext, workspaceView } from "../lib/copilot/workspaceContext";
import { ErrorBoundary } from "./ErrorBoundary";
import { LoadingState } from "./States";

const CareerCopilotPage = lazy(() => import("../features/copilot/CareerCopilotPage").then(module => ({ default: module.CareerCopilotPage })));

export function CareerAIPanel() {
  const ai = useCareerAI()!;
  const location = useLocation();
  const navigate = useNavigate();
  const fullPage = location.pathname === "/copilot";
  const [wide, setWide] = useState(() => window.matchMedia?.("(min-width: 1280px)").matches ?? false);
  const [fullVisited, setFullVisited] = useState(fullPage);
  if (fullPage && !fullVisited) setFullVisited(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const wasVisible = useRef(false);
  const previousRoute = useRef("/dashboard");
  const routeRequest = useMemo(() => {
    const context = copilotRouteContext(location.search);
    // Each route entry is an explicit selection, even when a URL was used earlier.
    return context ? { ...context, token: location.key + ":" + crypto.randomUUID() } : undefined;
  }, [location.search, location.key]);
  // Keep the last explicit request when leaving full-page mode, preventing a stale panel request from winning.
  const [requests, setRequests] = useState({ panel: ai.request, route: routeRequest, current: fullPage ? routeRequest ?? ai.request : ai.request });
  if (ai.request !== requests.panel || (fullPage && routeRequest && routeRequest !== requests.route)) {
    setRequests({ panel: ai.request, route: routeRequest, current: fullPage && routeRequest && routeRequest !== requests.route ? routeRequest : ai.request ?? requests.current });
  }
  const request = requests.current;
  const visible = fullPage || ai.open;
  const modal = visible && !fullPage && !wide;
  const { closePanel, returnFocus, openPanel } = ai;
  useEffect(() => { if (!fullPage) previousRoute.current = `${location.pathname}${location.search}${location.hash}`; }, [fullPage, location.pathname, location.search, location.hash]);
  useEffect(() => {
    const query = window.matchMedia?.("(min-width: 1280px)");
    if (!query) return;
    const update = () => setWide(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (element.open) element.close();
    if (visible) {
      if (modal) element.showModal(); else element.show();
      if (!fullPage) element.querySelector<HTMLButtonElement>("[data-ai-close]")?.focus();
    } else if (wasVisible.current) returnFocus();
    wasVisible.current = visible;
  }, [visible, modal, fullPage, returnFocus]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || !(event.code === "Period" || event.key === "." || event.key === ">") || fullPage) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (document.querySelector("dialog[open]:not(.career-ai-surface)")) return;
      event.preventDefault();
      if (visible) closePanel(); else openPanel(ai.visited ? undefined : ai.selection);
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [visible, fullPage, closePanel, openPanel, ai.visited, ai.selection]);
  const close = () => {
    closePanel();
    if (fullPage) navigate(previousRoute.current);
  };
  return <dialog ref={dialog} className={`career-ai-surface ${fullPage ? "career-ai-full" : "career-ai-dock"}`} aria-label={fullPage ? "Career Copilot" : "Career AI"} aria-modal={modal || undefined} onCancel={event => { event.preventDefault(); close(); }}>
    <header className="career-ai-header">
      <div><h2>{fullPage ? "Career Copilot" : "Career AI"}</h2><p>Local answers · reviewed changes</p></div>
      {fullPage ? <button className="icon-button" title="Dock conversation" aria-label="Dock conversation" onClick={() => { openPanel(); navigate(previousRoute.current); }}><PanelRightClose size={17} /></button> : <Link className="icon-button" aria-label="Open full-page Copilot" title="Open full page" to="/copilot"><Maximize2 size={17} /></Link>}
      <button data-ai-close className="icon-button" type="button" aria-label="Close Career AI" onClick={close}>×</button>
    </header>
    <div className="career-ai-view" aria-label="Current workspace view"><span>Current view: {workspaceView(location.pathname)}</span><span>Selected: {ai.selection?.label ?? "No record selected"}</span></div>
    {(ai.visited || fullVisited) ? <ErrorBoundary><Suspense fallback={<LoadingState label="Opening Career AI…" />}><CareerCopilotPage managed panel={!fullPage} requestedContext={request} workspaceSelection={ai.selection} /></Suspense></ErrorBoundary> : null}
  </dialog>;
}
