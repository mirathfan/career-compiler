# Public Job Source Adapters

Adapters implement `JobSourceAdapter` in `src/lib/job-automation/types.ts`. Each adapter validates the source identifier, fetches a documented public JSON endpoint, validates the payload with Zod, preserves the original payload locally, converts descriptions to normalized plain text, and emits a stable external ID.

## Supported sources

| Source | Identifier | GET endpoint |
| --- | --- | --- |
| Greenhouse | Board token | `https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` |
| Lever | Site name | `https://api.lever.co/v0/postings/{site}?mode=json` |
| Ashby | Job-board name | `https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true` |

The native fetch command accepts only HTTPS and exact approved ATS hosts. It follows at most three redirects, applies a 1–30 second timeout, attempts a request at most twice, limits the body to 5 MB, accepts JSON only, and never supports POST.

Manual URLs intentionally do not use generic extraction. A user can capture a current page with the existing browser extension or save a job description explicitly.

## Adding an adapter

1. Add a source type to the domain and migration check only when necessary.
2. Implement `validateSource`, `fetchJobs`, and `normalizeJob` in `src/lib/job-automation/adapters`.
3. Register it in `adapters/index.ts`.
4. If a new network host is required, add its exact HTTPS host to the Rust allow-list and justify why it is public and unauthenticated.
5. Add local response fixtures for valid, optional-field, malformed-response, HTTP-failure, and normalization cases.
6. Preserve original provider payloads but never log them or execute provider HTML.

Provider references used for the implementation: [Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html), [Lever Postings API](https://github.com/lever/postings-api), and [Ashby Public Job Posting API](https://developers.ashbyhq.com/docs/public-job-posting-api).
