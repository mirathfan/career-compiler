import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="grid min-h-[260px] place-items-center p-6">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm">
        <Loader2 aria-hidden="true" size={18} className="animate-spin text-blue-700" />
        {label}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="panel p-8 text-center">
      <div className="mx-auto mb-4 grid size-11 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
        {icon ?? <Inbox aria-hidden="true" size={20} />}
      </div>
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertTriangle aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">Something needs attention</p>
        <p className="mt-1 leading-6">{message}</p>
      </div>
    </div>
  );
}
