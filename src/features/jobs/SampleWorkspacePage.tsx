import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { createSampleWorkspace } from "../../lib/jobs/sampleWorkspace";
import type { AppRepository } from "../../lib/database/repository";
import { RepositoryContext } from "../../lib/database/repositoryContext";
import { JobsPage } from "./JobsPage";
import { InlineError, LoadingState } from "../../components/States";

export function SampleWorkspacePage() {
  const [params] = useSearchParams();
  const full = params.get("scenario") === "fit";
  const [repository, setRepository] = useState<AppRepository | null>(null);
  const [error, setError] = useState("");
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  useEffect(() => { let active = true; createSampleWorkspace(full).then((repo) => { if (active) setRepository(repo); }).catch(() => { if (active) setError("The sample workspace could not be opened."); }); return () => { active = false; client.clear(); }; }, [client, full]);
  return <><div className="sample-banner"><span><strong>Sample workspace</strong> · Fictional jobs and sample career data. Changes stay in this preview.</span><Link to="/jobs"><ArrowLeft size={14} aria-hidden="true" />Return to my jobs</Link></div>{error ? <InlineError message={error} /> : repository ? <QueryClientProvider client={client}><RepositoryContext.Provider value={{ repository, ready: true, error: null }}><JobsPage sample /></RepositoryContext.Provider></QueryClientProvider> : <LoadingState label="Preparing a sample workspace…" />}</>;
}
