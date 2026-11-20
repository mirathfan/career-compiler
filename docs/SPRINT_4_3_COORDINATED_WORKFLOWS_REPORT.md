# Sprint 4.3 — Coordinated Career AI preparation

## A. Executive summary and final status

**PARTIAL — the narrow coordinated workflow is implemented and verified through synthetic services and component acceptance; native interactive acceptance remains unverified.** No live provider claim is made.

In a saved-job conversation, **Prepare this job** or “Help me prepare for this job” creates a local, bounded preparation plan. It can suggest one evidence-backed profile skill, one exact verified-statement résumé bullet replacement, and one linked application's next action. Each operation uses its existing proposal, explicit acceptance, transaction and reviewed reversal. Creating a plan changes conversation history only. There is no bulk approval, automatic continuation or plan-wide undo.

This is deterministic local coordination of the existing capabilities. The existing reviewed mock/model read-and-synthesis pipeline can precede it in the same thread, but this sprint does not add a model planner, new remote fields or new mutation types. Unsupported or ambiguous steps remain omitted with explanations.

## B. Repository baseline and preservation

- Authoritative repository: `/Users/athfan/Desktop/career-compiler`.
- Branch: `ui-ux-overhaul`; HEAD: `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`.
- Baseline recorded at `2026-11-13T14:52:10.744523+00:00`. All **1,293** source files matched the Sprint 4.2 final inventory by membership, hashes and modes; prior tracked/untracked Git status also matched before editing.
- Evidence and new recovery directory: `/Users/athfan/Desktop/career-compiler-sprint4-3-evidence-20261113-144855`.
- `source-before.tar.gz`: SHA-256 `d0f3f01bdfdc88852610c9aa7d36f568f586c97127cacd62b02e4b574ce4c2b4`. Every member's content and mode was verified before editing. Exclusions are generated/runtime trees, dependencies and Git, recorded in the inventory; this is a source snapshot, not a production-data backup.
- `preservation.json`, `git-status-before.txt`, `before/`, `changes.json`, `changed-paths.json`, `sprint4-3.patch`, `git-status-after.txt` and `final-preservation.json` provide before/after reconciliation, including new untracked additions.
- Four existing files were checked against their recovery hashes immediately before modification. Final verification rejects any other source change or deletion.

Tests and builds reuse `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/verification-source`. No new full development copy was created. Changed source is synchronized to that established QA copy; final source hash/mode parity is checked.

Rollback is manual and conflict-aware: verify every current changed file still matches its `afterSha256` and mode in `changes.json`; restore only the four replacements from this sprint's verified `before/`; move the eight additions to a new quarantine directory, preserving them. Stop on any later user edit. Never restore the whole tree or touch production records, Git metadata, prior candidates or recovery. No rollback was performed.

## C. Existing services reused

Reuses CareerCopilotPage in both full-page and panel modes; persisted CareerCopilotThread/Message and pendingActionsJson; `actionReview`; `prepareProfileSkillAction`, `prepareResumeBulletAction`, `prepareApplicationNextAction`; existing domain validators, confirmed-action transactions and immutable SafetyRecord audits; exact résumé lineage/archive services; React Query; citation navigation; `loadIntelligenceInputs`, `rankPermittedJobs` and `comparePermittedResumes`.

Existing provider contracts, workspace read dispatcher, explicit outbound reviews, consent categories, bounded repair, timeout/cancellation, budgets, Keychain handling and store flags are unchanged. No new repository mutation API or table was added.

## D. Coordinated-plan contract and limits

Strict versioned Zod `PreparationPlan` is stored on an existing assistant message's `structuredContentJson.preparationPlan`. It carries exact job ID/hash, frozen selected record IDs, evidence and assessment fingerprints, existing fit/comparison reports, up to three nullable suggestion slots and missing-information notes.

`preparationReview` associates a subsequent existing pending action with a plan ID and step. `preparationSkip` records a user's skipped suggestions. These are message associations, not a replacement audit or state machine. Accepted/rejected/reversed states are derived from persisted domain actions and their `undoOf` relationships.

Limits: one saved job, five verified facts, three most-recent nonarchived résumé candidates, one uniquely linked application, **ten selected records total**, three suggestion slots, at most five profile-builder probes (at most ten sorted tags per selected fact), 100 candidate source bullets, 24,000 serialized plan characters, and two explicit review attempts per step per plan. There are no automatic tool retries, provider calls or recursive planning. One conversation cannot create another plan while an earlier actionable/pending/stale item remains unresolved.

The shortlist is deliberately local and bounded. Existing repository inventory methods read local lists to shortlist; this is not a new paginated storage API. Revalidation performs a fixed number of existing reads per step. It never loads the whole database into a provider prompt. Existing conversations retain their historical storage semantics; this sprint does not truncate or delete messages.

## E. Plan composition and evidence

The job must exist in the conversation's exact saved-job context. Local deterministic fit keeps technical evidence separate from eligibility and unknown sponsorship. Confirmed eligibility conflicts omit suggested preparation changes. Five enabled, verified facts with enabled parents are shortlisted by reviewed job-tag overlap and source-version linkage; injected or secret-like statements are excluded.

A profile suggestion requires a supported skill actually present in the selected verified statement and saved job, absent from the existing normalized skill list, and accepted by the original builder. Existing disabled duplicates are not silently recreated.

A résumé source must be recommended by the existing comparison among the selected versions, including claim validation. A proposal is prepared only when exactly one unlocked, included, unrejected bullet and one same-item verified alternative statement qualify. Multiple plausible choices require the individual picker. The original builder rechecks evidence, document identity, locks and whole-document claims. Exact statement replacement is a reviewable alternative, not a guarantee of improved fit; the UI explicitly warns that terms from the previous bullet may be lost.

Only an application whose stored `jobId` matches exactly can participate. Zero matches means no application creation; multiple matches require the user to use an exact application review. “Prepare application” is suggested only for a preparing/ready tracker with no next action and no recorded submission identity/history. Otherwise an explicit user next-action instruction is required. No inferred due date, status advancement or external submission is introduced.

## F. Independent review and approval

The plan displays the selected job, fit/eligibility snapshot, source version ranking, exact target IDs, reasons, supported evidence, missing information and current step status. It is inside the existing conversation scroll region. Each suggestion opens the existing exact before/after action card; validated Profile, source résumé and Application links are available.

States are Suggested, Pending approval, Accepted, Rejected, Skipped, Stale/conflicted, Needs information, Reversed or Archived. “Looks good” creates no approvals. “Cancel remaining plan items” cancels existing pending proposals and skips unresolved suggestions; accepted operations remain intact. There is no accept-all or undo-all control. Failures show the existing error and leave the failed proposal pending; no successful write is claimed before the repository returns success.

## G. Dependencies and stale state

Before preparing and accepting each operation, the coordinator checks thread/job identity, exact job hash, stored report integrity, current selected facts/items, recomputed deterministic reports and that operation's original profile/skills, source version or application fingerprint. The existing domain validator then runs as well. Acceptance dependency validation is inside the existing transaction, not just a UI check.

Changes in supporting evidence, source, selected comparison alternatives, application, profile, job or active conversation cannot silently refresh or retarget a proposal. Stale items need fresh review. Rejected and stale actions remain cancellable. Failed acceptance refreshes plan statuses in React Query.

The candidate set is frozen for each plan. A newly created child is not substituted into the earlier source or submitted application; a fresh user-requested plan is needed to consider it. The existing fit service derives evidence from verified facts, not merely listed profile skills; accepting a skill can therefore leave later recommendations unchanged, but they are recomputed before acceptance. Assessment-date changes also invalidate old reports conservatively.

## H. Transactions and partial success

Each accepted operation uses its own existing confirmed-action transaction. There is no multi-operation domain transaction. Tests accept steps in both forward and reverse order. A synthetic failure after a résumé write/audit but before pending-action confirmation rolls that operation back completely while retaining the previously accepted profile skill. Duplicate approval is rejected. Changing or cancelling one suggestion never silently reverses another.

## I. Undo/reversal

Profile and application next-action updates retain their conflict-safe, separately reviewed undo. Résumé reversal retains the original non-destructive archive operation for an unchanged, unused generated child. Child content, parent and base identity, submitted-version associations, files and audit are retained; reversal does not delete history or change the old source. There is no generic multi-domain reversal.

## J. Conversation persistence and navigation

The plan and associations persist in existing message JSON, with no migration. Tests reopen SQL.js SQLite after partial acceptance, with a pending résumé proposal, after application proposal creation and after final reversal. Exact job/source/application identities remain stable. Navigation cannot rebind the conversation; a mismatched context is refused. An ambiguous named project or application is not guessed.

The current plan is shown in the existing shared UI; older plan messages and their actions remain in history and Accepted changes. Record links recheck existence before navigation. The plan does not grant permission to read another record remotely.

## K. Outbound-data protections

Planning and local proposals make **zero provider calls**, including when the mock provider is configured to fail. Broader outbound scopes remain unnecessary for these local features. Imported instructions are never executed as commands or interpreted as approval. Whole résumé documents, private notes, credentials and local path bindings are not added to any provider payload.

A separate test begins with the actual existing workspace pipeline and two explicitly approved mocked requests, then continues with the local plan in the same thread. Declining review performs no call. Inspected mock payloads exclude private fixture markers, original document structures and plan bindings. Existing suites cover invalid outputs, unknown citations, cancellation, tool limits, provider failures and approval/undo safety. No paid call or external service request was made.

## L. Synthetic end-to-end acceptance

Actual shared Career AI component plus actual repository services demonstrate:

1. Select synthetic saved AI Engineer job `skill-job` and create a plan.
2. Inspect local fit and sponsorship uncertainty; receive up to three justified suggestions with no pending writes or domain changes.
3. Review/reject the AURA résumé revision with originals unchanged.
4. Separately review and accept verified LangGraph skill addition (keyboard Enter is exercised).
5. Prepare a fresh résumé review, reopen the synthetic SQLite repository/UI while pending, then accept it into a new child of `preserved-master`.
6. Explicitly request “Set my next action to review this application tomorrow.” and separately accept for `preparation-application`.
7. Verify independent persisted changes, child lineage, original Master/submitted versions, historical application identity, PDF-hash association and Application History provenance.
8. Review and accept each domain's reversal; verify restored skill/tracker values and retained, archived child.

Evidence: `coordinated-acceptance.json` includes the real synthetic messages, plan, actions and audits; `preparation-ui-acceptance.json` records UI acceptance. No production SQLite path was opened: the new coordinated-workflow fixtures use new in-memory `SQL.Database()` instances with serialized export/reopen, not filesystem databases. Other existing acceptance regressions retain their disposable synthetic fixture roots. This is repository restart evidence, **not native process restart**.

Additional cases cover one justified operation, missing/unverified evidence, already-listed skills, locked/ambiguous bullets, missing/multiple applications, submission evidence, confirmed eligibility conflict, unknown sponsorship, duplicate/unknown references, tampered snapshots, deleted job reads, stale dependencies, two-review limits, separate skipping, local operation with unavailable provider and imported injection.

## M. Test commands and results

Final new verification:

| Check | Result |
|---|---|
| Full frontend, single worker | **815 passed, 2 existing skips**, 96 files; 146.42 seconds |
| New coordination coverage | **23 passing tests** in the full suite: 11 service/persistence, 10 safety, 2 shared-UI tests |
| Rust | **40 passed**, 0 failures |
| TypeScript | PASS |
| Lint | PASS, 0 errors; the existing `no-control-regex` warning at `applicationActionContract.ts:10` remains |
| Rustfmt | PASS |
| Clippy all targets/features, warnings denied | PASS |
| Frontend build | PASS, `tsc -b && vite build` as native beforeBuildCommand |
| Native debug build | PASS, `--no-bundle --locked --offline`; executable built, not launched |
| Native startup/interactive/restart | NOT VERIFIED; no launch attempted |
| Real XeLaTeX rendering | Not repeated; existing serializer/page-count tests passed; prior actual PDF result remains historical |

The two unchanged environment-gated skips are in `historyRecovery.test.ts`: retained native backup/restore checks requiring `CC_HISTORY_BACKUP_ACCEPTANCE_ROOT` and `CC_HISTORY_RECOVERY_DESTINATION_ROOT`. Those roots were deliberately not enabled for this run. Vite's existing >500 kB chunk warning remains; it is not a failed build.

Exact underlying commands, including development iterations:

| Evidence name | Exit | Command |
|---|---:|---|
| `types-first` | 2 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/typescript/bin/tsc -b --noEmit` |
| `focused-first` | 1 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run src/lib/copilot/preparationWorkflow.test.ts --maxWorkers=1` |
| `diagnosis` | 1 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run src/lib/copilot/preparationWorkflow.test.ts -t 'composes three' --maxWorkers=1` |
| `focused-second` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run src/lib/copilot/preparationWorkflow.test.ts --maxWorkers=1` |
| `safety-first` | 1 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run src/lib/copilot/preparationSafety.test.ts src/lib/copilot/preparationWorkflow.test.ts --maxWorkers=1` |
| `ui-first` | 1 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run src/features/copilot/PreparationWorkflow.test.tsx --maxWorkers=1` |
| `focused-final` | 1 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run src/lib/copilot/preparationWorkflow.test.ts src/lib/copilot/preparationSafety.test.ts src/features/copilot/PreparationWorkflow.test.tsx --maxWorkers=1` |
| `types-second` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/typescript/bin/tsc -b --noEmit` |
| `ui-verified` | 1 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run src/features/copilot/PreparationWorkflow.test.tsx --maxWorkers=1` |
| `ui-completed` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run src/features/copilot/PreparationWorkflow.test.tsx --maxWorkers=1` |
| `lint-first` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/oxlint/bin/oxlint .` |
| `rustfmt` | 0 | `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo fmt --manifest-path src-tauri/Cargo.toml --check` |
| `frontend-final` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/vitest/vitest.mjs run --maxWorkers=1` |
| `types-verified` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/typescript/bin/tsc -b --noEmit` |
| `lint-verified` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node node_modules/oxlint/bin/oxlint .` |
| `rust-tests` | 0 | `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo test --manifest-path src-tauri/Cargo.toml --locked --offline` |
| `clippy` | 0 | `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked --offline -- -D warnings` |
| `native-build` | 0 | `/Users/athfan/.local/node-v22.23.4/bin/node /Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js run tauri:build -- --debug --no-bundle -- --locked --offline` |


Commands run from the established verification-source via `python3 /Users/athfan/Desktop/career-compiler-sprint4-3-evidence-20261113-144855/check.py <evidence-name> <command>`. Logs and `*-result.json` contain exact commands, cwd, exit code and timestamp. The harness uses dedicated `qa-home`, `qa-temp`, `qa-cache`, `qa-cargo`, offline Rust and npm settings from the established QA environment; it unsets `CC_ACCEPTANCE_ROOT` for these nonlaunching checks. No system prerequisites were installed.

Initial development failures are preserved, not hidden: a TypeScript narrowing diagnostic was corrected; the inherited synthetic source contained a duplicate locked bullet and was correctly refused by the recommendation validator (the new fixture retains that bullet excluded); two new safety tests initially assumed a nonexistent delete API and context rebinding, then were corrected to exercise the actual fail-closed interfaces. New UI tests were corrected to await asynchronous query refresh/navigation/rehydration. Existing tests and assertions were not weakened or removed.

## N. Added and modified files

Added:

- `src/lib/copilot/preparationContract.ts` — strict plan and message associations.
- `src/lib/copilot/preparationWorkflow.ts` — bounded local composition, per-action preparation, dependency rechecks, skip/cancel and derived statuses.
- `src/features/copilot/PreparationPlanView.tsx` — compact plan and validated target links.
- `src/test/preparationFixture.ts` — synthetic valid source, separate current tracker and preserved historical application.
- `src/lib/copilot/preparationWorkflow.test.ts` — real Memory/SQLite workflows, partial failure, reopen and reviewed mocked-read continuity.
- `src/lib/copilot/preparationSafety.test.ts` — omission, ambiguity, privacy, bounds and identity/staleness checks.
- `src/features/copilot/PreparationWorkflow.test.tsx` — real shared UI, keyboard acceptance, independent review/reversal, persistence and stale-state display.
- `docs/SPRINT_4_3_COORDINATED_WORKFLOWS_REPORT.md` — this report.

Modified:

- `src/lib/copilot/careerCopilot.ts` — routes recognized local preparation requests and persists associations in existing messages.
- `src/lib/copilot/actionReview.ts` — invokes plan dependency checks inside original acceptance validation.
- `src/lib/copilot/applicationNextAction.ts` — allows a locally bound exact job/application pair after rechecking the stored thread and association; explicit stored user instruction remains mandatory.
- `src/features/copilot/CareerCopilotPage.tsx` — plan trigger/presentation, exact-review focus and status refresh after rejection of stale acceptance.

Total: **8 additions, 4 replacements, 0 deletions**. No native, provider, migration, domain action implementation or permission files changed.

## O. Production-data preservation

Final preservation checks passed: **1,301 source files**, eight additions/four replacements/zero deletions; all **1,289 unrelated baseline files** retain their original content and modes. All 1,293 snapshot archive members and the archive SHA-256 were reverified. The tested verification copy matches the final source hashes and modes.

Branch, HEAD and eight protected Git metadata entries (including index) are unchanged. Acceptance guards, native production configuration, migrations and provider interface hashes are unchanged. Metadata for **57,125 excluded original runtime/dependency files** remains unchanged. All **1,251 approved candidate files** and both original source/Git recovery archives verify against their manifests. Existing Sprint 4.2 recovery was read only; all new evidence is in the Sprint 4.3 directory. See `final-preservation.json` for exact verified scope.

No production SQLite contents, Keychain entries or private runtime files were opened by this sprint. Tests use synthetic in-memory repositories and isolated build paths. Native app processes were neither launched nor inspected. No production migrations, credentials/security settings, paid calls, external submissions/messages, commits, pushes or deployments occurred. Existing user source and unrelated tracked/untracked work remain preserved. Private-runtime verification uses metadata only; it is not a new content hash or inspection of production records.

## P. Native interactive QA limitation

Historical native startup/UI identity resolution remains unverified. This sprint did not retry historical processes or modify identities, native guards, permissions or tooling to bypass it. No native application was launched. Native build success, if listed above, proves compilation only. Native dev startup, actual desktop keyboard/focus behavior, 720/1024/1440 pixel layout, real native persistence and native PDF interaction are **not verified in this run**. There are no new UI screenshots.

Existing CSS scrolling/min-width/wrapping is retained and the new plan is inside the conversation scroll region; component tests exercise keyboard actions and rehydration, but jsdom cannot establish pixel overflow or packaged desktop behavior. PDF serialization/page-count regressions remain covered by the frontend suite. Sprint 4.2's actual one-page XeLaTeX result is historical evidence; no new real PDF render is claimed here.

## Q. Remaining gaps

The supported vertical slice is local deterministic coordination with bounded English commands. It does not add a free-form model planner, automatic dependent replanning, bulk operations, alternative-version picking inside the plan, arbitrary bullet rewriting, whole-document optimization or external execution. Missing/ambiguous data routes to the existing individual workflows. Frozen recent-version/fact shortlists may omit useful older evidence; the UI states their scope. Original repository list methods are not newly paginated. Native interactive and pixel-layout acceptance remains outstanding.

## R. Recommended next milestone

First complete supported isolated native QA for this exact workflow, including compact layout, separate keyboard approvals, restart and normal PDF preview/export. Then consider an explicit user-selected alternative résumé/evidence shortlist with a new read-only plan preview, still preserving separate approval and current domain validators. Do not add bulk acceptance or new write domains until that foundation is verified.
