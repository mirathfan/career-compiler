import type { ReactNode } from "react";
import { clsx } from "clsx";

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  meta,
}: {
  title: string;
  eyebrow: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="border-b border-slate-200/80 bg-white/95 px-5 py-5 backdrop-blur md:px-8">
      <div className={clsx("mx-auto flex w-full max-w-[1560px] flex-wrap items-start justify-between gap-5")}>
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}
          {meta ? <div className="mt-3 flex flex-wrap gap-2">{meta}</div> : null}
        </div>
        {actions ? <div className="flex max-w-full flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
