import type { ResumeBullet, ResumeCareerItemSection, TailoredResume } from "../../types/domain";
import { createControlledResumeVariantFromBase } from "./baseVariant";

function reorderUnlocked<T>(values: T[], locked: (value: T) => boolean, rank: (value: T) => number): T[] {
  const movable = values.filter(x => !locked(x)).sort((a, b) => rank(a) - rank(b));
  let i = 0;
  return values.map(x => locked(x) ? x : movable[i++]);
}
const facts = (bullet: ResumeBullet) => [...bullet.sourceFactIds].sort().join("|");

// Opt-in job tailoring leaves conservative regeneration/single-bullet revision
// semantics unchanged. Omission is deliberately not automatic in this increment.
export function createJobSpecificVariant(base: TailoredResume, proposed: TailoredResume): TailoredResume {
  const variant = createControlledResumeVariantFromBase({ base, proposed }).variant;
  const markPending = (section: ResumeCareerItemSection) => {
    if (section.locked) return;
    for (const bullet of section.bullets) if (!bullet.locked && bullet.included && !bullet.rejected) {
      bullet.approved = false;
      bullet.selectionReason = "Prioritized existing evidence using the selected job's ranked plan. Review the new order; factual wording is preserved unless separately proposed.";
    }
  };
  for (const kind of ["projects", "experience"] as const) {
    const itemRank = new Map(proposed[kind].map((section, index) => [section.careerItemId, index]));
    const previous = [...variant[kind]];
    variant[kind] = reorderUnlocked(variant[kind], x => x.locked, x => itemRank.get(x.careerItemId) ?? Number.MAX_SAFE_INTEGER);
    variant[kind].forEach((section, index) => {
      if (previous[index].careerItemId !== section.careerItemId) markPending(section);
      if (section.locked) return;
      const p = proposed[kind].find(x => x.careerItemId === section.careerItemId);
      const order = new Map(p?.bullets.map((b, i) => [facts(b), i]) ?? []);
      const old = section.bullets.map(b => b.id);
      section.bullets = reorderUnlocked(section.bullets, b => b.locked || !b.included || b.rejected, b => order.get(facts(b)) ?? Number.MAX_SAFE_INTEGER);
      if (section.bullets.some((b, i) => b.id !== old[i])) markPending(section);
    });
  }
  // Reorder only already-approved base skills. A job keyword cannot add a skill.
  const skillRank = new Map(proposed.skills.map((s, i) => [s.toLowerCase(), i]));
  const rankSkill = (s: string) => skillRank.get(s.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
  variant.skills.sort((a, b) => rankSkill(a) - rankSkill(b));
  if (variant.skillGroups) {
    for (const group of variant.skillGroups) group.skills.sort((a, b) => rankSkill(a) - rankSkill(b));
    variant.skillGroups.sort((a, b) => Math.min(...a.skills.map(rankSkill)) - Math.min(...b.skills.map(rankSkill)));
  }
  return variant;
}
