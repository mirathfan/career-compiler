import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { openIsolatedRepository, runNativeAcceptance, type AcceptanceEnvironment } from "./nativeAcceptance";
import { updatePackageResume } from "../job-automation/applicationPackages";
import { handleExtensionRequest } from "../extension/requestProcessor";
import { extensionError, type ExtensionRequest } from "../extension/protocol";
import { configureIsolatedRuntime } from "./runtime";

export function NativeBridgeAcceptanceApp({ environment }: { environment: AcceptanceEnvironment }) {
  const [status, setStatus] = useState("Preparing synthetic test bridge…");
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      configureIsolatedRuntime();
      const { repository, paths } = await openIsolatedRepository(environment);
      if (!(await repository.getResumeVersion("resume-b"))) {
        const baseline = await runNativeAcceptance(environment, () => {});
        if (baseline.results.some((result) => result.status !== "PASS")) throw new Error("Baseline acceptance failed");
      }
      const template = await repository.getResumeVersion("resume-b");
      if (!template) throw new Error("Synthetic resume missing");
      for (const name of ["greenhouse", "lever", "ashby", "multi-step", "dynamic"]) {
        if (await repository.getJob(`local-${name}`)) continue; // Never restore a revoked approval on restart.
        const job = await repository.saveJob({ id: `local-${name}`, company: `Synthetic ${name}`, roleTitle: "Software Engineer", sourceUrl: `http://127.0.0.1:5297/${name}.html`, applicationUrl: `http://127.0.0.1:5297/${name}.html`, rawDescription: "Synthetic React role", descriptionText: "Synthetic React role" });
        const resume = await repository.saveResumeVersion({ ...template, id: `local-resume-${name}`, jobId: job.id });
        await repository.saveApplicationPackage({ jobId: job.id });
        await updatePackageResume(repository, job.id, resume.id, true);
      }
      let queue = Promise.resolve();
      const tick = async () => {
        if (cancelled) return;
        const raw = await invoke<string | null>("acceptance_bridge_next");
        if (!raw) return;
        const request = JSON.parse(raw) as ExtensionRequest;
        let response;
        try { response = await handleExtensionRequest({ repository, request, authorizeResumeFile: (input) => invoke("acceptance_resume_file", { path: input.path, expectedDigest: input.expectedDigest }) }); }
        catch { response = extensionError(request.requestId, "synthetic_processor_failed", "Synthetic request rejected", false); }
        await invoke("acceptance_bridge_complete", { id: request.requestId, response: JSON.stringify(response) });
      };
      unlisten = await listen("acceptance-extension-request", () => { queue = queue.then(tick).catch(() => setStatus("Test IPC request rejected")); });
      await invoke("acceptance_artifact", { name: "bridge-ready.json", bytes: Array.from(new TextEncoder().encode(JSON.stringify({ paths, processId: environment.processId, mode: "synthetic-test-only", credential: "none", ready: true }))) });
      setStatus("READY — test IPC active; no Chrome installation or production capabilities");
      await tick();
    })().catch(() => setStatus("BLOCKED — synthetic bridge startup failed"));
    return () => { cancelled = true; unlisten?.(); };
  }, [environment]);
  return <main><h1>CareerCompiler isolated extension bridge</h1><p>{status}</p><p>{environment.databaseUrl}</p><p>Loopback fixtures only. Providers, discovery, notifications and submission disabled.</p></main>;
}
