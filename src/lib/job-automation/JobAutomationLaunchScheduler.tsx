import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRepositoryStatus } from "../database/repositoryContext";
import { runJobAutomation } from "./runner";
import { shouldRunOnLaunch } from "./scheduling";

export function JobAutomationLaunchScheduler() {
  const { repository } = useRepositoryStatus();
  const queryClient = useQueryClient();
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || !repository) return;
    checked.current = true;
    void Promise.all([
      repository.getJobSearchPreferences(),
      repository.listJobSources(),
      repository.listJobAutomationRuns(),
    ]).then(async ([preferences, sources, runs]) => {
      if (!shouldRunOnLaunch(preferences, sources, runs)) return;
      await runJobAutomation(repository);
      await queryClient.invalidateQueries();
    }).catch((caught: unknown) => {
      console.warn("Scheduled job search did not complete", caught instanceof Error ? caught.message : String(caught));
    });
  }, [queryClient, repository]);
  return null;
}
