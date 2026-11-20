import type { AppRepository } from "../database/repository";
import { updatePackageResume } from "../job-automation/applicationPackages";

export async function selectWorkspaceResume(repository: AppRepository, jobId: string, resumeVersionId: string) {
  return repository.transaction(async (repo) => {
    const current = (await repo.listApplicationPackages()).find((item) => item.jobId === jobId);
    if (!current) await repo.saveApplicationPackage({ jobId, generationStatus: "not_started", validationStatus: "not_validated" });
    return updatePackageResume(repo, jobId, resumeVersionId);
  });
}
