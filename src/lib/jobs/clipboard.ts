export interface ParsedClipboardJob {
  company: string;
  roleTitle: string;
  sourceUrl: string;
  rawDescription: string;
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function parseClipboardJob(text: string): ParsedClipboardJob {
  const rawDescription = text.trim();
  const lines = rawDescription.split(/\r?\n/).map(clean).filter(Boolean);
  let company = "";
  let roleTitle = "";
  let sourceUrl = "";
  for (const line of lines.slice(0, 20)) {
    const companyLabel = line.match(/^company\s*:\s*(.+)$/i);
    const roleLabel = line.match(/^(?:role|job title|position)\s*:\s*(.+)$/i);
    const combined = line.match(/^(.{3,80}?)\s+(?:at|@)\s+(.{2,80})$/i);
    if (companyLabel && !company) company = clean(companyLabel[1]);
    if (roleLabel && !roleTitle) roleTitle = clean(roleLabel[1]);
    if (combined && !roleTitle && !company) {
      roleTitle = clean(combined[1]);
      company = clean(combined[2]);
    }
    const url = line.match(/https?:\/\/\S+/)?.[0];
    if (url && !sourceUrl) sourceUrl = url.replace(/[),.;]+$/, "");
  }
  if (!roleTitle && lines[0] && lines[0].length <= 100) roleTitle = lines[0];
  if (!company && lines[1] && lines[1].length <= 80 && !/^about|overview|description/i.test(lines[1])) {
    company = lines[1];
  }
  return { company, roleTitle, sourceUrl, rawDescription };
}
