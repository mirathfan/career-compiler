import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RepositoryProvider } from "./lib/database/RepositoryProvider";
import { initializeWindowState } from "./lib/desktop/windowState";

void initializeWindowState();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

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
