import { MemoryRepository } from "./memoryRepository";
import type { AppRepository } from "./repository";
import { SqliteRepository } from "./sqliteRepository";

let repositoryPromise: Promise<AppRepository> | null = null;

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function createAppRepository(): Promise<AppRepository> {
  if (!repositoryPromise) {
    repositoryPromise = (async () => {
      if (isTauriRuntime()) {
        const { default: Database } = await import("@tauri-apps/plugin-sql");
        const db = await Database.load("sqlite:careercompiler.db");
        const repository = new SqliteRepository(db);
        await repository.initialize();
        return repository;
      }
      const repository = new MemoryRepository(undefined, "careercompiler-dev");
      await repository.initialize();
      return repository;
    })();
  }
  return repositoryPromise;
}
