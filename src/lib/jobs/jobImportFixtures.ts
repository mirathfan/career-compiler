// Exact, explicitly synthetic mappings. Never a hostname-wide fallback or network resolver.
export const IMPORT_FIXTURE_JD = `Company: Compiler Sample Labs
Title: Software Engineer
Location: Seattle, WA
Requisition: import-001
Compensation: USD 90000–120000 yearly
Responsibilities:
Build accessible React and TypeScript interfaces with tested Python APIs.
Required qualifications:
Bachelor's degree in Computer Science required.
Current work authorization in the United States required.
Sponsorship is available.
Entry-level engineers are welcome.
Graduation date between 2026-05-01 and 2027-08-31.
Remote within United States.
Preferred qualifications:
Experience with Python preferred.`;
export const importFixtures = [
 {id:"greenhouse",label:"Synthetic Greenhouse response",url:"https://job-boards.greenhouse.io/cc-synthetic/jobs/import-001"},
 {id:"lever",label:"Synthetic Lever response",url:"https://jobs.lever.co/cc-synthetic/import-002"},
 {id:"ashby",label:"Synthetic Ashby response",url:"https://jobs.ashbyhq.com/cc-synthetic/import-003"},
 {id:"employer",label:"Synthetic employer text",url:"https://careers.cc-synthetic.example/jobs/import-004"},
] as const;
export type ImportFixtureId = typeof importFixtures[number]["id"];
