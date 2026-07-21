import type { ReactNode } from "react";
import type { TailoredResume, ValidationIssue } from "../../types/domain";
import { formatDateRange } from "../../lib/utils";

function PreviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h4 className="border-b border-slate-900 pb-1 text-[11px] font-bold uppercase text-slate-950">{title}</h4>
      {children}
    </section>
  );
}

function contactDisplay(value: string, label: string) {
  return /^https?:\/\//i.test(value) ? label : value;
}

function CareerEntries({ sections }: { sections: TailoredResume["projects"] }) {
  return sections.map((section) => (
    <div key={section.careerItemId} className="mt-2">
      <div className="flex justify-between gap-4">
        <p>
          <strong>{section.title}</strong>{section.organization ? <span> | {section.organization}</span> : null}
          {section.repositoryUrl ? <span> | GitHub</span> : null}
          {section.url ? <span> | Live</span> : null}
        </p>
        <p className="text-slate-500">{formatDateRange(section.startDate, section.endDate, section.isCurrent)}</p>
      </div>
      {section.technologies?.length ? (
        <p className="mt-0.5 text-slate-600">{section.technologies.join(", ")}</p>
      ) : null}
      <ul className="mt-1 list-disc pl-5">
        {section.bullets.filter((bullet) => bullet.included).map((bullet) => <li key={bullet.id}>{bullet.text}</li>)}
      </ul>
    </div>
  ));
}

export function ResumePreview({ resume, validationIssues, pageCount }: {
  resume: TailoredResume;
  validationIssues: ValidationIssue[];
  pageCount: number;
}) {
  const errors = validationIssues.filter((issue) => issue.severity === "error").length;
  const warnings = validationIssues.filter((issue) => issue.severity === "warning").length;
  const renderSection = (section: TailoredResume["sectionOrder"][number]) => {
    if (section === "summary" && resume.summary.length) {
      return <PreviewSection key={section} title="Summary">{resume.summary.map((line) => <p key={line} className="mt-1">{line}</p>)}</PreviewSection>;
    }
    if (section === "projects" && resume.projects.length) {
      return <PreviewSection key={section} title="Projects"><CareerEntries sections={resume.projects} /></PreviewSection>;
    }
    if (section === "experience" && resume.experience.length) {
      return <PreviewSection key={section} title="Experience"><CareerEntries sections={resume.experience} /></PreviewSection>;
    }
    if (section === "education" && resume.education.length) {
      return (
        <PreviewSection key={section} title="Education">
          {resume.education.map((entry) => (
            <div key={entry.careerItemId} className="mt-2 flex justify-between gap-4">
              <p><strong>{entry.organization}</strong>{entry.title ? <span> | {entry.title}</span> : null}</p>
              <p className="text-slate-500">{entry.dateLabel}</p>
            </div>
          ))}
        </PreviewSection>
      );
    }
    if (section === "skills" && resume.skills.length) {
      return (
        <PreviewSection key={section} title="Skills">
          {resume.skillGroups?.length
            ? resume.skillGroups.map((group) => (
                <p className="mt-1" key={group.id}><strong>{group.name}:</strong> {group.skills.join(", ")}</p>
              ))
            : <p className="mt-2">{resume.skills.join(" | ")}</p>}
        </PreviewSection>
      );
    }
    return null;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
        <span>Estimated pages: {pageCount}</span>
        <span className={errors ? "text-red-700" : "text-emerald-700"}>{errors} errors / {warnings} warnings</span>
      </div>
      <div
        className="mx-auto min-h-[880px] w-full max-w-[680px] bg-white p-6 leading-5 shadow-sm ring-1 ring-slate-200 sm:p-10"
        style={{ fontSize: `${resume.layout.bodyFontSize + 1}px`, lineHeight: 1.25 * resume.layout.spacingScale }}
      >
        <header className="text-center">
          <h3 className="text-xl font-bold text-slate-950">{resume.header.fullName}</h3>
          {resume.header.headline ? <p className="mt-1 text-slate-700">{resume.header.headline}</p> : null}
          <p className="mt-1 text-slate-600">{[
            resume.header.location,
            resume.header.email,
            resume.header.phone,
            contactDisplay(resume.header.portfolioUrl, "Portfolio"),
            contactDisplay(resume.header.linkedInUrl, "LinkedIn"),
            contactDisplay(resume.header.githubUrl, "GitHub"),
          ].filter(Boolean).join(" | ")}</p>
          {resume.header.workAuthorizationNote ? <p className="text-slate-600">{resume.header.workAuthorizationNote}</p> : null}
        </header>
        {resume.sectionOrder.map(renderSection)}
      </div>
    </div>
  );
}
