import { containsPromptInjectionText } from "./evidenceImport";
import type { CareerImportChange, CareerImportProposal } from "../../types/domain";
import { createId } from "../utils";
import { containsProbableSecret, createDeterministicCareerImportProposal } from "./careerIntake";
import { extractNumericTokens } from "../resume/validation";
import { bulletText, compactText, looksLikeHeader, mentionsSkill, resumeLines, sectionType, splitSkillList, takeDates, type ResumeBlock, type ResumeLine } from "./resumeBlocks";
function sourceLocation(lines: ResumeLine[], source: string) {
    const first = lines[0], last = lines.at(-1)!;
    return /(?:resume-pdf|\.pdf)/i.test(source)
        ? `page=${first.page};lines=${first.line}-${last.line};endPage=${last.page}`
        : `textLines=${first.line}-${last.line}`;
}
function change<T>(targetType: CareerImportChange<T>["targetType"], proposedValue: T, lines: ResumeLine[], source: string): CareerImportChange<T> {
    return { proposalId: createId("proposal"), operation: "add", targetType, existingRecordId: "", confidence: 0.6,
        reason: `Document transcription; review before saving. ${source};${sourceLocation(lines, source)}.`,
        sourceExcerpt: lines.map(x => x.originalText).join("\n"), validationStatus: "pending", validationIssues: [], duplicateCandidates: [], conflictDetails: [], userDecision: "pending", existingValue: null, proposedValue };
}
const role = (s: string) => /\b(engineer|intern|developer|analyst|founder|manager|researcher|consultant)\b/i.test(s);
const institution = (s: string) => /\b(university|institute|college|school)\b/i.test(s);
export function proposeResumeIntake(text: string, sourceReference: string): CareerImportProposal {
    if (text.length > 100000)
        throw new Error("Résumé text exceeds the local review limit.");
    if (containsProbableSecret(text))
        throw new Error("Remove probable secrets before generating import proposals.");
    const result = createDeterministicCareerImportProposal({ text: "", sourceType: "resume_text", sourceTitle: "Imported résumé", sourceReference });
    result.unresolvedQuestions = [];
    result.warnings = ["Document-supported claims are not independently verified. Review grouping, dates, source excerpts and every proposed record before saving."];
    const lines = resumeLines(text), blocks: ResumeBlock[] = [];
    let section: ReturnType<typeof sectionType>, block: ResumeBlock | undefined, bullet: ResumeLine[] | undefined;
    const skillGroups: ResumeLine[][] = [];
    let skillGroup: ResumeLine[] | undefined;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (containsPromptInjectionText(line.text)) {
            result.warnings.push(`Excluded prompt-like text at page ${line.page}, line ${line.line}; review adjacent text for omissions.`);
            bullet = undefined;
            block = undefined;
            skillGroup = undefined;
            continue;
        }
        const heading = sectionType(line.text);
        if (heading) {
            section = heading;
            block = undefined;
            bullet = undefined;
            skillGroup = undefined;
            continue;
        }
        const explicit = line.text.match(/^(Project title|Experience|Education|Skills|Skill tags):\s*(.+)$/i);
        if (explicit) {
            section = /project/i.test(explicit[1]) ? "project" : /experience/i.test(explicit[1]) ? "employment" : /education/i.test(explicit[1]) ? "education" : "skills";
            block = undefined;
            bullet = undefined;
            skillGroup = undefined;
            line.text = explicit[2];
        }
        if (section === "skills") {
            if (!skillGroup || /^[^:]{1,60}:\s*\S/.test(line.text)) {
                skillGroup = [];
                skillGroups.push(skillGroup);
            }
            skillGroup.push(line);
            continue;
        }
        if (!section || section === "other")
            continue;
        if (bulletText(line.text)) {
            if (!block) {
                result.unresolvedQuestions.push(`Unassigned bullet, page ${line.page}, line ${line.line}: ${line.text}`);
                continue;
            }
            bullet = [line];
            block.bullets.push(bullet);
            continue;
        }
        const newEducation = section === "education" && block && institution(line.text) && (takeDates(line.text).startDate || !/^Relevant coursework/i.test(line.text));
        if (bullet && !looksLikeHeader(line, lines[i + 1])) {
            bullet.push(line);
            continue;
        }
        if (!block || bullet || newEducation) {
            block = { type: section, headers: [], bullets: [] };
            blocks.push(block);
            bullet = undefined;
        }
        block.headers.push(line);
    }
    for (const group of skillGroups) {
        const full = compactText(group.map(x => x.text).join(" "));
        const category = full.match(/^([^:]{1,60}):\s*(.*)$/);
        const value = category?.[2] ?? full;
        if ((value.match(/\(/g)?.length ?? 0) !== (value.match(/\)/g)?.length ?? 0))
            result.unresolvedQuestions.push(`Unbalanced skill parentheses: ${full}`);
        for (const name of splitSkillList(value)) {
            if (result.skillChanges.some(x => x.proposedValue.name.toLowerCase() === name.toLowerCase()))
                continue;
            if (result.skillChanges.length >= 120 || name.length > 200) {
                result.unresolvedQuestions.push(`Skill limit reached; not proposed: ${name}`);
                continue;
            }
            result.skillChanges.push(change("skill", { name, category: category?.[1] ?? "Technical", proficiencyNote: "Document-supported; review scope and proficiency.", enabled: true }, group, sourceReference));
        }
    }
    for (const b of blocks) {
        if (result.careerItemChanges.length >= 40) {
            result.unresolvedQuestions.push(`Career item limit reached; not proposed: ${b.headers.map(x => x.text).join(" ")}`);
            continue;
        }
        const dated = takeDates(b.headers[0].text);
        let title = dated.text, organization = "", location = "";
        let metadata = b.headers.slice(1).map(x => x.text);
        // Right-aligned status labels are retained as context, never dates.
        const status = title.match(/\s{2,}(TestFlight beta|Supervised beta|Local benchmark|In development|Coursework|Completed)$/i);
        if (status) {
            title = title.slice(0, status.index).trim();
            metadata.unshift(status[1]);
        }
        const halves = title.split(/\s+[|—]\s+/);
        if (b.type === "employment") {
            if (halves.length === 2) {
                if (role(halves[0]))
                    [title, organization] = halves;
                else
                    [organization, title] = halves;
            }
            else if (metadata[0] && role(metadata[0])) {
                organization = title;
                title = metadata.shift()!;
            }
            else
                result.unresolvedQuestions.push(`Confirm employer and role: ${title}`);
        }
        else if (b.type === "education") {
            if (halves.length === 2) {
                if (institution(halves[0]))
                    [organization, title] = halves;
                else
                    [title, organization] = halves;
            }
            else if (institution(title) && metadata.some(x => /degree|master|bachelor|M\.?A\.?S|B\.?Tech/i.test(x))) {
                organization = title;
                const index = metadata.findIndex(x => /degree|master|bachelor|M\.?A\.?S|B\.?Tech/i.test(x));
                title = metadata.splice(index, 1)[0];
            }
            else
                result.unresolvedQuestions.push(`Confirm institution and qualification: ${title}`);
            const place = title.match(/\s+\(([^)]+,\s*[^)]+)\)$/);
            if (place) {
                location = place[1];
                title = title.slice(0, place.index).trim();
            }
            // Degree/GPA share a line; GPA is retained as documentary context.
            const degree = title.split(/\s+\|\s+/);
            title = degree.shift()!;
            metadata.unshift(...degree);
        }
        else if (title.includes(" | ") && halves.length === 2 && !/github\.com|https?:/i.test(halves[1]))
            [title, organization] = halves;
        if (!dated.startDate)
            result.unresolvedQuestions.push(`Missing dates: ${title}. No dates inferred.`);
        if (dated.isCurrent || /in development|beta/i.test(metadata.join(" ")))
            result.unresolvedQuestions.push(`Time-sensitive status: ${title}; confirm it is still current.`);
        if (/independent|founder/i.test(b.headers.map(x => x.text).join(" ")))
            result.unresolvedQuestions.push(`Independent work: ${title}. Review project versus employment representation; do not double-count across sources.`);
        const item = change("career_item", { type: b.type, title, organization, location, startDate: dated.startDate, endDate: dated.endDate, isCurrent: dated.isCurrent, shortDescription: metadata.join("\n"), url: "", repositoryUrl: "", enabled: true }, b.headers, sourceReference);
        result.careerItemChanges.push(item);
        for (const rows of b.bullets) {
            const statement = compactText([bulletText(rows[0].text), ...rows.slice(1).map(x => x.text)].join(" "));
            if (statement.length > 4000 || result.careerFactChanges.length >= 120) {
                result.unresolvedQuestions.push(`Fact limit reached; complete text requires manual review: ${statement}`);
                continue;
            }
            const fact = change("career_fact", { statement, careerItemId: "", careerItemTitle: title, evidenceStatus: "needs_review" as const, sourceType: "resume" as const, sourceReference: `${sourceReference};${sourceLocation(rows, sourceReference)}`, skillTags: result.skillChanges.map(x => x.proposedValue.name).filter(s => mentionsSkill(statement, s)), roleTags: [], metricTokens: extractNumericTokens(statement), importance: 4, enabled: true }, rows, sourceReference);
            result.careerFactChanges.push(fact);
        }
        if (!b.bullets.length && b.type !== "education")
            result.unresolvedQuestions.push(`No bullet evidence assigned to ${title}; check structure before saving.`);
    }
    const titles = new Map<string, number>();
    for (const item of result.careerItemChanges) {
        const key = item.proposedValue.title.toLowerCase();
        titles.set(key, (titles.get(key) ?? 0) + 1);
    }
    for (const item of result.careerItemChanges) {
        if ((titles.get(item.proposedValue.title.toLowerCase()) ?? 0) > 1) {
            item.validationIssues.push("error: Repeated title has an ambiguous parent identity. Edit distinct titles or resolve the duplicate before saving.");
            result.unresolvedQuestions.push(`Ambiguous parent identity: ${item.proposedValue.title}. No automatic merge performed.`);
        }
    }
    for (const fact of result.careerFactChanges) {
        if ((titles.get((fact.proposedValue.careerItemTitle ?? "").toLowerCase()) ?? 0) > 1)
            fact.validationIssues.push("error: Resolve the repeated parent title before saving this fact.");
    }
    result.unresolvedQuestions.push("Contact details, authorization and job-search preferences are not inferred by this section parser. Review them separately.");
    if (!blocks.length && !skillGroups.length)
        result.unresolvedQuestions.push("No clear sections detected. Use Projects, Experience, Education and Skills headings or add records manually.");
    return result;
}
