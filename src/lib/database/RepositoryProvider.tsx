import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createAppRepository } from "./appRepository";
import type { AppRepository } from "./repository";
import { RepositoryContext } from "./repositoryContext";

export function RepositoryProvider({ children }: { children: ReactNode }) {
  const [repository, setRepository] = useState<AppRepository | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    createAppRepository()
      .then((repo) => {
        if (alive) setRepository(repo);
      })
      .catch((caught: unknown) => {
        console.error("Failed to initialize repository", caught);
        if (alive) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo(
    () => ({ repository, error, ready: Boolean(repository) && !error }),
    [repository, error],
  );
  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>;
}
