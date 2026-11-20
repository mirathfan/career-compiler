import { z } from "zod";
import { ProfileSkillSuggestion } from "./profileSkillContract";
import { ResumeBulletSuggestion, ResumeBulletTarget } from "./resumeBulletContract";
import { Grants } from "./workspaceReads";
import { IntelligenceReport } from "./workspaceIntelligence";
const Id = z.string().min(1).max(160).regex(/^[\w:-]+$/);
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const PreparationStep = z.enum(["profile", "resume", "application"]);
export type PreparationStep = z.infer<typeof PreparationStep>;
export const PreparationPlan = z.object({
    version: z.literal(1), id: Id, jobId: Id, jobRevision: Hash, jobLabel: z.string().max(400),
    selection: Grants, evidenceRevision: Hash, assessmentRevision: Hash,
    fit: IntelligenceReport, comparison: IntelligenceReport,
    profile: z.object({ suggestion: ProfileSkillSuggestion, binding: z.object({ profileId: Id, profileRevision: Hash, skillsRevision: Hash }).strict() }).strict().nullable(),
    resume: z.object({ target: ResumeBulletTarget, sourceRevision: Hash, suggestion: ResumeBulletSuggestion, label: z.string().max(400), section: z.string().max(400) }).strict().nullable(),
    application: z.object({ id: Id, revision: Hash, label: z.string().max(400), instruction: z.string().max(1000).nullable() }).strict().nullable(),
    notes: z.object({ profile: z.string().max(1200), resume: z.string().max(1200), application: z.string().max(1200) }).strict(),
}).strict();
export type PreparationPlan = z.infer<typeof PreparationPlan>;
// These are associations on existing messages, not a new action status or audit store.
export const PreparationReview = z.object({ planId: Id, step: PreparationStep }).strict();
export const PreparationSkip = z.object({ planId: Id, steps: z.array(PreparationStep).min(1).max(3) }).strict();
export const stepTitles: Record<PreparationStep, string> = { profile: "Profile skill", resume: "Résumé bullet", application: "Application next action" };
