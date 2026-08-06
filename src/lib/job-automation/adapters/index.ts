import type { JobSourceType } from "../../../types/domain";
import type { JobSourceAdapter } from "../types";
import { AshbyAdapter } from "./ashby";
import { GreenhouseAdapter } from "./greenhouse";
import { LeverAdapter } from "./lever";

const adapters: Partial<Record<JobSourceType, JobSourceAdapter>> = {
  ashby: new AshbyAdapter(),
  greenhouse: new GreenhouseAdapter(),
  lever: new LeverAdapter(),
};

export function adapterForSource(type: JobSourceType) {
  return adapters[type] ?? null;
}

export { AshbyAdapter, GreenhouseAdapter, LeverAdapter };
