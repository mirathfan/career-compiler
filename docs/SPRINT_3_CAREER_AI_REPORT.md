# Sprint 3 — bounded connected Career AI reads

**Status: PARTIAL.** November 12, 2026. A tested, non-migrating vertical slice is implemented in the authoritative repository. The full intelligent-assistant acceptance criteria are not complete.

## A. Executive summary

Career AI now offers **Read across selected records** inside its existing saved-job conversation, in both panel and full-page presentations. The user chooses categories and individual saved jobs, verified career facts, applications, and résumé versions. A structured model request selects permitted read tools; a second, separate review shows the exact retrieved fields before they can be sent for an answer. Responses consist of model-selected, locally validated evidence quotes and existing record citations. They persist through the existing SQLite conversation system. The offline mock explicitly identifies its fixed field selection and does not pretend to reason.

No new write tools, migrations, provider subsystem, conversation store, or domain approval engine were introduced. Existing job-note/application-status review and undo remain in place. New scopes start empty and are authorized per request; local Copilot remains usable without them.

This slice does **not** implement deterministic job prioritization, résumé bullet coverage/recommendation, general career reasoning, inferred next steps, or unrestricted conversational reference resolution. It is a bounded evidence-selection foundation for those features, not completion of the mission's five example conversations.

## B. Source baseline and preservation

- Repository: `/Users/athfan/Desktop/career-compiler`.
- Branch: `ui-ux-overhaul`.
- HEAD: `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`.
- Recovery/evidence directory: `/Users/athfan/Desktop/career-compiler-sprint3-evidence-20261112`.
- Before editing, the actual integrated working tree was inventoried, including tracked, untracked and relevant ignored source files. `source-before.tar.gz` contains 1,251 source files with verified contents and modes. Archive SHA-256: `37ac630c1a6c9ebc72603932b94c55c8658d756eb3189492825e61745d0ae05a`.
- `preservation.json` and `git-status-before.txt` record the starting state. The archive includes the recently changed acceptance-identity guards; these guards remain unchanged by Sprint 3.
- Verification reused `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/verification-source`. Only the Sprint 3 paths were synchronized into that existing copy. No new full development copy was created. Tests/builds ran there with isolated home/cache/temp paths and offline toolchain settings, leaving original generated/private directories alone.
- `final-preservation.json` and `changes.json` record final source checks, candidate/recovery checks, hashes and modes. Source changes remain uncommitted. No branch, commit, index, or production configuration changes were made.

## C. Reused infrastructure and original boundaries

The existing `CareerCopilotPage`, `CareerAIPanel`, thread/message repositories, `SourceChip`/record links, React Query invalidation, `AIProvider`, `OpenAIProvider.callStructured`, mock provider, and structured native OpenAI command are reused. `modelJobContext` is the existing selected-job configuration/freshness function, now exported for both workflows. The existing shared budget reservations and native live-attempt gate are reused without increasing configured limits.

Before Sprint 3, remote Copilot Q&A received an explicitly reviewed saved-job allowlist and bounded same-job history. Local Copilot could read supporting entities and create existing pending proposals. Those paths remain available. Thread identity is still a saved-job anchor; navigation does not silently rebind it or its approvals. Existing supported write operations still require their original independent approval and undo pipelines.

## D. New typed read registry

The names reuse existing Copilot tool terminology. `workspaceReads.ts` defines strict Zod inputs/outputs, grant validation, structured error codes and audit summaries. Model input is `{ calls: [{ tool, ids }] }`, never SQL or a repository method name. Each call accepts 1–5 explicit IDs. There are at most four calls and ten distinct authorized records per request. Duplicate record requests and additional arguments fail validation before record reads.

| Tool | Allowed output fields | Boundary |
|---|---|---|
| `get_job` | company, role, location, description, status | Explicitly selected, available saved jobs; no notes or URLs |
| `get_career_fact` | statement, project/item title, evidence status | Explicitly selected enabled **verified** facts with enabled parents; no source notes, private notes, source paths, contact header, disabled/prohibited facts |
| `get_application` | company, role, status, applied date, follow-up date, job ID, submitted résumé-version ID | Explicitly selected applications; no notes, history bodies, PDF paths or provenance payloads |
| `get_resume` | name, kind, status, job ID, parent/base version IDs | Explicitly selected version metadata/lineage; no résumé body, personal/contact header, PDF path or document export |

Every output record includes its entity ID, bounded label, revision and typed field/value list. Audit entries contain tool, IDs and count; persisted message tool calls carry these execution summaries. Errors distinguish invalid arguments, denied scope, missing/ineligible records and context overflow. No read tool writes domain records.

Field values are limited to 2,400 characters, labels to 240, and the complete local result to 24,000 serialized characters. Picker pages show 20 records. **Limitation:** existing repository list methods materialize local collections before pagination, and career-fact lookup uses those existing list methods. This does not transmit the database; true repository-level bounded queries remain future work. Field excerpts can be truncated and are not complete-document evidence.

## E. Model orchestration

1. The user explicitly selects categories/records and writes a question (maximum 2,000 characters). No provider call occurs here.
2. The application validates the selection, current saved-job anchor, thread, provider configuration and daily capacity. It captures a local freshness snapshot.
3. First review displays the exact ordered catalogue, question and budget anchor. Approval permits one structured planning request. It receives record IDs/labels, not retrieved bodies. The generated budget-attempt ID is added at dispatch.
4. The strict dispatcher rejects unapproved tools, arguments and IDs, then performs the selected local reads. An empty/ambiguous plan requires clarification; there is no recursive loop.
5. Second review displays the exact bounded records. Approval permits one evidence-answer request. No automatic second call occurs.
6. The answer schema permits only an insufficient-evidence flag and up to eight exact quotes. Every quote must match a supplied entity and field. Fabricated IDs, unsupported text and action-shaped output are rejected locally.
7. Successful user/assistant messages are saved transactionally in the existing thread. Citations are constructed from actual retrieved records, not model-provided citation strings.

Approvals are single-use, repository-bound immutable receipts. Settings, anchor, thread and selected snapshots are revalidated before and after transport and before persistence. A changed selection/record or cancelled request cannot save a stale answer. There are no automatic retries or repairs. Each phase uses a separate existing budget reservation. The response timeout is 60 seconds; new native workspace schemas cap output at 1,200 tokens. An already sent request cannot be recalled, and cancellation does not refund reservations.

## F. Privacy and security

The UI selection, local picker, authorized remote catalogue and actual outbound fields remain distinct. Categories and record grants start empty; opening the panel or navigating does not call a provider. Reusing an earlier selection is an explicit action and still requires both outbound reviews. Old conversation bodies are not silently transmitted.

The new OpenAI adapter parses a strict request schema and uses the existing `career_copilot` command, Keychain path and live budget gate. `store:false` remains enabled; this is a request flag, not a claim about all provider retention. Native production command permissions, acceptance guards and production identifier are unchanged. Test mode forces the existing mock provider and omits live OpenAI/Keychain handlers.

The field allowlist excludes repository-only notes, résumé text, source paths, history bodies and contact header fields. Supplemental minimization removes recognized email addresses, local-path patterns and `sk-` token patterns. **This is not a universal secret detector:** free text can contain other sensitive data, and the user's question is intentionally transmitted as reviewed. Users must review the exact outbound content. Source text is always untrusted; prompt instructions cannot authorize additional IDs, tool kinds or mutations. Quotes are rendered as text in the existing message UI.

Adversarial tests reject model plans for an unrelated `secret-profile`, SQL-shaped calls, write-shaped answers and unsupported sponsorship claims. Malicious résumé body content is excluded from both requests. Eligibility is not recalculated or overridden; this slice cannot recommend based on sponsorship assumptions.

## G. Conversation UX and context

The new surface is a request-review section in the existing conversation, not a second chat. It shows category permissions, selected-record count, exact request previews, paid/mock labeling, loading/cancel state and errors. Long previews wrap and have bounded scroll regions. The header distinguishes existing selected-job Q&A from explicitly reviewed connected reads.

Successful responses appear in the existing conversation log with record links and a snapshot warning. Closing/reopening and full-page/panel behavior reuse the existing lifecycle. Ordered grants persist in `structuredContentJson.workspaceRead`, requiring no migration. An explicit reuse button restores the prior ordered selection; a second-job follow-up retains the same catalogue order after SQLite reopen. Arbitrary pronoun resolution and conversation-wide semantic memory are not implemented. A model can decline ambiguous selection; it cannot access an ungranted ID.

Existing source-link routing is reused: job and résumé citations include record IDs; application and career-fact citations currently open their collection screens. Exact application/fact deep-linking remains incomplete. Existing panel tests cover selected context, navigation, close/reopen, full-page switching and pending-action target preservation. New tests verify all four scopes start disabled and navigation never calls either provider method. Native link clicking, new compact-panel layout, VoiceOver and native keyboard behavior were not verified this sprint.

## H. Actual validated synthetic scenarios

- Two jobs (`Alpha · AI engineer`, `Beta`), one verified agent-project fact, one application with recorded follow-up `2026-11-14`, and one résumé version were selected in memory/SQLite fixtures. All four tools returned only allowed fields; private note/path/name/history markers were absent. Jobs, applications, résumé content and facts remained unchanged.
- Two reviewed mock requests persisted a question and cited evidence response into the existing conversation. Five source citations pointed to retrieved entities. The mock selected fixed first fields; this is **not evidence that a live model compared or ranked those jobs**.
- SQLite was exported, reopened and initialized in memory. Messages, ordered grants, application records and résumé versions matched exactly. A follow-up catalogue's second job remained `Beta`.
- Changed applications/settings, changed résumé metadata during transport, modified reviews, wrong-context threads, unavailable provider, timeout and cancellation were rejected without saving an answer or retrying automatically.
- A separate rendered-component test exercised explicit scope selection, first review, second review cancellation, re-review and successful persistence. Cancelled requests did not create threads or change job notes.

## I. Tests and native checks performed in this run

Exact executable arguments, working directories, timestamps and exit codes are in the evidence directory's `*-result.json` files. `check.py` documents the controlled environment; it uses the retained Node/Rust installations, offline Cargo/npm and no production acceptance flags. Commands below ran in the existing verification copy.

| Command | Actual result |
|---|---|
| `node node_modules/vitest/vitest.mjs run` | **691 passed, 2 existing skips; 81 files passed** (`frontend-final.log`) |
| Focused Vitest run: `CareerAIPanel`, `WorkspaceReadReview`, `workspaceConversation`, `workspaceTransport` tests | **25 passed**, including 17 new tests (`focused-final.log`) |
| `node node_modules/typescript/bin/tsc -b --noEmit` | PASS; final native build also reran TypeScript |
| `node node_modules/oxlint/bin/oxlint .` | PASS, 0 warnings/errors (`lint-final.log`) |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline` | **40 passed**, binary/doc targets passed |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | PASS |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked --offline -- -D warnings` | PASS |
| `npm run tauri:build -- --debug --config /Users/athfan/Desktop/career-compiler-sprint3-evidence-20261112/tauri.unique.json` with explicit debug identity pin | PASS; includes `npm run build` / TypeScript / Vite |

Initial checks found two incomplete new fixtures, an old scope-label assertion, and an unsupported test matcher option. They were corrected without removing assertions. The updated panel assertion additionally checks navigation causes no connected-provider calls. The full suite then passed, followed by a final focused run. Existing React `act`/Node experimental SQLite notices and the Vite bundle-size warning remain; they were not suppressed. Historical 674/39 results were not counted as new passes.

The two skips are the existing retained-native recovery tests gated by `CC_HISTORY_BACKUP_ACCEPTANCE_ROOT` and `CC_HISTORY_RECOVERY_DESTINATION_ROOT`; those variables were deliberately unset. Other synthetic recovery tests ran normally.

### Native evidence

Identity: `com.mirathfan.careercompiler.acceptance.runce5dfa569f1a4da2996f05239035b24f`.

Synthetic database: `/private/tmp/careercompiler-native-uupngkt5/native.sqlite3`.

Runtime home: `/private/tmp/careercompiler-native-uupngkt5/runtime-home`. Configuration/data/cache paths are beneath that home; the WKWebView store derives from the exact new identity. No prior application identity or production runtime was reused.

| Native item | Result |
|---|---|
| Debug bundle identity, compile/runtime pin and synthetic-root markers | PASS |
| Actual native startup and dedicated application paths | PASS; native `ISOLATION_PREFLIGHT` recorded |
| SQLite `PRAGMA database_list` identity | PASS; exact synthetic path, 20 existing synthetic Jobs-feed fixtures |
| Native window measurement | PASS; 1280×820 points, scale 2 |
| New workflow interaction, citation clicking, compact layout, keyboard handling | **BLOCKED** by UI tool application binding |
| Native conversation restart/approval/undo/PDF workflow | **Not rerun**; no new native pass claimed |
| Owned child termination | Confirmed; SIGTERM, child exit `-15` recorded by its owning launcher; UI Quit was not verified |
| Synthetic database integrity after exit | PASS (`integrity_check = ok`) |

The UI tool's inventory listed the new identity, but selecting that identity returned `Invalid app`; path/name selection resolved to the previous acceptance identity and returned `Running application not found`. Refreshing the tool session did not resolve it. No Launch Services/security changes or unrelated process control were attempted. The single owned child was terminated; nothing owned by this run was left running. `ui-owned.json`, `ui-native.log`, `owned-stop.json` and `native-results.json` preserve the evidence. No UI screenshot was captured. No Tauri dev-server startup or signed release was tested; packaged debug startup was verified.

## J. Changes made

| Path | Purpose |
|---|---|
| `src/lib/copilot/workspaceReads.ts` (new) | Typed grant-restricted read registry, minimization, bounds, citations |
| `src/lib/copilot/workspaceContract.ts` (new) | Strict planning/answer contracts and quote validation |
| `src/lib/copilot/workspaceConversation.ts` (new) | Two-stage consent, freshness, shared budgets, existing-thread persistence |
| `src/features/copilot/WorkspaceReadReview.tsx` (new) | Category/record picker and exact outbound review |
| `src/lib/copilot/workspaceConversation.test.ts` (new) | Read safety, consent, stale-state, injection, cancellation, SQLite reopen |
| `src/lib/copilot/workspaceTransport.test.ts` (new) | Mocked native transport and strict outbound schema |
| `src/features/copilot/WorkspaceReadReview.test.tsx` (new) | Scope defaults, cancellation, two approvals, persisted result |
| `src/features/copilot/CareerCopilotPage.tsx` | Mount request review; truthful scope/message labels |
| `src/components/CareerAIPanel.test.tsx` | Updated scope label and both-provider navigation assertion |
| `src/lib/copilot/modelConversation.ts` | Export/reuse existing context/budget configuration |
| `src/lib/ai/provider.ts` | Optional connected-read method on existing interface |
| `src/lib/ai/openAIProvider.ts` | Existing structured transport for strict plan/quote responses |
| `src/lib/ai/mockProvider.ts` | Explicit offline fixed-selection implementation |
| `src-tauri/src/commands/ai.rs` | Output-token cap for new schemas; regression test for store/budget behavior |
| `docs/SPRINT_3_CAREER_AI_REPORT.md` (new) | This report |

## K. Unfinished work and acceptance classification

The mission's acceptance is **PARTIAL**. Selected multi-record evidence retrieval, explicit outbound scopes, persistent cited responses and no new domain writes are implemented and tested. The following remain incomplete:

- Deterministic prioritization/fit/eligibility tool integration and grounded explanations of rankings.
- Search-driven evidence discovery and full profile/skills/preferences summaries.
- Résumé evidence-backed bullet retrieval, coverage comparison and justified existing-version recommendation.
- Application-history/follow-up rule summaries and actionable next-step reasoning; only recorded dates/status are exposed here.
- General cross-record follow-up interpretation; this slice preserves explicit ordered selections only.
- Exact application/fact citation deep links; those existing links currently open collection screens.
- Unanchored workspace conversations outside saved-job threads, durable category preferences and per-field opt-ins.
- Model behavior beyond exact quote selection. Mock tests verify contracts/safety, not reasoning quality. No live provider call was made or verified.
- Native interaction/compact layout acceptance for the new controls, due to the UI binding issue above. PDF and previous native approval/undo results remain historical.

## L. Data preservation and recovery

No production database was opened or migrated, no real career data was used as a fixture, and no credential/Keychain or production permission changes were made. All domain mutation in tests was confined to synthetic fixtures. New read operations only add the intended conversation/audit and shared budget records when explicitly run; they do not alter jobs, profile facts, applications, history/provenance or résumé versions. Regression tests for existing approval/undo, recovery and persistence passed.

Final verification checks every original source path against its pre-edit hash/mode, permits only the documented edits/additions, and verifies source parity with the tested copy. Prior candidate hashes and recovery archives are checked without modification. Excluded original private/runtime paths are checked by metadata only; their contents are not opened for QA. This does not claim a new content-level audit of the production database or Keychain.

Actual preservation result: **PASS**. Eight files added, seven replaced, zero deleted; the other 1,244 original source files and all original source modes are unchanged. All 1,259 final source files match the tested verification copy. All 1,251 prior candidate files and both original recovery archive hashes match their manifests. Eight protected Git entries, branch and HEAD are unchanged. Metadata for 57,125 original excluded/private/runtime files is unchanged. The three acceptance guard files and production Tauri configuration are byte-identical to the Sprint 3 baseline.

To roll back later, verify `source-before.tar.gz` and the current after-hashes/modes in `changes.json` first; stop if newer edits exist. Restore only the seven modified pre-existing paths from the verified archive (or `before/` copies). Move the eight new files into a new quarantine directory rather than deleting them. Recheck restored hashes/modes. Do not reset Git, extract the whole archive over unrelated work, or touch any database, credential, original candidate or Sprint 2.7 recovery material. Rollback has not been executed.

## M. Next recommendation

Complete the remaining read-only Sprint 3 slice first: a deterministic job/profile fit tool and an evidence-backed existing-résumé comparison, using the same selection grants, reviewed payloads, citations and freshness checks. Resolve native UI binding and validate the new controls at 720/1024/1440 widths before claiming complete desktop acceptance.

For Sprint 4, the smallest safe write increment would be one model-proposed profile-fact correction built on the existing pending-action mechanism: exact target and before/after values, evidence references, explicit acceptance, stale-state rejection, transactional audit and supported undo. Do not begin résumé rewriting or external actions as part of that increment. No Sprint 4 work was performed here.
