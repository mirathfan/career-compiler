import { useEffect, useRef, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { findWorkspaceDestinations } from "../lib/desktop/navigation";

export function WorkspaceNavigator({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const destinations = findWorkspaceDestinations(query);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    inputRef.current?.focus();
    return () => { dialog?.close(); previousFocus?.focus(); };
  }, []);

  const choose = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <dialog
      ref={dialogRef}
      className="workspace-navigator"
      aria-labelledby="workspace-navigator-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div>
          <h2 id="workspace-navigator-title" className="text-lg font-semibold tracking-tight">Where would you like to go?</h2>
          <p className="mt-1 text-sm text-slate-600">Find a screen by name or by what you want to do.</p>
        </div>
        <button type="button" className="icon-button shrink-0" aria-label="Close navigation" onClick={onClose}><X size={16} aria-hidden="true" /></button>
      </div>
      <label className="relative mx-5 mt-4 block">
        <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-slate-500" />
        <span className="sr-only">Find a screen</span>
        <input
          ref={inputRef} className="field navigator-search" value={query} placeholder="Try ‘resume’, ‘salary’, or ‘backup’…"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && destinations.length) { event.preventDefault(); resultRefs.current[0]?.focus(); }
            if (event.key === "Enter" && destinations.length) { event.preventDefault(); choose(destinations[0].to); }
          }}
        />
      </label>
      <p role="status" className="sr-only">{destinations.length} destinations found</p>
      <div className="navigator-results p-3" aria-label="Destinations">
        {destinations.length === 0 ? <p className="px-3 py-6 text-sm text-slate-600">No screens match “{query}”. Try ‘profile’, ‘jobs’, or ‘settings’.</p> : destinations.map((destination, index) => (
          <button
            key={destination.to} type="button" className="navigator-result" ref={(element) => { resultRefs.current[index] = element; }}
            onClick={() => choose(destination.to)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const next = index + (event.key === "ArrowDown" ? 1 : -1);
                if (next < 0) inputRef.current?.focus();
                else resultRefs.current[Math.min(next, destinations.length - 1)]?.focus();
              }
              if (event.key === "Home" || event.key === "End") {
                event.preventDefault(); resultRefs.current[event.key === "Home" ? 0 : destinations.length - 1]?.focus();
              }
            }}
          >
            <span className="min-w-0"><span className="block font-semibold">{destination.label}</span><span className="mt-0.5 block text-xs leading-5 text-slate-600">{destination.description}</span></span>
            <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-slate-400" />
          </button>
        ))}
      </div>
      <p className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">↑ ↓ to move · Enter to open · Esc to close</p>
    </dialog>
  );
}
