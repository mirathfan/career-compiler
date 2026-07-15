import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Download, KeyRound, Trash2, Upload } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { InlineError, LoadingState } from "../../components/States";
import { useRepository } from "../../lib/database/RepositoryProvider";
import { AI_CONFIG } from "../../lib/ai/config";
import type { AppSettings, BackupPayload, Profile } from "../../types/domain";

interface KeyStatus {
  exists: boolean;
  source: "keychain" | "env" | "none";
  maskedSuffix: string;
}

export function SettingsPage() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: () => repository.getProfile() });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => repository.getSettings() });

  const saveProfile = useMutation({
    mutationFn: (profile: Profile) => repository.saveProfile(profile),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });
  const saveSettings = useMutation({
    mutationFn: (settings: AppSettings) => repository.saveSettings(settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });
  const resetSeed = useMutation({
    mutationFn: () => repository.resetSampleData(),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  if (profileQuery.isLoading || settingsQuery.isLoading) {
    return <LoadingState label="Loading settings..." />;
  }
  if (profileQuery.isError) throw profileQuery.error;
  if (settingsQuery.isError) throw settingsQuery.error;

  const profile = profileQuery.data ?? null;
  const settings = settingsQuery.data!;

  const updateProfile = (patch: Partial<Profile>) => {
    if (!profile) return;
    saveProfile.mutate({ ...profile, ...patch });
  };
  const updateSettings = (patch: Partial<AppSettings>) => {
    saveSettings.mutate({ ...settings, ...patch });
  };
  const refreshKeyStatus = async () => {
    const status = await invoke<KeyStatus>("get_openai_key_status");
    setKeyStatus(status);
  };

  return (
    <div>
      <PageHeader eyebrow="Local preferences" title="Settings" />
      <div className="grid grid-cols-[1fr_420px] gap-6 p-8">
        <section className="space-y-5">
          {error ? <InlineError message={error} /> : null}
          {profile ? (
            <div className="panel p-5">
              <h3 className="text-lg font-semibold text-slate-950">Profile</h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["fullName", "Full name"],
                  ["headline", "Headline"],
                  ["city", "City"],
                  ["region", "Region"],
                  ["email", "Email"],
                  ["phone", "Phone"],
                  ["portfolioUrl", "Portfolio"],
                  ["linkedInUrl", "LinkedIn"],
                  ["githubUrl", "GitHub"],
                  ["workAuthorizationNote", "Work authorization note"],
                ].map(([field, label]) => (
                  <label key={field} className="text-sm font-semibold text-slate-700">
                    {label}
                    <input
                      className="field mt-1"
                      value={String(profile[field as keyof Profile] ?? "")}
                      onChange={(event) => updateProfile({ [field]: event.target.value } as Partial<Profile>)}
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="panel p-5">
              <p className="text-sm text-slate-600">No profile has been seeded yet.</p>
              <button className="button mt-3" type="button" onClick={() => resetSeed.mutate()}>
                Seed profile
              </button>
            </div>
          )}

          <div className="panel p-5">
            <h3 className="text-lg font-semibold text-slate-950">AI and resume defaults</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-sm font-semibold text-slate-700">
                AI provider
                <select
                  className="field mt-1"
                  value={settings.aiProvider}
                  onChange={(event) => updateSettings({ aiProvider: event.target.value as AppSettings["aiProvider"] })}
                >
                  <option value="mock">Mock</option>
                  <option value="openai">OpenAI</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Model name
                <input
                  className="field mt-1"
                  value={settings.modelName}
                  onChange={(event) => updateSettings({ modelName: event.target.value })}
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Default template
                <input
                  className="field mt-1"
                  value={settings.defaultTemplateId}
                  onChange={(event) => updateSettings({ defaultTemplateId: event.target.value })}
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Default export directory
                <input
                  className="field mt-1"
                  value={settings.defaultExportDirectory}
                  onChange={(event) => updateSettings({ defaultExportDirectory: event.target.value })}
                />
              </label>
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <div className="panel p-5">
            <h3 className="text-lg font-semibold text-slate-950">OpenAI API key</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Stored in macOS Keychain as {AI_CONFIG.serviceName} / {AI_CONFIG.keychainAccount}. The
              saved full key is never returned to the frontend.
            </p>
            <div className="mt-4 flex gap-2">
              <button className="button" type="button" onClick={() => void refreshKeyStatus()}>
                <KeyRound size={15} aria-hidden="true" />
                Status
              </button>
              <button
                className="button"
                type="button"
                onClick={async () => {
                  await invoke("test_openai_key");
                  await refreshKeyStatus();
                }}
              >
                Test
              </button>
              <button
                className="button button-danger"
                type="button"
                onClick={async () => {
                  await invoke("delete_openai_key");
                  setKeyValue("");
                  await refreshKeyStatus();
                }}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
            <input
              className="field mt-4"
              value={keyValue}
              type="password"
              placeholder="sk-..."
              onChange={(event) => setKeyValue(event.target.value)}
            />
            <button
              className="button button-primary mt-3 w-full"
              type="button"
              disabled={!keyValue.trim()}
              onClick={async () => {
                await invoke("set_openai_key", { key: keyValue });
                setKeyStatus({ exists: true, source: "keychain", maskedSuffix: keyValue.slice(-4) });
                setKeyValue("");
              }}
            >
              Save or replace key
            </button>
            {keyStatus ? (
              <p className="mt-3 text-sm font-semibold text-slate-700">
                Status: {keyStatus.exists ? `available via ${keyStatus.source}` : "missing"}
                {keyStatus.maskedSuffix ? `, ending ${keyStatus.maskedSuffix}` : ""}
              </p>
            ) : null}
          </div>

          <div className="panel p-5">
            <h3 className="text-lg font-semibold text-slate-950">Backup and reset</h3>
            <div className="mt-4 grid gap-2">
              <button
                className="button"
                type="button"
                onClick={async () => {
                  try {
                    const payload = await repository.exportBackup();
                    const path = await save({
                      defaultPath: `careercompiler-backup-${new Date().toISOString().slice(0, 10)}.json`,
                      filters: [{ name: "JSON", extensions: ["json"] }],
                    });
                    if (path) {
                      await invoke("write_text_file", { path, text: JSON.stringify(payload, null, 2) });
                    }
                  } catch (caught) {
                    console.error("Backup export failed", caught);
                    setError(caught instanceof Error ? caught.message : String(caught));
                  }
                }}
              >
                <Download size={15} aria-hidden="true" />
                Export backup
              </button>
              <button
                className="button"
                type="button"
                onClick={async () => {
                  try {
                    const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
                    if (typeof path === "string") {
                      const text = await invoke<string>("read_text_file", { path });
                      await repository.importBackup(JSON.parse(text) as BackupPayload);
                      queryClient.invalidateQueries();
                    }
                  } catch (caught) {
                    console.error("Backup import failed", caught);
                    setError(caught instanceof Error ? caught.message : String(caught));
                  }
                }}
              >
                <Upload size={15} aria-hidden="true" />
                Import backup
              </button>
              <button
                className="button button-danger"
                type="button"
                onClick={() => {
                  if (window.confirm("Reset sample data? This replaces local seeded records.")) {
                    resetSeed.mutate();
                  }
                }}
              >
                Reset sample data
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
