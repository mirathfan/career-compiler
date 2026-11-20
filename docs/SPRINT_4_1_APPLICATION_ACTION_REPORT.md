# Sprint 4.1 — AI-assisted application management

## A. Summary and status

**COMPLETE for the scoped local feature and synthetic acceptance. Native interactive acceptance remains unverified.**

The existing Career AI now supports one additional reviewed operation: `set_application_next_action`. A user can inspect recorded application attention items, resolve a specific application, request a tracker task/date, reject the proposal without mutation, explicitly accept it, reopen the persisted conversation, and review an undo. The operation changes only the existing `nextAction` and `followUpDate` fields, with normal `updatedAt` bookkeeping.

This is a local, deterministic conversational action within the existing Copilot. It does not ask a remote model to invent tasks or dates. Existing reviewed model reads and profile-skill proposals remain available separately, with unchanged outbound scopes. No email, reminder, submission, status advancement or résumé edit is performed.

Synthetic component/database acceptance passes. Interactive native acceptance and live-provider behavior are unverified. No native app was launched this sprint.

## B. Baseline and preservation

- Authoritative repository: `/Users/athfan/Desktop/career-compiler`.
- Branch: `ui-ux-overhaul`; HEAD: `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`.
- Sprint 3.2 and 4.0 reports and current domain/repository/review/UI code were inspected.
- All **1,279** inventoried source files matched the Sprint 4.0 final hashes and modes before editing. Existing tracked and untracked work was preserved; no pre-edit source drift was found.
- Evidence/recovery directory: `/Users/athfan/Desktop/career-compiler-sprint4-1-evidence-20261112-184549` (`EVIDENCE` below).
- Verified snapshot: `EVIDENCE/source-before.tar.gz`.
- SHA-256: `0b6ed896832cc48ad6d60b70cbca305358e96a7317dff5336d5cdbb98ea39105`.
- `preservation.json` records the complete source membership, hashes, modes, branch and HEAD. Archive member contents and modes were verified before editing. Cumulative Git status is retained in `git-status-before.txt`.

The existing verification source was reused at `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/verification-source`. Changed files were synchronized there for checks; no new full development copy was created. `final-preservation.json` verifies parity with the tested source and preservation of the unrelated source, protected Git state, existing candidate and recovery archives.

The verified final change set is **6 additions, 8 replacements, 0 deletions**, including this report. `changes.json` contains per-path before/after hashes and modes, `before/` contains replacement recovery copies, and `sprint4-1.patch` includes untracked additions as well as replacements. The final manifest, rather than Git's tracked-only diff, is the complete reconciliation record.

## C. Existing services reused

`ApplicationRecord` already contains `nextAction` and `followUpDate`. Both repositories already persist them through `saveApplication`; no schema change, table, new database or migration was necessary.

The implementation reuses the shared panel/full-page `CareerCopilotPage`, existing conversations and `pendingActionsJson`, strict typed validation, `actionReview.ts`, `confirmCareerCopilotAction`, cancellation and reviewed undo. Existing repository transactions perform the mutation and existing `SafetyRecord` storage holds immutable acceptance/reversal audits. React Query invalidation refreshes Applications and Home.

Application-to-job and exact submitted résumé links are read through existing repositories. History classification uses the existing history marker/proof reader. Home keeps its existing deterministic explicit-date prioritization. No application-status or submission event is fabricated from a next-action edit.

## D. Operation contract

The only new pending-action type is `set_application_next_action`. Its strict candidate schema is:

```ts
{
  operation: "set_application_next_action";
  nextAction: string;   // trimmed, nonempty, at most 500 characters
  followUpDate: string; // empty or a real YYYY-MM-DD calendar date
}
```

Unknown keys (including `dueDate`, SQL, credentials and arbitrary application fields), other operations, punctuation-only text, control characters, recognized prompt-injection text and probable secrets are rejected. The actual existing date field is `followUpDate`; no duplicate due-date field was introduced.

Application code adds the exact application ID, pending proposal/thread/message IDs, target display label, before values, complete application SHA-256 revision, proposed values, reason, original user instruction and local date-resolution provenance. An optional candidate must exactly equal the locally parsed stored user instruction. A model cannot supply authority, a new target or arbitrary values.

The stored before snapshot contains only tracker values and a revision digest, not a copied private application record. The complete local application is hashed for conflict detection. Undo uses the same narrow action type and an `undoOf` reference to the exact accepted operation.

## E. Proposal preparation and review

Supported instructions include:

- “What applications need my attention?” / “What do I need to follow up on?”
- “Open the second application.” after a numbered, persisted attention list.
- “Set my next action for this application to follow up with the recruiter on Friday.”
- “Set my next action to review evidence on 2026-11-20.”
- “Undo that.” to prepare a separately reviewed reversal.

The card shows the exact application, current/proposed task, current/proposed follow-up date, original instruction, reason, linked local sources, effect and explicit Accept/Reject controls. It states that only the local tracker changes and no email or reminder is sent. Revision is handled by rejection and a fresh proposal. Ordinary chat text such as “yes” does not accept a proposal.

Dates are resolved locally from the device's calendar date and timezone and displayed with that context. ISO dates, today/tomorrow and an upcoming bare weekday are supported. A bare weekday equal to today, “next Friday,” ambiguous numeric dates and invalid calendar dates require clarification. Missing date language preserves the existing recorded date, including absence. The resolved date is frozen in the proposal; delayed acceptance cannot silently move it to another week. The clock is device-local context, not an independently synchronized time-service claim.

## F. Validation

Preparation requires an active conversation, one locally resolved application, an existing target and the exact persisted user instruction. It refuses ambiguous targets and duplicate pending next-action proposals for the same target in the thread. An unchanged task/date is informational rather than an actionable duplicate.

Acceptance verifies the exact stored pending action, operation/target, current application existence, complete revision and before tracker values, content/date schema, and instruction/date provenance. A changed application requires a fresh proposal. The application is loaded again inside the existing transaction.

After `saveApplication`, the service checks that the saved tracker values equal the proposal and that all other application fields except `updatedAt` remain identical. If the repository would infer or change unrelated application data, the transaction fails instead of accepting that side effect. This also preserves imported applications whose recorded submission date/time are unknown.

Imported job text, application notes and history are read as data, never treated as user instructions. “I applied yesterday” is tested to produce no new proposal or submission mutation. Existing status actions remain separate.

## G. Approval, persistence and undo

The accepted update, immutable `application_next_action` audit and proposal-status resolution commit in one existing transaction. Audits retain direction, target, original instruction, before/after values, date context, thread/message IDs, acceptance time and `acceptedBy: explicit_proposal_review`. Repeated or simultaneous acceptance produces one change and one audit. Rejection/cancellation changes only proposal state.

Undo verifies the original confirmed operation and matching audit, no existing reversal, and unchanged accepted tracker values. It builds a fresh proposal against the current application revision. It restores only the previous task/date and preserves unrelated intervening notes, history and résumé associations. Conflicting tracker edits, edits after undo review, repeated undo or missing targets are rejected. The original audit remains; a reversal audit is appended. `updatedAt` advances normally and is not rolled back.

Two concurrency issues were reproduced and fixed within the existing mechanisms:

1. A manual next-action blur could use stale query data after AI acceptance. The existing manual editor now retains dirty drafts and compares the expected next action with an authoritative repository read in a transaction before saving. It reports a conflict instead of overwriting the accepted value. Unedited fields refresh after query invalidation.
2. In-memory acceptance could resurrect an application deleted concurrently outside the transaction queue. Both repositories now route their existing `deleteApplication` entry point through that queue. No AI deletion operation was added. The failing reproduction is retained in `deletion-race-before.log`.

Injected failures at proposal resolution verify complete rollback of application/audit changes for acceptance and undo. Explicit retry remains possible. Pending, accepted and undo proposals are tested across SQLite export/reopen.

## H. Home and Applications integration

The accepted task/date refresh in the actual Applications tracker. The manual task editor updates from fresh data while preserving an unsaved conflicting draft. Home retains the same explicit-date eligibility/order rules and now includes the recorded next-action text in a due follow-up's detail. Global query invalidation after approval/undo refreshes both views.

Undated tasks do not acquire invented deadlines or a new Home priority rule. Closed applications remain excluded from Home's existing follow-up queue. No external reminder scheduler was added.

## I. Conversation context

An application-scoped conversation remains bound to that exact application. In an all-record conversation, attention results persist an ordered list of at most ten exact IDs and an optional focus in existing `structuredContentJson.applicationActionContext`. “Open the second application” resolves that persisted position, rereads the current record and provides its validated tracker link. It sets conversation focus; it does not claim navigation occurred before the user follows the link.

Ambiguous, out-of-range or deleted references request clarification. New unrelated assistant responses do not supply a guessed target. Screen changes cannot change a stored action's target, and the existing thread-context mismatch check remains in force. Restart/reopen preserves references and conversation history.

Attention lists use recorded tasks/dates and open draft states, with recorded due dates first. They show status, task/date, up to three recent recorded status events, recorded submission time, reviewed history classification when consistent proof is available, linked job and exact submitted/linked résumé identity. They distinguish recorded values from independent verification and disclose unavailable links. There are no inferred deadlines, invented history events or private-note dumps.

## J. Privacy and outbound behavior

The new attention/action/undo flow is local and makes no provider calls. Opening Career AI, navigation and tracker refresh do not invoke a provider. It remains usable when the provider is unavailable and without enabling any remote scope.

No provider, native transport, model budget, request cap, storage flag or outbound allowlist was changed. Existing remote application reads still require explicit record selection and both outbound approvals; they expose the previous limited status/date/relationship fields. `nextAction`, full status history, private notes, paths and credentials were not added to that remote scope.

A focused mocked-provider test declines outbound approval, inspects the reviewed payload, attempts to return the new operation through an existing model-proposal envelope, and simulates provider failure. Unauthorized/malformed output is rejected without conversation, application or next-action audit writes. Existing profile-skill model authorization remains separate. No live model compatibility or provider-retention guarantee is claimed.

## K. Synthetic acceptance

`EVIDENCE/application-action-ui-acceptance.json` records the actual React/jsdom + `SqliteRepository` result. The fixture is generated through the existing reviewed synthetic History Import pipeline and retains its history source, batch/audit records and exact submitted résumé `preserved-child` (parent `preserved-master`). Its imported submission date/time are intentionally unknown and remain empty.

| Required check | Result |
|---|---|
| Open Applications, select fixture, open contextual Career AI | PASS — actual routed components |
| Ask what needs attention and inspect application evidence | PASS — recorded snapshot and validated citation to exact tracker |
| Request task/date and inspect before/after card | PASS |
| Reject, verify no application/audit mutation | PASS |
| Fresh proposal, explicit keyboard acceptance | PASS |
| Tracker refresh | PASS — exact task/date saved and visible |
| Home reflects supported follow-up | PASS — explicit synthetic overdue date and task text |
| Close/reopen panel; export/reopen SQLite and remount | PASS — accepted task and conversation retained |
| Review/accept undo | PASS — previous task/date restored; set/undo audits retained |
| History, evidence and exact submitted résumé preserved | PASS — full unrelated snapshots equal; original submission fields unchanged |
| Stale, duplicate and conflicting operations | PASS — repository and UI regression coverage |
| Native restart and desktop keyboard/layout | UNVERIFIED — no native session launched |

The overdue date `2000-01-01` is explicitly requested by the synthetic test to exercise Home. A separate fixed-clock test resolves Friday from Thursday, 2026-11-12, to 2026-11-13. These are test inputs, not real user deadlines. The UI flow records zero provider calls. SQLite reopening is not presented as native restart evidence. No screenshots were captured.

## L. Tests and commands

Checks run in the existing verification source using `EVIDENCE/check.py`, isolated HOME/cache/temp paths and the existing offline toolchain. The wrapper removes `CC_ACCEPTANCE_ROOT` and records exact argv, cwd, timestamp, exit code and output in `*-result.json`/`.log`.

```text
NODE=/Users/athfan/.local/node-v22.23.4/bin/node
NPM=/Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js
CARGO=/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo
EVIDENCE=/Users/athfan/Desktop/career-compiler-sprint4-1-evidence-20261112-184549
```

```sh
python3 "$EVIDENCE/check.py" frontend-final "$NODE" node_modules/vitest/vitest.mjs run
python3 "$EVIDENCE/check.py" frontend-serial "$NODE" node_modules/vitest/vitest.mjs run --maxWorkers=1
python3 "$EVIDENCE/check.py" types-final "$NODE" node_modules/typescript/bin/tsc -b --noEmit
python3 "$EVIDENCE/check.py" lint-final "$NODE" node_modules/oxlint/bin/oxlint .
python3 "$EVIDENCE/check.py" rust-tests "$CARGO" test --manifest-path src-tauri/Cargo.toml --locked --offline
python3 "$EVIDENCE/check.py" rustfmt "$CARGO" fmt --manifest-path src-tauri/Cargo.toml --check
python3 "$EVIDENCE/check.py" clippy "$CARGO" clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked --offline -- -D warnings
python3 "$EVIDENCE/check.py" native-build "$NODE" "$NPM" run tauri:build -- --debug --no-bundle -- --locked --offline
python3 "$EVIDENCE/verify-preservation.py"
GIT_OPTIONAL_LOCKS=0 git diff --check
```

| Final check | Result |
|---|---|
| Complete frontend suite, one worker | **767 passed, 2 existing skips**, all 90 test files; exit 0 |
| TypeScript | PASS; exit 0 |
| Lint | PASS; exit 0 |
| Rust tests | **40 passed**, no failures; binary/doc targets have 0 tests; exit 0 |
| Rustfmt | PASS; exit 0 |
| Clippy, all targets/features, warnings denied | PASS; exit 0 |
| Frontend production build | PASS — native beforeBuildCommand ran `npm run build` (TypeScript + Vite) |
| Native debug executable build | PASS — `--no-bundle`, executable built but not launched |
| Source preservation, tested-copy parity and recovery audit | PASS — 1,285 source files; 1,271 other baseline files unchanged; hashes and modes verified |

The successful full suite completed in 144.26 seconds. No test timeout was increased. Non-failing output included Node's existing SQLite experimental warning and Vite's bundle chunk-size warning. No new skipped tests were added.

The first full run failed: 725 passed, 12 failed, two skipped, plus three worker-start errors. Its log shows widespread timeouts and subsequent shared-test-state failures across changed and unchanged code. It did not complete all test files. After the owned Cargo run completed, the full suite was rerun with one worker, without changing assertions or timeouts. No process investigation or global setting change was performed; the precise system cause of the initial slowdown was not independently established.

Focused final safety/UI coverage passed 18 new cases. Earlier focused regression coverage passed 61 cases, including existing action/undo, Home and Applications tests. Development failure evidence is retained: strict TypeScript literal/citation mismatches (corrected to existing domain types), an empty punctuation-only instruction (now rejected), incomplete synthetic history fixture shape (replaced with actual reviewed import), overlapping fixture records (removed from synthetic setup before import), stale manual-query saves, and the deletion race. No assertion was weakened or test removed. Existing two skips are the environment-gated history-recovery cases.

## M. Files changed

Added:

- `src/lib/copilot/applicationActionContract.ts` — strict operation/date/text contracts and bounded date parser.
- `src/lib/copilot/applicationNextAction.ts` — local attention, exact targets, preparation, validation, audit, undo and safe existing manual-save helper.
- `src/lib/copilot/applicationNextAction.test.ts` — 16 date, target, transaction, undo, persistence, privacy and race cases.
- `src/features/copilot/ApplicationNextActionWorkflow.test.tsx` — two real component acceptance/manual-conflict workflows.
- `src/test/applicationActionFixture.ts` — synthetic reviewed history, linked résumé and reopening fixture.
- `docs/SPRINT_4_1_APPLICATION_ACTION_REPORT.md` — this report.

Modified:

- `src/types/domain.ts` — one additional pending-action type.
- `src/lib/copilot/careerCopilot.ts` — local intent dispatch and persisted application references.
- `src/lib/copilot/actionReview.ts` — new type validation and reviewed undo dispatch.
- `src/lib/database/memoryRepository.ts` and `sqliteRepository.ts` — narrow action dispatch, immutable audit kind and queued existing deletion.
- `src/features/copilot/CareerCopilotPage.tsx` — shared exact review card, result messages, starters and reviewed undo.
- `src/features/applications/ApplicationsPage.tsx` — current-value refresh and conflict-safe manual task draft.
- `src/lib/dashboard/workspace.ts` — include recorded next-action text in existing due-follow-up detail.

## N. Production preservation and recovery

Production career records and credential contents were not opened or changed. Tests use synthetic SQLite/memory stores. No Keychain operation, paid request, production migration, external submission/message, Git mutation, commit, push or deployment was performed. Acceptance guards, production identifiers, native command permissions and provider configuration are unchanged.

The final preservation audit passed: full source membership/hashes/modes and tested-copy parity; unchanged branch/HEAD and eight protected Git entries; 57,125 preexisting excluded artifact metadata entries; 1,251 original candidate files; and both existing recovery archive hashes. Metadata verification is not represented as a new content audit of private production databases. Existing recovery materials remain at `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/recovery`.

Reversible source rollback, if later requested: verify current affected after-hashes against `changes.json` and stop if subsequent work differs; verify the snapshot hash; restore only the eight replacements from `before/` with their original modes; move the six additions into a new quarantine directory; recheck `preservation.json`. Do not reset Git, bulk-extract over later work, delete additions or touch production databases. Rollback was not executed.

## O. Native acceptance limitation

The historical UI identity-resolution blocker was not bypassed or investigated. No native app/session was launched, inspected, signalled or renamed. No acceptance identity, guard, permission or tooling configuration changed. Native dev startup, interactive keyboard/layout and real native restart remain unverified. A native debug build is compilation evidence only. No PDF verification or résumé generation was required or claimed.

## P. Remaining capabilities and Sprint 4.2 recommendation

This release uses bounded English local instructions; arbitrary natural-language planning and remotely generated next-action suggestions are not implemented. Ambiguous dates/targets require clarification. “Open the second application” supplies a validated link and conversation focus; the user activates the link to navigate. Undated task Home prioritization and external reminders remain outside scope. Native interactive QA remains unverified.

If separately authorized, Sprint 4.2 should first add a read-only résumé improvement preview tied to an exact version and verified source facts, with explicit per-record data review. Establish preservation and native acceptance before enabling any résumé write. No résumé-editing work or Sprint 4.2 implementation was started here.
