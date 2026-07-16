import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, Lock, Plus, Save, Trash2, Unlock } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, LoadingState } from "../../components/States";
import { TagList } from "../../components/TagList";
import { generateApplicationAnswers } from "../../lib/applications/answerEngine";
import { normalizeDetectedField } from "../../lib/applications/questionClassifier";
import { useRepository } from "../../lib/database/repositoryContext";
import { parseCsv } from "../../lib/utils";
import type {
  ApplicationQuestionType,
  ApprovedApplicationAnswer,
  CandidateClaim,
  CandidatePreferences,
  CareerStory,
  SensitiveAnswer,
  SensitiveAnswerKey,
  VerificationStatus,
} from "../../types/domain";

const verificationStatuses: VerificationStatus[] = [
  "verified",
  "user_confirmed",
  "inferred",
  "unverified",
  "conflicting",
];

const sensitiveFields: Array<{ key: SensitiveAnswerKey; label: string }> = [
  { key: "current_work_authorization", label: "Current work authorization" },
  { key: "future_sponsorship", label: "Future sponsorship requirement" },
  { key: "visa_status_wording", label: "Visa status wording" },
  { key: "security_clearance", label: "Security clearance" },
  { key: "salary_expectations", label: "Salary expectations" },
  { key: "relocation", label: "Relocation" },
  { key: "willingness_to_travel", label: "Willingness to travel" },
  { key: "start_date", label: "Start date" },
  { key: "veteran_status", label: "Veteran status" },
  { key: "disability_selection", label: "Disability selection" },
  { key: "demographic_selections", label: "Demographic selections" },
  { key: "background_check_consent", label: "Background-check consent" },
];

const longFormQuestionTypes: ApplicationQuestionType[] = [
  "why_company",
  "why_role",
  "candidate_fit",
  "relevant_project",
  "technical_challenge",
  "behavioral_story",
  "additional_information",
];

function textValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function PreferencesPanel({
  preferences,
  onSave,
}: {
  preferences: CandidatePreferences | null;
  onSave: (preferences: Partial<CandidatePreferences>) => void;
}) {
  const [draft, setDraft] = useState(() => ({
    targetRoles: preferences?.targetRoles.join(", ") ?? "",
    avoidedRoles: preferences?.avoidedRoles.join(", ") ?? "",
    industries: preferences?.industries.join(", ") ?? "",
    preferredLocations: preferences?.preferredLocations.join(", ") ?? "",
    salaryFloor: preferences?.salaryFloor ?? "",
    preferredTechnologies: preferences?.preferredTechnologies.join(", ") ?? "",
    writingTone: preferences?.writingTone ?? "direct, specific, and concise",
    answerLengthPreference: preferences?.answerLengthPreference ?? "standard",
    wordsToAvoid: preferences?.wordsToAvoid.join(", ") ?? "thrilled, passionate",
    reuseApprovedAnswers: preferences?.reuseApprovedAnswers ?? true,
    generateCoverLetters: preferences?.generateCoverLetters ?? false,
    automaticallyChooseResume: preferences?.automaticallyChooseResume ?? false,
  }));
  return (
    <section className="panel p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-950">Preferences</h3>
        <button
          className="button"
          type="button"
          onClick={() =>
            onSave({
              targetRoles: parseCsv(draft.targetRoles),
              avoidedRoles: parseCsv(draft.avoidedRoles),
              industries: parseCsv(draft.industries),
              preferredLocations: parseCsv(draft.preferredLocations),
              salaryFloor: draft.salaryFloor,
              preferredTechnologies: parseCsv(draft.preferredTechnologies),
              writingTone: draft.writingTone,
              answerLengthPreference: draft.answerLengthPreference,
              wordsToAvoid: parseCsv(draft.wordsToAvoid),
              reuseApprovedAnswers: draft.reuseApprovedAnswers,
              generateCoverLetters: draft.generateCoverLetters,
              automaticallyChooseResume: draft.automaticallyChooseResume,
            })
          }
        >
          <Save size={15} aria-hidden="true" />
          Save
        </button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm font-semibold text-slate-700">
        <label>Target roles<input className="field mt-1" value={draft.targetRoles} onChange={(event) => setDraft({ ...draft, targetRoles: event.target.value })} /></label>
        <label>Avoided roles<input className="field mt-1" value={draft.avoidedRoles} onChange={(event) => setDraft({ ...draft, avoidedRoles: event.target.value })} /></label>
        <label>Industries<input className="field mt-1" value={draft.industries} onChange={(event) => setDraft({ ...draft, industries: event.target.value })} /></label>
        <label>Preferred locations<input className="field mt-1" value={draft.preferredLocations} onChange={(event) => setDraft({ ...draft, preferredLocations: event.target.value })} /></label>
        <label>Salary floor<input className="field mt-1" value={draft.salaryFloor} onChange={(event) => setDraft({ ...draft, salaryFloor: event.target.value })} /></label>
        <label>Preferred technologies<input className="field mt-1" value={draft.preferredTechnologies} onChange={(event) => setDraft({ ...draft, preferredTechnologies: event.target.value })} /></label>
        <label className="col-span-2">Writing tone<input className="field mt-1" value={draft.writingTone} onChange={(event) => setDraft({ ...draft, writingTone: event.target.value })} /></label>
        <label>Answer length<select className="field mt-1" value={draft.answerLengthPreference} onChange={(event) => setDraft({ ...draft, answerLengthPreference: event.target.value as CandidatePreferences["answerLengthPreference"] })}><option value="concise">concise</option><option value="standard">standard</option><option value="detailed">detailed</option></select></label>
        <label className="col-span-3">Words to avoid<input className="field mt-1" value={draft.wordsToAvoid} onChange={(event) => setDraft({ ...draft, wordsToAvoid: event.target.value })} /></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-slate-700">
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.reuseApprovedAnswers} onChange={(event) => setDraft({ ...draft, reuseApprovedAnswers: event.target.checked })} />Reuse approved answers</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.generateCoverLetters} onChange={(event) => setDraft({ ...draft, generateCoverLetters: event.target.checked })} />Generate cover letters</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.automaticallyChooseResume} onChange={(event) => setDraft({ ...draft, automaticallyChooseResume: event.target.checked })} />Automatically choose resume</label>
      </div>
    </section>
  );
}

function SensitiveVault({
  answers,
  onSave,
}: {
  answers: SensitiveAnswer[];
  onSave: (answer: Partial<SensitiveAnswer> & Pick<SensitiveAnswer, "key" | "label" | "value">) => void;
}) {
  return (
    <section className="panel p-4">
      <h3 className="text-base font-semibold text-slate-950">Sensitive Answer Vault</h3>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {sensitiveFields.map((field) => {
          const saved = answers.find((answer) => answer.key === field.key);
          return (
            <div key={field.key} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-800">{field.label}</p>
                <span className={saved?.locked ? "text-emerald-700" : "text-amber-700"}>{saved?.locked ? <Lock size={15} /> : <Unlock size={15} />}</span>
              </div>
              <textarea
                className="field mt-2 min-h-16"
                defaultValue={textValue(saved?.value)}
                placeholder="Requires user input until explicitly saved."
                onBlur={(event) => {
                  if (event.target.value !== textValue(saved?.value)) {
                    onSave({
                      ...saved,
                      key: field.key,
                      label: field.label,
                      value: event.target.value,
                      verificationStatus: "user_confirmed",
                      requiresReview: !saved?.locked,
                    });
                  }
                }}
              />
              <div className="mt-2 flex items-center gap-2">
                <button className="button" type="button" onClick={() => onSave({ ...saved, key: field.key, label: field.label, value: saved?.value ?? "", locked: !saved?.locked, requiresReview: false })}>
                  {saved?.locked ? <Unlock size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
                  {saved?.locked ? "Unlock" : "Lock"}
                </button>
                {saved?.requiresReview ? <span className="text-xs font-semibold text-red-700">Requires review</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ClaimsPanel({
  claims,
  onSave,
  onDelete,
}: {
  claims: CandidateClaim[];
  onSave: (claim: Partial<CandidateClaim> & Pick<CandidateClaim, "category" | "value">) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState({ category: "", value: "", evidenceIds: "", verificationStatus: "user_confirmed" as VerificationStatus, locked: false });
  return (
    <section className="panel p-4">
      <h3 className="text-base font-semibold text-slate-950">Structured Claims</h3>
      <div className="mt-3 grid grid-cols-[1fr_1.4fr_1fr_180px_auto] gap-2">
        <input className="field" placeholder="Category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
        <input className="field" placeholder="Value" value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} />
        <input className="field" placeholder="Evidence IDs" value={draft.evidenceIds} onChange={(event) => setDraft({ ...draft, evidenceIds: event.target.value })} />
        <select className="field" value={draft.verificationStatus} onChange={(event) => setDraft({ ...draft, verificationStatus: event.target.value as VerificationStatus })}>{verificationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select>
        <button className="button" type="button" disabled={!draft.category.trim() || !draft.value.trim()} onClick={() => { onSave({ category: draft.category, value: draft.value, evidenceIds: parseCsv(draft.evidenceIds), verificationStatus: draft.verificationStatus, locked: draft.locked }); setDraft({ category: "", value: "", evidenceIds: "", verificationStatus: "user_confirmed", locked: false }); }}><Plus size={15} /></button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {claims.map((claim) => (
          <div key={claim.id} className="rounded-md border border-slate-200 p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{claim.category}</p>
                <p className="mt-1 text-slate-700">{textValue(claim.value)}</p>
              </div>
              <button className="icon-button" title="Delete claim" type="button" onClick={() => onDelete(claim.id)}><Trash2 size={15} /></button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
              <span>{claim.verificationStatus}</span>
              {claim.locked ? <span>locked</span> : null}
              {claim.evidenceIds.length ? <span>{claim.evidenceIds.length} evidence links</span> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StoryBank({
  stories,
  onSave,
  onDelete,
}: {
  stories: CareerStory[];
  onSave: (story: Partial<CareerStory> & Pick<CareerStory, "title">) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState({
    title: "",
    tags: "",
    competencies: "",
    situation: "",
    problem: "",
    actions: "",
    result: "",
    metrics: "",
    technologies: "",
    evidenceIds: "",
    approved: false,
  });
  return (
    <section className="panel p-4">
      <h3 className="text-base font-semibold text-slate-950">Story Bank</h3>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <input className="field" placeholder="Story title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        <input className="field" placeholder="Tags" value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} />
        <input className="field" placeholder="Competencies" value={draft.competencies} onChange={(event) => setDraft({ ...draft, competencies: event.target.value })} />
        <textarea className="field min-h-16" placeholder="Situation" value={draft.situation} onChange={(event) => setDraft({ ...draft, situation: event.target.value })} />
        <textarea className="field min-h-16" placeholder="Problem" value={draft.problem} onChange={(event) => setDraft({ ...draft, problem: event.target.value })} />
        <textarea className="field min-h-16" placeholder="Actions, comma separated" value={draft.actions} onChange={(event) => setDraft({ ...draft, actions: event.target.value })} />
        <textarea className="field min-h-16" placeholder="Result" value={draft.result} onChange={(event) => setDraft({ ...draft, result: event.target.value })} />
        <input className="field" placeholder="Metrics" value={draft.metrics} onChange={(event) => setDraft({ ...draft, metrics: event.target.value })} />
        <input className="field" placeholder="Technologies" value={draft.technologies} onChange={(event) => setDraft({ ...draft, technologies: event.target.value })} />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <input className="field max-w-lg" placeholder="Evidence IDs" value={draft.evidenceIds} onChange={(event) => setDraft({ ...draft, evidenceIds: event.target.value })} />
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={draft.approved} onChange={(event) => setDraft({ ...draft, approved: event.target.checked })} />Approved</label>
        <button className="button" type="button" disabled={!draft.title.trim()} onClick={() => { onSave({ title: draft.title, tags: parseCsv(draft.tags), competencies: parseCsv(draft.competencies), situation: draft.situation, problem: draft.problem, actions: parseCsv(draft.actions), result: draft.result, metrics: parseCsv(draft.metrics), technologies: parseCsv(draft.technologies), evidenceIds: parseCsv(draft.evidenceIds), verificationStatus: "user_confirmed", approved: draft.approved }); setDraft({ title: "", tags: "", competencies: "", situation: "", problem: "", actions: "", result: "", metrics: "", technologies: "", evidenceIds: "", approved: false }); }}><Plus size={15} />Add story</button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {stories.map((story) => (
          <div key={story.id} className="rounded-md border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{story.title}</p>
                <p className="mt-1 text-sm text-slate-600">{story.result || story.problem || story.situation}</p>
              </div>
              <div className="flex gap-2">
                <button className="icon-button" title={story.archived ? "Unarchive story" : "Archive story"} type="button" onClick={() => onSave({ ...story, archived: !story.archived })}><Archive size={15} /></button>
                <button className="icon-button" title="Delete story" type="button" onClick={() => onDelete(story.id)}><Trash2 size={15} /></button>
              </div>
            </div>
            <div className="mt-2"><TagList tags={[...story.tags, ...story.competencies, ...story.technologies]} /></div>
            <p className={story.approved ? "mt-2 text-xs font-semibold text-emerald-700" : "mt-2 text-xs font-semibold text-amber-700"}>{story.approved ? "Approved for answer generation" : "Draft story"}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AnswerLibrary({
  answers,
  onSave,
  onDelete,
}: {
  answers: ApprovedApplicationAnswer[];
  onSave: (answer: Partial<ApprovedApplicationAnswer> & Pick<ApprovedApplicationAnswer, "normalizedQuestionType" | "originalQuestion" | "answer">) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState({ normalizedQuestionType: "candidate_fit" as ApplicationQuestionType, originalQuestion: "", answer: "", applicableRoleFamilies: "", applicableSkills: "", tone: "" });
  return (
    <section className="panel p-4">
      <h3 className="text-base font-semibold text-slate-950">Answer Library</h3>
      <div className="mt-3 grid grid-cols-[220px_1fr] gap-3">
        <select className="field" value={draft.normalizedQuestionType} onChange={(event) => setDraft({ ...draft, normalizedQuestionType: event.target.value as ApplicationQuestionType })}>{longFormQuestionTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
        <input className="field" placeholder="Original question" value={draft.originalQuestion} onChange={(event) => setDraft({ ...draft, originalQuestion: event.target.value })} />
        <textarea className="field min-h-24" placeholder="Approved answer" value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} />
        <div className="space-y-2">
          <input className="field" placeholder="Role families" value={draft.applicableRoleFamilies} onChange={(event) => setDraft({ ...draft, applicableRoleFamilies: event.target.value })} />
          <input className="field" placeholder="Skills" value={draft.applicableSkills} onChange={(event) => setDraft({ ...draft, applicableSkills: event.target.value })} />
          <input className="field" placeholder="Tone" value={draft.tone} onChange={(event) => setDraft({ ...draft, tone: event.target.value })} />
        </div>
      </div>
      <button className="button mt-3" type="button" disabled={!draft.originalQuestion.trim() || !draft.answer.trim()} onClick={() => { onSave({ normalizedQuestionType: draft.normalizedQuestionType, originalQuestion: draft.originalQuestion, answer: draft.answer, applicableRoleFamilies: parseCsv(draft.applicableRoleFamilies), applicableSkills: parseCsv(draft.applicableSkills), tone: draft.tone, approvedByUser: true }); setDraft({ normalizedQuestionType: "candidate_fit", originalQuestion: "", answer: "", applicableRoleFamilies: "", applicableSkills: "", tone: "" }); }}><Plus size={15} />Save answer</button>
      <div className="mt-4 space-y-3">
        {answers.map((answer) => (
          <div key={answer.id} className="rounded-md border border-slate-200 p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{answer.normalizedQuestionType}: {answer.originalQuestion}</p>
                <p className="mt-1 text-slate-700">{answer.answer}</p>
              </div>
              <div className="flex gap-2">
                <button className="icon-button" title={answer.doNotReuse ? "Allow reuse" : "Do not reuse"} type="button" onClick={() => onSave({ ...answer, doNotReuse: !answer.doNotReuse })}><Check size={15} /></button>
                <button className="icon-button" title="Delete answer" type="button" onClick={() => onDelete(answer.id)}><Trash2 size={15} /></button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
              <span>{answer.useCount} uses</span>
              {answer.doNotReuse ? <span>do not reuse</span> : <span>reusable</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CandidateBrainPage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => repository.getProfile() });
  const items = useQuery({ queryKey: ["career-items"], queryFn: () => repository.listCareerItems() });
  const facts = useQuery({ queryKey: ["career-facts"], queryFn: () => repository.listCareerFacts() });
  const skills = useQuery({ queryKey: ["skills"], queryFn: () => repository.listSkills() });
  const claims = useQuery({ queryKey: ["candidate-claims"], queryFn: () => repository.listCandidateClaims() });
  const sensitive = useQuery({ queryKey: ["sensitive-answers"], queryFn: () => repository.listSensitiveAnswers() });
  const preferences = useQuery({ queryKey: ["candidate-preferences"], queryFn: () => repository.getCandidatePreferences() });
  const stories = useQuery({ queryKey: ["career-stories"], queryFn: () => repository.listCareerStories(true) });
  const answers = useQuery({ queryKey: ["approved-application-answers"], queryFn: () => repository.listApprovedApplicationAnswers() });
  const invalidate = () => queryClient.invalidateQueries();
  const saveClaim = useMutation({ mutationFn: (claim: Parameters<typeof repository.saveCandidateClaim>[0]) => repository.saveCandidateClaim(claim), onSuccess: invalidate });
  const deleteClaim = useMutation({ mutationFn: (id: string) => repository.deleteCandidateClaim(id), onSuccess: invalidate });
  const saveSensitive = useMutation({ mutationFn: (answer: Parameters<typeof repository.saveSensitiveAnswer>[0]) => repository.saveSensitiveAnswer(answer), onSuccess: invalidate });
  const savePreferences = useMutation({ mutationFn: (next: Partial<CandidatePreferences>) => repository.saveCandidatePreferences(next), onSuccess: invalidate });
  const saveStory = useMutation({ mutationFn: (story: Parameters<typeof repository.saveCareerStory>[0]) => repository.saveCareerStory(story), onSuccess: invalidate });
  const deleteStory = useMutation({ mutationFn: (id: string) => repository.deleteCareerStory(id), onSuccess: invalidate });
  const saveAnswer = useMutation({ mutationFn: (answer: Parameters<typeof repository.saveApprovedApplicationAnswer>[0]) => repository.saveApprovedApplicationAnswer(answer), onSuccess: invalidate });
  const deleteAnswer = useMutation({ mutationFn: (id: string) => repository.deleteApprovedApplicationAnswer(id), onSuccess: invalidate });

  const profileData = profile.data;
  const itemData = useMemo(() => items.data ?? [], [items.data]);
  const factData = useMemo(() => facts.data ?? [], [facts.data]);
  const skillData = useMemo(() => skills.data ?? [], [skills.data]);
  const claimData = useMemo(() => claims.data ?? [], [claims.data]);
  const sensitiveData = useMemo(() => sensitive.data ?? [], [sensitive.data]);
  const storyData = useMemo(() => stories.data ?? [], [stories.data]);
  const answerData = useMemo(() => answers.data ?? [], [answers.data]);
  const preferenceData = preferences.data ?? null;

  const completeness = useMemo(() => {
    const complete = [
      profileData?.fullName && profileData.email && profileData.phone ? "Contact information" : "",
      itemData.some((item) => item.type === "education") ? "Education" : "",
      itemData.filter((item) => item.type === "project" && item.enabled).length >= 2 ? "Core projects" : "",
      profileData?.portfolioUrl || profileData?.linkedInUrl || profileData?.githubUrl ? "Portfolio links" : "",
      preferenceData?.targetRoles.length ? "Target roles" : "",
    ].filter(Boolean);
    const needs = [
      sensitiveData.some((answer) => answer.key === "current_work_authorization" && textValue(answer.value)) ? "" : "Work authorization answer",
      sensitiveData.some((answer) => answer.key === "salary_expectations" && textValue(answer.value)) ? "" : "Salary preference",
      sensitiveData.some((answer) => answer.key === "start_date" && textValue(answer.value)) ? "" : "Start date",
      storyData.some((story) => story.approved && story.competencies.some((tag) => /lead/i.test(tag))) ? "" : "Leadership story",
    ].filter(Boolean);
    return { complete, needs, score: complete.length / (complete.length + needs.length || 1) };
  }, [itemData, preferenceData, profileData, sensitiveData, storyData]);

  const loading = [profile, items, facts, skills, claims, sensitive, preferences, stories, answers].some((query) => query.isLoading);
  if (loading) return <LoadingState label="Loading Candidate Brain..." />;
  const errored = [profile, items, facts, skills, claims, sensitive, preferences, stories, answers].find((query) => query.isError);
  if (errored?.error) throw errored.error;

  const sampleAnswers = generateApplicationAnswers({
    fields: [
      normalizeDetectedField({ id: "preview-email", label: "Email", inputType: "email" }),
      normalizeDetectedField({ id: "preview-work-auth", label: "Are you authorized to work in the United States?" }),
      normalizeDetectedField({ id: "preview-fit", label: "Why are you a strong fit for this role?" }),
    ],
    job: null,
    profile: profileData ?? null,
    careerItems: itemData,
    careerFacts: factData,
    skills: skillData,
    claims: claimData,
    sensitiveAnswers: sensitiveData,
    stories: storyData,
    approvedAnswers: answerData,
    preferences: preferenceData,
  });

  return (
    <div>
      <PageHeader eyebrow="Application memory" title="Candidate Brain" />
      <div className="space-y-5 p-8">
        <section className="panel p-5">
          <div className="flex items-start justify-between gap-5">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Profile completeness: {pct(completeness.score)}</h3>
              <p className="mt-1 text-sm text-slate-600">Only verified, user-confirmed, or existing user-provided evidence is eligible for application answers by default.</p>
            </div>
            <div className="w-64 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-950">Answer engine preview</p>
              {sampleAnswers.map((answer) => (
                <p key={answer.fieldId} className={answer.requiresReview ? "mt-2 text-amber-700" : "mt-2 text-emerald-700"}>{answer.normalizedQuestionType}: {answer.answerSource}</p>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-semibold text-emerald-700">Complete</p>
              {completeness.complete.map((item) => <p key={item} className="mt-1 text-slate-700">{item}</p>)}
            </div>
            <div>
              <p className="font-semibold text-amber-700">Needs attention</p>
              {completeness.needs.map((item) => <p key={item} className="mt-1 text-slate-700">{item}</p>)}
              {!completeness.needs.length ? <p className="mt-1 text-slate-700">No obvious gaps.</p> : null}
            </div>
          </div>
        </section>

        <PreferencesPanel preferences={preferenceData} onSave={(next) => savePreferences.mutate(next)} />
        <SensitiveVault answers={sensitiveData} onSave={(answer) => saveSensitive.mutate(answer)} />
        <ClaimsPanel claims={claimData} onSave={(claim) => saveClaim.mutate(claim)} onDelete={(id) => deleteClaim.mutate(id)} />
        <StoryBank stories={storyData} onSave={(story) => saveStory.mutate(story)} onDelete={(id) => deleteStory.mutate(id)} />
        <AnswerLibrary answers={answerData} onSave={(answer) => saveAnswer.mutate(answer)} onDelete={(id) => deleteAnswer.mutate(id)} />
        {!itemData.length ? <EmptyState title="No career evidence yet" body="Add career items and facts in the Evidence Database so application answers have reviewed source material." /> : null}
      </div>
    </div>
  );
}
