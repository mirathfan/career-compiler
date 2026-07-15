import { createContext, useContext } from "react";
import type { AppRepository } from "./repository";

export interface RepositoryContextValue {
  repository: AppRepository | null;
  error: string | null;
  ready: boolean;
}

export const RepositoryContext = createContext<RepositoryContextValue>({
  repository: null,
  error: null,
  ready: false,
});

export function useRepository() {
  const context = useContext(RepositoryContext);
  if (context.error) throw new Error(context.error);
  if (!context.repository) throw new Promise((resolve) => setTimeout(resolve, 25));
  return context.repository;
}

export function useRepositoryStatus() {
  return useContext(RepositoryContext);
}
