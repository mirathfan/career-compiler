import { configureIsolatedRuntime } from "./lib/acceptance/runtime";
import { configureAppRepository } from "./lib/database/appRepository";
import { invoke } from "@tauri-apps/api/core";
import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RepositoryProvider } from "./lib/database/RepositoryProvider";
import { initializeWindowState } from "./lib/desktop/windowState";


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

async function start() {
  if ("__TAURI_INTERNALS__" in window) {
    const environment = await invoke<import("./lib/acceptance/nativeAcceptance").AcceptanceEnvironment | null>("acceptance_environment");
    if (environment?.bridgeMode) {
      const { NativeBridgeAcceptanceApp } = await import("./lib/acceptance/NativeBridgeAcceptanceApp");
      createRoot(document.getElementById("root")!).render(<NativeBridgeAcceptanceApp environment={environment} />);
      return;
    } else if (environment?.uiMode) {
      document.getElementById("root")!.textContent = "Opening isolated CareerCompiler UI…";
      await invoke("acceptance_artifact", { name: "ui-startup.json", bytes: Array.from(new TextEncoder().encode(JSON.stringify({ stage: "policy_verified", processId: environment.processId }))) });
      configureIsolatedRuntime();
      const { openIsolatedRepository } = await import("./lib/acceptance/nativeAcceptance");
      const opened = await openIsolatedRepository(environment);
      if (environment.jobsFeed) {
        const { populateFitFixtures } = await import("./lib/jobs/fitFixtures");
        const { loadFitFeed, filterFitFeed } = await import("./lib/jobs/fitFeed");
        const started = performance.now();
        if (!(await opened.repository.getJob("fit-job-0"))) {
          if ((await opened.repository.listJobs()).length || await opened.repository.getProfile()) throw new Error("Use a fresh isolated root for Jobs feed fixtures.");
          await opened.repository.transaction(repo => populateFitFixtures(repo));
        }
        const rows = await loadFitFeed(opened.repository);
        await invoke("acceptance_artifact", { name: "jobs-feed.json", bytes: Array.from(new TextEncoder().encode(JSON.stringify({ processId: environment.processId, database: opened.paths, fixtures: rows.length, initializationMs: performance.now()-started, recommended: filterFitFeed(rows,"recommended").map(row=>row.job.id), decisions: rows.map(row=>({jobId:row.job.id, eligibility:row.assessment.eligibility, score:row.assessment.score, application:row.application.state})), aiReservations: (await opened.repository.listSafetyRecords("ai_budget")).length }))) });
      }
      configureAppRepository(opened.repository);
      await invoke("acceptance_artifact", { name: "ui-startup.json", bytes: Array.from(new TextEncoder().encode(JSON.stringify({ stage: "repository_verified", processId: environment.processId, paths: opened.paths, windowGeometry: environment.windowGeometry }))) });
    } else if (environment) {
      const { NativeAcceptanceApp } = await import("./lib/acceptance/NativeAcceptanceApp");
      createRoot(document.getElementById("root")!).render(<NativeAcceptanceApp environment={environment} />);
      return;
    }
  }
  void initializeWindowState();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <RepositoryProvider>
            <Suspense
              fallback={
                <div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-semibold text-slate-600">
                  Opening CareerCompiler...
                </div>
              }
            >
              <App />
            </Suspense>
          </RepositoryProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );

}
void start().catch((error: unknown) => {
  document.getElementById("root")!.textContent = `Startup blocked: ${error instanceof Error ? error.message : String(error)}`;
});
