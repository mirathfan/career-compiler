import { useRef } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Circle, HelpCircle, Info, Loader2, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { clsx } from "clsx";

type Tone = "slate" | "blue" | "emerald" | "amber" | "red" | "purple";

const toneClasses: Record<Tone, string> = {
  slate: "border-slate-200 bg-slate-50 text-slate-700",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  red: "border-red-200 bg-red-50 text-red-800",
  purple: "border-violet-200 bg-violet-50 text-violet-800",
};

export function Badge({
  children,
  tone = "slate",
  icon: Icon,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex min-h-6 max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold leading-5",
        toneClasses[tone],
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" size={13} className="shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.replaceAll("_", " ");
  const tone: Tone =
    /error|missing|conflict|rejected|prohibited|blocked/i.test(status)
      ? "red"
      : /warning|review|draft|pending|needs/i.test(status)
        ? "amber"
        : /verified|approved|ready|success|applied|offer|exported|connected/i.test(status)
          ? "emerald"
          : /openai|blue|generated|preparing/i.test(status)
            ? "blue"
            : "slate";
  return <Badge tone={tone}>{normalized}</Badge>;
}

export function VerificationBadge({
  status,
  locked,
}: {
  status: string;
  locked?: boolean;
}) {
  const tone: Tone =
    status === "verified" || status === "user_confirmed"
      ? "emerald"
      : status === "conflicting"
        ? "red"
        : status === "unverified" || status === "inferred"
          ? "amber"
          : "slate";
  return <Badge tone={tone} icon={locked ? Lock : ShieldCheck}>{status.replaceAll("_", " ")}</Badge>;
}

export function SensitiveBadge({ locked, requiresReview }: { locked?: boolean; requiresReview?: boolean }) {
  if (requiresReview) return <Badge tone="red" icon={ShieldAlert}>needs review</Badge>;
  return <Badge tone={locked ? "emerald" : "amber"} icon={locked ? Lock : ShieldAlert}>{locked ? "locked" : "editable"}</Badge>;
}

export function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return <Badge tone={pct >= 80 ? "emerald" : pct >= 55 ? "amber" : "red"}>{pct}% confidence</Badge>;
}

export function PageSection({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("panel p-5", className)}>
      {title || description || actions ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? <h3 className="text-lg font-semibold text-slate-950">{title}</h3> : null}
            {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-600">{label}</p>
        {Icon ? (
          <span className={clsx("grid size-8 place-items-center rounded-md border", toneClasses[tone])}>
            <Icon aria-hidden="true" size={16} />
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-normal text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p> : null}
    </div>
  );
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[minmax(220px,1fr)_auto]", className)}>{children}</div>;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="sr-label">
      <span className="sr-only">Search</span>
      <input
        className="field"
        data-search-input
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label = "Sections",
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          tabIndex={value === tab.id ? 0 : -1}
          ref={(element) => { tabRefs.current[index] = element; }}
          onKeyDown={(event) => {
            if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
            onChange(tabs[next].id);
            tabRefs.current[next]?.focus();
          }}
          className={clsx("segmented-item", value === tab.id && "segmented-item-active")}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {typeof tab.count === "number" ? <span className="segmented-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function ProgressChecklist({
  items,
}: {
  items: Array<{ label: string; detail?: string; complete: boolean; warning?: boolean; statusLabel?: string }>;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const Icon = item.complete ? CheckCircle2 : item.warning ? AlertTriangle : Circle;
        return (
          <div key={item.label} className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
            <Icon
              aria-hidden="true"
              size={16}
              className={clsx("mt-0.5 shrink-0", item.complete ? "text-emerald-600" : item.warning ? "text-amber-600" : "text-slate-400")}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{item.label}</p>
              {item.statusLabel ? <p className="mt-0.5 text-xs font-medium text-slate-600">{item.statusLabel}</p> : null}
              {item.detail ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{item.detail}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AlertBanner({
  tone = "blue",
  title,
  children,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
}) {
  const Icon = tone === "red" || tone === "amber" ? AlertTriangle : Info;
  return (
    <div className={clsx("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm", toneClasses[tone])}>
      <Icon aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1 leading-6">{children}</div> : null}
      </div>
    </div>
  );
}

export function InlineHelp({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-start gap-2 text-xs leading-5 text-slate-500">
      <HelpCircle aria-hidden="true" size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-md bg-slate-200", className)} aria-hidden="true" />;
}

export function LoadingPanel({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="grid min-h-[280px] place-items-center p-8">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm">
        <Loader2 aria-hidden="true" size={18} className="animate-spin text-blue-700" />
        {label}
      </div>
    </div>
  );
}
