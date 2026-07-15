import { create } from "zustand";
import type { ResumeBullet, ResumeCareerItemSection, TailoredResume } from "../types/domain";

interface ResumeEditorStore {
  resume: TailoredResume | null;
  deterministicBaseline: TailoredResume | null;
  history: TailoredResume[];
  setResume: (resume: TailoredResume) => void;
  setReviewDraft: (resume: TailoredResume, baseline: TailoredResume) => void;
  applyResume: (resume: TailoredResume) => void;
  updateBullet: (bulletId: string, text: string) => void;
  toggleBullet: (bulletId: string) => void;
  moveBullet: (bulletId: string, direction: -1 | 1) => void;
  acceptBullet: (bulletId: string) => void;
  rejectBullet: (bulletId: string) => void;
  acceptAll: () => void;
  toggleBulletLock: (bulletId: string) => void;
  toggleCareerItemLock: (careerItemId: string) => void;
  restoreDeterministicBullet: (bulletId: string) => void;
  replaceBullet: (bulletId: string, replacement: ResumeBullet) => void;
  replaceSection: (careerItemId: string, replacement: ResumeCareerItemSection) => void;
  approveWarning: (code: string) => void;
  undo: () => void;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mutateBullet(
  resume: TailoredResume,
  bulletId: string,
  mutate: (
    sectionIndex: number,
    bulletIndex: number,
    sectionKind: "projects" | "experience",
  ) => void,
) {
  for (const sectionKind of ["projects", "experience"] as const) {
    for (const [sectionIndex, section] of resume[sectionKind].entries()) {
      const bulletIndex = section.bullets.findIndex((bullet) => bullet.id === bulletId);
      if (bulletIndex !== -1) {
        mutate(sectionIndex, bulletIndex, sectionKind);
        return;
      }
    }
  }
}

function update(
  state: Pick<ResumeEditorStore, "resume" | "history">,
  mutate: (resume: TailoredResume) => void,
) {
  if (!state.resume) return state;
  const next = clone(state.resume);
  mutate(next);
  return { resume: next, history: [...state.history, state.resume] };
}

export const useResumeEditorStore = create<ResumeEditorStore>((set, get) => ({
  resume: null,
  deterministicBaseline: null,
  history: [],
  setResume: (resume) => set({ resume: clone(resume), deterministicBaseline: null, history: [] }),
  setReviewDraft: (resume, baseline) =>
    set({ resume: clone(resume), deterministicBaseline: clone(baseline), history: [] }),
  applyResume: (resume) =>
    set((state) => ({
      resume: clone(resume),
      history: state.resume ? [...state.history, state.resume] : state.history,
    })),
  updateBullet: (bulletId, text) =>
    set((state) =>
      update(state, (next) =>
        mutateBullet(next, bulletId, (sectionIndex, bulletIndex, sectionKind) => {
          const bullet = next[sectionKind][sectionIndex].bullets[bulletIndex];
          bullet.text = text;
          bullet.isUserEdited = true;
          bullet.generationSource = "user";
          bullet.approved = false;
          bullet.rejected = false;
        }),
      ),
    ),
  toggleBullet: (bulletId) =>
    set((state) =>
      update(state, (next) =>
        mutateBullet(next, bulletId, (sectionIndex, bulletIndex, sectionKind) => {
          const bullet = next[sectionKind][sectionIndex].bullets[bulletIndex];
          bullet.included = !bullet.included;
          bullet.rejected = !bullet.included;
        }),
      ),
    ),
  moveBullet: (bulletId, direction) =>
    set((state) =>
      update(state, (next) =>
        mutateBullet(next, bulletId, (sectionIndex, bulletIndex, sectionKind) => {
          const bullets = next[sectionKind][sectionIndex].bullets;
          const targetIndex = bulletIndex + direction;
          if (targetIndex < 0 || targetIndex >= bullets.length) return;
          const [removed] = bullets.splice(bulletIndex, 1);
          bullets.splice(targetIndex, 0, removed);
        }),
      ),
    ),
  acceptBullet: (bulletId) =>
    set((state) =>
      update(state, (next) =>
        mutateBullet(next, bulletId, (sectionIndex, bulletIndex, sectionKind) => {
          const bullet = next[sectionKind][sectionIndex].bullets[bulletIndex];
          bullet.approved = true;
          bullet.rejected = false;
          bullet.included = true;
        }),
      ),
    ),
  rejectBullet: (bulletId) =>
    set((state) =>
      update(state, (next) =>
        mutateBullet(next, bulletId, (sectionIndex, bulletIndex, sectionKind) => {
          const bullet = next[sectionKind][sectionIndex].bullets[bulletIndex];
          bullet.approved = false;
          bullet.rejected = true;
          bullet.included = false;
        }),
      ),
    ),
  acceptAll: () =>
    set((state) =>
      update(state, (next) => {
        for (const { bullet } of [...next.projects, ...next.experience].flatMap((section) =>
          section.bullets.map((bullet) => ({ bullet })),
        )) {
          if (!bullet.rejected && bullet.included) bullet.approved = true;
        }
      }),
    ),
  toggleBulletLock: (bulletId) =>
    set((state) =>
      update(state, (next) =>
        mutateBullet(next, bulletId, (sectionIndex, bulletIndex, sectionKind) => {
          const bullet = next[sectionKind][sectionIndex].bullets[bulletIndex];
          bullet.locked = !bullet.locked;
        }),
      ),
    ),
  toggleCareerItemLock: (careerItemId) =>
    set((state) =>
      update(state, (next) => {
        const section = [...next.projects, ...next.experience].find(
          (item) => item.careerItemId === careerItemId,
        );
        if (section) section.locked = !section.locked;
      }),
    ),
  restoreDeterministicBullet: (bulletId) => {
    const baseline = get().deterministicBaseline;
    if (!baseline) return;
    set((state) =>
      update(state, (next) =>
        mutateBullet(next, bulletId, (sectionIndex, bulletIndex, sectionKind) => {
          const current = next[sectionKind][sectionIndex].bullets[bulletIndex];
          const replacement = [...baseline.projects, ...baseline.experience]
            .flatMap((section) => section.bullets)
            .find(
              (bullet) =>
                [...bullet.sourceFactIds].sort().join("|") ===
                [...current.sourceFactIds].sort().join("|"),
            );
          if (replacement) next[sectionKind][sectionIndex].bullets[bulletIndex] = clone(replacement);
        }),
      ),
    );
  },
  replaceBullet: (bulletId, replacement) =>
    set((state) =>
      update(state, (next) =>
        mutateBullet(next, bulletId, (sectionIndex, bulletIndex, sectionKind) => {
          next[sectionKind][sectionIndex].bullets[bulletIndex] = clone(replacement);
        }),
      ),
    ),
  replaceSection: (careerItemId, replacement) =>
    set((state) =>
      update(state, (next) => {
        for (const sectionKind of ["projects", "experience"] as const) {
          const index = next[sectionKind].findIndex((section) => section.careerItemId === careerItemId);
          if (index !== -1) next[sectionKind][index] = clone(replacement);
        }
      }),
    ),
  approveWarning: (code) =>
    set((state) =>
      update(state, (next) => {
        if (!next.approvedWarningCodes.includes(code)) next.approvedWarningCodes.push(code);
      }),
    ),
  undo: () => {
    const { history } = get();
    const previous = history.at(-1);
    if (!previous) return;
    set({ resume: previous, history: history.slice(0, -1) });
  },
}));
