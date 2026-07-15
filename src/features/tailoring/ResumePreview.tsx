import type { ReactNode } from "react";
import type { TailoredResume, ValidationIssue } from "../../types/domain";
import { formatDateRange } from "../../lib/utils";

function PreviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h4 className="border-b border-slate-900 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-950">
        {title}
      </h4>
      {children}
    </section>
  );
}

export function ResumePreview({
  resume,
  validationIssues,
  pageCount,
}: {
  resume: TailoredResume;
  validationIssues: ValidationIssue[];
  pageCount: number;
}) {
  const errors = validationIssues.filter((issue) => issue.severity === "error").length;
  const warnings = validationIssues.filter((issue) => issue.severity === "warning").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
        <span>Page count: {pageCount}</span>
        <span className={errors ? "text-red-700" : "text-emerald-700"}>
          {errors} errors / {warnings} warnings
        </span>
      </div>
      <div className="mx-auto min-h-[880px] w-[680px] bg-white p-10 text-[11px] leading-5 shadow-sm ring-1 ring-slate-200">
        <header className="text-center">
          <h3 className="text-xl font-bold text-slate-950">{resume.header.fullName}</h3>
          <p className="mt-1 text-slate-600">
            {[
              resume.header.location,
              resume.header.email,
              resume.header.phone,
              resume.header.portfolioUrl,
              resume.header.githubUrl,
            ]
              .filter(Boolean)
              .join(" | ")}
          </p>
        </header>
        {resume.summary.length ? (
          <PreviewSection title="Summary">
            {resume.summary.map((line) => (
              <p key={line} className="mt-1">
                {line}
              </p>
            ))}
          </PreviewSection>
        ) : null}
        {resume.projects.length ? (
          <PreviewSection title="Projects">
            {resume.projects.map((section) => (
              <div key={section.careerItemId} className="mt-2">
                <div className="flex justify-between gap-4">
                  <p>
                    <strong>{section.title}</strong>
                    {section.organization ? <span> | {section.organization}</span> : null}
                  </p>
                  <p className="text-slate-500">
                    {formatDateRange(section.startDate, section.endDate, section.isCurrent)}
                  </p>
                </div>
                <ul className="mt-1 list-disc pl-5">
                  {section.bullets
                    .filter((bullet) => bullet.included)
                    .map((bullet) => (
                      <li key={bullet.id}>{bullet.text}</li>
                    ))}
                </ul>
              </div>
            ))}
          </PreviewSection>
        ) : null}
        {resume.experience.length ? (
          <PreviewSection title="Experience">
            {resume.experience.map((section) => (
              <div key={section.careerItemId} className="mt-2">
                <div className="flex justify-between gap-4">
                  <p>
                    <strong>{section.title}</strong>
                    {section.organization ? <span> | {section.organization}</span> : null}
                  </p>
                  <p className="text-slate-500">
                    {formatDateRange(section.startDate, section.endDate, section.isCurrent)}
                  </p>
                </div>
                <ul className="mt-1 list-disc pl-5">
                  {section.bullets
                    .filter((bullet) => bullet.included)
                    .map((bullet) => (
                      <li key={bullet.id}>{bullet.text}</li>
                    ))}
                </ul>
              </div>
            ))}
          </PreviewSection>
        ) : null}
        <PreviewSection title="Education">
          {resume.education.map((entry) => (
            <div key={entry.careerItemId} className="mt-2 flex justify-between gap-4">
              <p>
                <strong>{entry.organization}</strong>
                {entry.title ? <span> | {entry.title}</span> : null}
              </p>
              <p className="text-slate-500">{entry.dateLabel}</p>
            </div>
          ))}
        </PreviewSection>
        <PreviewSection title="Skills">
          <p className="mt-2">{resume.skills.join(" | ")}</p>
        </PreviewSection>
      </div>
    </div>
  );
}
