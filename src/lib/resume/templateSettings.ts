import type { ResumeTemplateSettings, TailoredResume } from "../../types/domain";

export const DEFAULT_MIR_TEMPLATE_SETTINGS: ResumeTemplateSettings = {
  fontFamily: "Helvetica Neue",
  bodyFontSize: 9.5,
  headerFontSize: 17.5,
  sectionHeadingSize: 10,
  marginInches: 0.55,
  sectionSpacing: 5.5,
  bulletSpacing: 1.8,
  dateAlignment: "right",
  urlDisplay: "labels",
  educationOrdering: "graduate-first",
  projectsExperienceOrdering: "projects-first",
  summaryAllowed: false,
  maximumProjectCount: 3,
  defaultBulletsPerProject: 2,
};

export const APPROVED_RESUME_FONTS = [
  "Helvetica Neue",
  "Arial",
  "Avenir Next",
  "Times New Roman",
] as const;

export function applyTemplateOrdering(
  resume: TailoredResume,
  settings: ResumeTemplateSettings,
) {
  const next = structuredClone(resume);
  if (!settings.summaryAllowed) next.summary = [];
  next.education.sort((left, right) => {
    if (settings.educationOrdering === "graduate-first") {
      return left.careerItemId.includes("illinois") ? -1 : right.careerItemId.includes("illinois") ? 1 : 0;
    }
    return left.dateLabel.localeCompare(right.dateLabel);
  });
  const core = next.sectionOrder.filter(
    (section) => section !== "projects" && section !== "experience" && section !== "summary",
  );
  const contentSections: TailoredResume["sectionOrder"] =
    settings.projectsExperienceOrdering === "projects-first"
      ? ["projects", "experience"]
      : ["experience", "projects"];
  next.sectionOrder = [
    ...(next.summary.length ? (["summary"] as const) : []),
    ...contentSections,
    ...core,
  ];
  next.projects = next.projects.slice(0, settings.maximumProjectCount);
  for (const section of next.projects) {
    let included = 0;
    for (const bullet of section.bullets) {
      if (!bullet.included) continue;
      included += 1;
      if (included > settings.defaultBulletsPerProject && !bullet.locked) bullet.included = false;
    }
  }
  next.layout.bodyFontSize = settings.bodyFontSize;
  return next;
}
