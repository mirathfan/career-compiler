export function sanitizeFilenamePart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function defaultResumeFilename(company: string, roleTitle: string) {
  const companyPart = sanitizeFilenamePart(company || "Company");
  const rolePart = sanitizeFilenamePart(roleTitle || "Role");
  return `Mir_Athfan_Ali_${companyPart}_${rolePart}.pdf`;
}
