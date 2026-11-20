import { CareerAIContext, useCareerAI } from "./careerAIContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { CopilotContextRequest, WorkspaceSelection } from "../lib/copilot/workspaceContext";

export function CareerAIWorkspaceProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState(false);
  const [request, setRequest] = useState<CopilotContextRequest>();
  const [selected, setSelected] = useState<{ path: string; value: WorkspaceSelection }>();
  const trigger = useRef<HTMLElement | null>(null);
  const selection = selected?.path === location.pathname ? selected.value : undefined;
  const openPanel = useCallback((record?: WorkspaceSelection) => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (record) setRequest({ type: record.type, id: record.id, token: crypto.randomUUID() });
    setOpen(true); setVisited(true);
  }, []);
  const closePanel = useCallback(() => setOpen(false), []);
  const returnFocus = useCallback(() => {
    const target = trigger.current?.isConnected ? trigger.current : document.querySelector<HTMLElement>("[data-career-ai-trigger]");
    target?.focus();
  }, []);
  const register = useCallback((value: WorkspaceSelection) => {
    setSelected({ path: location.pathname, value });
    return () => setSelected(current => current?.value === value ? undefined : current);
  }, [location.pathname]);
  const value = useMemo(() => ({ open, visited, request, selection, openPanel, closePanel, register, returnFocus }), [open, visited, request, selection, openPanel, closePanel, register, returnFocus]);
  return <CareerAIContext.Provider value={value}>{children}</CareerAIContext.Provider>;
}

export function CareerAISelection({ type, id, label }: WorkspaceSelection) {
  const register = useCareerAI()?.register;
  useEffect(() => register?.({ type, id, label }), [register, type, id, label]);
  return null;
}

export function CareerAIButton({ selection, children }: { selection: WorkspaceSelection; children: ReactNode }) {
  const ai = useCareerAI();
  // Standalone screens keep their existing full-page entry point.
  if (!ai) return <Link className="button" to={`/copilot?contextType=${selection.type}&contextId=${encodeURIComponent(selection.id)}`}>{children}</Link>;
  return <button className="button" type="button" onClick={event => { event.currentTarget.focus(); ai.openPanel(selection); }}>{children}</button>;
}
