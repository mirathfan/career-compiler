# CareerCompiler Full Product Audit

Audit date: 2026-07-16  
Audited commit: `af38c5c1bf40db899f1a3737cc6cd620060c94cf`  
Final result includes fixes made during the audit.

## Executive Verdict

**Ready for supervised beta use, not yet ready for unsupervised daily use or external beta.**

CareerCompiler has a strong local-first foundation: evidence-grounded generation, local SQLite persistence, Keychain-backed OpenAI secret storage, deterministic validators, a real Chrome extension bridge, and a meaningful test suite. The core "seed profile -> analyze job -> score evidence -> generate a reviewable resume" workflow works in the browser-memory runtime and the Tauri app starts cleanly from a fresh local profile.

The product still needs supervised use because several daily-use surfaces remain brittle or under-verified: first-run onboarding is seed-profile oriented, Chrome extension setup is technical, public ATS compatibility has only been read-only inspected, Workday is unsupported, and PDF export was not visually verified end-to-end from the packaged app with a complete profile. During this audit I fixed the most serious correctness, privacy, and false-ready issues found.

No real job applications were submitted. Public ATS pages were inspected read-only:

- Greenhouse: [Mercury Senior Software Engineer - Frontend Developer Experience](https://boards.greenhouse.io/mercury/jobs/6116808004)
- Lever: [Proof Senior Full Stack Software Engineer](https://jobs.lever.co/proof/398186bb-457d-453f-a747-57c72217e12e/apply)
- Ashby: [SPAN Staff Software Engineer: Embedded Device Software](https://jobs.ashbyhq.com/span/067aa28a-da63-412e-ac06-085923a6ab09/application?ref=levels.fyi&src=levels.fyi&utm_source=levels.fyi)

## What Is Good

- The architecture is disciplined: database/repository logic, AI request construction, tailoring, resume validation, search, Copilot tooling, import, and UI routes are separated cleanly.
- The evidence contract is real. Resume bullets carry `sourceFactIds`; validation catches unsupported claims, prohibited facts, duplicate bullets, weak links, and contact completeness.
- Secret handling is appropriately conservative. OpenAI API keys go through macOS Keychain commands rather than SQLite, localStorage, logs, or backups.
- Local-first persistence works. A fresh Tauri dev run and a packaged app smoke test both created isolated SQLite databases without touching the real profile.
- The Chrome native bridge has a serious security model: explicit extension IDs, pairing credentials, bounded messages, origin validation, pending desktop approvals, and no automatic submit path in code or tests.
- The test suite is broad enough to catch many regressions: validators, migrations, search, Copilot, extension request processing, content-script fixtures, manual-submit safeguards, LaTeX safety, keychain behavior, and bridge cleanup.
- The mock provider makes the main tailoring workflow testable without paid OpenAI calls.
- The app is honest in several places: export blocks on validation failures, sensitive answer fields can be marked as user-required, and settings expose provider mode and data-control decisions.

## What Is Bad

- First-run UX still feels like a private developer tool. "Run safe seed" and Mir-specific seed copy are useful for development but confusing as the main onboarding affordance.
- The Chrome extension setup is powerful but technical. A nontechnical user will likely need help pairing, installing, verifying, and recovering from native-host issues.
- Public ATS compatibility is not proven enough for daily trust. Greenhouse, Lever, and Ashby were read-only inspected; no full no-submit browser-extension session was completed against live forms.
- Workday is effectively unsupported.
- The app has pockets of false confidence. Before this audit, Export PDF looked available even when contact validation would block it.
- Some workflows are strong in code but not polished in UI: backup restore, evaluation, Copilot tooling, sensitive answer vault, and import review.
- The production web build still emits a Vite chunk-size warning for the main entry bundle.
- The product depends on external runtime prerequisites for full value: XeLaTeX, macOS desktop app packaging, Chrome extension installation, and optionally paid OpenAI requests.

## Critical Issues

| Severity | Issue | Repro | Impact | Fix status |
| --- | --- | --- | --- | --- |
| High | Locked Candidate Brain data could be overwritten or deleted through repository saves/deletes. | Lock a sensitive answer or candidate claim, then save a changed value through repository paths. | A "locked" item was not actually immutable, undermining user trust for sensitive application answers. | Fixed in `memoryRepository` and `sqliteRepository`; regression test added. |
| High | Sensitive answer UI could race when typing and immediately clicking Lock. | Type "No" in Future sponsorship and click Lock immediately. | The stored value could be stale or unlocked, and empty values rendered as literal `""`. | Fixed with controlled drafts, immediate lock save, readonly state, and UI regression test. |
| High | Native-host IPC socket used an Application Support path that could exceed macOS Unix socket limits and previously had broad default permissions. | Start Tauri with a long temp HOME; socket path reached 108 characters and no socket was created. Earlier audit run observed mode `srwxr-xr-x`. | Chrome native messaging could silently fail; socket visibility was broader than needed. | Fixed by moving socket to short per-user `/tmp/careercompiler-...` runtime path, setting runtime dir `0700` and socket `0600`, adding path-length regression test, and verifying dev and packaged app startup. |
| High | Authorized resume export cleanup did not recurse into per-application directories. | Authorized exports are stored under `AuthorizedResumeExports/<application-id>/...`; cleanup only scanned the root. | Expired PDF copies could remain longer than intended. | Fixed with recursive cleanup and Rust regression tests. |
| Medium | Export PDF button was enabled even when validation would block export. | Generate a resume from seeded profile with contact completeness 3/5. | User saw a ready-looking export button that failed on click. | Fixed by disabling export and surfacing the blocking reason in the button title; regression test added. |
| Medium | Extension field normalization trusted content-script `unknown` classifications too much. | Public Greenhouse custom fields such as Country can arrive as text-like `unknown`. | Known fields could become manual instead of auto-prepared. | Fixed by falling back to desktop classifier when extension type is `unknown`; regression test added. |
| Medium | Lever radio groups lost the real question label. | Lever authorization/sponsorship radios use Yes/No labels with question text in an ancestor container. | Work authorization and sponsorship groups could be classified as unknown. | Fixed content-script group labeling; fixture test added. |
| Low | Settings and Evaluation empty states rendered bare error text without route context. | Open Settings or Evaluation before creating/seeding a profile. | App felt broken on first run. | Fixed with page headers and an "Open Career Memory" action; regression tests added. |

No open Critical severity issue remains from this audit. The open blockers are product-readiness and end-to-end verification gaps rather than known catastrophic data-loss bugs.

## Feature Scorecard

| Area | Score | Notes |
| --- | ---: | --- |
| First-run onboarding | 6/10 | Functional but seed-centric and private-app toned. Needs real guided setup. |
| Career Memory | 8/10 | Strong data model, facts, links, jobs, projects, preferences, and validation. Manual UX is dense. |
| Local evidence import | 7/10 | Allowlisted, bounded, review-first, and prompt-injection aware. UI was not deeply E2E tested. |
| Candidate Brain | 8/10 | Useful claims, sensitive answers, stories, and answer preview. Lock semantics fixed during audit. |
| Job intake and analysis | 7/10 | Paste/sample workflow works with mock analysis. URL/web scraping is not a general capability. |
| Evidence scoring and tailoring | 8/10 | Deterministic scoring and resume planning are good. Some seeded recommendations over-favor mobile projects for full-stack roles. |
| Resume generation and validation | 8/10 | Strong evidence checks and one-page estimate. Full packaged PDF visual QA remains incomplete. |
| Resume library | 7/10 | Versioning/search/recommendations exist. Needs more real-world volume testing. |
| Application tracker | 7/10 | Useful CRUD/status model. Needs more workflow polish and real submission-history testing. |
| Application answers | 7/10 | Safe, evidence-backed, and review-first. Output can be generic and needs live form testing. |
| Chrome extension and native bridge | 6/10 | Solid engineering, but setup and ATS coverage are not daily-use ready. |
| Career Copilot | 7/10 | Good local tooling and citations. Not a general conversational agent yet. |
| Evaluation framework | 7/10 | Role fixtures and objective metrics are valuable. UI was gated behind seeded data until fixed. |
| Settings, backup, privacy | 7/10 | Good primitives; restore and extension setup need stronger guided UX. |
| Build/package health | 8/10 | All required checks pass; main bundle warning remains. |

## End-to-End Test Result

| Workflow step | Result | Evidence |
| --- | --- | --- |
| Install dependencies | Pass | `npm install` completed with no vulnerabilities. |
| Fresh browser runtime launch | Pass | In-app browser opened `http://localhost:5173/#/dashboard`. |
| Fresh Tauri dev startup | Pass | Isolated HOME created SQLite DB and IPC socket; socket dir `drwx------`, socket `srw-------`. |
| Packaged app launch | Pass | `npm run tauri:build` succeeded; packaged binary launched with isolated HOME and created DB/socket. |
| Dashboard empty state | Partial | Renders, but first-run copy remains seed/developer oriented. |
| Safe seed flow | Pass | Browser runtime seeded profile and populated Career Memory/dashboard counts. |
| Career Memory manual fact management | Partial | UI inspected and repository behavior tested; not all manual edit paths were clicked. |
| Smart Career Intake | Partial | Code and safety rules inspected; no full import/save session was run with real files. |
| Candidate Brain lock/edit flow | Pass | UI regression verifies immediate Lock preserves value and makes field readonly. |
| Candidate claim lock enforcement | Pass | Repository regression blocks locked claim changes until unlocked. |
| Job paste/sample analysis | Pass | Sample job analysis produced role summary, required skills, and scoring inputs. |
| Evidence scoring | Pass | Seeded evidence was scored and ranked for the sample full-stack role. |
| Resume generation review | Pass | Mock generation produced a reviewable resume with quality metrics and evidence citations. |
| Resume export | Partial | Export gating is now correct; XeLaTeX is installed. A complete-profile packaged visual PDF export was not finished. |
| Resume library | Partial | Empty/library routes inspected; full version lineage and restore workflows not exhaustively tested. |
| Application tracker | Partial | Routes and source inspected; full application lifecycle not exhaustively clicked. |
| Application answer generation | Partial | Request processor and classifiers tested; live extension answer insertion not completed. |
| Chrome native host install/pairing | Partial | Runtime socket verified in dev and packaged app; actual Chrome pairing was not completed. |
| Browser extension no-submit guarantee | Pass by automated tests, Partial by live testing | Static and fixture tests cover no submit/click behavior; public live pages were read-only inspected only. |
| Copilot | Partial | Tools/source inspected; full conversational scenarios not exhaustively tested. |
| Backup/restore | Partial | Code inspected; restore preview/confirm was not run against a real backup file in packaged app. |
| OpenAI live provider | Not tested | No paid API calls were made automatically. |

## ATS Compatibility

| ATS | Result | Findings |
| --- | --- | --- |
| Generic HTML forms | Partial | Content script handles inputs, textareas, selects, radios, checkboxes, labels, and nearby context. Coverage is good for normal forms but should be validated on more fixtures. |
| Greenhouse | Partial | Read-only Mercury page inspection found 15 visible controls, 3 file inputs, custom Country and sponsorship fields. The `unknown` fallback fix improves custom text field classification. No live fill/upload was performed. |
| Lever | Partial | Read-only Proof page inspection found 19 visible controls, 1 file input, 3 selects, and authorization/sponsorship radio groups. Lever ancestor-question labeling was fixed and tested. No live fill/upload was performed. |
| Ashby | Partial with risk | Read-only SPAN page inspection found 63 visible controls, 2 file inputs, and many demographic checkbox/radio groups. The extension needs stronger sensitive/demographic scoping before trusting broad Ashby fills. |
| Workday | Fail / unsupported | Workday is not meaningfully supported and should be presented as manual until a dedicated strategy exists. |

## Automated Test Coverage

Final automated coverage after audit fixes:

- TypeScript/Vitest: 22 files, 90 tests passed.
- Rust/Cargo: 21 tests passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:run`: passed.
- `npm run build`: passed with Vite chunk warning.
- `npm run extension:build`: passed.
- `cargo fmt --check`: passed.
- `cargo clippy --all-targets --all-features -- -D warnings`: passed.
- `cargo test`: passed.
- `npm run tauri:dev`: started successfully from isolated HOME.
- `npm run tauri:build`: built release binary and `CareerCompiler.app`.

Coverage strengths:

- Resume validation, LaTeX safety, import file allowlists, backup pre-migration copy, OpenAI request redaction, provider parsing, search/recommendations, Copilot tools, extension protocol, content-script fixtures, manual-submit safeguards, and native bridge cleanup.

Coverage gaps:

- Full packaged UI E2E with Playwright or a Tauri UI driver.
- Real Chrome extension pairing plus live no-submit sessions on Greenhouse, Lever, and Ashby.
- Visual PDF rendering QA from a complete real profile.
- Real OpenAI request/repair flow with paid calls.
- Backup restore UX against old and conflicting backups.
- Long-running performance and larger personal datasets.
- Workday or other heavy iframe/shadow-DOM ATS systems.

## Security Findings

### Critical

- No open Critical security issue remains from this audit.

### High

- Fixed: locked Candidate Brain records were not enforced at the repository layer.
- Fixed: IPC socket path could exceed macOS limits and the socket mode was too broad.
- Fixed: expired authorized resume PDFs in nested directories were not cleaned.

### Medium

- Open: the extension uses broad host permissions and content-script reach. This is expected for an autofill tool but should move toward narrower activation or stronger user-facing scope controls before external beta.
- Open: live Chrome pairing and request approval were not tested against the installed Chrome extension in this audit.
- Open: backup exports are plaintext JSON by design. The app warns through UX but should make the privacy implications very explicit.
- Open: Ashby demographic-heavy forms need extra guardrails so optional demographic fields are not over-eagerly filled from sensitive answer memory.

### Low

- Fixed: Settings and Evaluation first-run guards looked broken.
- Open: debug logs were empty in dev because bridge startup runs before the debug log plugin is installed. This is not a data leak, but it reduces diagnosability.

### Informational

- API key storage follows the intended Keychain model.
- OpenAI connectivity and evaluation actions are not automatically run.
- The app correctly keeps job clipboard/paste state transient until the user saves.
- Imported evidence is treated as untrusted and allowlisted by file type and size.

## UX Findings Top Ten

1. First-run should ask the user to create or import their own profile before offering a seed profile.
2. Dashboard empty state should explain the next real workflow, not lead with "Run safe seed."
3. Extension setup needs a plain-language success path and recovery path, not only diagnostics.
4. Candidate Brain is useful but visually dense; sensitive answers, claims, stories, and preview compete for attention.
5. The Tailor Resume review is powerful but long; the user needs a clearer "safe to export" summary.
6. Resume export readiness was misleading before this audit. The button is now disabled with a reason, but the page should also show a persistent checklist.
7. Settings and Evaluation guard states are now fixed, but similar empty states should be audited route-wide.
8. Application tracking feels like a data table, not yet a guided daily workflow.
9. Copilot should show more direct examples of what it can answer from local records.
10. Evaluation and role fixtures are useful for development but should be separated from user-facing daily flows.

## Performance Findings

- `npm run build` passes but warns that `dist/assets/index-C3YYwD96.js` is 564.30 kB minified, above Vite's 500 kB warning threshold.
- `pdf-B1ztJvK9.js` is 424.55 kB and should remain lazily loaded.
- Local SQLite and TanStack Query performance looked fine for seeded data.
- No large-database performance test was run.
- Extension DOM scanning was inspected and fixture-tested, but not profiled on very large ATS forms.
- XeLaTeX is installed: `XeTeX 3.141592653-2.6-0.999997 (TeX Live 2025)`.

## Fixes Completed During Audit

- `src/lib/database/memoryRepository.ts`: block locked candidate claim changes/deletes and locked sensitive answer changes/deletes.
- `src/lib/database/sqliteRepository.ts`: same locked-record enforcement for SQLite.
- `src/lib/database/memoryRepository.test.ts`: added locked Candidate Brain value regression.
- `src/features/candidate-brain/CandidateBrainPage.tsx`: fixed `""` rendering, controlled sensitive answer drafts, lock race, readonly lock state, and accessible textarea labels.
- `src/features/candidate-brain/CandidateBrainPage.test.tsx`: added immediate type-and-lock regression.
- `src/features/tailoring/TailorResumePage.tsx`: disable Export PDF when validation/contact issues or unapproved bullets block export.
- `src/features/tailoring/TailorResumePage.test.tsx`: added disabled export regression for missing contact fields.
- `src/lib/extension/requestProcessor.ts`: fall back to desktop classification when extension type is `unknown`.
- `src/lib/extension/requestProcessor.test.ts`: added Country field regression.
- `apps/careercompiler-extension/src/content.js`: improved radio/checkbox group label discovery for Lever-style ancestor question text.
- `src/lib/extension/contentScriptFixtures.test.ts`: added Lever radio group fixture.
- `src-tauri/src/extension_bridge.rs`: moved IPC socket to short per-user runtime path, set runtime dir `0700`, set socket `0600`, recursively clean expired authorized resume exports, and added Rust regressions.
- `src/features/settings/SettingsPage.tsx` and `src/features/evaluation/EvaluationPage.tsx`: replaced bare no-profile errors with page headers and action-oriented empty states.
- `src/features/settings/SettingsPage.test.tsx`: added Settings/Evaluation guard regressions.

## Remaining Work

### Must Fix Before Personal Daily Use

- Complete a real first-run flow that creates/imports the user's profile without requiring the seed profile.
- Run full no-submit Chrome extension sessions on live Greenhouse, Lever, and Ashby pages with the packaged app and installed extension.
- Complete visual PDF QA from a complete profile and representative tailored resumes.
- Add clearer ATS risk states: unsupported, manual-only, ready-to-review, and ready-to-fill.
- Add stronger demographic/sensitive field scoping for Ashby-style long forms.
- Add a practical recovery flow for native-host pairing failures.

### Must Fix Before External Beta

- Sign/notarize the app and document runtime prerequisites.
- Replace developer/owner-specific onboarding copy with product-grade setup.
- Build a guided extension installer and verifier for nontechnical users.
- Add a packaged-app E2E suite, ideally covering first run, seed/import, tailoring, export, extension approval, and backup restore.
- Decide whether Workday is explicitly unsupported or gets a dedicated implementation.
- Add privacy copy for extension host permissions, plaintext backups, resume export retention, and optional remote AI calls.

### Should Improve Later

- Code-split the main app bundle to remove the 564 KB entry warning.
- Improve answer naturalness and role-specific tone while preserving evidence citations.
- Add larger-dataset benchmarks for search, scoring, and resume recommendations.
- Add more ATS fixtures for SmartRecruiters, Workable, iCIMS, BambooHR, and custom forms.
- Make the Copilot more discoverable with suggested local-record questions.
- Add richer profile completeness guidance and one-click fixes.

### Optional Enhancements

- Offer encrypted backups.
- Add a local-only semantic provider option.
- Add per-company answer memory and recruiter/contact deduping.
- Add a preflight "today's application packet" view with resume, answers, risks, and manual checklist.
- Add a public beta diagnostic bundle that redacts private data by construction.
