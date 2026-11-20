export type RequirementSection="required"|"preferred"|"other";
// Only exact structural headings are metadata. Malformed/mixed lines remain substantive text.
export function requirementHeading(text:string):RequirementSection|undefined {
 const heading=text.trim().replace(/^#{1,6}\s+/,"").replace(/:$/,"").trim();
 if(/^User-reviewed additional constraints \(original requirements retained\)$/i.test(heading))return "required";
 if(/^(required qualifications|minimum qualifications|required skills|requirements)$/i.test(heading))return "required";
 if(/^(preferred qualifications|preferred skills|nice to have)$/i.test(heading))return "preferred";
 if(/^(responsibilities|benefits|qualifications)$/i.test(heading))return "other";
 return undefined;
}
export function requirementClauses(description:string) {
 let section:RequirementSection="other";const result:{text:string;section:RequirementSection}[]=[];
 for(const line of description.split(/\n+/)){
  const heading=requirementHeading(line);if(heading){section=heading;continue;}
  for(const text of line.split(/;|(?<=[.!?])\s+(?=[A-Z])|\s+and\s+(?=must\b)/i).map(s=>s.trim()).filter(Boolean))result.push({text,section});
 }
 return result;
}
export function positiveEquivalence(text:string,kind:"internship"|"project") {
 if(/\b(no|not|never|cannot|excluded|except)\b/i.test(text))return false;
 return kind==="internship"?/\binternships? (?:experience )?(?:count(?:s)? toward|(?:is )?accepted (?:toward|as)) (?:the required )?professional experience\b/i.test(text):/\bproject experience (?:is )?(?:accepted|qualifies)|\bprojects (?:are )?(?:accepted|permitted)\b/i.test(text);
}
export function professionalCategory(value:string) {
 return /^(?:professional(?: (?:software )?(?:engineering|development))?|production (?:software )?engineering|industry(?: software (?:development|engineering))?|commercial(?: software (?:development|engineering))?|full[- ]time professional development)$/i.test(value.trim());
}
