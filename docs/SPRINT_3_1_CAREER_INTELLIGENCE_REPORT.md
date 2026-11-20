# Sprint 3.1 — grounded job and résumé comparisons

## A. Executive summary and status

**PARTIAL — November 12, 2026.** The bounded primary workflow is implemented and covered by synthetic tests: compare selected jobs using existing deterministic fit and eligibility rules, inspect evidence and uncertainty, resolve a ranked-job follow-up, recommend an existing résumé from validated bullet evidence, and report selected application state. Results and exact record references persist in the existing Career AI conversation. No career-record write capability was added.

The implementation remains deliberately bounded. Résumé coverage uses the existing technical-requirement rules, not exhaustive document understanding. The model selects permitted tools and validated quotes; application code determines the ranking and recommendation. General model-written reasoning remains incomplete. Live provider behavior and interactive native acceptance are unverified. Those limitations prevent a COMPLETE classification.

## B. Verified baseline and preservation

- Authoritative source: `/Users/athfan/Desktop/career-compiler`.
- Branch: `ui-ux-overhaul`; HEAD: `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`.
- Evidence and reversible source backup: `/Users/athfan/Desktop/career-compiler-sprint3-1-evidence-20261112`.
- Pre-edit inventory: **1,259 source files**, including existing tracked and untracked work. The actual source matched the final Sprint 3 manifest with **zero drift**. Existing cumulative uncommitted work was preserved, not reconstructed from HEAD.
- Snapshot: `source-before.tar.gz`; SHA-256 `c9d57a7c0da3a482960e2a60e7253e3b894d7cc11678bf2eb7f7c212d6bb66b8`. `preservation.json` records every source hash/mode and `git-status-before.txt` records status.
- Verification reused `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/owner-approved-integration-20261112/verification-source`. Only changed source paths were synchronized. No new full development copy was created.
- `changes.json`, `sprint3-1.patch`, `before/`, and `final-preservation.json` describe the final change set and recovery checks. The patch is supplemental; the archive and manifest also cover untracked files.

## C. Existing infrastructure reused

The existing Career AI panel/full page, message renderer, thread/message repository, source citations, React Query, `AIProvider`, OpenAI structured transport, mock provider, shared budget reservations, two-stage outbound review and single-use approval receipts are retained.

Comparisons reuse `assessJobFit`, `reconcileApplication`, `filterFitFeed`, `rankPreferences`, `findDuplicate`, `validateResumeClaims`, and the existing résumé recommendation scoring formula. `scoreResume` is now exported for pure calculation; the existing cache-writing recommendation workflow is not called by a read tool. `readRankingPreferences` extracts the existing preference reader so comparison does not read private job-skip notes. Other callers retain the original `readRefinement` behavior.

There is no second provider, scoring engine, conversation store, approval system or database schema. Existing job-note/application-status approvals, cancellation, stale-state checks and undo remain intact.

## D. Deterministic job ranking

The input is at most five explicitly selected saved jobs plus permitted supporting records. Only selected, enabled, verified facts and their enabled parent items contribute career evidence. Standalone skills and the full personal profile are not silently loaded. Saved preferences and reviewed eligibility claims require their own unchecked-by-default permission.

Each job gets existing fit reasons, fit score, preference-adjusted priority, eligibility, sponsorship evidence, selected application reconciliation, recorded posting date, confidence limits, recommendation and supporting record references. Technical reasons appear separately from eligibility; the existing total score is explicitly **not** represented as a probability or pure technical-fit percentage.

Ordering is stable and documented in the response:

1. Actionable eligible jobs with explicit sponsorship conclusions.
2. Jobs requiring confirmation, including unknown sponsorship or possible application matches.
3. Jobs with recorded application activity.
4. Known conflicts and skipped/unavailable jobs.

Within each group the existing feed ordering applies: preference-adjusted fit descending, posting/creation date descending, then ID. Possible duplicates are flagged without merging identities. Missing posting dates remain unknown; no live freshness check occurs. Missing requirements or evidence remain uncertain. Incomplete selected employment history cannot inherit a complete-history assertion from a broader local claim.

Application reconciliation is explicitly limited to selected applications. No match in that subset never becomes a workspace-wide claim that the user has not applied. Exact application records show actual status, recorded applied date and exact submitted résumé ID. Imported/unproven matches remain possible matches; this tool does not fetch unselected application-history proof bodies.

## E. Résumé comparison and evidence limits

The comparison accepts one selected job and up to five selected existing versions. The user must separately authorize local résumé-evidence computation and select supporting verified facts.

Included, unrejected bullets must cite selected facts from the correct career item and pass existing claim validation. Unsupported metrics, missing facts, unverified evidence and blocking validation errors cannot support a recommendation. Coverage requires both verified skill evidence and that skill in an included validated bullet. Titles, filenames, arbitrary keyword tags and stale stored analysis are not treated as content evidence.

Versions sort by supported required-technical-rule coverage, remaining gaps, the existing recommendation score on supported content, then ID. Names and recency are neutralized for this comparison; empty unsupported sections and arbitrary keyword tags do not affect the score. A recommendation requires actual supported coverage, validated bullets and no blocking errors. Otherwise the response says the evidence is insufficient.

The output preserves each exact version ID, kind, parent/base lineage, submitted identity, supported/excluded counts, coverage and gaps. A locked Master and its same-named child are distinct. All original versions, locks, content and submitted identities remain unchanged.

**Limits:** this is coverage under existing technical-skill extraction rules, not every responsibility, qualification or formatting criterion. Unselected evidence is unavailable, not proof that the complete résumé lacks it. Raw bullet text, contact headers, PDF paths and complete résumé bodies stay local. A recommendation is a starting point, not export approval or eligibility verification.

## F. Extended typed read contracts and conversation

The existing registry gains two strict operations using existing Copilot tool names:

| Operation | Input and scope | Output |
|---|---|---|
| `analyze_job_requirements` | The complete selected set of 1–5 permitted job IDs; selected facts/applications; optional separately authorized preferences/eligibility | Ordered deterministic job reports and bounded explanations |
| `compare_resumes` | Exactly one permitted job ID, matching the resolved follow-up when present; selected résumé versions/facts/applications | Existing-version coverage, exact lineage/submitted IDs, justified recommendation or insufficiency |

The four existing entity reads remain available. Zod validates tool names, inputs, outputs and allowed fields; model IDs must match explicit grants. No SQL, filesystem, general repository, mutation or external-action tools exist. At most four calls and ten record requests execute per turn; grants permit ten records total and five per category. Complete results retain the **24,000-character** limit; overflow fails closed. Labels are bounded to 240 characters, ordinary fields to 2,400, and comparison sections have explicit array/text bounds. Audit summaries persist with the message.

The first review authorizes the catalogue, question, consent flags and resolved references. The second review authorizes the exact retrieved fields and computed summaries. Each phase consumes one existing budget reservation; limits are not increased. There are no recursive calls or automatic retries. Existing timeout/cancellation and native output-token restrictions remain unchanged.

Model answers remain validated evidence quotes. Comparison quotes must equal the complete supplied field and fit the existing quote bound; the model cannot truncate, reorder or rewrite a computed conclusion. Full application-computed reports render regardless of whether a short quote is available. The mock explicitly identifies fixed selection and does not claim model reasoning.

Existing message JSON stores ranked IDs and a focused job without a migration. With the same selected job set, “second” resolves to the last displayed ranking; “that one” and “already applied” retain its exact ID. Explicit selection can disambiguate. A model-requested partial ranking is rejected before reading records, so displayed positions cannot conflict with the selected set; the user can explicitly narrow that selection. Changed selections, out-of-range ordinals and unresolved résumé references require clarification. The saved-job thread anchor and pending-action targets do not change.

Before transport and persistence, receipts revalidate the selected records, provider settings, thread and a local digest of comparison inputs. Changes to résumé content, eligibility, preferences, or employment completeness invalidate review. Sensitive inputs used for that digest are not exported.

## G. Outbound privacy guarantees

Three new permissions default to false: deterministic fit summaries, saved preferences/reviewed eligibility, and local résumé evidence comparison. Opening the panel and navigating do not call a provider. Reusing a selection does not enable these permissions. Local Copilot remains available without expanded remote scopes.

UI selection, local access, explicit authorization and transmitted fields remain separate. Résumé content is inspected locally only with the comparison permission; the remote request contains derived coverage and references, never the body. Preferences/eligibility may reveal personal constraints through derived explanations, which the UI explicitly discloses before review. Only selected verified facts contribute statements or evidence links.

The allowlist excludes credential fields, private notes, history bodies, contact headers and local file paths. Existing minimization removes recognized email, local-path and `sk-` token patterns. This is not universal secret detection; user-authored text and derived excerpts still require exact outbound review. Imported records remain untrusted text. Adversarial tests cover injected résumé content, unauthorized IDs and SQL-shaped requests; retained tests cover malicious job text and unsupported answers.

Keychain handling, production Tauri permissions, acceptance guards, provider abstraction and `store:false` are unchanged. No paid request, credential access, external submission or job-board call was made for this sprint. `store:false` is not a claim about all provider retention.

## H. Citation and deep-link behavior

Typed destinations map only known entity kinds and validated IDs to Jobs, Applications, Résumés and Career Memory. Clicking rechecks local existence and evidence eligibility before navigation. Missing/deleted/disallowed targets show an unavailable message; another record is never substituted. Model-supplied route strings are not accepted.

Résumé links open the exact version, including archived versions. Career Memory links select the exact fact/item; explicit navigation to another item clears the precise citation filter. A missing fact has no fallback selection. Existing job/application detail routes are reused. Comparison citations are generated from actual supplied report sources, not fabricated model IDs. Reviewed snapshot warnings remain visible; clicking a current record does not retroactively make an old answer current.

New evidence panels fit the existing conversation, use expandable details and wrapping text, and retain its scroll/layout architecture. Actual native compact layout, keyboard interaction and screen-reader behavior were not verified in this sprint.

## I. Validated synthetic conversation

`validated-conversation.json` in the evidence directory is an actual test-generated transcript, including computed text and citation IDs. It contains four successful two-review mock turns and eight persisted messages:

| Question | Actual deterministic result |
|---|---|
| “Compare my three saved AI engineer jobs.” | `fit-job-6` / Ambiguous AI first: fit 82, eligibility needs confirmation, ambiguous sponsorship. `python-job` / Fixture AI second: fit 69, existing exact application. `fit-job-7` / Restricted Labs third: fit 82, known sponsorship conflict. The score is not allowed to override eligibility or application state. |
| “Why is the second one less suitable?” | Focus resolves to `python-job`, while the full permitted comparison remains available to inspect relative reasons. |
| “Which résumé should I use for that one?” | Focus remains `python-job`. `exact-child` is recommended from a verified Python project bullet; the same-titled `locked-master` supplies no supported bullet coverage. Parent/base are exactly `locked-master`. |
| “Have I already applied?” | The selected exact application is `applied`, recorded date `2026-10-14`, submitted version exactly `exact-child`. Other selected jobs do not receive a false no-application guarantee. |

The mock does not tailor a natural-language explanation to each question. These checks verify bounded tool execution, deterministic conclusions, reference continuity and grounding, not live model quality. SQLite export/reopen also preserves the conversation, ranked/focused references, recommendation and domain state. Domain snapshots before/after reads are equal.

## J. Checks, commands and limitations

All commands ran in the existing verification copy with controlled HOME, cache, temporary paths and retained offline Node/Rust installations. `check.py` and each `*-result.json` record exact executable paths, arguments, working directory, UTC completion time and exit code. No test opened the production database.

| Command | Result / evidence |
|---|---|
| `node node_modules/vitest/vitest.mjs run` | **714 passed, 2 existing skips, 83 files passed**; `frontend-verified.log` |
| `node node_modules/vitest/vitest.mjs run src/features/copilot/IntelligenceResponse.test.tsx src/features/copilot/WorkspaceReadReview.test.tsx src/lib/copilot/workspaceIntelligence.test.ts` | **23 passed**, after final fixture and permission-label corrections; `focused-complete.log` |
| `node node_modules/oxlint/bin/oxlint .` | PASS, 0 warnings/errors; `lint-verified.log` |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline` | **40 passed**, binary/doc targets passed; `rust-tests.log` |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | PASS; `rustfmt.log` |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked --offline -- -D warnings` | PASS; `clippy.log` |
| `node node_modules/typescript/bin/tsc -b --noEmit` | PASS; `typecheck-verified.log`; the subsequent final native build also reran project TypeScript |
| `npm run tauri:build -- --debug --no-bundle -- --locked --offline` | PASS; includes `npm run build` / `tsc -b` / Vite and native debug compilation; `native-build-verified.log`. No bundle signing or application launch. |

There are **23 new tests**: 20 intelligence/contract/persistence tests and three rendered UI tests. Coverage includes fit/conflict/uncertainty, missing dates and qualifications, duplicates/ties, exact Master/child/submitted identities, unsupported metrics/keywords, scopes, IDs and budgets, multi-turn references, partial-ranking rejection, provider failure, stale/deleted records, injection, no domain writes, no private profile/skip-note reads, SQLite reopen, exact navigation and unavailable states. Existing approval/undo, application-history/provenance, recovery, Jobs, Profile, Home, Activity and panel regressions passed in the full suite.

Initial failures were preserved in logs. They exposed incomplete synthetic fixtures, a missing-metadata read case, the completeness-digest edge case, unsupported keyword influence and partial-ranking ambiguity. Fixtures and the relevant implementation were corrected without removing coverage. A native-build attempt caught required fixture fields that a non-build `tsc --noEmit` invocation did not check; the final project build is the authoritative TypeScript check. The focused run covers fixture and label corrections; the final full run additionally covers partial-ranking rejection. No assertions were removed to obtain a passing result.

The two skips remain the retained-native recovery tests gated by `CC_HISTORY_BACKUP_ACCEPTANCE_ROOT` / `CC_HISTORY_RECOVERY_DESTINATION_ROOT`; those variables were not enabled. Existing React `act`, experimental SQLite and bundle-size notices are not hidden.

**Native interaction coverage: BLOCKED / not rerun.** The last verified Sprint 3 attempt could start its isolated binary but the UI tool could not bind the unique application identity. That historical evidence is in `docs/SPRINT_3_CAREER_AI_REPORT.md`; it is not a new Sprint 3.1 pass or failure. This sprint did not launch a native app, repeat historical process investigation, alter guards or bypass identity resolution. No Tauri dev startup, native restart/approval/undo, real PDF rendering, new width measurements, signed release or screenshot was verified here. The build check does not substitute for those interactions.

## K. Files added or modified

**Six additions, ten replacements, zero deletions**, including this report. The manifest records exact before/after hashes and modes.

| File | Change |
|---|---|
| `src/lib/copilot/workspaceIntelligence.ts` | New bounded deterministic comparison contracts, evidence projection and reference resolution |
| `src/lib/copilot/workspaceIntelligence.test.ts` | New synthetic safety, comparison, continuity and SQLite tests |
| `src/lib/copilot/citationNavigation.ts` | New typed, existence-checked local destinations |
| `src/features/copilot/IntelligenceResponse.tsx` | New shared rendering of computed comparisons |
| `src/features/copilot/IntelligenceResponse.test.tsx` | New consent/review and precise navigation tests |
| `docs/SPRINT_3_1_CAREER_INTELLIGENCE_REPORT.md` | New report |
| `src/lib/copilot/workspaceReads.ts` | Extended dispatcher and bounded computed outputs |
| `src/lib/copilot/workspaceContract.ts` | Comparison permissions/reference contract and immutable conclusion rules |
| `src/lib/copilot/workspaceConversation.ts` | Freshness, reference persistence and comparison citations |
| `src/lib/ai/mockProvider.ts` | Deterministic comparison fixture planning |
| `src/features/copilot/WorkspaceReadReview.tsx` | Explicit comparison permissions, focus selector and scope notices |
| `src/features/copilot/CareerCopilotPage.tsx` | Existing message integration, focus label and safe source links |
| `src/features/career-memory/CareerMemoryPage.tsx` | Exact fact/item destinations and unavailable states |
| `src/features/resume-library/ResumeLibraryPage.tsx` | Exact version destinations and unavailable states |
| `src/lib/jobs/preferenceRefinement.ts` | Reusable preference-only reader; skips remain outside comparison reads |
| `src/lib/search/resumeRecommendations.ts` | Export existing pure scoring calculation |

## L. Production preservation and recovery

No production database was opened or migrated, no real career data became a fixture, and no credentials, Keychain entries, production configuration or acceptance guards were changed. Read tools do not mutate jobs, evidence, applications, history/provenance or résumé versions. Explicit conversations still persist their intended messages/audit and shared budget reservations.

The final verifier compares source hashes/modes/membership against the pre-edit archive, checks exact parity with the verification copy, verifies protected Git state, prior candidate hashes and original recovery archive hashes, and checks original private/runtime file metadata without opening private contents. This is not a new content audit of production databases or Keychain.

Preservation result: **PASS**. Six additions, ten replacements, zero deletions. The other **1,249** original source files and all existing source modes remain unchanged; all **1,265** final source files match the verification copy. All **1,251** prior candidate hashes/modes and both original recovery archive hashes match. Branch, HEAD and eight protected Git entries remain unchanged. Metadata for **57,125** original excluded/private/runtime files is unchanged. The three native acceptance guard files and production Tauri configuration are byte-identical to the pre-sprint baseline. `final-preservation.json` records the checks and UTC verification time.

Recovery remains at `/Users/athfan/Desktop/career-compiler-sprint2-7-20261111-114140/recovery`; the prior candidate remains untouched. For a future rollback, first verify this sprint’s archive hash and all current after-hashes/modes in `changes.json`; stop if newer work differs. Restore only the ten replaced source files from the verified archive or `before/` copies. Move the six additions to a new quarantine directory rather than deleting them. Reverify baseline hashes and modes. Do not extract the whole archive over unrelated work, reset Git, or touch any database/credential/recovery artifact. Rollback was not executed.

## M. Remaining Sprint 3 work

- General model-composed reasoning beyond permitted tool selection and exact evidence quotes; live model quality remains unverified.
- Broader résumé responsibility/qualification coverage beyond the existing bounded technical rules.
- Search-driven evidence discovery, truly paginated repository reads and larger comparison sets. Current local list APIs materialize collections before filtering, although outbound records remain bounded.
- Application-history proof selection, rule-backed follow-up planning, and profile/skills summaries beyond explicitly reviewed eligibility and selected verified facts.
- More general conversational reference resolution, unanchored workspace threads, and durable remote permission preferences. Current ordinals/pronouns require the same explicit job set.
- Native interaction, accessibility and compact-width validation for the new controls; historical acceptance/PDF results are not new verification.

## N. Recommended next step

Complete native identity/tool binding and exercise this read-only comparison flow at 720/1024/1440 widths before expanding write scope. Then consider one explicitly authorized profile-fact correction proposal using the existing pending-action mechanism: exact target, before/after values, supporting facts, separate acceptance, stale-state rejection, transactional provenance and real undo. Do not begin résumé rewriting or external actions as part of that increment. No Sprint 4 implementation occurred here.
