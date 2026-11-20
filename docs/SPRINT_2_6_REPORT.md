# CareerCompiler — Sprint 2.6 verification and integration decision

November 11, 2026. Results below were executed in Sprint 2.6 unless explicitly labeled historical.

## 1. Executive summary

**READY WITH DOCUMENTED LIMITATIONS.** All three outstanding prerequisite checks are now **PASS**: Rustfmt, Clippy, and actual native XeLaTeX rendering. The cumulative implementation also passes regression checks after applying the cumulative patch to a disposable copy of the complete original working tree. No integration into the actual original repository was performed.

Both the development copy and the reconciled copy pass **674 frontend tests, 36 Rust tests, lint, TypeScript, frontend build, Rustfmt and Clippy**. The two pre-existing environment-gated recovery tests remain skipped. A native debug acceptance bundle built and ran successfully, including actual PDF rendering, failure handling, provenance invalidation, process restart and persistence. Normal routed application startup was separately verified with `tauri:dev` on the same synthetic database.

The new toolchains are isolated QA installations. They do not provision XeLaTeX for a normal Finder-launched production application. Signed release distribution, human hardware/VoiceOver testing and live provider operation remain outside this acceptance. These limitations do not indicate a demonstrated integration defect.

## 2. Exact development location

- **Development:** `/Users/athfan/Desktop/career-compiler-sprint2-6-20261111-112347/development`.
- Recovery and deliverables: `/Users/athfan/Desktop/career-compiler-sprint2-6-20261111-112347/`.
- Preserved Sprint 2.5 input: the `preserved/` directory in that parent.
- Original, untouched: `/Users/athfan/Desktop/career-compiler`.
- Prior Sprint 2.5 source, untouched: `/Users/athfan/Desktop/career-compiler-sprint2-5-20261111-090352/development`.
- Exact native database: `/private/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/careercompiler-native-fr1clol6/native.sqlite3`.
- Native application: `src-tauri/target/debug/bundle/macos/CareerCompiler Acceptance.app` in this development copy; executable `Contents/MacOS/career_compiler`.
- Acceptance identifier: `com.mirathfan.careercompiler.acceptance`.
- Inherited development HEAD: `adb3c083f079fa06a1f431cbf15d0aa07dc1d3b9`; original HEAD remains `7ba0dee7aa5d41d3c1775844fbd4b359ea98b312`.
- Complete Sprint 2.5 baseline tree: `43e183841f0a4577978b696e27155e243e68fa18`. Development started from the actual complete working tree, not either old HEAD.

No commits, pushes, deployment, original-repository patch application, production migration, credential change or global security change occurred.

## 3. Toolchain inventory and isolated setup

The existing global Rust installation had cargo, rustc and rust-std, but no Rustfmt or Clippy. No compatible existing XeLaTeX installation was found in the previously documented standard and user-local locations. The project has no Rust toolchain override file. Its existing Cargo lockfile and application dependency manifests were retained.

| Tool | Version used | Resolution |
|---|---|---|
| macOS / architecture | 27.2, build 26B123 / arm64 | Existing host |
| Node / npm | v22.23.4 / 10.9.9 | `/Users/athfan/.local/bin/` |
| rustup | 1.29.2 | Existing proxy in `/Users/athfan/.local/share/cargo/bin/` |
| rustc | 1.99.1 (58cf8f9c3 2026-10-13) | Isolated clone of existing stable aarch64 toolchain |
| cargo | 1.99.1 (5f94df478 2026-08-27) | Same isolated toolchain |
| Rustfmt | 1.10.0-stable (58cf8f9c35 2026-10-13) | Component installed only into isolated Rustup home |
| Clippy | 0.1.99 (58cf8f9c35 2026-10-13) | Component installed only into isolated Rustup home |
| XeLaTeX | XeTeX 3.141592653-2.6-0.999998, TeX Live 2026 | Isolated TinyTeX v2026.11 |
| Independent PDF inspection | Poppler 26.05.0 | Existing bundled Codex runtime; no installation |

Setup used APFS copy-on-write copies of the existing Rustup toolchain and Cargo registry/cache into `../toolchains/rustup` and `../toolchains/cargo`. Rustfmt and Clippy were then installed with the existing Rustup executable while `RUSTUP_HOME` pointed to the clone:

```sh
RUSTUP_HOME=/Users/athfan/Desktop/career-compiler-sprint2-6-20261111-112347/toolchains/rustup \
  /Users/athfan/.local/share/cargo/bin/rustup component add rustfmt clippy --toolchain stable-aarch64-apple-darwin
```

This follows Rustup's documented isolation variables ([official Rustup installation documentation](https://rust-lang.github.io/rustup/installation/)). No global toolchain selection or components changed. Before/after global component lists and configuration-file SHA-256 values match, including Rustup settings, shell profiles and Cargo config presence. Credentials were not copied.

TinyTeX was obtained from the [official v2026.11 release](https://github.com/rstudio/tinytex-releases/releases/tag/v2026.11), using `TinyTeX-1-darwin-v2026.11.tar.xz`, **67,211,812 bytes**, SHA-256 **`9416a257c4caea2f82351fa2f89252b8bd75dceeb0ce6e442d25530b1922a02d`**, verified against the GitHub release asset digest. The archive was extracted only beneath `../toolchains/TinyTeX`. The shell installer was inspected but not executed. No `sudo`, `tlmgr path add`, global font installation, shell-profile change or alternate PDF engine was used. The official [TinyTeX documentation](https://yihui.org/tinytex/) and [installation options](https://yihui.org/tinytex/faq/) informed this isolated setup. All 7,122 archive paths were verified to remain within its TinyTeX root.

The actual engine is `/Users/athfan/Desktop/career-compiler-sprint2-6-20261111-112347/toolchains/TinyTeX/bin/universal-darwin/xelatex`. Required `fontspec`, `geometry`, `hyperref` and `xcolor` packages resolve inside that runtime. The downloaded release metadata and archive are retained under `../toolchains/downloads/`; these external runtimes are deliberately excluded from the source archive.

Every Rust/native QA command used this session-only environment, also saved in `../toolchains/qa-env.sh`:

```sh
export RUSTUP_HOME=/Users/athfan/Desktop/career-compiler-sprint2-6-20261111-112347/toolchains/rustup
export CARGO_HOME=/Users/athfan/Desktop/career-compiler-sprint2-6-20261111-112347/toolchains/cargo
export PATH=/Users/athfan/Desktop/career-compiler-sprint2-6-20261111-112347/toolchains/TinyTeX/bin/universal-darwin:/Users/athfan/.local/share/cargo/bin:$PATH
export CARGO_NET_OFFLINE=true
```

Evidence: [before inventory](sprint2-6-evidence/toolchain-before.json), [after inventory and resolved executables](sprint2-6-evidence/toolchain-after.json), [TeX provenance](sprint2-6-evidence/tex-release-provenance.json), [component installation](sprint2-6-evidence/rust-components-install.log).

## 4. Rustfmt — PASS

Executed `cargo fmt --manifest-path src-tauri/Cargo.toml --check` against the isolated toolchain. The initial check identified one formatting difference in `src-tauri/src/commands/ai.rs`: the wrapping of the existing `pending.send().await.map_err(...)` expression. That exact pre-fix file matches the original repository and Sprint 2.5 file, so the formatting predates every sprint.

Only that expression's wrapping was corrected manually. No repository-wide formatter mutation was run. Whitespace-normalized file bytes are identical before/after. The final development check and the reconciled-copy check both exit 0. Initial and final outputs remain in `rustfmt-initial.log`, `rustfmt-final.log`, and `reconciled-rustfmt.log` in the evidence directory.

## 5. Clippy — PASS

Executed:

```sh
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --offline --locked -- -D warnings
```

The project feature configuration supports this command. Both development and reconciled-copy checks exit 0. No compilation errors or Clippy correctness/style warnings were emitted; no Clippy-driven product changes were required. After the formatting correction, all 36 Rust tests pass. Evidence: `clippy-final.log`, `reconciled-clippy.log`, `rust-tests.log`, `reconciled-rust-tests.log`.

## 6. XeLaTeX — PASS

The native renderer found the isolated XeLaTeX engine through the explicit QA process PATH. The actual existing pipeline was used: `renderResumeLatex` serialization → Tauri `render_resume_latex` command → native XeLaTeX → PDF bytes → one-page validation → allowlisted acceptance artifact path → existing résumé repository and native PDF provenance checks.

The acceptance artifact writer supplies a fixed synthetic output path instead of the normal Save As dialog. This proves the serializer, native engine, output validation, version persistence and provenance path; it is **not** a claim that the normal routed export dialog was operated. Native shell escape remains disabled and runtime/source/output bounds are unchanged. No rendering implementation or application dependency was replaced.

## 7. Native PDF and restart acceptance — PASS

The existing synthetic résumé fixture was extended with explicit A/B version headlines, a synthetic Master and a historical submitted-A reference. Real native rendering used no real résumé, model generation or mock PDF renderer. Automated frontend tests separately mock the renderer and are not the evidence for this result.

The packaged native run, PID **45207**, reported **16 passing acceptance scenarios**. Restart PID **45298** reported **2 passing scenarios**. Preflight and repository `PRAGMA database_list` independently identify the exact marked temporary SQLite path in section 2. Native dev startup PID **45550** separately reached `repository_verified` on that same database. All three owned processes and the dev server process tree were stopped after verification.

| Check | Actual evidence |
|---|---|
| Real output and readability | A: 14,209 bytes; B: 14,370 bytes. Native SHA-256 snapshot, pdf-lib, `pdfinfo`, `pdftotext` and raster rendering all succeeded. |
| One-page requirement | Both files are exactly one Letter page; independently confirmed with Poppler. |
| Version identity | A/B have distinct bytes and visible `Synthetic version A/B` headlines. Each extracted text contains its own version and excludes the other. Persisted content IDs and output paths correspond to `resume-a` / `resume-b`. |
| Provenance | A SHA-256 `d5420e7272772894d9b92ab89f1fcc062cd609f8eaf9442ed5a3f31bcdee8e3b`; B `2196d00713b88c6248a75618c4701408d5099bceecf239477d19bd0a0b4bd6cc`. |
| Master preservation | Complete Master record remains unchanged after both exports and invalid-source failure; remains kind `master`, without export path, with original headline. |
| Existing export/submission preservation | Exporting B preserves the complete exported-A record, A bytes/hash, and complete historical application with submitted A ID/path/hash/date. |
| Safe compiler failure | A deliberately undefined LaTeX command returns sanitized `latex_compile_failed`; source command text is absent from the error. No résumé record or submitted output is changed. |
| Temporary files | No renderer directory for the completed render process remains after successful or failed compilation. Intentional final PDFs remain in the guarded acceptance root. |
| Approval/invalidation | Existing native package approval, replace/revoke/reapprove, same-path tampering rejection, stale-token rejection, rollback and evidence-invalidation checks all pass. |
| Restart | A/B output digests, Master hash, all résumé-record hash and historical-submission hash match the initial successful run. Approved B package/tracker and interrupted-analysis recovery persist. |
| SQLite health | `integrity_check=ok`; zero foreign-key violations at initial and restart inspections. |

Both PDFs were rendered to PNG and visually inspected: legible header, contact line and skills, correct version text, no clipping/overlap. They are deliberately minimal fixtures with substantial whitespace, not dense résumé or all-template coverage.

Evidence: [native stage one](sprint2-6-evidence/native-stage-one.json), [restart](sprint2-6-evidence/native-stage-two.json), [initial PDF invariants](sprint2-6-evidence/pdf-native-verification.json), [restart invariants](sprint2-6-evidence/pdf-restart-verification.json), [native binary hash](sprint2-6-evidence/native-binary.json), [dev startup](sprint2-6-evidence/native-dev-startup.json). Actual artifacts: [A PDF](sprint2-6-evidence/resume-a.pdf), [B PDF](sprint2-6-evidence/resume-b.pdf), [A render](sprint2-6-evidence/resume-a.png), [B render](sprint2-6-evidence/resume-b.png), [native completion screenshot](sprint2-6-evidence/native-pdf-completed.png), [restart screenshot](sprint2-6-evidence/native-restart.png). PDF text/info and native accessibility captures are alongside them.

## 8. Regression commands and results

Commands ran in the exact development path in section 2, with `source ../toolchains/qa-env.sh` for Rust/native commands. The same source checks ran in `/Users/athfan/Desktop/career-compiler-sprint2-6-20261111-112347/replay-sprint1-through-sprint2-6-ne46_qmn`, an actual cumulative patch replay. That copy uses a separate `../reconciliation-target` APFS clone for Cargo build cache, and its own `node_modules`; source was compiled from the replay directory.

| Exact command | Development | Reconciled copy |
|---|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS, 284 packages | PASS |
| `npm run lint` | PASS | PASS |
| `npm run typecheck` | PASS | PASS |
| `npm run test:run` | PASS, 78 files, **674 passed / 2 skipped**, 52.81s | PASS, 78 files, **674 passed / 2 skipped**, 41.63s |
| `npm run build` | PASS | PASS |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | PASS after narrow correction | PASS |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --offline --locked -- -D warnings` | PASS | PASS |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline` | PASS, **36 tests** | PASS, **36 tests** |

Additional executed development commands:

```sh
python3 scripts/prepare-native-acceptance.py
npm run tauri:build -- --debug --config /private/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/careercompiler-native-fr1clol6/tauri.acceptance.json
CC_ACCEPTANCE_ROOT=/private/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/careercompiler-native-fr1clol6 CC_ACCEPTANCE_UI=1 npm run tauri:dev -- --config /private/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/careercompiler-native-fr1clol6/tauri.acceptance.dev.json
python3 scripts/check-sprint26-pdf.py /private/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/careercompiler-native-fr1clol6 stage-one.json
python3 scripts/check-sprint26-pdf.py /private/var/folders/0f/qs92mvkj0sqbbqt3r_84r75m0000gn/T/careercompiler-native-fr1clol6 stage-two.json
python3 scripts/verify-sprint26-preservation.py
python3 scripts/prepare-sprint26-reconciliation.py
```

All pass. Native build used the isolated environment above. Packaged launch/restart invoked the exact executable in section 2 with `CC_ACCEPTANCE_ROOT` set and UI/jobs-feed/bridge/budget/interrupt probes unset, selecting the existing guarded native harness. Dev used the generated test configuration with loopback port 5207. Independent PDF commands were the bundled Poppler `pdfinfo`, `pdftotext -layout`, and `pdftoppm -png -scale-to 1400 -singlefile`, applied to each native-generated PDF. No production executable was launched.

The full suite covers résumé validation/serialization/lineage/provenance, Copilot conversations/persistence/action review/status/note/accept/reject/undo/stale/conflict cases and transport bounds, Home/Activity/navigation, Jobs/Applications/Profile, Application History and recovery. The two unchanged conditional cases in `historyRecovery.test.ts` require `CC_HISTORY_BACKUP_ACCEPTANCE_ROOT` and, for the second case, `CC_HISTORY_RECOVERY_DESTINATION_ROOT`; they are reported as skipped, not passes. The ordinary real-temporary-SQLite recovery cases do run and pass. No assertions, tests or timeouts were removed or weakened.

Retained logs are in `docs/sprint2-6-evidence/`: development `*-final.log`, `rust-tests.log`, `native-build-final.log`, `tauri-dev.log`; reconciled `reconciled-*.log` plus machine-readable command/exit results. Existing Node experimental SQLite and Vite large-chunk warnings remain. Git reports whitespace warnings in preserved raw reporter logs; these are evidence formatting, not failed patch application or product warnings.

Initial failures are retained: Rustfmt found the pre-existing wrap described above; the first extended acceptance test used a synthetic Master with an empty required job foreign key, causing a fixture failure. The fixture now references the existing synthetic job, and tracker checks select by job ID rather than list ordering after the additional historical fixture. The mocked renderer was extended to model the intentional compiler failure and distinguish A/B bytes. A focused test and both final full suites pass. The initial archive-path validator also rejected the legal top-level `TinyTeX` member; validation was corrected to allow that root and its descendants, with the same verified official SHA-256. No unresolved product failure is hidden in the final counts.

## 9. Product-code and acceptance changes

- `src-tauri/src/commands/ai.rs`: the single whitespace-only Rustfmt correction. No request, key, budget, provider or permission behavior changed.
- `src/lib/acceptance/nativeAcceptance.ts`: strengthened the existing guarded synthetic PDF scenario with distinct versions, Master and historical-reference preservation, safe compiler failure, and stable tracker selection by job ID.
- `src/lib/acceptance/nativeAcceptance.test.ts`: retained existing assertions and added mock failure/version behavior and persistence assertions.
- Added `scripts/check-sprint26-pdf.py`, `scripts/verify-sprint26-preservation.py`, `scripts/prepare-sprint26-reconciliation.py`, this report and Sprint 2.6 evidence.

Of **302 inherited files under `src/` and `src-tauri/`**, only the three listed source paths differ. There are **no new schema migrations**, application dependencies, capabilities, global settings, model data fields or action permissions. Existing migration and native resource files remain included. [Source comparison evidence](sprint2-6-evidence/source-change-verification.json) verifies the formatting's original provenance, semantic whitespace identity and the executed native bundle hash.

## 10. Data and source preservation

Before editing, all **1,188** Sprint 2.5 manifest members matched the actual source and source archive in content and POSIX mode. The prior archive SHA-256 is **`2be3b3f8318d070dd4414ba55c50ec9ae9959b95945e168ba3f1cea9784d846e`**. Both prior patch digests matched. The complete files were copied into new development and recovery directories and reverified; relevant tracked and untracked files were preserved. No post-report implementation drift was found.

Preservation checks recursively verify original **1,070**, Sprint 1 **1,110**, Sprint 2 **1,147**, Sprint 2.5 **1,188** files and their recovery copies, plus recorded Git states. They also verify global Rust components and configuration hashes remain unchanged. See parent `preservation-manifest.json`, `preservation-verification.json` and [current preservation evidence](sprint2-6-evidence/preservation-verification.json).

Production databases were not opened or modified by this task. That conclusion is supported by the marked direct-child temporary root, guarded acceptance build, process preflight and repository-reported paths, not by reading real user records. All PDF and SQLite inspection used the exact synthetic paths in section 2. The native harness denies real OpenAI, board, Keychain, bridge and production-database commands. AI/ATS transport was mocked; no paid call or external submission occurred. Prior sprint copies and ambient preview servers were left untouched.

## 11. Full reconciliation verification

The parent directory contains:

- `complete-source.tar.gz`: complete final source and evidence, including inherited relevant untracked files; exact POSIX modes retained.
- `reconciliation-manifest.json`: every member's path, SHA-256, bytes, mode, original provenance and incremental/cumulative classification.
- `sprint2-6.patch`: incremental patch from the complete verified Sprint 2.5 tree.
- `sprint1-through-sprint2-6.patch`: cumulative patch from the complete preserved original working tree, including untracked additions. It is not a patch against original old HEAD.
- `reconciliation-verification.json`: authoritative final counts, archive/patch hashes, both disposable replay directories and every non-executable POSIX mode difference.
- `sprint26-changed-files.txt`: exact Sprint 2.6 changed/added path list.

Both patches pass `git apply --check` and actual application in fresh disposable copies, followed by comparison of **every final manifest file**. Contents and executable bits match. The archive is independently reopened and every member's hash/mode verified. The 828 original relevant untracked/ignored files are included. No content conflicts against the unchanged inspected original baseline were found.

Full regression results in section 8 are from the actual cumulative replay, not merely the development source. `reconciled-build-inputs.json` records the tested source/config hashes and replay path. Final sealing after report/evidence additions rechecks that all executable/build inputs remain identical to that tested copy. Native build/launch is from development; no separate native launch from the replay is claimed. The final archive includes all required tracked/untracked source and native resources; generated `node_modules`, `dist`, Cargo targets, caches, isolated runtimes and synthetic databases are intentionally excluded.

Git patches encode executable bits, not arbitrary POSIX permission bits. Some mode-0600 files become 0644 when rewritten by patch replay; all affected paths are listed in the external verification. The archive/manifest is authoritative for exact recovery. No mode change was made to the original or prior sprint files. Future adoption must explicitly preserve reviewed modes rather than treating a patch as complete filesystem recovery.

## 12. Remaining limitations

There are **no remaining unavailable-tool blockers** for this isolated verification. Rustfmt, Clippy and real XeLaTeX acceptance are closed by current evidence.

1. The isolated toolchain is QA-only. Normal application runtime provisioning/discovery of XeLaTeX still requires an explicit deployment choice; Finder launches do not inherit this shell PATH. This sprint makes no system-wide installation or distribution claim.
2. Native packaging was a debug acceptance `.app`. Release signing, notarization and distribution were not tested.
3. PDF acceptance used the actual serializer/native engine/repository pipeline through the existing synthetic harness and fixed artifact path. Normal Save As interaction, dense résumés and all approved font/template combinations were not exhaustively tested.
4. Two existing conditional retained-source recovery tests remain skipped. Live providers/external submissions remain intentionally unexecuted.
5. Phase 2F.4.2 keyboard acceptance at independently measured 720×800 points passed in Sprint 2.5; its source/evidence is preserved and relevant regressions rerun. That entire keyboard sequence was not repeated here. Human physical keyboard operation, VoiceOver speech and native paint timing remain unverified.

## 13. Integration recommendation and exact safe procedure

**Recommendation: approve a separate integration review using the cumulative Sprint 2.6 artifact.** No new product feature work is needed to close these three prerequisite gaps. Decide how XeLaTeX will be supplied for normal launches before treating this as a distributable release.

The following is a future procedure only; no step writes to the actual original during this sprint:

1. Obtain separate authorization for integration. From this development directory run `python3 scripts/verify-sprint26-preservation.py`. Independently compare current original file hashes, modes and Git status to the original baseline and verify the final archive/patch SHA-256 values from parent `reconciliation-verification.json`. If any original work has changed, stop automatic application and retain it.
2. Make a new verified recovery snapshot of the original's **actual working tree and Git metadata**, including untracked/ignored relevant source. Do not reset or reconstruct it from old HEAD. Keep production databases outside the operation; do not launch the candidate on them.
3. Create a new disposable integration candidate from that verified current original snapshot. In that candidate, run the following with the candidate as working directory:

```sh
git apply --check /Users/athfan/Desktop/career-compiler-sprint2-6-20261111-112347/sprint1-through-sprint2-6.patch
git apply /Users/athfan/Desktop/career-compiler-sprint2-6-20261111-112347/sprint1-through-sprint2-6.patch
```

4. Compare every candidate file with `reconciliation-manifest.json`, including executable bits. Review every recorded 0600/0644 difference. Preserve existing original modes for existing files and reviewed manifest modes for additions. Do not blindly extract the archive over original or silently broaden file permissions. If original advanced, reconcile each changed path using preserved original, current original and final source; do not discard either side.
5. Run the exact npm/Rust checks in section 8 inside the candidate, using the retained isolated tool environment. Generate a **new** marked synthetic root with `python3 scripts/prepare-native-acceptance.py`; use only its generated acceptance config/database for native build, launch, PDF and restart checks. Never reuse a production path or run production migrations as a test.
6. Present the reviewed candidate delta, manifest verification, actual results and recovery/rollback paths for final adoption approval. Apply only that reviewed delta to original after the separate approval. Preserve original Git history and unrelated work; do not commit, push, deploy or alter production data implicitly.

**Final decision: READY WITH DOCUMENTED LIMITATIONS.** Verification and recovery work is complete; actual original-repository integration remains unexecuted and requires separate authorization.
