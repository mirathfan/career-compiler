import type { ResumeBullet, TailoredResume } from "../../types/domain";

function clone(resume: TailoredResume) {
  return structuredClone(resume);
}

function estimatedLines(resume: TailoredResume) {
  const fontFactor = 9.5 / resume.layout.bodyFontSize;
  const charsPerLine = Math.floor(104 * fontFactor);
  const bulletLines = [...resume.projects, ...resume.experience]
    .flatMap((section) => section.bullets.filter((bullet) => bullet.included))
    .reduce((total, bullet) => total + Math.max(1, Math.ceil(bullet.text.length / charsPerLine)), 0);
  const summaryLines = resume.summary.reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)),
    0,
  );
  const skillLines = resume.skills.length === 0
    ? 0
    : resume.layout.condensedSkills
      ? Math.ceil(resume.skills.join(" | ").length / charsPerLine)
      : Math.ceil(resume.skills.join(" | ").length / Math.floor(charsPerLine * 0.82));
  const sectionCount = resume.sectionOrder.filter((section) => {
    if (section === "summary") return resume.summary.length > 0;
    if (section === "education") return resume.education.length > 0;
    if (section === "projects") return resume.projects.length > 0;
    if (section === "experience") return resume.experience.length > 0;
    return resume.skills.length > 0;
  }).length;
  return (
    4 +
    summaryLines +
    skillLines +
    bulletLines +
    resume.education.length * 1.3 +
    (resume.projects.length + resume.experience.length) * 1.4 +
    sectionCount * 1.5
  );
}

export function estimateResumePageCount(resume: TailoredResume) {
  const readableCapacity = 56 / resume.layout.spacingScale;
  return Math.max(1, Math.ceil(estimatedLines(resume) / readableCapacity));
}

function lowestUnlockedBullet(resume: TailoredResume): { bullet: ResumeBullet; itemTitle: string } | null {
  const candidates = [...resume.projects, ...resume.experience]
    .filter((section) => !section.locked)
    .flatMap((section) =>
      section.bullets
        .filter((bullet) => bullet.included && !bullet.locked)
        .map((bullet) => ({ bullet, itemTitle: section.title })),
    )
    .sort((left, right) => left.bullet.relevanceScore - right.bullet.relevanceScore);
  return candidates[0] ?? null;
}

export function compactResumeForOnePage(resume: TailoredResume) {
  const next = clone(resume);
  next.compactionActions = [];
  if (estimateResumePageCount(next) <= 1) return next;

  if (next.summary.length) {
    next.summary = [];
    next.compactionActions.push("Summary removed");
  }
  if (estimateResumePageCount(next) <= 1) return next;

  const removable = lowestUnlockedBullet(next);
  if (removable) {
    removable.bullet.included = false;
    next.compactionActions.push(
      `Lowest-ranked optional bullet removed from ${removable.itemTitle}`,
    );
  }
  if (estimateResumePageCount(next) <= 1) return next;

  if (!next.layout.condensedSkills && next.skills.length > 0) {
    next.layout.condensedSkills = true;
    next.compactionActions.push("Skills layout condensed");
  }
  if (estimateResumePageCount(next) <= 1) return next;

  if (next.layout.spacingScale > 0.8) {
    const previous = next.layout.spacingScale;
    next.layout.spacingScale = 0.8;
    next.compactionActions.push(
      `Section spacing reduced from ${previous.toFixed(2)} to ${next.layout.spacingScale.toFixed(2)}`,
    );
  }
  if (estimateResumePageCount(next) <= 1) return next;

  while (next.layout.bodyFontSize > 9 && estimateResumePageCount(next) > 1) {
    const previous = next.layout.bodyFontSize;
    next.layout.bodyFontSize = Math.max(9, Number((previous - 0.25).toFixed(2)));
    next.compactionActions.push(
      `Body font reduced from ${previous.toFixed(2)} to ${next.layout.bodyFontSize.toFixed(2)} points`,
    );
  }

  if (estimateResumePageCount(next) > 1) {
    next.compactionActions.push(
      "Automatic fitting stopped at readable limits; shorten an unlocked bullet before export",
    );
  }
  return next;
}

export async function compactResumeWithGroundedShortening(
  resume: TailoredResume,
  shorten: ((bullet: ResumeBullet) => Promise<ResumeBullet>) | null,
) {
  const next = compactResumeForOnePage(resume);
  if (estimateResumePageCount(next) <= 1 || !shorten) return next;
  const candidate = lowestUnlockedBullet(next);
  if (!candidate || candidate.bullet.generationSource !== "ai") return next;
  const shortened = await shorten(candidate.bullet);
  if (
    shortened.sourceFactIds.join("|") !== candidate.bullet.sourceFactIds.join("|") ||
    shortened.text.length >= candidate.bullet.text.length
  ) {
    return next;
  }
  candidate.bullet.text = shortened.text;
  candidate.bullet.generationReason = `${candidate.bullet.generationReason} Shortened to improve one-page fit.`;
  next.compactionActions.push(`AI-generated bullet shortened in ${candidate.itemTitle}`);
  return next;
}
