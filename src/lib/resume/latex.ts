import type { ResumeCareerItemSection, ResumeTemplateSettings, TailoredResume } from "../../types/domain";
import { ResumeTemplateSettingsSchema } from "../../schemas/settings";
import { formatDateRange } from "../utils";
import { DEFAULT_MIR_TEMPLATE_SETTINGS } from "./templateSettings";

const latexCharacters: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "$": "\\$",
  "&": "\\&",
  "#": "\\#",
  "_": "\\_",
  "%": "\\%",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};

export function escapeLatex(value: string) {
  return value.replace(/[\\{}$&#_%~^]/g, (character) => latexCharacters[character]);
}

function contactValue(value: string, label: string, display: ResumeTemplateSettings["urlDisplay"]) {
  if (/^https?:\/\//i.test(value)) {
    const visible = display === "labels" ? label : value;
    return `\\href{${escapeLatex(value)}}{${escapeLatex(visible)}}`;
  }
  if (value.includes("@")) {
    const email = escapeLatex(value);
    return `\\href{mailto:${email}}{${email}}`;
  }
  return escapeLatex(value);
}

function careerSection(section: ResumeCareerItemSection, settings: ResumeTemplateSettings) {
  const organization = section.organization
    ? ` {\\color{ResumeMuted}| ${escapeLatex(section.organization)}}`
    : "";
  const links = [
    section.repositoryUrl ? contactValue(section.repositoryUrl, "GitHub", settings.urlDisplay) : "",
    section.url ? contactValue(section.url, "Live", settings.urlDisplay) : "",
  ].filter(Boolean);
  const detailText = [
    section.technologies?.length ? `{\\itshape ${escapeLatex(section.technologies.join(", "))}}` : "",
    ...links,
  ].filter(Boolean);
  const details = detailText.length
    ? `{\\footnotesize ${detailText.join(" {\\color{ResumeMuted}|} ")}}\\par\n`
    : "";
  const date = formatDateRange(section.startDate, section.endDate, section.isCurrent);
  const dateSeparator = settings.dateAlignment === "right" ? "\\hfill" : " {\\color{ResumeMuted}|}";
  const dateNode = date
    ? `${dateSeparator} {\\color{ResumeMuted}\\footnotesize ${escapeLatex(date)}}`
    : "";
  const bullets = section.bullets
    .filter((bullet) => bullet.included)
    .map((bullet) => `  \\item ${escapeLatex(bullet.text)}`)
    .join("\n");
  return `{\\bfseries ${escapeLatex(section.title)}}${organization}${dateNode}\\par
${details}
\\begin{resumeitems}
${bullets}
\\end{resumeitems}`;
}

function sectionBody(
  resume: TailoredResume,
  section: TailoredResume["sectionOrder"][number],
  settings: ResumeTemplateSettings,
) {
  if (section === "summary" && resume.summary.length > 0) {
    return `\\resumesection{Summary}\n${resume.summary.map((line) => `${escapeLatex(line)}\\par`).join("\n")}`;
  }
  if (section === "education" && resume.education.length > 0) {
    const entries = resume.education.map((entry) => {
      const title = entry.title ? ` | ${escapeLatex(entry.title)}` : "";
      const dateSeparator = settings.dateAlignment === "right" ? "\\hfill" : " {\\color{ResumeMuted}|}";
      const date = entry.dateLabel
        ? `${dateSeparator} {\\color{ResumeMuted}\\footnotesize ${escapeLatex(entry.dateLabel)}}`
        : "";
      return `{\\bfseries ${escapeLatex(entry.organization)}}${title}${date}\\par`;
    });
    return `\\resumesection{Education}\n${entries.join("\n")}`;
  }
  if (section === "experience" && resume.experience.length > 0) {
    return `\\resumesection{Experience}\n${resume.experience.map((item) => careerSection(item, settings)).join("\n")}`;
  }
  if (section === "projects" && resume.projects.length > 0) {
    return `\\resumesection{Projects}\n${resume.projects.map((item) => careerSection(item, settings)).join("\n")}`;
  }
  if (section === "skills" && resume.skills.length > 0) {
    const skills = resume.skills.map(escapeLatex).join("~{\\color{ResumeMuted}|}\\allowbreak{} ");
    return `\\resumesection{Skills}\n${resume.layout.condensedSkills ? "{\\small " : ""}${skills}${resume.layout.condensedSkills ? "}" : ""}\\par`;
  }
  return "";
}

export function renderResumeLatex(
  resume: TailoredResume,
  templateSettings: ResumeTemplateSettings = DEFAULT_MIR_TEMPLATE_SETTINGS,
) {
  const settings = ResumeTemplateSettingsSchema.parse(templateSettings);
  const safeFonts: Record<ResumeTemplateSettings["fontFamily"], string> = {
    "Helvetica Neue": "Helvetica Neue",
    Arial: "Arial",
    "Avenir Next": "Avenir Next",
    "Times New Roman": "Times New Roman",
  };
  const fontSize = Math.max(9, Math.min(11, Math.min(settings.bodyFontSize, resume.layout.bodyFontSize)));
  const lineHeight = Number((fontSize * 1.2).toFixed(2));
  const spacing = Math.max(0.8, Math.min(1.2, resume.layout.spacingScale));
  const sectionGap = Number((settings.sectionSpacing * spacing).toFixed(2));
  const itemGap = Number((settings.bulletSpacing * spacing).toFixed(2));
  const contactItems = [
    [resume.header.location, "Location"],
    [resume.header.email, "Email"],
    [resume.header.phone, "Phone"],
    [resume.header.portfolioUrl, "Portfolio"],
    [resume.header.linkedInUrl, "LinkedIn"],
    [resume.header.githubUrl, "GitHub"],
  ]
    .filter(([value]) => Boolean(value))
    .map(([value, label]) => contactValue(value, label, settings.urlDisplay));
  const workAuthorization = resume.header.workAuthorizationNote
    ? `\\par\\vspace{1pt}{\\footnotesize ${escapeLatex(resume.header.workAuthorizationNote)}}`
    : "";
  const headline = resume.header.headline
    ? String.raw`{\small ${escapeLatex(resume.header.headline)}}\\[1.5pt]`
    : "";
  const sections = resume.sectionOrder
    .map((section) => sectionBody(resume, section, settings))
    .filter(Boolean)
    .join("\n");

  return String.raw`\documentclass[letterpaper,10pt]{article}
\XeTeXgenerateactualtext=1
\usepackage[margin=${settings.marginInches}in]{geometry}
\usepackage{fontspec}
\usepackage{xcolor}
\usepackage[hidelinks]{hyperref}
\setmainfont[Ligatures=NoCommon]{${safeFonts[settings.fontFamily]}}
\setsansfont[Ligatures=NoCommon]{${safeFonts[settings.fontFamily]}}
\definecolor{ResumeText}{HTML}{111827}
\definecolor{ResumeMuted}{HTML}{4B5563}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}
\setlength{\emergencystretch}{1.5em}
\hyphenpenalty=10000
\exhyphenpenalty=10000
\raggedbottom
\color{ResumeText}
\fontsize{${fontSize}pt}{${lineHeight}pt}\selectfont
\setlength{\leftmargini}{10pt}
\renewcommand{\labelitemi}{\textbullet}
\newenvironment{resumeitems}{\begin{itemize}\setlength{\itemsep}{${itemGap}pt}\setlength{\topsep}{2pt}\setlength{\parsep}{0pt}\setlength{\partopsep}{0pt}}{\end{itemize}}
\newcommand{\resumesection}[1]{\vspace{${sectionGap}pt}{\fontsize{${settings.sectionHeadingSize}pt}{${Number((settings.sectionHeadingSize * 1.15).toFixed(2))}pt}\selectfont\bfseries\MakeUppercase{#1}}\par\vspace{1.25pt}\hrule\vspace{2.5pt}}
\hypersetup{pdftitle={${escapeLatex(`${resume.header.fullName} Resume`)}},pdfauthor={${escapeLatex(resume.header.fullName)}}}
\begin{document}
\raggedright
\begin{center}
{\fontsize{${settings.headerFontSize}pt}{${Number((settings.headerFontSize * 1.1).toFixed(2))}pt}\selectfont\bfseries ${escapeLatex(resume.header.fullName)}}\\[-1pt]
${headline}
{\footnotesize ${contactItems.join(" \\enspace\\textbar\\enspace ")}}${workAuthorization}
\end{center}
\vspace{-5pt}
${sections}
\end{document}
`;
}
