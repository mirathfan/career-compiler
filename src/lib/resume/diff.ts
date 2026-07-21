import type { ResumeDiffEntry, TailoredResume } from "../../types/domain";

function bulletKey(careerItemId: string, sourceFactIds: string[]) {
  return `${careerItemId}:${[...sourceFactIds].sort().join("+")}`;
}

function flatten(resume: TailoredResume) {
  return [...resume.projects.map((section) => ({ section: "projects", value: section })),
    ...resume.experience.map((section) => ({ section: "experience", value: section }))]
    .flatMap(({ section, value }) =>
      value.bullets
        .filter((bullet) => bullet.included)
        .map((bullet, index) => ({
          section,
          careerItemId: value.careerItemId,
          bullet,
          index,
          key: bulletKey(value.careerItemId, bullet.sourceFactIds),
        })),
    );
}

export function semanticResumeDiff(before: TailoredResume, after: TailoredResume): ResumeDiffEntry[] {
  const entries: ResumeDiffEntry[] = [];
  const oldBullets = flatten(before);
  const newBullets = flatten(after);
  const oldByKey = new Map(oldBullets.map((entry) => [entry.key, entry]));
  const newByKey = new Map(newBullets.map((entry) => [entry.key, entry]));

  for (const current of newBullets) {
    const previous = oldByKey.get(current.key);
    if (!previous) {
      entries.push({
        category: "added",
        section: current.section,
        careerItemId: current.careerItemId,
        sourceFactIds: current.bullet.sourceFactIds,
        before: "",
        after: current.bullet.text,
        explanation: "Added evidence-grounded bullet.",
      });
      continue;
    }
    if (previous.bullet.text !== current.bullet.text) {
      entries.push({
        category: "reworded",
        section: current.section,
        careerItemId: current.careerItemId,
        sourceFactIds: current.bullet.sourceFactIds,
        before: previous.bullet.text,
        after: current.bullet.text,
        explanation: "Reworded the same source evidence for the target role.",
      });
    }
    if (previous.index !== current.index || previous.section !== current.section) {
      entries.push({
        category: "reordered",
        section: current.section,
        careerItemId: current.careerItemId,
        sourceFactIds: current.bullet.sourceFactIds,
        before: `${previous.section} position ${previous.index + 1}`,
        after: `${current.section} position ${current.index + 1}`,
        explanation: "Moved evidence within the resume structure.",
      });
    }
  }

  for (const previous of oldBullets) {
    if (!newByKey.has(previous.key)) {
      entries.push({
        category: "removed",
        section: previous.section,
        careerItemId: previous.careerItemId,
        sourceFactIds: previous.bullet.sourceFactIds,
        before: previous.bullet.text,
        after: "",
        explanation: "Omitted evidence from the new content budget.",
      });
    }
  }

  const oldSkills = before.skillGroups?.length
    ? before.skillGroups.map((group) => `${group.name}: ${group.skills.join(", ")}`).join(" | ")
    : before.skills.join(" | ");
  const newSkills = after.skillGroups?.length
    ? after.skillGroups.map((group) => `${group.name}: ${group.skills.join(", ")}`).join(" | ")
    : after.skills.join(" | ");
  if (oldSkills !== newSkills) {
    entries.push({
      category: "skills_changed",
      section: "skills",
      careerItemId: "",
      sourceFactIds: [],
      before: oldSkills,
      after: newSkills,
      explanation: "Changed the approved skills emphasized for the role.",
    });
  }

  if (before.sectionOrder.join("|") !== after.sectionOrder.join("|")) {
    entries.push({
      category: "section_changed",
      section: "resume",
      careerItemId: "",
      sourceFactIds: [],
      before: before.sectionOrder.join(" > "),
      after: after.sectionOrder.join(" > "),
      explanation: "Changed section order for the selected layout preset.",
    });
  }

  if (before.summary.join("\n") !== after.summary.join("\n")) {
    entries.push({
      category: "summary_changed",
      section: "summary",
      careerItemId: "",
      sourceFactIds: [],
      before: before.summary.join(" "),
      after: after.summary.join(" "),
      explanation: after.summary.length
        ? "Changed the summary content."
        : "Removed the summary to reduce visual density or page overflow.",
    });
  }

  const beforeLayout = JSON.stringify(before.layout);
  const afterLayout = JSON.stringify(after.layout);
  if (beforeLayout !== afterLayout) {
    entries.push({
      category: "layout_changed",
      section: "layout",
      careerItemId: "",
      sourceFactIds: [],
      before: `font ${before.layout.bodyFontSize}, spacing ${before.layout.spacingScale}, condensed skills ${before.layout.condensedSkills}`,
      after: `font ${after.layout.bodyFontSize}, spacing ${after.layout.spacingScale}, condensed skills ${after.layout.condensedSkills}`,
      explanation: "Adjusted approved template layout settings to improve one-page fit and readability.",
    });
  }

  return entries;
}
