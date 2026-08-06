import type { CitizenshipRequirement, SponsorshipStatus } from "../../types/domain";

export function classifySponsorship(text: string): SponsorshipStatus {
  const value = text.toLowerCase();
  if (/\b(no|not|unable to|cannot|can't|will not)\s+(?:provide|offer)?\s*(?:visa\s+)?sponsor(ship)?\b|\bwithout (?:current or future )?sponsorship\b/.test(value)) {
    return "explicitly_unavailable";
  }
  if (/\b(visa|immigration) sponsorship (?:is )?(?:available|provided|offered)\b|\bwe (?:will|can) sponsor\b/.test(value)) {
    return "explicitly_available";
  }
  if (/\bsponsor(ship)?\b|\bwork authori[sz]ation\b|\bvisa\b/.test(value)) return "unclear";
  return "not_mentioned";
}

export function classifyCitizenshipRequirement(text: string): CitizenshipRequirement {
  const value = text.toLowerCase();
  if (/\b(?:u\.?s\.?|united states) citizens? only\b|\bmust be (?:a )?(?:u\.?s\.?|united states) citizens?\b|\bcitizenship (?:is )?required\b/.test(value)) {
    return "required";
  }
  if (/\bcitizenship (?:is )?not required\b|\bno citizenship requirement\b/.test(value)) return "not_required";
  if (/\bcitizenship\b|\bsecurity clearance\b/.test(value)) return "unclear";
  return "not_mentioned";
}

export function hasSecurityClearanceRequirement(text: string) {
  return /\b(active|current|must (?:have|hold|obtain)|required)\b[^.\n]{0,50}\bsecurity clearance\b|\bsecurity clearance (?:is )?required\b/i.test(text);
}
