# Phase 2F.4.1 — selective history recovery and native keyboard closure

Date: 2026-10-16 (America/Chicago). Branch `ui-ux-overhaul`, HEAD `7ba0dee`.

**BACKUP/RESTORE: PASS. NATIVE KEYBOARD: BLOCKED. OVERALL: PARTIAL.**

GO for further isolated synthetic recovery testing. NO-GO for actual-history import,
production recovery, live model requests or real autofill. No real history was accessed.

## Implementation and dependency graph

The existing history importer persists canonical applications plus safety records of kinds
`application_history_entry`, `application_history_audit` and `application_history_batch`.
General database export does not preserve this complete provenance graph. This increment
adds an acceptance-only selective recovery path; it does not change normal product backup UI.

`src/lib/acceptance/historyRecovery.ts` reuses AppRepository/SqliteRepository transactions,
existing history parsing/classification/reconciliation, source identity rules, and shared
canonical JSON/checksum utilities. No parallel tracker, migration or Rust command was added.
`historyRecoveryFixture.ts` provides the Node-only verified temporary SQLite and file adapter.
`historyRecovery.test.ts` and `historyRecoveryPerformance.test.ts` provide regression evidence.

The graph contains selected canonical applications, source entries, original values and
fingerprints, namespaces, reviewed corrections and choices, stable event/application IDs,
import batches, before/after audit records and original history timestamps. Company-only
uncertainty stays unresolved. Different roles, requisitions and repeated events stay distinct.
External job/resume/package dependencies are explicit IDs and content digests, not copied
entities. Job snapshots are represented by explicit dependency targets and reconstructed only
from matching existing jobs. PDF references contain historical paths/hashes, never file bytes.
File dependencies remain unverified and block restoration; no PDF is read by recovery.

## Format and validation

Format `careercompiler-selective-history`, version 1, mode `synthetic-only`; compatibility
includes `cc-history-entry-v1`, `cc-history-v1` and the actual database migration version.
Schema identity is captured inside the source transaction, not merely during preflight.
Canonical ordering/serialization and SHA-256 detect content changes. A checksum is integrity
checking, **not authentication or proof of trusted origin**. Content remains untrusted.

Limits include 16 MB, 1,000 applications, 1,000 entries, 5,000 audits, 1,000 batches,
7,000 total provenance records, 4,000 references, bounded nesting and aggregate string data.
Strict schemas reject unsupported versions, extra fields, malformed timestamps/statuses,
missing relationships, duplicate identities and credential-like content. Source identity,
original normalized values, corrections, classification and audit relationships are rechecked
even when an untrusted sender recomputes a checksum. Nothing executes or follows source URLs.

## Backup, preview and restore

Backup reads a consistent repository snapshot. The retained native source connection is
read-only; transaction BEGIN is adapted to a read-only snapshot. Artifact output is confined
to its verified marked temporary root. A private directory, exclusive private partial file,
file fsync, atomic rename, directory fsync and completed-file validation prevent a failed
write being reported as a completed backup. Injected failures clean their own partial output.

Preview is read-only. It reports additions, identical existing records, conflicts and missing
dependencies, and binds the reviewed plan to backup checksum, actual destination path and
current relevant record contents. Restore requires explicit confirmation and revalidates this
plan inside one transaction before any application/provenance writes. Stale reviews, different
schema versions, conflicting IDs/events and missing or changed dependencies fail closed.
There is no force overwrite, destructive database replacement or automatic dependency creation.

Audit-write failure rolls back tracker and provenance together; retry succeeds. Simultaneous
restore requests using one preview produce one accepted write and one stale rejection.
A refreshed preview followed by an identical restore produces zero writes and no duplicate
audits. Original provenance timestamps remain; canonical storage `updatedAt` reflects the
existing repository's restore activity and alone is excluded from semantic idempotence checks.

## Isolation and actual SQLite evidence

Source, retained and never recreated:
`/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-kbz3c8za/native.sqlite3`.

Separate disposable destination:
`/private/var/folders/8p/201pkcjx5659bvydb50d26wr0000gn/T/careercompiler-native-_gd093xw/native.sqlite3`.

The adapter checks canonical temporary paths, markers, symlink rejection, actual SQLite
`PRAGMA database_list`, migration version and synthetic profile identity. The destination
requires both `ISOLATED_ACCEPTANCE` and `ISOLATED_HISTORY_RECOVERY`; the retained source is
not designated disposable. These are trusted acceptance-harness guards, not protection against
malicious same-process JavaScript forging a verifier or a hostile same-user filesystem actor.
No production UI imports this mechanism and no new filesystem permissions were introduced.

The native fixture backup contained 1 application, 2 source entries, 2 audits and 2 batches
(11,885 bytes). Destination was already populated with synthetic candidate/evidence,
preferences, jobs, an unrelated application, package and audit records. Full-content hashes
and field comparisons verified source tables unchanged during backup, unrelated destination
records unchanged, original application IDs/package state unchanged and fit/eligibility
unchanged. Restored job 0 remained EXACT. These checks exceed matching record counts.
Both final databases passed SQLite integrity and foreign-key checks.

The acceptance bundle identifier was `com.mirathfan.careercompiler.acceptance`. Startup used
only the marked root with `CC_ACCEPTANCE_ROOT`, `CC_ACCEPTANCE_UI=1`,
`CC_ACCEPTANCE_JOBS_FEED=1`; acceptance startup forces mocks and excludes production provider,
Keychain, live discovery and external bridge behavior. No notifications or submissions ran.
Native PIDs 77629, 78757 and 79270 opened the restored destination. The last two were a full
stop/start without an intervening restore: identical tracker/history digest
`a98116e9c874b1eb3d6e434f42db2b5803341eab406771fe20dcfb1bb35fbe9b` survived.
This is native startup/restart persistence evidence, not GUI interaction evidence.

## Executed regression matrix

| Scenarios | Result and evidence |
| --- | --- |
| 1–5 Empty, confirmed, multiple roles/requisitions, repeated events | PASS; real temporary SQLite round trips and stable identities |
| 6–9 Unresolved evidence, reviewed corrections, batches, audits | PASS; provenance/classification preserved |
| 10–14 Existing relationships, close/reopen, empty/populated destination, repeat restore | PASS; exact dependencies, idempotence and persistent records |
| 15–18 Duplicate/cross-source identity and missing job/application | PASS; rejection without writes |
| 19–27 Version, malformed/truncated JSON, checksum, required fields, timestamps, bounds, extras, states | PASS; rejection including recomputed-checksum malformed graphs |
| 28–31 Transaction failure, stale review, concurrent requests, partial file writes | PASS; rollback, retry, stale rejection and cleanup |
| 32 Native application restart after restore | PASS; actual packaged process restart and unchanged digest |
| 33–35 Unrelated state, foreign keys, reconciliation | PASS; full-content comparisons, integrity checks and unchanged EXACT/uncertain state |
| Missing/changed resume/package/PDF dependencies | PASS fail-closed policy; actual PDF restoration NOT VERIFIED/unsupported |
| Actual process death during backup/restore transaction | NOT VERIFIED |
| Physical keyboard closure at native 720×800 | BLOCKED |

There is no deterministic recovery transaction pause/death hook. Existing package interruption
infrastructure does not target this operation. Exception rollback and injected partial file
write failures were executed; ordinary completed-operation restarts do not prove process-death
atomicity. No arbitrary kill timing or unsafe production crash hook was introduced.

## Native keyboard attempt

Initial owned PID 70844 reached isolated startup, but CUA reported:
“The Mac is locked and automatic unlock could not unlock it.” The specific check stopped.
After the user's request to run now, CUA was retried and returned the same locked condition.
No permission/security changes were made. No new keyboard input, focus traversal, correction,
Cancel/Escape or 720px screenshot is claimed. Prior Phase 2F.4 native rendering/workflow results
remain historical evidence; they do not close this additional physical-keyboard check.
VoiceOver speech and native paint timings remain NOT VERIFIED.

## Focused verification

**122 tests / 6 files passed**, including **33 new recovery cases / 2 files**. The other four
files cover history import, history persistence, fit assessment and history panel interaction.
Both retained-source and separate native-destination integration paths were enabled in this run.
Lint, typecheck, acceptance production app build and whitespace checks passed.
Node's experimental SQLite warning and Vite's existing chunk-size warning remain visible.
No Rust/schema/Python/extension code changed in this increment; historical full suites were
not rerun or relabeled as new evidence. Acceptance build compiled the native application.

## Performance observations

Apple M4, macOS arm64, Node v24.12.0; one observation per size, actual temporary Node SQLite.
Fixture creation is excluded. API timings include validation where performed. Repeat includes
a fresh preview and zero-write restore. These are not native paint or speedup measurements.

| Rows | Bytes | Snapshot + encode ms | Serialize ms | Checksum ms | Validate ms | Preview ms | Restore ms | Repeat ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 142014 | 29.4 | 1.2 | 1.2 | 20.1 | 16.5 | 21.1 | 40.2 |
| 500 | 3550655 | 394.9 | 18.5 | 22.6 | 272.2 | 266.9 | 311.6 | 695.5 |
| 1000 | 7103656 | 770.7 | 40.7 | 42.5 | 551.4 | 720.4 | 721.6 | 1749.7 |

## Evidence and remaining prerequisites

Raw logs and safe metadata: [phase2f41 evidence](application-history-evidence/phase2f41/),
including test/build logs, performance observations, database integration hashes, native
startup logs, keyboard blocker, product restart digests and final safety checks.
No new screenshot was obtained. No mocked transport is described as genuine Chrome success.

Before any actual-history import: separately authorize/review a production backup boundary,
resolve external file dependencies, test deterministic process interruption, review untrusted
input and same-user filesystem threat assumptions, and complete native physical keyboard
acceptance on an unlocked usable window. This implementation deliberately supports no general
restore UI, authenticated provenance, batch undo or conflict overwrite. Concurrent tests cover
the existing serialized repository connection; independent-process restore races are not
claimed as separately exercised here.

All initial dirty paths remain present; branch and HEAD are unchanged. Owned native PIDs
70844/77629/78757/79270 are stopped. No production records, real history artifact, paid APIs,
live discovery, Gmail/OAuth, Chrome installation/registration, real autofill or submission,
account/security changes, commits, pushes or deployments occurred.


## Phase 2F.4.2 continuation

[Native keyboard closure attempt](APPLICATION_HISTORY_PHASE_2F4_REPORT.md#phase-2f42--native-keyboard-closure)
remains BLOCKED: native window access returned `cgWindowNotFound` before launch. No recovery
implementation or previously passing result changed. Overall acceptance remains PARTIAL.


2026-11-08 resumed Phase 2F.4.2: desktop AX access now works, but the documented disposable
native destination is missing. Launch stopped before database access; no recovery changes or
historical test reruns. See the fresh continuation in the Phase 2F.4 report. Status remains PARTIAL.

2026-11-08 fresh-environment continuation: new isolated empty SQLite prepared and checked; fixture population and native keyboard acceptance remain blocked because the retained app executable lacks execute permission (launch exit 126). No retained recovery artifact was touched. See the Phase 2F.4 report and fresh-environment evidence.


November 11, 2026 — Sprint 2.5 continuation: the outstanding functional native
keyboard workflow now passes at independently measured 720×800 points, including
correction, cancellation with zero writes, explicit approval, provenance and restart.
See [Phase 2F.4 closure continuation](APPLICATION_HISTORY_PHASE_2F4_REPORT.md#phase-2f42--native-keyboard-closure-sprint-25-continuation)
and [Sprint 2.5 report](SPRINT_2_5_REPORT.md). Native tool-delivered keys are distinguished
from human hardware/VoiceOver testing. Recovery implementation and retained sources
were not changed. Earlier blocked observations remain historical.
