import { create } from "zustand";
import type { TailoredResume } from "../types/domain";

interface ResumeEditorStore {
  resume: TailoredResume | null;
  history: TailoredResume[];
  setResume: (resume: TailoredResume) => void;
  updateBullet: (bulletId: string, text: string) => void;
  toggleBullet: (bulletId: string) => void;
  moveBullet: (bulletId: string, direction: -1 | 1) => void;
  undo: () => void;
}

function clone(resume: TailoredResume) {
  return JSON.parse(JSON.stringify(resume)) as TailoredResume;
}

function mutateBullet(
  resume: TailoredResume,
  bulletId: string,
  mutate: (sectionIndex: number, bulletIndex: number, sectionKind: "projects" | "experience") => void,
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

export const useResumeEditorStore = create<ResumeEditorStore>((set, get) => ({
  resume: null,
  history: [],
  setResume: (resume) => set({ resume: clone(resume), history: [] }),
  updateBullet: (bulletId, text) =>
    set((state) => {
      if (!state.resume) return state;
      const next = clone(state.resume);
      mutateBullet(next, bulletId, (sectionIndex, bulletIndex, sectionKind) => {
        next[sectionKind][sectionIndex].bullets[bulletIndex].text = text;
        next[sectionKind][sectionIndex].bullets[bulletIndex].isUserEdited = true;
      });
      return { resume: next, history: [...state.history, state.resume] };
    }),
  toggleBullet: (bulletId) =>
    set((state) => {
      if (!state.resume) return state;
      const next = clone(state.resume);
      mutateBullet(next, bulletId, (sectionIndex, bulletIndex, sectionKind) => {
        const bullet = next[sectionKind][sectionIndex].bullets[bulletIndex];
        bullet.included = !bullet.included;
      });
      return { resume: next, history: [...state.history, state.resume] };
    }),
  moveBullet: (bulletId, direction) =>
    set((state) => {
      if (!state.resume) return state;
      const next = clone(state.resume);
      mutateBullet(next, bulletId, (sectionIndex, bulletIndex, sectionKind) => {
        const bullets = next[sectionKind][sectionIndex].bullets;
        const targetIndex = bulletIndex + direction;
        if (targetIndex < 0 || targetIndex >= bullets.length) return;
        const [removed] = bullets.splice(bulletIndex, 1);
        bullets.splice(targetIndex, 0, removed);
      });
      return { resume: next, history: [...state.history, state.resume] };
    }),
  undo: () => {
    const { history } = get();
    const previous = history.at(-1);
    if (!previous) return;
    set({ resume: previous, history: history.slice(0, -1) });
  },
}));
