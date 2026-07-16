import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Link } from "react-router-dom";
import { Clipboard, Copy, Download, KeyRound, Play, RefreshCcw, Save, Trash2, Upload } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, InlineError, LoadingState } from "../../components/States";
import { testOpenAIConnectivity, type OpenAIConnectivityResult } from "../../lib/ai/connectivity";
import { buildResumeGenerationRequest } from "../../lib/ai/generationRequest";
import { generateEvidenceGroundedResume } from "../../lib/ai/generationPipeline";
import { createAIProvider } from "../../lib/ai/providerFactory";
import { createBackupPreview, parseBackupText, serializeBackup } from "../../lib/database/backup";
import { useRepository } from "../../lib/database/repositoryContext";
import { buildFirstRunChecklist } from "../../lib/diagnostics/firstRun";
import { createDiagnosticsReport } from "../../lib/diagnostics/report";
import { APPROVED_RESUME_FONTS } from "../../lib/resume/templateSettings";
import { validateResumeClaims } from "../../lib/resume/validation";
import { scoreCareerFacts, splitEvidence } from "../../lib/tailoring/evidence";
import { ROLE_PROFILES, controlsForRoleProfile } from "../../lib/tailoring/roleProfiles";
import { ResumeTemplateSettingsSchema } from "../../schemas/settings";
import type { AppSettings, BackupPayload, BackupPreview, Job, Profile, ResumeTemplateSettings, XeLaTeXDiagnostics } from "../../types/domain";
import { createId, nowIso } from "../../lib/utils";
import { sampleJob } from "../tailoring/sampleJob";
import { AI_CONFIG } from "../../lib/ai/config";

interface KeyStatus { exists: boolean; source: "keychain" | "env" | "none"; maskedSuffix: string }

function TemplatePreview({ profile, options }: { profile: Profile; options: ResumeTemplateSettings }) {
  const label = (value: string, fallback: string) => options.urlDisplay === "labels" && /^https?:/.test(value) ? fallback : value;
  return <div className="min-h-[520px] bg-white px-8 py-7 text-slate-900 shadow-sm" style={{ fontFamily: options.fontFamily, fontSize: `${options.bodyFontSize}px` }}>
    <header className="text-center"><p className="font-bold" style={{ fontSize: `${options.headerFontSize}px` }}>{profile.fullName || "Mir Athfan Ali"}</p><p>{profile.headline || "Software Engineer"}</p><p className="mt-1 text-[10px] text-slate-600">{[profile.city && profile.region ? `${profile.city}, ${profile.region}` : "Chicago, Illinois", profile.email || "email required", profile.phone || "phone required", label(profile.linkedInUrl, "LinkedIn"), label(profile.githubUrl, "GitHub"), label(profile.portfolioUrl, "Portfolio")].filter(Boolean).join(" | ")}</p></header>
    {["PROJECTS", "EDUCATION", "SKILLS"].map((section) => <section key={section} style={{ marginTop: `${options.sectionSpacing}px` }}><p className="border-b border-slate-500 font-bold" style={{ fontSize: `${options.sectionHeadingSize}px` }}>{section}</p>{section === "PROJECTS" ? <div className="mt-2"><div className="flex justify-between font-semibold"><span>Forge - Fitness and Workout Tracker</span><span>{options.dateAlignment === "right" ? "2026" : "| 2026"}</span></div><ul className="ml-4 list-disc" style={{ lineHeight: 1.35 }}><li style={{ marginTop: `${options.bulletSpacing}px` }}>Built an end-to-end mobile product with a typed frontend and reliable backend.</li><li style={{ marginTop: `${options.bulletSpacing}px` }}>Validated core workflows with automated tests and local quality checks.</li></ul></div> : section === "EDUCATION" ? <p className="mt-2 font-semibold">Illinois Institute of Technology | Master's in Computer Science</p> : <p className="mt-2">TypeScript | React | Python | PostgreSQL | Testing</p>}</section>)}
  </div>;
}

export function SettingsPage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [latex, setLatex] = useState<XeLaTeXDiagnostics | null>(null);
  const [exportWritable, setExportWritable] = useState(true);
  const [connectivity, setConnectivity] = useState<OpenAIConnectivityResult | null>(null);
  const [pipelineResult, setPipelineResult] = useState("");
  const [backupPayload, setBackupPayload] = useState<BackupPayload | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);
  const [restoreMode, setRestoreMode] = useState<"replace" | "merge">("merge");
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: () => repository.getProfile() });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => repository.getSettings() });
  const metricsQuery = useQuery({ queryKey: ["dashboard"], queryFn: () => repository.getDashboardMetrics() });
  const databaseQuery = useQuery({ queryKey: ["database-status"], queryFn: () => repository.getDatabaseStatus() });
  const searchDiagnosticsQuery = useQuery({ queryKey: ["search-diagnostics"], queryFn: () => repository.getSearchDiagnostics() });
  const itemsQuery = useQuery({ queryKey: ["career-items"], queryFn: () => repository.listCareerItems() });
  const factsQuery = useQuery({ queryKey: ["career-facts"], queryFn: () => repository.listCareerFacts() });
  const skillsQuery = useQuery({ queryKey: ["skills"], queryFn: () => repository.listSkills() });
  const [profileDraft, setProfileDraft] = useState<Profile | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings | null>(null);
  useEffect(() => { if (profileQuery.data && !profileDraft) setProfileDraft(profileQuery.data); }, [profileDraft, profileQuery.data]);
  useEffect(() => { if (settingsQuery.data && !settingsDraft) setSettingsDraft(settingsQuery.data); }, [settingsDraft, settingsQuery.data]);

  const saveProfile = useMutation({ mutationFn: (profile: Profile) => repository.saveProfile(profile), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }) });
  const saveSettings = useMutation({ mutationFn: (settings: AppSettings) => repository.saveSettings(settings), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }) });

  const refreshDiagnostics = useCallback(async () => {
    try {
      const [nextKey, nextLatex] = await Promise.all([
        invoke<KeyStatus>("get_openai_key_status"),
        invoke<XeLaTeXDiagnostics>("get_xelatex_diagnostics"),
      ]);
      setKeyStatus(nextKey);
      setLatex(nextLatex);
      if (settingsDraft?.defaultExportDirectory) setExportWritable(await invoke<boolean>("check_directory_writable", { path: settingsDraft.defaultExportDirectory }));
      else setExportWritable(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  }, [settingsDraft?.defaultExportDirectory]);
  useEffect(() => { void refreshDiagnostics(); }, [refreshDiagnostics]);

  const checklist = useMemo(() => profileDraft && settingsDraft && databaseQuery.data && latex ? buildFirstRunChecklist({ database: databaseQuery.data, careerFactCount: metricsQuery.data?.careerFacts ?? 0, profile: profileDraft, xelatex: latex, exportDirectoryWritable: exportWritable, apiKeyExists: keyStatus?.exists ?? false, settings: settingsDraft }) : [], [databaseQuery.data, exportWritable, keyStatus?.exists, latex, metricsQuery.data?.careerFacts, profileDraft, settingsDraft]);

  if ([profileQuery, settingsQuery, metricsQuery, databaseQuery, searchDiagnosticsQuery, itemsQuery, factsQuery, skillsQuery].some((query) => query.isLoading)) return <LoadingState label="Loading daily-use settings..." />;
  if (!profileDraft || !settingsDraft) {
    return (
      <div>
        <PageHeader eyebrow="Daily-use readiness" title="Settings" />
        <div className="p-8">
          <EmptyState
            title="Set up Career Memory first"
            body="Settings depend on a local profile and default resume settings. Load the sample profile or add your own career memory, then return here to configure exports, AI, backups, and diagnostics."
            action={<Link className="button button-primary" to="/career-memory">Open Career Memory</Link>}
          />
        </div>
      </div>
    );
  }

  const saveTemplateSettings = async () => {
    const parsed = ResumeTemplateSettingsSchema.safeParse(settingsDraft.templateSettings);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Template settings are invalid."); return; }
    await saveSettings.mutateAsync({ ...settingsDraft, templateSettings: parsed.data });
    setError("");
  };

  const runLivePipeline = async () => {
    if (!window.confirm("This development test runs a complete paid OpenAI pipeline but does not save the job or resume. Continue?")) return;
    setPipelineResult("Running job analysis...");
    try {
      const provider = createAIProvider("openai");
      const analyzed = await provider.analyzeJob({ ...sampleJob, modelName: settingsDraft.modelName });
      const controls = controlsForRoleProfile("full-stack-software-engineer", settingsDraft.tailoringDefaults);
      const evidence = splitEvidence(scoreCareerFacts(analyzed.data, factsQuery.data ?? [], itemsQuery.data ?? [], ROLE_PROFILES[controls.roleProfileId]), {});
      const job: Job = { id: createId("dev-job"), company: sampleJob.company || analyzed.data.inferredCompany, roleTitle: sampleJob.roleTitle || analyzed.data.inferredRoleTitle, sourceUrl: sampleJob.sourceUrl, rawDescription: sampleJob.rawDescription, analysisJson: analyzed.data, createdAt: nowIso(), updatedAt: nowIso() };
      const request = buildResumeGenerationRequest({ job, analysis: analyzed.data, profile: profileDraft, items: itemsQuery.data ?? [], evidence, skills: skillsQuery.data ?? [], controls });
      const generated = await generateEvidenceGroundedResume({ provider, request, modelName: settingsDraft.modelName });
      const issues = validateResumeClaims({ resume: generated.resume, facts: factsQuery.data ?? [], items: itemsQuery.data ?? [], skills: skillsQuery.data ?? [], profile: profileDraft, generationRequest: request });
      const tokens = generated.metadata.calls.reduce((total, call) => total + (call.totalTokens ?? 0), 0);
      setPipelineResult(`Completed without saving. ${generated.metadata.calls.length + 1} calls including analysis, ${issues.filter((issue) => issue.severity === "error").length} blocking issues, ${tokens || "unreported"} tokens.`);
    } catch (caught) { setPipelineResult(caught instanceof Error ? caught.message : String(caught)); }
  };

  return <div><PageHeader eyebrow="Daily-use readiness" title="Settings" /><div className="space-y-6 p-8">{error ? <InlineError message={error} /> : null}
    <section className="panel p-5"><div className="flex items-center justify-between"><div><h3 className="text-lg font-semibold text-slate-950">First-run checklist</h3><p className="mt-1 text-sm text-slate-600">Mock mode remains usable when OpenAI is optional.</p></div><button className="button" type="button" onClick={() => void refreshDiagnostics()}><RefreshCcw size={15} />Retry checks</button></div><div className="mt-4 grid grid-cols-3 gap-3">{checklist.map((check) => <div key={check.id} className="border-l-2 border-slate-300 pl-3"><p className="text-xs font-semibold uppercase text-slate-500">{check.status.replace("_", " ")}</p><p className="mt-1 font-semibold text-slate-900">{check.label}</p><p className="mt-1 text-xs leading-5 text-slate-600">{check.detail}</p></div>)}</div></section>

    <div className="grid grid-cols-[minmax(0,1fr)_460px] gap-6"><div className="space-y-6">
      <section className="panel p-5"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-slate-950">Profile</h3><button className="button button-primary" type="button" onClick={() => saveProfile.mutate(profileDraft)}><Save size={15} />Save profile</button></div><div className="mt-4 grid grid-cols-2 gap-3">{[["fullName","Full name"],["headline","Headline"],["city","City"],["region","State / region"],["email","Email"],["phone","Phone"],["portfolioUrl","Portfolio"],["linkedInUrl","LinkedIn"],["githubUrl","GitHub"],["workAuthorizationNote","Optional work authorization"]].map(([field,label]) => <label key={field} className="text-sm font-semibold text-slate-700">{label}<input className="field mt-1" value={String(profileDraft[field as keyof Profile] ?? "")} onChange={(event) => setProfileDraft({ ...profileDraft, [field]: event.target.value })} /></label>)}</div></section>

      <section className="panel p-5"><div className="flex items-center justify-between"><div><h3 className="text-lg font-semibold text-slate-950">Mir Resume</h3><p className="mt-1 text-sm text-slate-600">Validated options only. No raw LaTeX is accepted.</p></div><button className="button button-primary" type="button" onClick={() => void saveTemplateSettings()}><Save size={15} />Save template</button></div><div className="mt-4 grid grid-cols-3 gap-3">
        <label className="text-sm font-semibold text-slate-700">Default template<select className="field mt-1" value={settingsDraft.defaultTemplateId} onChange={(event) => setSettingsDraft({ ...settingsDraft, defaultTemplateId: event.target.value })}><option value="mir-resume">Mir Resume</option><option value="mir-standard">Mir Standard (legacy)</option><option value="ai-full-stack">AI and Full-Stack</option></select></label>
        <label className="text-sm font-semibold text-slate-700">Font<select className="field mt-1" value={settingsDraft.templateSettings.fontFamily} onChange={(event) => setSettingsDraft({ ...settingsDraft, templateSettings: { ...settingsDraft.templateSettings, fontFamily: event.target.value as ResumeTemplateSettings["fontFamily"] } })}>{APPROVED_RESUME_FONTS.map((font) => <option key={font}>{font}</option>)}</select></label>
        {[{key:"bodyFontSize",label:"Body font",min:9,max:11,step:.25},{key:"headerFontSize",label:"Header font",min:15,max:22,step:.5},{key:"sectionHeadingSize",label:"Section heading",min:9,max:13,step:.25},{key:"marginInches",label:"Margins (in)",min:.45,max:.8,step:.05},{key:"sectionSpacing",label:"Section spacing",min:3,max:10,step:.5},{key:"bulletSpacing",label:"Bullet spacing",min:0,max:5,step:.25}].map((field) => <label key={field.key} className="text-sm font-semibold text-slate-700">{field.label}<input className="field mt-1" type="number" min={field.min} max={field.max} step={field.step} value={settingsDraft.templateSettings[field.key as keyof ResumeTemplateSettings] as number} onChange={(event) => setSettingsDraft({ ...settingsDraft, templateSettings: { ...settingsDraft.templateSettings, [field.key]: Number(event.target.value) } })} /></label>)}
        <label className="text-sm font-semibold text-slate-700">Date alignment<select className="field mt-1" value={settingsDraft.templateSettings.dateAlignment} onChange={(event) => setSettingsDraft({ ...settingsDraft, templateSettings: { ...settingsDraft.templateSettings, dateAlignment: event.target.value as ResumeTemplateSettings["dateAlignment"] } })}><option value="right">Right</option><option value="inline">Inline</option></select></label>
        <label className="text-sm font-semibold text-slate-700">URLs<select className="field mt-1" value={settingsDraft.templateSettings.urlDisplay} onChange={(event) => setSettingsDraft({ ...settingsDraft, templateSettings: { ...settingsDraft.templateSettings, urlDisplay: event.target.value as ResumeTemplateSettings["urlDisplay"] } })}><option value="labels">Linked labels</option><option value="visible">Visible URLs</option></select></label>
        <label className="text-sm font-semibold text-slate-700">Education order<select className="field mt-1" value={settingsDraft.templateSettings.educationOrdering} onChange={(event) => setSettingsDraft({ ...settingsDraft, templateSettings: { ...settingsDraft.templateSettings, educationOrdering: event.target.value as ResumeTemplateSettings["educationOrdering"] } })}><option value="graduate-first">Graduate first</option><option value="chronological">Chronological</option></select></label>
        <label className="text-sm font-semibold text-slate-700">Content order<select className="field mt-1" value={settingsDraft.templateSettings.projectsExperienceOrdering} onChange={(event) => setSettingsDraft({ ...settingsDraft, templateSettings: { ...settingsDraft.templateSettings, projectsExperienceOrdering: event.target.value as ResumeTemplateSettings["projectsExperienceOrdering"] } })}><option value="projects-first">Projects first</option><option value="experience-first">Experience first</option></select></label>
        <label className="text-sm font-semibold text-slate-700">Maximum projects<select className="field mt-1" value={settingsDraft.templateSettings.maximumProjectCount} onChange={(event) => setSettingsDraft({ ...settingsDraft, templateSettings: { ...settingsDraft.templateSettings, maximumProjectCount: Number(event.target.value) as 2|3|4 } })}><option>2</option><option>3</option><option>4</option></select></label>
        <label className="text-sm font-semibold text-slate-700">Bullets / project<select className="field mt-1" value={settingsDraft.templateSettings.defaultBulletsPerProject} onChange={(event) => setSettingsDraft({ ...settingsDraft, templateSettings: { ...settingsDraft.templateSettings, defaultBulletsPerProject: Number(event.target.value) as 1|2|3 } })}><option>1</option><option>2</option><option>3</option></select></label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={settingsDraft.templateSettings.summaryAllowed} onChange={(event) => setSettingsDraft({ ...settingsDraft, templateSettings: { ...settingsDraft.templateSettings, summaryAllowed: event.target.checked } })} />Summary allowed</label>
      </div></section>
    </div><aside className="space-y-6"><section className="panel overflow-hidden"><TemplatePreview profile={profileDraft} options={settingsDraft.templateSettings} /></section>
      <section className="panel p-5"><h3 className="text-lg font-semibold text-slate-950">AI defaults</h3><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-sm font-semibold text-slate-700">Provider<select className="field mt-1" value={settingsDraft.aiProvider} onChange={(event) => setSettingsDraft({ ...settingsDraft, aiProvider: event.target.value as AppSettings["aiProvider"] })}><option value="mock">Mock</option><option value="openai">OpenAI</option></select></label><label className="text-sm font-semibold text-slate-700">Model<input className="field mt-1" value={settingsDraft.modelName} onChange={(event) => setSettingsDraft({ ...settingsDraft, modelName: event.target.value })} /></label><label className="col-span-2 text-sm font-semibold text-slate-700">Default role profile<select className="field mt-1" value={settingsDraft.tailoringDefaults.roleProfileId} onChange={(event) => setSettingsDraft({ ...settingsDraft, tailoringDefaults: controlsForRoleProfile(event.target.value as keyof typeof ROLE_PROFILES, settingsDraft.tailoringDefaults) })}>{Object.values(ROLE_PROFILES).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><label className="col-span-2 text-sm font-semibold text-slate-700">Default export directory<input className="field mt-1" value={settingsDraft.defaultExportDirectory} onChange={(event) => setSettingsDraft({ ...settingsDraft, defaultExportDirectory: event.target.value })} /></label></div><button className="button button-primary mt-4 w-full" type="button" onClick={async () => { await saveSettings.mutateAsync(settingsDraft); await refreshDiagnostics(); }}><Save size={15} />Save defaults</button></section>
      <section className="panel p-5"><h3 className="text-lg font-semibold text-slate-950">Hybrid retrieval</h3><div className="mt-4 space-y-3"><label className="text-sm font-semibold text-slate-700">Semantic search<select className="field mt-1" value={settingsDraft.semanticSearchMode} onChange={(event) => setSettingsDraft({ ...settingsDraft, semanticSearchMode: event.target.value as AppSettings["semanticSearchMode"], allowRemoteEmbeddings: event.target.value === "openai" ? settingsDraft.allowRemoteEmbeddings : false })}><option value="disabled">Disabled</option><option value="openai">OpenAI embeddings</option><option value="local">Local provider</option></select></label>{settingsDraft.semanticSearchMode === "openai" ? <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900"><input className="mt-1" type="checkbox" checked={settingsDraft.allowRemoteEmbeddings} onChange={(event) => setSettingsDraft({ ...settingsDraft, allowRemoteEmbeddings: event.target.checked })} />Allow sending selected career search text to a remote embedding provider</label> : null}<label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={settingsDraft.allowPrivateNotesInEmbeddings} onChange={(event) => setSettingsDraft({ ...settingsDraft, allowPrivateNotesInEmbeddings: event.target.checked })} />Private notes in embeddings</label><label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={settingsDraft.allowContactFieldsInCopilotContext} onChange={(event) => setSettingsDraft({ ...settingsDraft, allowContactFieldsInCopilotContext: event.target.checked })} />Contact fields in Copilot context</label><dl className="grid grid-cols-[150px_1fr] gap-y-2 border-t border-slate-200 pt-3 text-sm"><dt className="font-semibold text-slate-700">Documents</dt><dd>{searchDiagnosticsQuery.data?.documentCount ?? 0}</dd><dt className="font-semibold text-slate-700">FTS5</dt><dd>{searchDiagnosticsQuery.data?.fts5Available ? "Available" : "Fallback search"}</dd><dt className="font-semibold text-slate-700">Embeddings</dt><dd>{searchDiagnosticsQuery.data?.embeddingCount ?? 0}</dd><dt className="font-semibold text-slate-700">Last duration</dt><dd>{searchDiagnosticsQuery.data?.lastSearchDurationMs ?? 0} ms</dd></dl><button className="button w-full" type="button" onClick={async () => { await repository.rebuildSearchIndex(); await queryClient.invalidateQueries({ queryKey: ["search-diagnostics"] }); }}><RefreshCcw size={15} />Rebuild text index</button><button className="button w-full" type="button" onClick={async () => navigator.clipboard.writeText(JSON.stringify(searchDiagnosticsQuery.data, null, 2))}><Copy size={15} />Copy search diagnostics</button></div></section>
    </aside></div>

    <div className="grid grid-cols-2 gap-6"><section className="panel p-5"><h3 className="text-lg font-semibold text-slate-950">OpenAI API key</h3><p className="mt-2 text-sm text-slate-600">Stored in macOS Keychain as {AI_CONFIG.serviceName} / {AI_CONFIG.keychainAccount}. The full key is never returned.</p><div className="mt-4 flex gap-2"><button className="button" type="button" onClick={() => void refreshDiagnostics()}><KeyRound size={15} />Status</button><button className="icon-button" title="Delete API key" type="button" onClick={async () => { if (!window.confirm("Delete the CareerCompiler OpenAI API key from macOS Keychain?")) return; await invoke("delete_openai_key"); setKeyStatus(null); await refreshDiagnostics(); }}><Trash2 size={15} /></button></div><input className="field mt-4" value={keyValue} type="password" placeholder="sk-..." onChange={(event) => setKeyValue(event.target.value)} /><button className="button button-primary mt-3" type="button" disabled={!keyValue.trim()} onClick={async () => { await invoke("set_openai_key", { key: keyValue }); setKeyValue(""); await refreshDiagnostics(); }}>Save or replace key</button>{keyStatus ? <p className="mt-3 text-sm text-slate-600">{keyStatus.exists ? `Available via ${keyStatus.source}, ending ${keyStatus.maskedSuffix}` : "No key configured"}</p> : null}<label className="mt-5 flex items-center gap-2 border-t border-slate-200 pt-4 text-sm font-semibold text-slate-700"><input type="checkbox" checked={settingsDraft.developerMode} onChange={(event) => setSettingsDraft({ ...settingsDraft, developerMode: event.target.checked })} />Developer mode</label>{settingsDraft.developerMode ? <div className="mt-4 space-y-3"><button className="button" type="button" onClick={async () => setConnectivity(await testOpenAIConnectivity(settingsDraft.modelName))}><Play size={15} />Run minimal structured test</button><button className="button" type="button" onClick={() => void runLivePipeline()}><Play size={15} />Run full pipeline test</button>{connectivity ? <p className={connectivity.success ? "text-sm text-emerald-700" : "text-sm text-red-700"}>{connectivity.success ? "Success" : connectivity.errorCode}: {connectivity.message} | {connectivity.durationMs} ms | {connectivity.totalTokens ?? "-"} tokens</p> : null}{pipelineResult ? <p className="text-sm leading-6 text-slate-700">{pipelineResult}</p> : null}</div> : null}</section>

      <section className="panel p-5"><div className="flex items-center justify-between"><div><h3 className="text-lg font-semibold text-slate-950">XeLaTeX runtime</h3><p className="mt-1 text-sm text-slate-600">CareerCompiler never falls back to another renderer.</p></div><button className="icon-button" title="Retry XeLaTeX diagnostics" type="button" onClick={() => void refreshDiagnostics()}><RefreshCcw size={15} /></button></div>{latex ? <dl className="mt-4 grid grid-cols-[160px_1fr] gap-y-2 text-sm"><dt className="font-semibold">Available</dt><dd>{latex.available ? "Yes" : "No"}</dd><dt className="font-semibold">Executable</dt><dd className="break-all">{latex.executablePath || "Not found"}</dd><dt className="font-semibold">Version</dt><dd>{latex.version || "Unavailable"}</dd><dt className="font-semibold">Last compilation</dt><dd>{latex.lastSuccessfulCompilation || "None this session"}</dd><dt className="font-semibold">Duration</dt><dd>{latex.lastCompilationDurationMs ?? "-"} ms</dd></dl> : null}<div className="mt-4 border-t border-slate-200 pt-4"><p className="text-sm text-slate-600">macOS: install MacTeX, or install TinyTeX with XeLaTeX plus geometry, fontspec, xcolor, and hyperref.</p><button className="button mt-3" type="button" onClick={() => void navigator.clipboard.writeText("brew install --cask mactex-no-gui\nsudo tlmgr install geometry fontspec xcolor hyperref")}><Clipboard size={15} />Copy installation commands</button></div></section></div>

    <div className="grid grid-cols-2 gap-6"><section className="panel p-5"><h3 className="text-lg font-semibold text-slate-950">Backup and restore</h3><div className="mt-4 flex gap-2"><button className="button" type="button" onClick={async () => { try { const payload = await repository.exportBackup(); const path = await save({ defaultPath: `careercompiler-backup-${new Date().toISOString().slice(0,10)}.json`, filters: [{ name: "JSON", extensions: ["json"] }] }); if (path) await invoke("write_text_file", { path, text: serializeBackup(payload) }); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } }}><Download size={15} />Export JSON backup</button><button className="button" type="button" onClick={async () => { try { const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] }); if (typeof path === "string") { const text = await invoke<string>("read_text_file", { path }); const payload = parseBackupText(text); setBackupPayload(payload); setBackupPreview(createBackupPreview(payload, await repository.exportBackup())); } } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } }}><Upload size={15} />Preview import</button></div>{backupPreview && backupPayload ? <div className="mt-4 border-t border-slate-200 pt-4 text-sm"><p className="font-semibold text-slate-900">Backup schema {backupPreview.schemaVersion} from {backupPreview.exportedAt}</p><p className="mt-1 text-slate-600">{Object.entries(backupPreview.counts).map(([name,count]) => `${name} ${count}`).join(" | ")}</p><p className="mt-1 text-slate-600">{backupPreview.conflicts.length} matching IDs require conflict handling.</p><select className="field mt-3" value={restoreMode} onChange={(event) => setRestoreMode(event.target.value as "replace"|"merge")}><option value="merge">Merge and replace matching IDs</option><option value="replace">Replace all local backup-managed data</option></select><button className="button button-primary mt-3" type="button" onClick={async () => { if (!window.confirm(`Restore this backup using ${restoreMode} mode? A failed restore will roll back.`)) return; await repository.importBackup(backupPayload, restoreMode); setBackupPayload(null); setBackupPreview(null); await queryClient.invalidateQueries(); }}>Confirm restore</button></div> : null}</section>

      <section className="panel p-5"><h3 className="text-lg font-semibold text-slate-950">Local diagnostics report</h3><p className="mt-2 text-sm text-slate-600">Excludes API keys, prompts, job descriptions, contact fields, career notes, and resume content.</p><button className="button mt-4" type="button" onClick={async () => { if (!databaseQuery.data || !latex) return; const report = createDiagnosticsReport({ appVersion: "0.1.0", operatingSystem: navigator.platform, tauriVersion: "2", database: databaseQuery.data, xelatex: latex, aiProvider: settingsDraft.aiProvider, modelName: settingsDraft.modelName, lastSafeErrorCategory: connectivity?.errorCode ?? "", lastPdfCompilationStatus: latex.lastSuccessfulCompilation ? "success" : "none" }); await navigator.clipboard.writeText(report); }}><Copy size={15} />Copy redacted report</button></section></div>
  </div></div>;
}
