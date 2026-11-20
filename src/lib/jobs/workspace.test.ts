import { describe, expect, it } from "vitest";
import { createSampleWorkspace } from "./sampleWorkspace";
import { filterWorkspaceJobs, jobFit, jobNextAction, jobSalary, safeJobUrl } from "./workspace";
import { parseCareerBoard } from "./sources";
import { selectWorkspaceResume } from "./applicationWorkspace";

describe("job workspace decisions", () => {
  it("filters by saved state, work arrangement, and search terms", async () => {
    const repo = await createSampleWorkspace();
    const jobs = await repo.listJobs();
    const matches = await repo.listJobMatches();
    const result = filterWorkspaceJobs(jobs, matches, { view: "all", search: "studio engineer", workplace: "remote", sort: "fit" });
    expect(result).toHaveLength(1);
    expect(result[0].company).toBe("Example Studio");
    expect(filterWorkspaceJobs(jobs, matches, { view: "saved", search: "", workplace: "", sort: "fit" })).toHaveLength(0);
    await repo.saveJob({ ...result[0], status: "saved" });
    expect(filterWorkspaceJobs(await repo.listJobs(), matches, { view: "saved", search: "", workplace: "", sort: "fit" })).toHaveLength(1);
  });

  it("uses local scores when AI output is stale and leaves unscored jobs unscored", async () => {
    const repo = await createSampleWorkspace();
    const job = (await repo.listJobs())[0];
    const match = (await repo.listJobMatches()).find((item) => item.jobId === job.id)!;
    const stale = { ...match, combinedScore: 99, deterministicScore: 45, strengths: ["Old AI claim"], analysisJson: { schemaVersion: "careercompiler-job-match-audit-v1", state: "stale" } };
    expect(jobFit(stale, job)).toMatchObject({ score: 45, strengths: [], aiValidated: false });
    expect(jobFit(undefined).score).toBeNull();
  });

  it("does not infer application readiness from a master resume or an unexported draft", async () => {
    const repo = await createSampleWorkspace();
    const job = (await repo.listJobs())[0];
    const resume = (await repo.listResumeVersions())[0];
    expect(jobNextAction(job, [{ ...resume, kind: "master", jobId: job.id }], [], []).label).toBe("Prepare resume");
    expect(jobNextAction(job, [{ ...resume, jobId: job.id }], [], []).label).toBe("Review resume");
    expect(jobNextAction(job, [{ ...resume, jobId: job.id, lastExportPath: "/test/sample.pdf", validationJson: [] }], [], []).label).toBe("Prepare application");
  });

  it("rolls back package creation when a resume does not belong to the job", async () => {
    const repo = await createSampleWorkspace();
    const jobs = await repo.listJobs();
    const resume = (await repo.listResumeVersions())[0];
    const other = jobs.find((job) => job.id !== resume.jobId)!;
    await expect(selectWorkspaceResume(repo, other.id, resume.id)).rejects.toThrow("Select a resume for this job");
    expect(await repo.listApplicationPackages()).toHaveLength(0);
  });

  it("preserves submitted applications when changing a package", async () => {
    const repo = await createSampleWorkspace();
    const resume = (await repo.listResumeVersions())[0];
    const application = await repo.saveApplication({ jobId: resume.jobId, company: "Example Cloud", role: "Frontend Engineer", status: "applied", resumeVersionId: resume.id });
    await expect(selectWorkspaceResume(repo, resume.jobId, resume.id)).rejects.toThrow("Preserve the submitted application");
    expect(await repo.getApplication(application.id)).toEqual(application);
    expect(await repo.listApplicationPackages()).toHaveLength(0);
  });
});

describe("career board input", () => {
  it("identifies supported boards and strips job paths and tracking parameters", () => {
    expect(parseCareerBoard("https://jobs.ashbyhq.com/example/123?utm=sample")).toEqual({ sourceType: "ashby", sourceIdentifier: "example", careersUrl: "https://jobs.ashbyhq.com/example" });
    expect(parseCareerBoard("https://job-boards.greenhouse.io/example").sourceType).toBe("greenhouse");
    expect(parseCareerBoard("https://jobs.lever.co/example").sourceType).toBe("lever");
  });
  it("rejects arbitrary hosts, non-HTTPS URLs, embedded credentials, and malformed identifiers", () => {
    for (const value of ["http://jobs.lever.co/example", "https://jobs.lever.co.evil.test/example", "https://user:pass@jobs.lever.co/example", "https://jobs.ashbyhq.com/%2e%2e", "https://jobs.lever.co/", "javascript:alert(1)"]) expect(() => parseCareerBoard(value)).toThrow();
  });
  it("never opens an executable job URL", async () => {
    const repo = await createSampleWorkspace();
    const job = (await repo.listJobs())[0];
    expect(safeJobUrl({ ...job, applicationUrl: "javascript:alert(1)" })).toBe("");
  });
});

it("keeps the sample workspace separate from persisted career records and the editor draft", async () => {
  localStorage.setItem("careercompiler-dev", "existing-records");
  localStorage.setItem("careercompiler-resume-draft-v3", "existing-draft");
  const repository = await createSampleWorkspace();
  expect((await repository.listJobs()).length).toBe(3);
  expect(localStorage.getItem("careercompiler-dev")).toBe("existing-records");
  expect(localStorage.getItem("careercompiler-resume-draft-v3")).toBe("existing-draft");
});

it("does not invent a currency when only compensation numbers are supplied",async()=>{const repo=await createSampleWorkspace();const job=(await repo.listJobs())[0];expect(jobSalary({...job,salaryMin:100,salaryMax:null,salaryCurrency:""})).toContain("Currency not provided");});
