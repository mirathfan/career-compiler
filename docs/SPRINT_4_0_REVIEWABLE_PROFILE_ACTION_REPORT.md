# Sprint 4.0 — Reviewable profile-skill actions

## A. Executive summary and status

**COMPLETE for the scoped implementation and synthetic acceptance. Native interactive acceptance remains unverified.**

Career AI can now check a named skill against local verified career evidence, prepare one `add_evidence_backed_profile_skill` proposal, display its exact target and change, reject it without a domain mutation, accept it transactionally, and prepare a separately reviewed, conflict-safe undo. The existing panel, full-page Copilot, conversations, proposal identities, repository transactions and citation navigation are reused.

An optional, initially unchecked model-proposal setting extends the existing two-stage outbound review. A mocked model suggestion passes through the same local validator and pending-action store. It cannot select arbitrary profile fields or execute the change. The complete local workflow needs no remote authorization or provider call.

New verification: **749 frontend tests passed, two existing skips; 40 Rust tests passed; TypeScript, lint, Rustfmt, Clippy, frontend build and native debug build passed.** No native application was launched this sprint. Component/database reopening tests are not native restart evidence. No live provider was tested.

## B. Repository and preservation baseline

- Authoritative source: `/Users/athfan/Desktop/career-compiler`.
- Branch: `ui-ux-overhaul`; HEAD: `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`.
- Baseline recorded at `2026-11-12T15:17:20.617867+00:00`.
- All **1,272** inventoried source files matched the Sprint 3.2 final source state, including accumulated tracked and untracked work. No pre-edit source drift was found. Sprint 3, 3.1 and 3.2 reports and the current implementation were inspected.
- Recovery/evidence directory: `/Users/athfan/Desktop/career-compiler-sprint4-0-evidence-20261112-151717` (called `EVIDENCE` below).
- Recovery archive: `EVIDENCE/source-before.tar.gz`.
- Archive SHA-256: `6424578fd53a3b16af211b2948a9956e880d54020a603298cc20d8429b94dce6`.
- `preservation.json` contains the complete before inventory, hashes and modes; `git-status-before.txt` preserves cumulative status. The archive's member contents and modes are verified against that inventory.

The existing verification source was reused at `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/verification-source`. No new full development copy was created. Final source/hash/mode parity with this tested copy is checked by `EVIDENCE/verify-preservation.py`.

`changes.json`, `sprint4-0.patch`, `before/`, `git-status-after.txt` and `final-preservation.json` record this sprint's **7 additions, 12 replacements and 0 deletions**, including this report. They cover untracked additions as well as tracked files. The remaining **1,260** baseline source files are unchanged.

## C. Existing infrastructure reused

The operation uses `CareerCopilotPage` in both panel and full-page presentation, existing persisted threads/messages and `pendingActionsJson`, `actionReview.ts`, `confirmCareerCopilotAction`, `cancelCareerCopilotAction`, and the existing undo proposal flow. `structuredContentJson` holds the bounded follow-up reference. There is no separate proposal or conversation store.

Skills retain the existing `Skill` representation. Verified `CareerFact` records and their enabled `CareerItem` parents supply evidence. `saveSkill` and `deleteSkill` perform the approved addition and its exact reversal. Existing `SafetyRecord` storage records immutable acceptance/reversal provenance; no table or schema migration is needed.

The model path reuses the workspace tool registry, record grants, two outbound reviews, freshness receipts, OpenAI/native transport, structured response validation, budget gates, mock provider and citation validation. The UI uses existing source links and React Query invalidation to refresh Profile after acceptance or undo.

## D. Exact new operation contract

The strict model-facing suggestion contains only:

```ts
{
  operation: "add_evidence_backed_profile_skill";
  skillName: string;       // 1–80 characters; constrained character set
  evidenceIds: string[];  // 1–3 distinct, bounded identifiers
}
```

Unknown keys, other operations, target IDs supplied by the model, SQL fragments and unselected evidence IDs are rejected. Application code creates the pending-action ID and new skill ID, selects the actual local profile, and supplies:

- Exact `recordsAffected` profile target.
- `beforeJson`: SHA-256 profile, skill-list and evidence revisions; `skill: null` for addition.
- `afterJson`: operation, profile ID, normalized name, exact skill object, evidence IDs and local explanation.
- Skill values: canonical evidence-tag spelling, category `Evidence-backed`, empty proficiency note and `enabled: true`.
- Existing thread/message identity, pending status and timestamps.

Undo is a pending action of this same narrow type with `undoOf` pointing to the accepted original and `beforeJson.skill` containing the exact created skill. It cannot delete arbitrary preexisting skills. The stored pending action must exactly equal the accepted input; ordinary chat text such as “yes” never confirms it.

## E. Evidence validation

Proposal construction and acceptance both read local evidence. Every cited fact and its parent must still exist and be enabled; the fact must have `evidenceStatus: verified`, a normalized matching skill tag, and a statement explicitly naming that skill with a supported positive experience verb. Negation/future-intent markers, recognized prompt-injection text and probable secrets are rejected.

Existing normalization treats capitalization, spaces and hyphens consistently: `LangGraph`, `lang graph` and `LANG-GRAPH` cannot create duplicates. The canonical display name comes from verified evidence. An existing disabled skill produces an informational response, not reactivation. Pending duplicates in the same thread are also informational; cross-thread acceptance is protected by current-state and duplicate checks.

Named projects must match actual local project identity. Model suggestions may cite only career facts retrieved under the reviewed grant. Complete supporting fact/parent snapshots are hashed, so changed statements, status or provenance invalidate acceptance. No new fact, achievement or metric is created.

This is deliberately conservative lexical validation of already reviewed evidence, not general semantic entailment. Unsupported wording or synonyms require clarification or evidence review; the assistant does not guess.

## F. Review interface and conversation

The shared pending-action card shows Career Profile → Skills, exact profile and skill IDs, current absence/value, proposed addition/reversal, category, linked evidence, local reason and impact. It explains that saved résumés and applications are not rewritten, although future matching can use the changed skill.

Accept and Reject proposal remain explicit controls. Submission is disabled while a confirmation or cancellation is pending. Rejection uses the existing cancellation operation. Revision is handled by rejecting the draft and requesting a fresh proposal, not by silently changing accepted data. Conflict errors are visible. Success refreshes Profile and exposes “Review undo”; after reversal, the card shows “Undone · audit retained.”

Supported local examples include the requested AURA check, “Does my profile include LangGraph?”, “Add LangGraph to my profile using the AURA evidence,” “Add it,” and “Undo that.” “Add it” requires the most recent assistant message's validated skill context, persisted in the existing message. An unrelated reply clears that interpretation. A changed profile target requires a fresh check. Navigation never rebinds the stored target.

Ordinary questions still use the existing Copilot. Keyboard activation, evidence navigation, panel closing/focus restoration and close/reopen persistence are exercised by component tests. No new layout system was introduced.

## G. Approval and transaction implementation

The existing confirmation transaction checks stored proposal identity/status, parses the strict operation, verifies the active thread and exact target, checks profile/skill revisions, revalidates evidence and prevents duplicates. It then adds the skill, inserts an immutable `profile_skill_action` audit, and marks the stored proposal confirmed in the same transaction. Repeated or simultaneous confirmation yields one mutation and one audit.

The audit retains operation direction, exact before/after values, evidence IDs, profile/thread/message IDs, timestamp and `acceptedBy: explicit_proposal_review`. Attempts to overwrite this audit kind fail. Existing job-note/application-status behavior and package audit immutability are preserved.

A focused concurrency test exposed a real in-memory race: a manual profile save during acceptance could be lost when the transaction committed its snapshot. Both repositories now route `saveProfile` through their existing transaction wrapper when called outside a transaction. The failing reproduction is retained in `concurrent-profile-before.log`; it passes after the fix. This change serializes the relevant manual edit without introducing a transaction engine.

Injected failures after skill/audit work but before message resolution verify atomic rollback for acceptance and undo in both repositories. A failed operation remains explicitly retryable. Existing derived match/package invalidation still runs through skill services; saved résumé versions, applications and evidence are preserved.

## H. Undo and conflicts

Undo requires the original confirmed action and matching immutable audit, no prior reversal, the same target profile revision and an unchanged exact created skill. A later edit to that skill, conflicting equivalent skill, changed profile or missing target refuses reversal. A pending undo also requires explicit acceptance and can be cancelled.

Successful undo removes only the skill introduced by that accepted action, records its reversal and retains the original proposal, audit and supporting evidence. Unrelated skills added subsequently remain. It does not restore a whole profile/database snapshot. SQLite export/reopen tests verify pending approval, accepted action and undo continuity; duplicate undo/acceptance is rejected.

## I. Authorization and outbound controls

The local skill flow makes **zero provider calls**. It does not depend on remote permission. The optional model flow requires an unchecked-by-default “Allow one evidence-backed profile-skill proposal” control, an explicitly named add request and selected career evidence, then the existing planning and data reviews. A separate action acceptance is still required afterward.

Profile identity, profile revision, skill-list revision and requested-skill binding remain in the existing local WeakMap receipt. They are not included in the provider request. No profile field or current skill-list outbound scope was added. The provider sees only already-authorized bounded records/question plus the proposal option. It is instructed that it has not seen the profile and cannot assert absence or successful addition.

Freshness is checked around provider use and transaction persistence. A changed profile invalidates the review before a provider call. The model wrapper accepts only the existing validated answer plus the strict optional suggestion. Existing budgets, request bounds, two-call workflow, provider settings and storage flags are unchanged. No claim about provider retention is inferred from an API flag.

Mock transport tests inspect payloads for private profile markers, paths/notes and unauthorized fields; adversarial arguments, wrong skills, unselected evidence, injected statements and unrequested proposal mode fail without partial conversation or domain changes. Native commands, permissions, Keychain handling and acceptance guards are unchanged.

## J. Synthetic acceptance evidence

`EVIDENCE/profile-skill-ui-acceptance.json` records the actual React/jsdom and synthetic SQLite result. Fixture identities are `profile-fixture`, project `aura`, fact `aura-langgraph` and existing skill `typescript`. The synthetic submitted résumé is `preserved-child`, with parent `preserved-master`; its exact application linkage/content is included in preservation assertions.

| Check | Result and evidence |
|---|---|
| Open Profile and Career AI; ask the AURA skill question | PASS — actual ProfilePage and panel components with SqliteRepository |
| Inspect verified evidence | PASS — citation opens the actual career-fact destination |
| Request addition and inspect exact proposal | PASS — absence/addition, target, evidence and review controls asserted |
| Reject/cancel without mutation | PASS — skills and unrelated domain snapshots unchanged |
| Fresh proposal, explicit keyboard acceptance, Profile refresh | PASS — one LangGraph skill appears |
| Persist and reopen | PASS — export SQLite, reopen repository, remount with fresh query client; conversation/action and skill retained |
| Review and accept undo | PASS — original skill list restored; add and reversal audits retained |
| Preserve unrelated data | PASS — profile fields, evidence, items, applications and résumé versions exactly equal before/after |
| Duplicate and stale acceptance | PASS — repository tests cover repeated/concurrent submission and changed profile/skills/evidence |
| Mocked model proposal | PASS — both evidence and synthesis responses; two reviewed mock requests, pending proposal only, then separate acceptance |
| Native restart/interactive UI | UNVERIFIED — no native session launched |

Local component acceptance recorded zero provider calls. Model interactions use `MockAIProvider` or a mocked native transport; no paid/live call was made. No screenshots were captured.

## K. Commands, results and skips

Commands ran in the existing verification source, using `EVIDENCE/check.py`, its isolated HOME/cache/temp paths and offline toolchain. `CC_ACCEPTANCE_ROOT` was removed for this nonlaunching run. No production database was initialized. The wrapper records exact argv, cwd, timestamp and exit code in each `*-result.json` and output in the corresponding `.log`.

Exact tool paths:

```text
NODE=/Users/athfan/.local/node-v22.23.4/bin/node
NPM=/Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js
CARGO=/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo
EVIDENCE=/Users/athfan/Desktop/career-compiler-sprint4-0-evidence-20261112-151717
```

The following are the exact final wrapper commands, with those paths expanded by shell variables:

```sh
python3 "$EVIDENCE/check.py" frontend-final "$NODE" node_modules/vitest/vitest.mjs run
python3 "$EVIDENCE/check.py" types-verified "$NODE" node_modules/typescript/bin/tsc -b --noEmit
python3 "$EVIDENCE/check.py" lint-verified "$NODE" node_modules/oxlint/bin/oxlint .
python3 "$EVIDENCE/check.py" rust-tests "$CARGO" test --manifest-path src-tauri/Cargo.toml --locked --offline
python3 "$EVIDENCE/check.py" rustfmt "$CARGO" fmt --manifest-path src-tauri/Cargo.toml --check
python3 "$EVIDENCE/check.py" clippy "$CARGO" clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked --offline -- -D warnings
python3 "$EVIDENCE/check.py" native-build "$NODE" "$NPM" run tauri:build -- --debug --no-bundle -- --locked --offline
python3 "$EVIDENCE/verify-preservation.py"
GIT_OPTIONAL_LOCKS=0 git diff --check
```

| Final check | Result |
|---|---|
| Frontend | 88 test files; 749 passed, 2 existing skips; exit 0 |
| TypeScript | PASS; exit 0 |
| Lint | PASS; exit 0 |
| Rust tests | 40 passed; binary/doc targets contain 0 tests; exit 0 |
| Rustfmt | PASS; exit 0 |
| Clippy, all targets/features, warnings denied | PASS; exit 0 |
| Frontend production build | PASS, executed by native beforeBuildCommand (`npm run build`, TypeScript + Vite) |
| Native debug executable build | PASS; `--no-bundle`, executable produced, not launched |
| Preservation and tested-copy parity | PASS; `final-preservation.json` |

The two historical skips remain in `historyRecovery.test.ts`; none were added to achieve a pass. There are 23 additional frontend test cases compared with the reported 726 baseline. Non-failing output includes the existing Node SQLite experimental warning and Vite chunk-size warning. No assertion was removed or weakened.

Focused final run `actions-final` passed 40 tests covering the new action/model/UI flow plus existing action/undo tests. Earlier development failures are preserved: a duplicate citation-link selector in UI QA (fixed by scoping to the actual conversation and asserting the destination), a readonly test-fixture array type (copied to the required mutable shape), and the manual-profile concurrency regression described above. All relevant tests pass in the final full suite.

## L. Added and modified files

Added:

| Path | Purpose |
|---|---|
| `src/lib/copilot/profileSkillContract.ts` | Strict shared suggestion contract and provider instructions |
| `src/lib/copilot/profileSkillActions.ts` | Local evidence, proposal, acceptance, undo and bounded intent handling |
| `src/lib/copilot/profileSkillActions.test.ts` | 16 action, conflict, concurrency and persistence cases |
| `src/lib/copilot/profileSkillModel.test.ts` | 4 reviewed model/privacy cases |
| `src/features/copilot/ProfileSkillWorkflow.test.tsx` | 2 actual component acceptance workflows |
| `src/test/profileSkillFixture.ts` | Explicit synthetic memory/SQLite fixtures and reopen support |
| `docs/SPRINT_4_0_REVIEWABLE_PROFILE_ACTION_REPORT.md` | This report |

Modified:

| Path | Purpose |
|---|---|
| `src/types/domain.ts` | Add exactly one pending-action type |
| `src/lib/copilot/careerCopilot.ts` | Reuse local conversation/persistence for skill intents |
| `src/lib/copilot/actionReview.ts` | Validate and prepare reviewed skill undo |
| `src/lib/database/memoryRepository.ts` | Narrow action dispatch, immutable audit, serialized profile save |
| `src/lib/database/sqliteRepository.ts` | Matching transactional action/audit/profile-save behavior |
| `src/lib/copilot/workspaceContract.ts` | Optional proposal request/response wrapper |
| `src/lib/copilot/workspaceConversation.ts` | Local receipt binding and validated model-to-pending proposal |
| `src/lib/ai/openAIProvider.ts` | Opted-in structured wrapper within existing transport |
| `src/lib/ai/mockProvider.ts` | Deterministic fixture suggestion within existing mock flow |
| `src/lib/copilot/workspaceTransport.test.ts` | One added outbound/wrapper/adversarial transport test |
| `src/features/copilot/WorkspaceReadReview.tsx` | Default-off proposal authorization and explanation |
| `src/features/copilot/CareerCopilotPage.tsx` | Shared skill review, evidence, acceptance/result and undo UI |

## M. Data, credentials and recovery

Tests use synthetic in-memory SQLite fixtures and repositories. Production database contents and credentials were not opened or modified; there were no Keychain calls, external requests, production migrations, Git writes, commits, pushes or deployments. No new native permissions, command access or application identity was introduced.

Final verification checks source hashes/modes/membership, tested-copy parity, unchanged branch/HEAD and eight protected Git entries, 57,125 preexisting excluded build/runtime/private artifact metadata entries, 1,251 candidate files and both existing recovery archive hashes. Metadata equality is not represented as a new content-level production database audit. Keychain contents were not inspected.

The existing recovery directory `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/recovery` and candidate are untouched. Sprint-specific rollback is available without resetting other work:

1. Check current affected paths against `EVIDENCE/changes.json`; stop if subsequent work differs.
2. Verify the archive hash and the 12 replacement before-hashes/modes.
3. Restore only those replacements from `EVIDENCE/before/` or the verified archive; preserve their modes.
4. Move the seven additions into a new quarantine directory instead of deleting them.
5. Reverify against `preservation.json`; do not wholesale extract over the repository, reset Git or touch production data.

Rollback was not executed. The authoritative repository retains all earlier work plus this scoped sprint.

## N. Native QA limitation

The prior native UI identity-resolution blocker was not investigated or bypassed. No app was launched, no historical process was inspected or signalled, and no identity, guard or tooling configuration was changed. Tauri dev startup, native keyboard/layout behavior and real native restart remain unverified for Sprint 4.0. A successful native build and synthetic component acceptance do not establish them. No new PDF verification was required or claimed.

## O. Unfinished or intentionally unsupported behavior

Native interactive QA and live-provider compatibility remain unverified. The existing remote workflow still uses a saved-job conversation anchor; the local skill workflow works directly from Profile. Bounded phrasing and conservative evidence rules may require an explicit named skill/project rather than arbitrary natural-language interpretation. No inline proposal editing, bulk action, generic deletion, profile-field mutation, résumé rewriting or new autonomous behavior was added.

These limits do not prevent the specified single-skill synthetic acceptance flow. A user must review evidence and accept each exact operation; the assistant cannot turn a general recommendation into an automatic write.

## P. Next action recommendation

If separately authorized, the next small domain action should be an explicit application follow-up date proposal, bound to one application revision with a before/after review, provenance and conflict-safe undo. Require a user-supplied or recorded date rather than inferring a deadline. This is a recommendation only; no subsequent sprint or action was started.
