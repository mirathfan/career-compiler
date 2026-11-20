# Selected-job model Q&A increment

## Delivered and scope

Copilot now has an opt-in “Ask AI about this job” panel for an explicitly selected saved job. A person can ask natural-language questions and follow-up questions without deterministic intent commands. In OpenAI mode, the existing OpenAIProvider invokes the native `run_openai_structured` command with `career_copilot` request type and a new strict response schema. This is a real runtime provider path, tested with a mocked native transport, not a placeholder. In mock mode it is explicitly labeled a fixed-field offline demo with no model reasoning.

The model selects relevant verbatim excerpts from the supplied job fields, or returns insufficient evidence. Local validation rejects unknown fields/IDs, invented quotations, unsupported extra/tool fields and contradictory empty responses. The UI renders only checked quotations, source links and a fixed insufficient-evidence message. It does not display unrestricted model prose or execute model instructions. An exact quote proves presence in the selected record, not real-world truth or relevance; the UI labels it as quoted evidence, not independent verification.

This is intentionally a bounded read-only conversational slice. It does not reason across career facts/resumes/applications, generate free-form advice or propose edits. Existing local reviewed note/status actions remain separate and unchanged. The general conversational agent goal is not complete.

## Review, privacy and state

Every turn requires “Review AI request,” followed by a provider-specific explicit approval button. The review displays provider, configured model, paid versus offline mode, shared daily reservations, exact outbound JSON and inspectable system instructions. Editing or cancelling clears approval. Reviews are single-use, bound to repository, selected record, configuration and exact payload; stale/tampered/replayed reviews fail before transmission.

Only selected job ID/content hash, company, title, location and the first 12,000 characters of saved raw description are allowed. Questions are limited to 2,000 characters. Private job notes, source payloads, all career facts (including disabled/prohibited facts), resumes, applications and unselected jobs are excluded and not fetched for conversational context. The explicitly entered question is visible in the reviewed payload. The last three locally validated turns from this same job can accompany a follow-up; arbitrary, modified or cross-record history is rejected. No existing deterministic Copilot message history is imported.

Conversations remain temporary UI state, labeled as such. Context switching/unmount or “End AI conversation” aborts local use of the response and clears the visible session. A sent request cannot be recalled and may still incur cost; stopping never claims a refund or remote cancellation. Job changes during a request cause the response to be discarded. Provider failures are sanitized rather than displaying raw returned errors.

## Existing runtime gates reused

- Settings/provider selection and the existing AI-analysis enablement, mock-mode and per-run/daily limits are respected. Nothing is enabled automatically.
- Each approved turn reserves one existing durable daily AI slot; reservations are not refunded and no dollar estimate is invented.
- Mock attempts use the existing accounting function. `career_copilot` was added to the native request types requiring `mark_live_attempt`, reusing the committed reservation, job hash, day, provider, replay and AI-preference checks before network transmission.
- Credentials remain resolved only through the existing native Keychain path; no secret was inspected, stored or changed by this work.
- There is one provider attempt per approval, no automatic repair/retry and no tool execution.
- Native Copilot requests set `store:false` and a 60-second network timeout. These source changes have not been compiled or live-validated in this turn.
- Only safety/budget records are persisted by this feature. It never saves jobs, facts, resumes, applications or model-output edits.

## Files

- `src/lib/copilot/modelContract.ts`: bounded output schema, instructions and exact citation validation.
- `src/lib/copilot/modelConversation.ts` and `.test.ts`: context allowlist, one-use reviews, scoped history, budget/cancellation and result validation.
- `src/lib/ai/provider.ts`, `openAIProvider.ts`, `mockProvider.ts`, `copilotProvider.test.ts`: provider contract, actual native command route and offline demo.
- `src/features/copilot/ModelJobConversation.tsx` and `.test.tsx`: opt-in conversational UI, exact-context approval, follow-ups and cancellation.
- `src/features/copilot/CareerCopilotPage.tsx` and `.test.tsx`: selected-job integration and truthful mode labeling.
- `src-tauri/src/commands/ai.rs`: native budget-gate inclusion, non-stored response request and bounded timeout.

All unrelated pre-existing changes and retained fixtures/backups were preserved. No schema/database migration was added or run.

## Actual validation

- Final full frontend suite: **73 files passed; 624 tests passed, 2 skipped**. Log: `/tmp/cc-model-full.log`.
- TypeScript, lint, Vite production build and `git diff --check` passed. Build: `/tmp/cc-model-build`; log: `/tmp/cc-model-build.log`. Existing large-chunk warning remains.
- Initial focused model tests passed 10 cases; final full suite includes the additional OpenAI-service path and cancelled/invalid-result cases. Focused log: `/tmp/cc-model-focused.log`.
- Tests cover selected fields and excluded-data reads, explicit approval, preview cancellation/tamper/replay, missing record/configuration, disabled AI and shared budget exhaustion, sanitized provider failures, native credential-error propagation through a mocked command, follow-up scope and altered history, cancellation before send and after send, changing records during requests, schema rejection, fabricated IDs/quotes/tools, citation links and unchanged job records.
- UI tests confirm no provider call on opening or preview, cancellation without a reservation, explicit mock approval, follow-up review and unmount/context-switch discard. All provider responses and native transport calls in tests were mocked/offline; test records were synthetic.

## Unrun validation and runtime requirements

No live OpenAI request, paid spending, secret inspection or real user-data transmission occurred. No live browser, screenshots, measured narrow-layout or native keyboard validation occurred. The earlier loopback preview denial was not retried or bypassed. Native 720×800 acceptance remains deferred.

The changed native command has not been built/tested: the known Rust dependency-cache blocker remains, and the instruction not to start/build Tauri was honored. Consequently, an existing installed bundle is not claimed to contain the new budget-gated Copilot path. No Rust failure was rerun, no caches repaired, no uncertain native session touched and no process inspection performed.

For a later live test: first authorize and complete native build/validation in a permitted isolated session. Then, using a synthetic saved job, configure a supported structured-output model and existing Keychain credential, enable the existing AI-analysis gate with a small daily limit, select OpenAI (mock off), inspect the exact request and explicitly approve one paid send. None of those settings or credentials were changed here. Native validation is the remaining prerequisite, not merely clicking a button in an old bundle.

No push/deployment, data deletion, external sharing, discovery/autofill/submission, security/permission or schedule changes were performed.

## Documentation and next step

The existing Responses API strict `text.format` JSON-schema contract was checked against official documentation: https://developers.openai.com/api/docs/guides/structured-outputs and https://developers.openai.com/api/reference/resources/responses/methods/create . Schemas constrain structure; local citation checks constrain the evidence that can be displayed.

Next: native validation of the new budget-gated route when authorized, followed by a synthetic approved live-provider test. Product work toward a fuller agent needs evaluated grounded synthesis beyond quotations, explicitly selected eligible career-fact context, and a separate schema-validated model proposal integration through the existing acceptance/undo gates.
