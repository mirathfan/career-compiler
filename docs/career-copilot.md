# Career Copilot

Career Copilot is the local-first assistant route at `#/copilot`. It persists conversations in `career_copilot_threads` and `career_copilot_messages`, stores tool calls, internal citations, and pending write actions, and answers from repository records rather than free-form memory.

The current assistant path is deterministic and offline. It uses repository read tools for application history, resume comparison, resume-base recommendations, career-memory search, and grounded application-answer drafting. The prompt contract in `src/lib/ai/prompts.ts` is versioned for a future OpenAI agent path, but write operations still remain pending proposals until the user confirms them in the UI.

Copilot can be opened globally from the sidebar or with context query params such as `contextType=application&contextId=...`, `contextType=resume&contextId=...`, and `contextType=job&contextId=...`.

Write safety:

- Read tools may run immediately.
- Write tools create `CareerCopilotPendingAction` objects.
- Confirm applies the action transactionally through the repository.
- Cancel updates only the saved pending-action status.
- Unsupported or stale actions fail without mutating SQLite.

Limitations:

- No automated job applications.
- No remote web/company facts.
- OpenAI agent streaming is not enabled yet; the route currently uses local deterministic answers.
