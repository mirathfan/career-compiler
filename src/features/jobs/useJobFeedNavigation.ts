import { useLayoutEffect, useRef, useState } from "react";

// Requests are consumed after React commits the visible pane, never by a delayed timer.
export function useJobFeedNavigation(scope: string) {
  const feed = useRef<HTMLElement>(null);
  const detail = useRef<HTMLElement>(null);
  const snapshot = useRef<{ scope: string; positions: { element: Element; top: number; left: number }[] }>(null);
  const [request, setRequest] = useState<{ pane: "feed" | "detail"; id: string } | null>(null);
  const enter = (id: string, row: HTMLElement) => {
    const positions = [];
    for (let element: Element | null = row.parentElement; element; element = element.parentElement) {
      positions.push({ element, top: element.scrollTop, left: element.scrollLeft });
    }
    snapshot.current = { scope, positions };
    setRequest({ pane: "detail", id });
  };
  const back = (id: string) => setRequest({ pane: "feed", id });
  useLayoutEffect(() => {
    if (!request) return;
    const pane = request.pane === "feed" ? feed.current : detail.current;
    if (!pane || pane.closest("[hidden]") || getComputedStyle(pane).display === "none") { setRequest(null); return; }
    const row = request.pane === "feed"
      ? Array.from(pane.querySelectorAll<HTMLButtonElement>("[data-job-id]")).find(row => row.dataset.jobId === request.id)
      : undefined;
    const target = row ?? pane;
    if (request.pane === "feed" && row && snapshot.current?.scope === scope) {
      for (const position of snapshot.current.positions) if (position.element.isConnected) {
        position.element.scrollTop = position.top;
        position.element.scrollLeft = position.left;
      }
    }
    target.focus({ preventScroll: true });
    // Keep the focused target visible if the dataset/layout changed, without losing a valid offset.
    if (target.getClientRects().length) target.scrollIntoView({ block: request.pane === "detail" ? "start" : "nearest", inline: "nearest" });
    setRequest(null);
  }, [request, scope]);
  return { feed, detail, enter, back };
}
