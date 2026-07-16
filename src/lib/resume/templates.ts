import type { ResumeTemplateId, TailoredResume } from "../../types/domain";

export interface ResumeTemplatePreset {
  id: ResumeTemplateId;
  name: string;
  sectionOrder: TailoredResume["sectionOrder"];
  summaryLines: number;
}

export const RESUME_TEMPLATES: Record<ResumeTemplateId, ResumeTemplatePreset> = {
  "mir-resume": {
    id: "mir-resume",
    name: "Mir Resume",
    sectionOrder: ["projects", "experience", "education", "skills"],
    summaryLines: 0,
  },
  "mir-standard": {
    id: "mir-standard",
    name: "Mir Standard",
    sectionOrder: ["summary", "education", "experience", "projects", "skills"],
    summaryLines: 0,
  },
  "ai-full-stack": {
    id: "ai-full-stack",
    name: "AI and Full-Stack",
    sectionOrder: ["summary", "projects", "experience", "education", "skills"],
    summaryLines: 2,
  },
};

export function resolveResumeTemplate(id: string) {
  return RESUME_TEMPLATES[id as ResumeTemplateId] ?? RESUME_TEMPLATES["mir-resume"];
}
