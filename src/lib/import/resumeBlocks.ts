// Local, bounded reconstruction. This is evidence transcription, not a claim verifier.
export interface ResumeLine {
    text: string;
    originalText: string;
    page: number;
    line: number;
    boundary: boolean;
}
export interface ResumeBlock {
    type: "project" | "employment" | "education";
    headers: ResumeLine[];
    bullets: ResumeLine[][];
}
export const bulletText = (s: string) => s.match(/^(?:[-•*]|\d+[.)])\s+(.+)$/)?.[1];
export const compactText = (s: string) => s.replace(/\s+/g, " ").trim();
const datePart = "(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\s+)?(?:19|20)\\d{2}(?:-\\d{2}(?:-\\d{2})?)?";
const dates = new RegExp(`\\s+(${datePart})(?:\\s*[–—-]\\s*(${datePart}|Present|Current|Ongoing))?\\s*$`, "i");
export function takeDates(text: string) {
    const match = text.match(dates);
    return { text: match ? text.slice(0, match.index).trim() : text, startDate: match?.[1] ?? "", endDate: match?.[2] ?? "", isCurrent: /^(Present|Current|Ongoing)$/i.test(match?.[2] ?? "") };
}
export function resumeLines(text: string): ResumeLine[] {
    const lines: ResumeLine[] = [];
    for (const [page, content] of text.split("\f").entries()) {
        let boundary = false;
        content.split(/\r?\n/).forEach((raw, line) => {
            if (!raw.trim()) {
                boundary = true;
                return;
            }
            lines.push({ text: raw.trim(), originalText: raw.trim(), page: page + 1, line: line + 1, boundary });
            boundary = false;
        });
    }
    return lines;
}
export function sectionType(text: string) {
    const heading = text.replace(/:$/, "").toLowerCase();
    if (/^(projects|selected projects)$/.test(heading))
        return "project";
    if (/^(experience|work experience|professional experience|employment)$/.test(heading))
        return "employment";
    if (heading === "education")
        return "education";
    if (/^(skills|technical skills)$/.test(heading))
        return "skills";
    if (/^(summary|contact|certifications|awards|interests)$/.test(heading))
        return "other";
    return undefined;
}
export function looksLikeHeader(line: ResumeLine, next?: ResumeLine) {
    const text = line.text;
    if (bulletText(text))
        return false;
    if (takeDates(text).startDate || /\s[|—]\s/.test(text))
        return true;
    // A short title followed by a bullet is a common plain-text/DOCX boundary.
    // Sentences, metric fragments and lower-case continuations are not titles.
    return text.length < 120 && !/[.!?,;:]$/.test(text) && /^[A-Z]/.test(text) &&
        (!!next && !!bulletText(next.text) || line.boundary && /(?:Project|Platform|Lab|Tool|Pipeline|University|Institute|College)\b/.test(text));
}
export function splitSkillList(value: string): string[] {
    const parts: string[] = [];
    let depth = 0, start = 0;
    for (let i = 0; i < value.length; i++) {
        if (value[i] === "(" || value[i] === "[")
            depth++;
        if (value[i] === ")" || value[i] === "]")
            depth = Math.max(0, depth - 1);
        if (!depth && /[,|;]/.test(value[i])) {
            parts.push(value.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(value.slice(start).trim());
    return parts.filter(Boolean);
}
export function mentionsSkill(statement: string, skill: string) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(statement);
}
