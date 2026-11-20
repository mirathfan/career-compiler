import { useQuery } from "@tanstack/react-query";
import { useRepository } from "../../lib/database/repositoryContext";
import { LoadingState } from "../../components/States";
import { estimateResumePageCount } from "../../lib/resume/compaction";
import { validateResumeClaims } from "../../lib/resume/validation";
import { useState } from "react";
import { ResumePreview } from "../tailoring/ResumePreview";
import type { ResumeVersion } from "../../types/domain";

export function SampleResumePanel({ resumes, jobId }: { resumes: ResumeVersion[]; jobId: string }) {
  const repository = useRepository();
  const evidence = useQuery({ queryKey: ["sample-resume-evidence"], queryFn: async () => {
    const [profile, facts, items, skills] = await Promise.all([repository.getProfile(), repository.listCareerFacts(), repository.listCareerItems(), repository.listSkills()]);
    return { profile, facts, items, skills };
  } });
  const example = resumes.find((resume) => resume.jobId === jobId) ?? resumes[0];
  const [resume, setResume] = useState(() => example ? structuredClone(example.contentJson) : null);
  if (evidence.isLoading) return <LoadingState label="Opening sample resume…" />;
  if (evidence.isError) throw evidence.error;
  if (!resume) return <p className="workspace-content">No sample resume is available.</p>;
  const bullets = [...resume.projects, ...resume.experience].flatMap((section) => section.bullets).slice(0, 3);
  return <div className="workspace-content"><div className="workspace-note"><h3>Try reviewing a sample resume</h3><p>These changes affect this preview only. No AI request, file export, or change to your saved draft is made.</p></div><div className="sample-resume-layout"><div><h3>Supporting experience</h3>{bullets.map((bullet) => <div key={bullet.id} className="sample-bullet"><p>{bullet.text}</p><span className="field-hint">{bullet.sourceFactIds.length} source facts · {bullet.included ? "Included" : "Excluded"}</span><button className="button" type="button" onClick={() => setResume((current) => { const next = structuredClone(current!); for (const section of [...next.projects, ...next.experience]) { const found = section.bullets.find((item) => item.id === bullet.id); if (found) found.included = !found.included; } return next; })}>{bullet.included ? "Exclude this bullet" : "Include this bullet"}</button></div>)}</div><ResumePreview resume={resume} validationIssues={evidence.data?.profile ? validateResumeClaims({ resume, ...evidence.data, profile: evidence.data.profile }) : []} pageCount={estimateResumePageCount(resume)} /></div></div>;
}
