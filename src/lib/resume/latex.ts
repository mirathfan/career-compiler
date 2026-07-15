import type { ResumeCareerItemSection, TailoredResume } from "../../types/domain";
import { formatDateRange } from "../utils";

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

function contactValue(value: string) {
  if (/^https?:\/\//i.test(value)) {
    return `\\href{${escapeLatex(value)}}{${escapeLatex(value)}}`;
  }
  if (value.includes("@")) {
    const email = escapeLatex(value);
    return `\\href{mailto:${email}}{${email}}`;
  }
  return escapeLatex(value);
}

function careerSection(section: ResumeCareerItemSection) {
  const organization = section.organization
    ? ` {\\color{ResumeMuted}| ${escapeLatex(section.organization)}}`
    : "";
  const date = formatDateRange(section.startDate, section.endDate, section.isCurrent);
  const dateNode = date
    ? `\\hfill {\\color{ResumeMuted}\\footnotesize ${escapeLatex(date)}}`
    : "";
  const bullets = section.bullets
    .filter((bullet) => bullet.included)
    .map((bullet) => `  \\item ${escapeLatex(bullet.text)}`)
    .join("\n");
  return `\\begin{samepage}
{\\bfseries ${escapeLatex(section.title)}}${organization}${dateNode}\\par
\\begin{resumeitems}
${bullets}
\\end{resumeitems}
\\end{samepage}`;
}

function sectionBody(resume: TailoredResume, section: TailoredResume["sectionOrder"][number]) {
  if (section === "summary" && resume.summary.length > 0) {
    return `\\resumesection{Summary}\n${resume.summary.map((line) => `${escapeLatex(line)}\\par`).join("\n")}`;
  }
  if (section === "education" && resume.education.length > 0) {
    const entries = resume.education.map((entry) => {
      const title = entry.title ? ` | ${escapeLatex(entry.title)}` : "";
      const date = entry.dateLabel
        ? `\\hfill {\\color{ResumeMuted}\\footnotesize ${escapeLatex(entry.dateLabel)}}`
        : "";
      return `{\\bfseries ${escapeLatex(entry.organization)}}${title}${date}\\par`;
    });
    return `\\resumesection{Education}\n${entries.join("\n")}`;
  }
  if (section === "experience" && resume.experience.length > 0) {
    return `\\resumesection{Experience}\n${resume.experience.map(careerSection).join("\n")}`;
  }
  if (section === "projects" && resume.projects.length > 0) {
    return `\\resumesection{Projects}\n${resume.projects.map(careerSection).join("\n")}`;
  }
  if (section === "skills" && resume.skills.length > 0) {
    const skills = escapeLatex(resume.skills.join(" | "));
    return `\\resumesection{Skills}\n${resume.layout.condensedSkills ? "{\\small " : ""}${skills}${resume.layout.condensedSkills ? "}" : ""}\\par`;
  }
  return "";
}

export function renderResumeLatex(resume: TailoredResume) {
  const fontSize = Math.max(9, Math.min(10, resume.layout.bodyFontSize));
  const lineHeight = Number((fontSize * 1.2).toFixed(2));
  const spacing = Math.max(0.8, Math.min(1.2, resume.layout.spacingScale));
  const sectionGap = Number((5.5 * spacing).toFixed(2));
  const itemGap = Number((1.8 * spacing).toFixed(2));
  const contactItems = [
    resume.header.location,
    resume.header.email,
    resume.header.phone,
    resume.header.portfolioUrl,
    resume.header.linkedInUrl,
    resume.header.githubUrl,
  ]
    .filter(Boolean)
    .map(contactValue);
  const workAuthorization = resume.header.workAuthorizationNote
    ? `\\par\\vspace{1pt}{\\footnotesize ${escapeLatex(resume.header.workAuthorizationNote)}}`
    : "";
  const headline = resume.header.headline
    ? String.raw`{\small ${escapeLatex(resume.header.headline)}}\\[1.5pt]`
    : "";
  const sections = resume.sectionOrder
    .map((section) => sectionBody(resume, section))
    .filter(Boolean)
    .join("\n");

  return String.raw`\documentclass[letterpaper,10pt]{article}
\XeTeXgenerateactualtext=1
\usepackage[margin=0.55in]{geometry}
\usepackage{fontspec}
\usepackage{xcolor}
\usepackage[hidelinks]{hyperref}
\setmainfont[Ligatures=NoCommon]{Helvetica Neue}
\setsansfont[Ligatures=NoCommon]{Helvetica Neue}
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
\newcommand{\resumesection}[1]{\vspace{${sectionGap}pt}{\bfseries\MakeUppercase{#1}}\par\vspace{1.25pt}\hrule\vspace{2.5pt}}
\hypersetup{pdftitle={${escapeLatex(`${resume.header.fullName} Resume`)}},pdfauthor={${escapeLatex(resume.header.fullName)}}}
\begin{document}
\raggedright
\begin{center}
{\fontsize{17.5pt}{19pt}\selectfont\bfseries ${escapeLatex(resume.header.fullName)}}\\[-1pt]
${headline}
{\footnotesize ${contactItems.join(" \\enspace\\textbar\\enspace ")}}${workAuthorization}
\end{center}
\vspace{-5pt}
${sections}
\end{document}
`;
}
