# Sprint 3.2 — Grounded Conversational Intelligence

## A. Executive summary and status

**PARTIAL — a tested conversational slice is implemented; general free-form model synthesis and interactive native acceptance remain incomplete.**

Career AI now has an opt-in grounded explanation mode in the existing connected-record workflow. It combines deterministic job conclusions, verified evidence, exact résumé-version recommendations, application state, uncertainty and read-only next steps. Both existing outbound approvals remain mandatory. A five-turn conversation passes through the actual persisted Copilot pipeline using the mock provider.

The explanation contract deliberately uses controlled composition: the provider selects and combines locally constructed sentence variants. Arbitrary model-written factual prose is rejected, even if it carries a valid citation. This improves presentation and continuity over isolated quotes, but **does not complete Objective A's general model-written reasoning and synthesis**. A citation or a valid JSON schema alone cannot prove an arbitrary sentence true. This limitation is visible in the UI and is not presented as live-provider verification.

Résumé comparisons can additionally expose an explicitly authorized, bounded responsibility-overlap summary. They still preserve exact Master, child and submitted-version identities and never export full résumé documents or change domain records.

New verification: **726 frontend tests passed, two existing skips; 40 Rust tests passed; typecheck, lint, Rustfmt, Clippy, frontend build, native debug build and isolated acceptance-bundle build passed.** Native startup/interaction is not a pass: see section M.

## B. Repository baseline and preservation

- Authoritative repository: `/Users/athfan/Desktop/career-compiler`.
- Branch: `ui-ux-overhaul`.
- HEAD: `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`.
- Baseline recorded at `2026-11-12T14:31:03.741282+00:00`.
- All **1,265 source files**, including relevant tracked and untracked work, matched the final Sprint 3.1 manifest before editing. No prior-sprint source drift was detected.
- Recovery/evidence directory: `/Users/athfan/Desktop/career-compiler-sprint3-2-evidence-20261112`.
- Verified archive: `source-before.tar.gz` in that directory.
- Archive SHA-256: `364d8b27899b098ef3b644a77035f35388447afa17499346b92fbf21640813c3`.
- `preservation.json` records membership, file hashes and modes; `git-status-before.txt` preserves the cumulative uncommitted state. Archive member contents and modes were verified before editing.

Tests and builds use the **existing** verification source at `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/verification-source`. Changed source files were synchronized there; no new full development copy was made. The final preservation verifier checks complete source/hash/mode parity with this tested copy, protected Git state, original private/runtime metadata, the original integration candidate and existing recovery archives.

Final per-path before/after hashes and modes are in `changes.json`; the complete additive/replacement patch, including untracked additions, is `sprint3-2.patch`. Neither is applied to any other repository.

The final audit passed: 1,272 source files, seven additions, 11 replacements, zero deletions, 1,254 other original files unchanged, unchanged original modes and full parity with the tested source. Protected Git entries, private/runtime metadata, candidate and recovery archives passed their checks. `final-preservation.json` records the latest audit timestamp and results.

## C. Existing architecture reused

- `WorkspaceReadReview`, `CareerCopilotPage`, the persistent panel/full-page surface and existing record-navigation callbacks.
- `reviewWorkspaceQuestion` / `sendWorkspaceReview`, immutable single-use outbound-review receipts, selected-record freshness checks and saved-job thread binding.
- Existing `workspaceRead` JSON in persisted messages; no new store or migration.
- Existing `OpenAIProvider.converseWorkspace`, `MockAIProvider`, structured-response transport and shared budget reservations.
- Existing typed read dispatcher, exact repository reads, deterministic fit/eligibility/ranking services and résumé validation/recommendation logic.
- Existing internal citations, action review, approval, undo, application provenance and résumé lineage.

The pure résumé coverage helpers were extracted from `review.ts` into `coverage.ts` without changing their existing behavior. This prevents the cycle caused by importing the provider-owning review module into workspace contracts. Existing résumé-review tests remain intact.

## D. Grounded synthesis implementation

`workspaceSynthesis.ts` builds an evidence ledger solely from already authorized and retrieved results. Each unit has a category, exact subject, internal source references, one or two permitted sentence variants and a required-conclusion flag. It performs no repository or provider access.

The structured answer contains `status`, answer sentences with evidence IDs, uncertainty IDs and next-step IDs. Validation rejects unknown or duplicate evidence IDs, category mismatches, unsupported wording, extra fields/private reasoning traces, changed comparison order, omitted required conclusions and omitted uncertainty for mentioned subjects. Refused/insufficient answers must have empty answer arrays.

Limits: 30 evidence units, six answer sentences, five uncertainty units and five next steps; combined retrieved-record/evidence context is bounded to 24,000 characters. Oversized context fails with a request to reduce selection. Existing limits remain four read operations, five IDs per operation/category and ten selected/retrieved records. There is no recursive execution or automatic repair/retry.

The provider uses the existing `career_copilot` request and native schema names (`career_workspace_plan_v1`, `career_workspace_quotes_v1`) so native token caps and request restrictions remain unchanged. The answer schema is selected by the reviewed `responseStyle`; legacy quote-only requests still work. No native AI command or budget change was made.

For factual integrity this release supports **model-selected composition of checked wording**, not arbitrary paraphrases. OpenAI's [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) distinguishes schema adherence from correctness and documents refusal/error handling; local semantic constraints remain necessary. No live OpenAI request was made.

## E. Résumé comparison improvements

The new `resumeResponsibilities` consent defaults off and requires existing local résumé-evidence comparison permission. It permits only derived requirement excerpts, related verified fact references and an explicit comparison-limit notice in the reviewed outbound result.

The comparison uses the existing deterministic responsibility extractor on the current saved job text, avoiding stale cached analysis. An overlap must occur in both a validated included résumé bullet and a linked, selected verified source fact. It is labelled `related_evidence`, never proof of complete responsibility coverage. Unestablished coverage remains explicit. There are at most eight responsibility excerpts per version.

Technical coverage remains the primary version ordering. Authorized responsibility overlap breaks ties before the existing recommendation score and exact ID. Names and filenames do not establish fit. Versions with insufficient validated technical support are not recommended. Locked Master, parent/base lineage and the exact submitted child ID remain distinct and unchanged.

Limitations: this is bounded lexical evidence retrieval, not semantic entailment. Education, employment duration and other qualifications still require separate review. Metadata-only permission cannot justify content coverage. Full résumé text remains local.

## F. Multi-turn context

The existing ordered job IDs and focused job ID continue to live in `structuredContentJson.workspaceRead.references`. Follow-ups now retain focus for “what should I do next?” and related next-step wording as well as the existing ordinal/pronoun cases. Ambiguous or out-of-range references request clarification; an explicit focus must belong to the authorized selection.

The five-turn flow retains `python-job` after resolving the second job. Screen navigation does not substitute a new conversation target. Each reviewed request revalidates the selected records and AI settings; stale or deleted records fail before saving the answer. Persisted answers are labelled reviewed snapshots, not current-record guarantees.

A real `SqliteRepository` backed by synthetic sql.js storage was exported, closed and reopened in a new test. The saved explanation, exact résumé/application records and next-step focus survived. This is automated SQLite persistence evidence, not a native app-restart pass.

## G. Privacy and outbound controls

The four boundaries remain distinct: current screen selection, authorized local reads, explicitly approved outbound fields and actual provider payload. Opening the panel or browsing does not initiate requests.

The new explanation option authorizes no additional records. Responsibility summaries require a separate unchecked permission. The first outbound review contains the ordered catalog/question and existing budget anchor; the second shows the exact retrieved fields, comparison summaries and synthesis ledger. Both require explicit approval. Changing selection invalidates the receipt. Declining expanded access leaves local Copilot functionality available.

No new arbitrary SQL, filesystem, profile-write, application-write, résumé-write or external-action tool was introduced. Full résumé bodies, private notes, contact details, paths and credentials remain excluded by the existing field allowlists/minimization. Tests inspect the actual transport and reject an added hidden `privateProfile` field. User-authored question text is visibly part of the reviewed payload, as before.

Imported records remain untrusted. A malicious job description cannot add `get_profile`, obtain unselected IDs or mutate records; invented statements fail local output validation. Existing résumé-injection and allowlist regression coverage also ran. These are tested bounded protections, not a claim to detect every possible secret embedded in arbitrary text.

Provider settings, Keychain code, `store:false`, shared spending limits and native output-token caps were not changed. The storage flag is not represented as a guarantee about all provider retention.

## H. Synthetic conversation evidence

Actual pipeline output is saved in `synthesis-conversation.json`; a concise extract is in `conversation-summary.json` under the evidence directory. Five user turns produced ten persisted messages through ten reviewed mock requests. Domain-record snapshots before and after were equal.

| User turn | Verified result |
| --- | --- |
| “Look at my saved AI engineering jobs. Which should I prioritize?” | Local order: `fit-job-6` (82, eligibility needs confirmation), `python-job` (69, needs confirmation), `fit-job-7` (82, disqualified). Technical score does not override eligibility or workflow priority. Unknown sponsorship and confirmed conflict remain explicit. |
| “Why is the second job less suitable?” | Resolves exactly `python-job`; reports its checked Python/project evidence, local preparation priority and existing application context. Does not replace the deterministic rank. |
| “Which existing résumé should I use for it?” | Recommends `exact-child` from validated Python bullet evidence, identifies its exact submitted status and keeps same-named `locked-master` distinct. |
| “Have I already applied?” | Reports selected application `exact-application`, status `applied`, recorded date `2026-10-14`, submitted version `exact-child`. No workspace-wide absence claim. |
| “What should I do next?” | Retains `python-job`; suggests inspecting the existing application and exact version before reuse. Creates no tasks, submissions or domain edits. |

Additional tests cover missing evidence, no justified résumé recommendation, closed jobs, conflicting reviewed eligibility, invalid scope, stale/deleted records, metadata-only answers, provider unavailability, cancellation and malformed output. All provider interactions were mocked.

## I. Citation validation, navigation and presentation

Synthesis citations are constructed from the validated ledger's retrieved sources; model-invented citation IDs are rejected. Existing saved comparison citations and the record resolver/navigation path are reused. Exact résumé-version links remain exact version IDs.

The existing panel renders a short explanation, expandable uncertainty/evidence limits, read-only next steps and expandable complete local comparisons. It labels mock composition distinctly from the OpenAI path and labels historical results as snapshots. Saved synthesis is revalidated before rendering; malformed saved content produces an alert rather than substituted context.

A provider failure leaves the conversation unchanged and offers the previously reviewed deterministic results, clearly labelled as local snapshots with no saved model explanation. Retry is explicit and goes through fresh review. Keyboard activation, scope defaults, error/empty states and expandable details are covered in jsdom tests. Native layout/keyboard behavior was not established in this run.

## J. Commands and results

All checks below used the existing verification source, isolated HOME/cache/temp paths, the existing project-scoped toolchain and offline Cargo. Exact argument arrays, working directories, completion times and exit codes are recorded in the corresponding `*-result.json`; output is in `*.log`.

Aliases used in this table:

```text
NODE=/Users/athfan/.local/node-v22.23.4/bin/node
NPM=/Users/athfan/.local/node-v22.23.4/lib/node_modules/npm/bin/npm-cli.js
CARGO=/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/toolchains/rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo
EVIDENCE=/Users/athfan/Desktop/career-compiler-sprint3-2-evidence-20261112
```

Each normal command was run as `python3 <EVIDENCE>/check.py <log-name> <command-and-arguments>`. The acceptance bundle used `native-check.py`, which pins the unique build identity.

| Check | Actual command (aliases expanded in result JSON) | Result |
| --- | --- | --- |
| Focused regression | `NODE node_modules/vitest/vitest.mjs run src/lib/copilot/workspaceSynthesis.test.ts src/features/copilot/SynthesisResponse.test.tsx src/lib/copilot/workspaceIntelligence.test.ts src/lib/copilot/workspaceConversation.test.ts src/lib/copilot/workspaceTransport.test.ts src/lib/resume/review.test.ts src/features/copilot/IntelligenceResponse.test.tsx src/features/copilot/WorkspaceReadReview.test.tsx` | 65 passed; `focused-final`. The later metadata-only case is included in the full suite below. |
| Full frontend | `NODE node_modules/vitest/vitest.mjs run` | **726 passed, 2 existing skips, 85 files**; `frontend-final`, exit 0. Includes existing approval/undo, history/provenance, Jobs, Home, Applications, Résumés, Profile, Activity, panel lifecycle and persistence tests. |
| TypeScript | `NODE node_modules/typescript/bin/tsc -b --noEmit` | PASS; `types-final`, exit 0. |
| Lint | `NODE node_modules/oxlint/bin/oxlint .` | PASS; 0 warnings/errors, 291 files; `lint-final`. |
| Rust | `CARGO test --manifest-path src-tauri/Cargo.toml --locked --offline` | **40 passed**; `rust-tests`, exit 0. |
| Rustfmt | `CARGO fmt --manifest-path src-tauri/Cargo.toml --check` | PASS; `rustfmt`, exit 0. |
| Clippy | `CARGO clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked --offline -- -D warnings` | PASS; `clippy`, exit 0. |
| Frontend + native debug | `NODE NPM run tauri:build -- --debug --no-bundle -- --locked --offline` | PASS; `native-build`. Includes the configured frontend production build. |
| Isolated native bundle | `NODE NPM run tauri:build -- --debug --config <EVIDENCE>/tauri.unique.json -- --locked --offline` | PASS; `acceptance-build`, exit 0. |
| Native startup/interaction | `python3 <EVIDENCE>/launch-owned.py ui`, then `startup-retry` after fixing only missing temporary directories | BLOCKED/NOT VERIFIED; see M. No ordinary production `tauri:dev` launch was performed. |

Vite still reports a chunk larger than 500 kB; this is a build warning, not a failed build. No dependencies or lockfiles changed.

Early failed checks are preserved: importing review helpers exposed a provider/contract circular dependency; extracting their unchanged pure implementation fixed it. A context-limit test initially did not exceed the limit; its fixture was corrected and explicitly asserts its size. Validation error precedence and an implicit test-spy `this` annotation were corrected. No test was removed or weakened to obtain the final pass.

## K. Changed and added files

**18 paths: 11 replacements, 7 additions, 0 deletions.** Existing cumulative uncommitted work remains.

| Path | Change and purpose |
| --- | --- |
| `src/lib/copilot/workspaceSynthesis.ts` | Added: bounded evidence ledger, composition contract, semantic checks, citations and instructions. |
| `src/lib/copilot/workspaceSynthesis.test.ts` | Added: nine synthetic workflow, privacy, grounding, scope and persistence tests. |
| `src/lib/copilot/workspaceContract.ts` | Extended existing request/answer schemas, retaining legacy quote mode. |
| `src/lib/copilot/workspaceConversation.ts` | Existing reviewed pipeline now projects, validates and persists synthesis. |
| `src/lib/copilot/workspaceIntelligence.ts` | Optional responsibility summaries and next-step reference continuity. |
| `src/lib/copilot/workspaceIntelligence.test.ts` | Reuses extracted synthetic fixture; existing tests/assertions retained. |
| `src/lib/copilot/workspaceTransport.test.ts` | Added mocked OpenAI transport coverage for synthesis and strict fields. |
| `src/lib/ai/openAIProvider.ts` | Existing structured call selects the reviewed synthesis schema/instructions. |
| `src/lib/ai/mockProvider.ts` | Deterministic, explicitly labelled mock composition. |
| `src/lib/resume/coverage.ts` | Added: extracted existing pure coverage helpers, avoiding provider import cycle. |
| `src/lib/resume/review.ts` | Imports the unchanged helper implementations. |
| `src/test/intelligenceFixture.ts` | Added: shared synthetic profile/jobs/versions/application fixture. |
| `src/features/copilot/WorkspaceReadReview.tsx` | Explicit explanation/overlap choices, review preservation and local failure fallback. |
| `src/features/copilot/SynthesisResponse.tsx` | Added: validated explanation, expandable uncertainty and next steps. |
| `src/features/copilot/SynthesisResponse.test.tsx` | Added: two interaction, failure/retry and rendering tests. |
| `src/features/copilot/IntelligenceResponse.tsx` | Shows permitted responsibility overlap and its limits. |
| `src/features/copilot/CareerCopilotPage.tsx` | Renders synthesis in the existing conversation with expandable local comparisons. |
| `docs/SPRINT_3_2_GROUNDED_CONVERSATION_REPORT.md` | Added: this report. |

## L. Data preservation and security

No production database contents or credentials were opened. Tests used memory repositories and synthetic sql.js databases; native attempts targeted only the dedicated path in section M, which remained absent. No production migration, real application action, external submission or paid request occurred.

The final preservation audit checks all source membership/hashes/modes, 57,125 previously inventoried original private/runtime file metadata entries, eight protected Git entries, branch and HEAD, the 1,251-file integration candidate and its existing recovery archives. Private/runtime checks compare size, mode and modification time without opening contents; they are **metadata evidence, not a new content hash of production data**.

`src-tauri/build.rs`, `src-tauri/src/acceptance.rs`, `src-tauri/src/lib.rs` and production `tauri.conf.json` remain byte-identical to the sprint baseline. No Tauri capability, Keychain handling, schema, budget setting, Git history/reference, commit, push or deployment change was performed. No unrelated process inspection was used.

Recovery procedure (not executed): first verify `source-before.tar.gz` against its SHA-256 and inspect `changes.json`. If every current changed path still matches its recorded after-hash/mode, restore only the 11 replaced paths from the verified `before/` copies or archive and move the seven added paths into a new quarantine directory. If any path has subsequent work, stop for reconciliation instead of overwriting it. Recheck all 1,265 original files against `preservation.json`. Never reset Git, extract the archive wholesale over the repository or delete added work. Existing earlier recovery artifacts remain intact.

## M. Native QA and limitations

Unique acceptance identity:
`com.mirathfan.careercompiler.acceptance.run83554983eeb14244b579898f3d784624`.

Dedicated root: `/private/tmp/careercompiler-native-q45or6l9`.
Dedicated HOME: `/private/tmp/careercompiler-native-q45or6l9/runtime-home`.
Intended synthetic database: `/private/tmp/careercompiler-native-q45or6l9/native.sqlite3`.
Dedicated application-data/cache directories are under this HOME and exact identifier. Build pin, runtime pin, root markers, bundle identity, restricted capability set and unchanged native guards were verified. No production identifier or permission was changed.

The first owned launch (`5477`) failed the application-path guard because the identity-specific temporary subdirectories had not been created. It exited `-6` before database creation. After creating only those required temporary directories, the second owned launch (`5642`) produced no startup artifact or database before it was stopped. Both UI-tool attempts returned `Invalid app` for the unique identifier. The second child was terminated via its retained `Popen` handle, not a historical PID, and `wait()` recorded exit `-15` at `2026-11-12T14:50:41.404558+00:00`.

No active owned session remains according to those launch handles. This is process-exit evidence, not a successful UI Quit. No process enumeration, permission expansion, identity workaround or guard modification was attempted.

| Native item in this sprint | Status |
| --- | --- |
| Acceptance bundle build and identity configuration | PASS |
| Successful native startup and actual synthetic database identity | BLOCKED / not verified; intended database remained absent |
| Home → Jobs → contextual AI interaction | BLOCKED |
| Native five-turn conversation, citation navigation, cancel/accept/undo and restart | BLOCKED; automated coverage is separate |
| Compact desktop overflow, focus and native keyboard behavior | BLOCKED / not observed |
| PDF generation/readability/page count | Not rerun; no new native PDF claim |
| Termination of this run's owned children | PASS, recorded exit codes above |

Evidence: `identity.json`, `tauri.unique.json`, `startup-preparation-correction.json`, `ui-owned.json`, `startup-retry-owned.json`, native logs and `native-startup-evidence.json`. No screenshots were captured. Earlier native/PDF results remain historical evidence only.

## N. Incomplete functionality

1. General model-written semantic synthesis remains incomplete. Controlled composition is enabled only by explicit choice and rejects otherwise valid paraphrases; it is not a substitute for the full requested reasoning capability.
2. Responsibility comparison is a bounded lexical signal. Full qualification/experience coverage and semantic résumé comparison are not complete.
3. Context resolution is bounded to selected IDs, explicit focus and recognized ordinal/follow-up wording. Arbitrary ambiguous natural-language references require clarification.
4. Live-provider behavior is unverified by design. Both provider selection and response transport were mocked.
5. Native startup, interactive UI, compact layout and native restart were not verified this sprint. Automated SQLite reopen must not be presented as native restart acceptance.
6. Existing Vite bundle-size warning remains; no unrelated optimization was attempted.

## O. First safe Sprint 4 action recommendation

First close the read-only synthesis and native-acceptance gaps. Then consider a narrowly defined model-proposed update to an **existing application's explicit follow-up date**, using the current pending-action review engine: exact record ID, before/after date, source evidence, explicit approval, stale-state check, transactional provenance and conflict-aware undo. Treat this as a proposal for a separately authorized sprint; no new action, schema or write permission was implemented here.
