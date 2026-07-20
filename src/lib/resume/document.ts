import type {
  ResumeDocument,
  ResumeDocumentKind,
  ResumeExperienceEntry,
  ResumeProjectEntry,
  ResumeSkillGroup,
  ResumeSourceReference,
  ResumeVersion,
  TailoredResume,
} from "../../types/domain";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function kindValue(value: unknown): ResumeDocumentKind {
  return value === "master" || value === "imported" || value === "tailored" ? value : "tailored";
}

function sourceReferenceType(value: unknown): ResumeSourceReference["type"] {
  return value === "generated_pdf" || value === "text_import" ? value : "uploaded_pdf";
}

function skillGroupsFromFlatSkills(skills: string[]): ResumeSkillGroup[] {
  return skills.length ? [{ id: "skills-primary", name: "Skills", skills }] : [];
}

export function resumeDocumentFromTailoredResume({
  resume,
  id,
  name,
  kind,
  parentResumeId,
  sourceJobId,
  templateId,
  createdAt,
  updatedAt,
}: {
  resume: TailoredResume;
  id: string;
  name: string;
  kind: ResumeDocumentKind;
  parentResumeId?: string;
  sourceJobId?: string;
  templateId: string;
  createdAt: string;
  updatedAt: string;
}): ResumeDocument {
  const convertExperience = (entry: TailoredResume["experience"][number]): ResumeExperienceEntry => ({
    id: entry.careerItemId,
    title: entry.title,
    organization: entry.organization,
    location: entry.location,
    startDate: entry.startDate,
    endDate: entry.endDate,
    isCurrent: entry.isCurrent,
    technologies: entry.technologies ?? [],
    bullets: entry.bullets.map((bullet) => ({
      id: bullet.id,
      text: bullet.text,
      sourceFactIds: bullet.sourceFactIds,
      included: bullet.included,
      locked: bullet.locked,
      approved: bullet.approved,
    })),
  });
  const convertProject = (entry: TailoredResume["projects"][number]): ResumeProjectEntry => ({
    ...convertExperience(entry),
    url: entry.url ?? "",
    repositoryUrl: entry.repositoryUrl ?? "",
    technologies: entry.technologies ?? [],
  });

  return {
    id,
    name,
    kind,
    parentResumeId,
    sourceJobId,
    templateId,
    contact: { ...resume.header },
    headline: resume.header.headline,
    summary: resume.summary.join("\n"),
    experience: resume.experience.map(convertExperience),
    projects: resume.projects.map(convertProject),
    education: resume.education,
    skills: skillGroupsFromFlatSkills(resume.skills),
    additionalSections: [],
    sectionOrder: resume.sectionOrder,
    createdAt,
    updatedAt,
  };
}

export function normalizeResumeDocument(value: unknown, fallback: ResumeDocument): ResumeDocument {
  const source = asRecord(value);
  const contact = asRecord(source.contact);
  const normalizeBullets = (bullets: unknown) =>
    (Array.isArray(bullets) ? bullets : []).map((bulletValue) => {
      const bullet = asRecord(bulletValue);
      return {
        id: String(bullet.id ?? ""),
        text: String(bullet.text ?? ""),
        sourceFactIds: stringArray(bullet.sourceFactIds),
        included: bullet.included === undefined ? true : Boolean(bullet.included),
        locked: Boolean(bullet.locked),
        approved: Boolean(bullet.approved),
      };
    });
  const normalizeExperience = (entries: unknown): ResumeExperienceEntry[] =>
    (Array.isArray(entries) ? entries : []).map((entryValue) => {
      const entry = asRecord(entryValue);
      return {
        id: String(entry.id ?? entry.careerItemId ?? ""),
        title: String(entry.title ?? ""),
        organization: String(entry.organization ?? ""),
        location: String(entry.location ?? ""),
        startDate: String(entry.startDate ?? ""),
        endDate: String(entry.endDate ?? ""),
        isCurrent: Boolean(entry.isCurrent),
        technologies: stringArray(entry.technologies),
        bullets: normalizeBullets(entry.bullets),
      };
    });
  const normalizeProjects = (entries: unknown): ResumeProjectEntry[] =>
    normalizeExperience(entries).map((entry, index) => {
      const raw = asRecord(Array.isArray(entries) ? entries[index] : {});
      return {
        ...entry,
        url: String(raw.url ?? ""),
        repositoryUrl: String(raw.repositoryUrl ?? ""),
        technologies: stringArray(raw.technologies ?? entry.technologies),
      };
    });
  const normalizeEducation = (entries: unknown) =>
    (Array.isArray(entries) ? entries : []).map((entryValue) => {
      const entry = asRecord(entryValue);
      return {
        careerItemId: String(entry.careerItemId ?? entry.id ?? ""),
        title: String(entry.title ?? ""),
        organization: String(entry.organization ?? ""),
        location: String(entry.location ?? ""),
        dateLabel: String(entry.dateLabel ?? ""),
      };
    });
  const normalizeSkillGroups = (groups: unknown): ResumeSkillGroup[] =>
    (Array.isArray(groups) ? groups : []).map((groupValue, index) => {
      const group = asRecord(groupValue);
      return {
        id: String(group.id ?? `skill-group-${index + 1}`),
        name: String(group.name ?? "Skills"),
        skills: stringArray(group.skills),
      };
    }).filter((group) => group.skills.length);
  const normalizeSourceReferences = (references: unknown): ResumeSourceReference[] =>
    (Array.isArray(references) ? references : [])
      .map((referenceValue, index) => {
        const reference = asRecord(referenceValue);
        return {
          id: String(reference.id ?? `source-reference-${index + 1}`),
          type: sourceReferenceType(reference.type),
          label: String(reference.label ?? ""),
          path: String(reference.path ?? ""),
          sha256: reference.sha256 ? String(reference.sha256) : undefined,
          capturedAt: String(reference.capturedAt ?? ""),
        };
      })
      .filter((reference) => reference.label && reference.path);

  return {
    id: String(source.id ?? fallback.id),
    name: String(source.name ?? fallback.name),
    kind: kindValue(source.kind ?? fallback.kind),
    parentResumeId: source.parentResumeId ? String(source.parentResumeId) : fallback.parentResumeId,
    sourceJobId: source.sourceJobId ? String(source.sourceJobId) : fallback.sourceJobId,
    templateId: String(source.templateId ?? fallback.templateId),
    contact: {
      fullName: String(contact.fullName ?? fallback.contact.fullName),
      location: String(contact.location ?? fallback.contact.location),
      email: String(contact.email ?? fallback.contact.email),
      phone: String(contact.phone ?? fallback.contact.phone),
      portfolioUrl: String(contact.portfolioUrl ?? fallback.contact.portfolioUrl),
      linkedInUrl: String(contact.linkedInUrl ?? fallback.contact.linkedInUrl),
      githubUrl: String(contact.githubUrl ?? fallback.contact.githubUrl),
      workAuthorizationNote: String(contact.workAuthorizationNote ?? fallback.contact.workAuthorizationNote),
    },
    headline: source.headline === undefined ? fallback.headline : String(source.headline),
    summary: source.summary === undefined ? fallback.summary : String(source.summary),
    experience: normalizeExperience(source.experience).length ? normalizeExperience(source.experience) : fallback.experience,
    projects: normalizeProjects(source.projects).length ? normalizeProjects(source.projects) : fallback.projects,
    education: normalizeEducation(source.education).length ? normalizeEducation(source.education) : fallback.education,
    skills: normalizeSkillGroups(source.skills).length ? normalizeSkillGroups(source.skills) : fallback.skills,
    additionalSections: Array.isArray(source.additionalSections) ? source.additionalSections.map((sectionValue, index) => {
      const section = asRecord(sectionValue);
      return {
        id: String(section.id ?? `section-${index + 1}`),
        title: String(section.title ?? ""),
        content: stringArray(section.content),
      };
    }) : fallback.additionalSections,
    sourceReferences: normalizeSourceReferences(source.sourceReferences).length
      ? normalizeSourceReferences(source.sourceReferences)
      : fallback.sourceReferences,
    sectionOrder: stringArray(source.sectionOrder).length ? stringArray(source.sectionOrder) : fallback.sectionOrder,
    createdAt: String(source.createdAt ?? fallback.createdAt),
    updatedAt: String(source.updatedAt ?? fallback.updatedAt),
  };
}

export function resumeDocumentForVersion(resume: ResumeVersion): ResumeDocument {
  const fallback = resumeDocumentFromTailoredResume({
    resume: resume.contentJson,
    id: resume.id,
    name: resume.name,
    kind: resume.kind,
    parentResumeId: resume.parentResumeVersionId || undefined,
    sourceJobId: resume.jobId || undefined,
    templateId: resume.templateId,
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
  });
  return normalizeResumeDocument(resume.resumeDocumentJson, fallback);
}
