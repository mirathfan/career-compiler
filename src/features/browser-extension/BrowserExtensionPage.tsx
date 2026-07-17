import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle2,
  Clipboard,
  ExternalLink,
  KeyRound,
  Plug,
  RefreshCcw,
  ShieldCheck,
  TestTube2,
  Trash2,
} from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { AlertBanner, Badge, PageSection, ProgressChecklist } from "../../components/ui";

interface DiagnosticEvent {
  atMs: number;
  level: string;
  code: string;
  message: string;
}

interface ExtensionBridgeStatus {
  nativeHostName: string;
  protocolVersion: number;
  appSupportDir: string;
  socketPath: string;
  manifestPath: string;
  installedHostPath: string;
  manifestExists: boolean;
  manifestValid: boolean;
  hostBinaryExists: boolean;
  hostBinaryExecutable: boolean;
  configuredExtensionIds: string[];
  pairedExtensionId: string;
  setupState: string;
  pingOk: boolean;
  pingError: string;
  diagnostics: DiagnosticEvent[];
}

interface PairingCodeResult {
  pairingCode: string;
  expiresAtMs: number;
}

const extensionIdPattern = /^[a-p]{32}$/;

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("|") ? message.split("|").slice(1).join("|") : message;
}

function stateLabel(state: string) {
  return state.replaceAll("_", " ");
}

function statusTone(status: ExtensionBridgeStatus | null) {
  if (!status) return "border-slate-200 bg-slate-50 text-slate-700";
  if (status.setupState === "paired_and_connected" && status.pingOk) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status.setupState === "registered_but_not_paired") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status.setupState.includes("registered")) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function BrowserExtensionPage() {
  const [extensionId, setExtensionId] = useState(() => localStorage.getItem("careercompiler-extension-id") ?? "");
  const [status, setStatus] = useState<ExtensionBridgeStatus | null>(null);
  const [pairing, setPairing] = useState<PairingCodeResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const extensionIdValid = extensionIdPattern.test(extensionId);
  const runtimeAvailable = isTauriRuntime();
  const statusItems = useMemo(() => [
    { label: "Manifest", ok: Boolean(status?.manifestExists && status.manifestValid) },
    { label: "Host binary", ok: Boolean(status?.hostBinaryExists && status.hostBinaryExecutable) },
    { label: "Extension ID", ok: extensionIdValid },
    { label: "Ping", ok: Boolean(status?.pingOk) },
    { label: "Paired", ok: Boolean(status?.pairedExtensionId) },
  ], [extensionIdValid, status]);

  const loadStatus = useCallback(async () => {
    if (!runtimeAvailable) return;
    const next = await invoke<ExtensionBridgeStatus>("extension_get_status", {
      extensionId: extensionIdValid ? extensionId : null,
    });
    setStatus(next);
  }, [extensionId, extensionIdValid, runtimeAvailable]);

  useEffect(() => {
    if (extensionId) localStorage.setItem("careercompiler-extension-id", extensionId);
  }, [extensionId]);

  useEffect(() => {
    void loadStatus().catch((error) => setMessage(friendlyError(error)));
    const interval = window.setInterval(() => {
      void loadStatus().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loadStatus]);

  const runAction = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setMessage("");
    try {
      await action();
      await loadStatus();
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Autofill bridge"
        title="Browser Extension"
        description="Pair the Chrome extension with this local desktop app, verify each setup step, and keep final submission manual."
        meta={
          <>
            <Badge tone={runtimeAvailable ? "emerald" : "amber"}>{runtimeAvailable ? "desktop runtime" : "browser preview"}</Badge>
            <Badge tone={extensionIdValid ? "emerald" : "amber"}>{extensionIdValid ? "extension ID valid" : "extension ID needed"}</Badge>
            <Badge tone={status?.pingOk ? "emerald" : "amber"}>{status?.pingOk ? "connected" : "not connected"}</Badge>
          </>
        }
      />
      <div className="page-body space-y-5">
        <section className={`rounded-md border p-5 ${statusTone(status)}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em]">Extension status</p>
              <h3 className="mt-1 text-xl font-semibold capitalize">{status ? stateLabel(status.setupState) : "Not checked"}</h3>
              <p className="mt-1 text-sm">
                {status?.pingError || message || (runtimeAvailable ? "CareerCompiler will verify each setup step." : "Open this screen in the Tauri app to manage native messaging.")}
              </p>
            </div>
            <button className="button" type="button" disabled={!runtimeAvailable || busy === "refresh"} onClick={() => runAction("refresh", loadStatus)}>
              <RefreshCcw size={15} />
              Refresh
            </button>
          </div>
          <div className="mt-4">
            <ProgressChecklist
              items={statusItems.map((item) => ({
                label: item.label,
                detail: item.ok ? "Verified by CareerCompiler." : "Complete or retry this step.",
                complete: item.ok,
                warning: true,
              }))}
            />
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <PageSection
            title="Guided setup"
            description="Complete these steps in order. Success is based on verification state, not just clicking a button."
          >
            <div className="flex items-center gap-2">
              <Plug size={18} aria-hidden="true" />
              <h4 className="font-semibold text-slate-950">Connect Chrome to CareerCompiler</h4>
            </div>
            <AlertBanner tone="blue" title="Autofill is assistive only">
              The extension can prepare fields for review, but you remain responsible for final submission.
            </AlertBanner>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-semibold text-slate-700">
                Chrome extension ID
                <input
                  className="field mt-1 w-full font-mono"
                  value={extensionId}
                  spellCheck={false}
                  placeholder="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                  onChange={(event) => setExtensionId(event.target.value.trim())}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button className="button" type="button" onClick={() => window.open("chrome://extensions", "_blank")}>
                  <ExternalLink size={15} />
                  Open Chrome extensions
                </button>
                <button className="button" type="button" onClick={() => navigator.clipboard.writeText("apps/careercompiler-extension/dist")}>
                  <Clipboard size={15} />
                  Copy extension path
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={!extensionIdValid || busy === "install"}
                  onClick={() => runAction("install", async () => {
                    const next = await invoke<ExtensionBridgeStatus>("extension_install_native_host", { extensionId });
                    setStatus(next);
                  })}
                >
                  <Plug size={15} />
                  Install native host
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={!extensionIdValid || busy === "verify"}
                  onClick={() => runAction("verify", async () => {
                    const next = await invoke<ExtensionBridgeStatus>("extension_verify_native_host", { extensionId });
                    setStatus(next);
                  })}
                >
                  <TestTube2 size={15} />
                  Verify native host
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={!extensionIdValid || busy === "pair"}
                  onClick={() => runAction("pair", async () => {
                    const next = await invoke<PairingCodeResult>("extension_generate_pairing_code", { extensionId });
                    setPairing(next);
                  })}
                >
                  <KeyRound size={15} />
                  Generate pairing code
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={!pairing}
                  onClick={() => pairing && navigator.clipboard.writeText(pairing.pairingCode)}
                >
                  <Clipboard size={15} />
                  Copy pairing code
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={busy === "revoke"}
                  onClick={() => runAction("revoke", async () => {
                    const next = await invoke<ExtensionBridgeStatus>("extension_revoke_extension");
                    setStatus(next);
                  })}
                >
                  <Trash2 size={15} />
                  Revoke extension
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={busy === "reset"}
                  onClick={() => runAction("reset", async () => {
                    const next = await invoke<ExtensionBridgeStatus>("extension_reset_connection");
                    setStatus(next);
                    setPairing(null);
                  })}
                >
                  <RefreshCcw size={15} />
                  Reset connection
                </button>
              </div>
              {pairing ? (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                  <p className="font-semibold">Pairing code</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.18em]">{pairing.pairingCode}</p>
                  <p className="mt-1 text-xs">Expires {new Date(pairing.expiresAtMs).toLocaleTimeString()}.</p>
                </div>
              ) : null}
            </div>
          </PageSection>

          <PageSection title="Setup stages" description="Use this as the recovery path when pairing fails.">
            <ProgressChecklist
              items={[
                { label: "Install or load extension", complete: extensionIdValid, detail: "Load the built extension in Chrome and copy its ID.", warning: true },
                { label: "Register native host", complete: Boolean(status?.manifestExists && status.manifestValid), detail: "Creates Chrome native messaging manifest.", warning: true },
                { label: "Verify host", complete: Boolean(status?.hostBinaryExists && status.hostBinaryExecutable), detail: "Confirms the local bridge executable exists.", warning: true },
                { label: "Pair extension", complete: Boolean(status?.pairedExtensionId), detail: "Uses a short-lived pairing code.", warning: true },
                { label: "Test connection", complete: Boolean(status?.pingOk), detail: status?.pingError || "Ping confirms the extension can reach the desktop app.", warning: true },
              ]}
            />
          </PageSection>

          <details className="panel p-5 xl:col-span-2">
            <summary className="cursor-pointer font-semibold text-slate-950">Advanced diagnostics and paths</summary>
            <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} aria-hidden="true" />
              <h3 className="font-semibold text-slate-950">Verified paths</h3>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-slate-500">Native host</dt>
                <dd className="break-all font-mono text-xs text-slate-700">{status?.installedHostPath || "-"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Chrome manifest</dt>
                <dd className="break-all font-mono text-xs text-slate-700">{status?.manifestPath || "-"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">IPC socket</dt>
                <dd className="break-all font-mono text-xs text-slate-700">{status?.socketPath || "-"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Host name</dt>
                <dd className="font-mono text-xs text-slate-700">{status?.nativeHostName || "com.mirathfan.careercompiler"}</dd>
              </div>
            </dl>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} aria-hidden="true" />
              <h3 className="font-semibold text-slate-950">Autofill test workflow</h3>
            </div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
              <li>Run <code>npm run extension:build</code>.</li>
              <li>Load <code>apps/careercompiler-extension/dist</code> in Chrome.</li>
              <li>Paste the extension ID here and install the native host.</li>
              <li>Generate a pairing code and enter it in the extension popup.</li>
              <li>Open a local fixture from <code>apps/careercompiler-extension/dist/fixtures</code>.</li>
              <li>Scan, fill, review highlights, save edits, and submit manually.</li>
            </ol>
          </div>
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2">
              <TestTube2 size={18} aria-hidden="true" />
              <h3 className="font-semibold text-slate-950">Connection diagnostics</h3>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {(status?.diagnostics ?? []).slice(-6).reverse().map((event) => (
                <div key={`${event.atMs}-${event.code}`} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                  <p className="font-semibold text-slate-800">{event.code}</p>
                  <p className="text-xs text-slate-600">{event.message}</p>
                </div>
              ))}
              {!status?.diagnostics.length ? <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No diagnostics yet.</p> : null}
            </div>
          </div>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
