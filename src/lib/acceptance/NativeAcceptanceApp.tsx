import { useEffect, useState } from "react";
import { runNativeAcceptance, runNativeBudgetProbe, runNativeInterruptionProbe } from "./nativeAcceptance";
import type { AcceptanceEnvironment, AcceptanceResult } from "./nativeAcceptance";

export function NativeAcceptanceApp({ environment }: { environment: AcceptanceEnvironment }) {
  const [results, setResults] = useState<AcceptanceResult[]>([]);
  const [state, setState] = useState("Running synthetic native acceptance…");
  useEffect(() => {
    if (environment.interruptProbe) {
      void runNativeInterruptionProbe(environment).catch((error: unknown) => setState(`FAIL: ${String(error)}`));
      return;
    }
    if (environment.budgetProbe) {
      void runNativeBudgetProbe(environment).then((report) => setState(`Budget probe completed: ${JSON.stringify(report)}`)).catch((error: unknown) => setState(`FAIL: ${String(error)}`));
      return;
    }
    void runNativeAcceptance(environment, (result) => setResults((previous) => [...previous, result]))
      .then((report) => setState(report.results.every((result) => result.status === "PASS") ? "PASS — native acceptance completed" : "FAIL — inspect acceptance artifacts"))
      .catch((error: unknown) => setState(`BLOCKED: ${String(error)}`));
  }, [environment]);
  return <main style={{ padding: 32 }}><h1>CareerCompiler — isolated synthetic acceptance</h1><p>{state}</p><p>Database: {environment.databaseUrl}</p><p>Live APIs, discovery, notifications and extension IPC disabled.</p><ol>{results.map((result) => <li key={result.scenario}><strong>{result.status}: {result.scenario}</strong><p>{result.detail}</p></li>)}</ol></main>;
}
