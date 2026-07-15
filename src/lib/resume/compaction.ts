import type { TailoredResume } from "../../types/domain";

export function estimateResumePageCount(resume: TailoredResume) {
  const bulletCount = [...resume.projects, ...resume.experience].flatMap((section) =>
    section.bullets.filter((bullet) => bullet.included),
  ).length;
  const lineEstimate =
    resume.summary.length * 2 +
    resume.education.length * 1.5 +
    resume.projects.length * 1.5 +
    resume.experience.length * 1.5 +
    bulletCount * 1.6 +
    Math.ceil(resume.skills.length / 8);
  return lineEstimate > 62 ? 2 : 1;
}

export function compactResumeForOnePage(resume: TailoredResume) {
  const next: TailoredResume = JSON.parse(JSON.stringify(resume));
  if (estimateResumePageCount(next) <= 1) {
    return next;
  }
  if (next.summary.length) {
    next.summary = [];
    next.compactionActions.push("Removed optional summary.");
  }
  while (estimateResumePageCount(next) > 1) {
    const bullets = [...next.projects, ...next.experience]
      .flatMap((section) => section.bullets)
      .filter((bullet) => bullet.included && !bullet.locked)
      .sort((a, b) => a.relevanceScore - b.relevanceScore);
    const lowest = bullets[0];
    if (!lowest) {
      break;
    }
    lowest.included = false;
    next.compactionActions.push(`Removed optional low-scoring bullet: ${lowest.text.slice(0, 72)}...`);
  }
  if (estimateResumePageCount(next) > 1 && next.skills.length > 14) {
    next.skills = next.skills.slice(0, 14);
    next.compactionActions.push("Condensed skills display.");
  }
  return next;
}
