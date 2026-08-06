# Job Search Automation

CareerCompiler can poll configured public Greenhouse, Lever, and Ashby boards, normalize published postings, deduplicate them, apply deterministic eligibility rules, and calculate an explainable local score. No application is submitted by this system.

## Workflow

1. Add an unauthenticated public ATS source in **Job Radar** and test it before saving.
2. Configure target roles, locations, workplace preference, job age, score threshold, exclusions, keywords, skills, and per-run caps.
3. Run a search manually. If automation is explicitly enabled, CareerCompiler also runs once on launch when the last run is overdue.
4. Each source is fetched independently. Malformed jobs and failed sources are recorded without ending the run.
5. Provider ID, canonical URL, exact normalized identity, content hash, and conservative repost similarity are checked in that order. Duplicate reasons are stored.
6. Eligibility rules run before scoring or any future AI call. Closed, previously applied/rejected, excluded, ineligible, or too-old jobs are filtered locally.
7. Eligible jobs are scored out of 100: title/seniority 25, skills 25, experience 20, location/workplace 10, project/evidence relevance 10, and recency 10.
8. Strong jobs appear in **Match Inbox**. Resume generation links into the existing evidence-grounded Tailor Resume flow.
9. **Application Queue** requires a selected exported resume with no blocking validation errors before package approval. Approval creates or updates an existing application-tracker draft.
10. The browser extension can fill an approved package and upload its authorized PDF, but stops before final submission. Opening a page never marks a job applied.

## AI boundary

The shipped automation runner is deterministic and does not make paid AI calls. A versioned structured match-analysis schema is available for a future explicitly approved enhancement. Its evidence IDs must pass a local allow-list, and the intended combined formula is 70% deterministic plus 30% validated AI. AI must never receive answer-vault values by default or replace deterministic hard filters.

## Scheduling and limits

The default interval is 24 hours. Runs never overlap, use configured job/resume caps, and retry a provider request at most once by default. Desktop scheduling works only when CareerCompiler is open; launch catch-up does not make the Mac app a background/cloud service. `src/lib/job-automation/runner.ts` is independent of React so a future local daemon or cloud worker can reuse it with another repository and transport.

## Notifications

Run summaries group high matches, source failures, and prepared packages. The current UI shows these grouped in Job Radar. Native macOS notification delivery is intentionally deferred so notification permissions cannot make discovery unreliable.

## Known limitations

- Manual URL and email-import source types are represented in the schema but are saved through existing explicit/manual job capture; there is no generic scraper.
- AI match enhancement and automatic resume preparation are not enabled. Resume generation remains an explicit Tailor Resume action.
- CareerCompiler cannot detect a job closing between polls unless a provider omits it in a later run; closed-post reconciliation is a future milestone.
- The application queue supports the existing extension architecture rather than submitting through ATS APIs.
