# Approval-gated Chrome isolated integration plan

Status: DOCUMENTATION ONLY. No extension was loaded/installed, no host registered, no
normal Chrome profile changed. This plan is not authorization to execute it.

## Execution approval required

Obtain explicit approval for ALL proposed side effects before proceeding:

- Starting an official Chrome for Testing/Chromium instance against a new disposable
  user-data directory (acquiring a supported official binary separately if necessary).
- Loading/enabling the synthetic-only unpacked extension in that directory; granting its
  nativeMessaging/activeTab/scripting/storage permissions and loopback host scope there.
- Writing a separately named native-host manifest ONLY inside that disposable user-data
  directory's NativeMessagingHosts, with exclusive creation and an exact observed ID.
- Writing the observed test ID into the marked temporary app/host identity file.
- Running the temporary fixture server, acceptance bundle and Chrome-launched Python host;
  populating synthetic local form controls and attaching only a synthetic PDF.
- Capturing synthetic-only screenshots, sender/protocol metadata and timing/error logs.
- Stopping only the recorded test PIDs and removing only the marked temporary profile,
  host manifest/socket/files afterward, with exact-path checks and explicit cleanup review.

No normal-profile paths, production native registrations/credentials, real sites/records,
security bypass flags, model/account settings, paid APIs, discovery, notifications or final
submission are part of this approval. If a step needs any of them, stop that step.

## Native messaging and registration

Chrome starts the executable named in the host manifest, supplies the extension origin,
and exchanges length-prefixed UTF-8 JSON over stdin/stdout. Prefix is a 32-bit native-endian
length (little-endian on this Mac). Chrome limits host responses to 1 MiB; our test host
also caps incoming frames at 1 MiB. Diagnostics belong on stderr, never framed stdout.
See [official native messaging documentation](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

The separately named host is `com.mirathfan.careercompiler.acceptance`; production is
`com.mirathfan.careercompiler`. User-level manifests are found under the browser user-data
NativeMessagingHosts directory; default macOS paths differ by browser family/version.
Chrome for Testing before version 146 shared Chrome's default location. Do not assume
custom-directory lookup works: inspect chrome://version Profile Path and native messaging
logs in the disposable instance, and prove the selected manifest was used. If this browser
requires registration in a normal/system directory, stop and request separate approval.
Never create anything under the normal `~/Library/Application Support/Google/Chrome/` or
`/Library/Google/Chrome/` directories for this plan.

## Preparation commands (safe artifact generation; already supported)

```sh
python3 scripts/phase2c/prepare.py
```

Record the returned canonical `<root>`, its synthetic marker, 0700 permissions, initial
prelaunch metadata and absent/new database. It must be a direct temporary-directory child
named careercompiler-native-*. Inspect the generated config and wrapper; they must resolve
only `<root>/native.sqlite3` and `<root>/s`, never HOME or a production socket/database.
The wrapper is a separate test-only Python process; the acceptance bundle explicitly
rejects production native-host argument mode. TEST_EXTENSION_ID is required, rejects
symlinks and contains exactly 32 lowercase a-p characters. Missing config fails closed.

Build only the acceptance app before launch:

```sh
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:build -- --config '<root>/tauri.acceptance.json' --bundles app
```

Inspect bundle identifier `com.mirathfan.careercompiler.acceptance`, disabled production
capabilities, CSP, and startup path guards before launching. The generated profile is
empty; never copy a real profile, credentials, candidate backup or Local State file.

## Browser identity and profile verification (approval required; NOT EXECUTED)

Use a browser build that supports the intended unpacked-extension loading mechanism.
Do not bypass branded Chrome restrictions or enable unsafe developer/security flags.
Future example, with exact executable/root substituted and approved:

```sh
'<official test browser binary>' --user-data-dir='<root>/browser-profile' --no-first-run --no-default-browser-check
```

Do not sign in, import settings, allow sync, or open a normal browser session. Verify
chrome://version's executable and Profile Path, OS command line, and newly created files
beneath the marked profile. Reject paths outside that root. Record only the test PID;
never kill unrelated Chrome processes. If browser startup tries account setup/network
access beyond the approved local fixtures, stop and review isolation first.

The current generated artifact is an unregistered template. Its placeholder ID is NOT
an installed extension identity. Load it ONLY after approval and derive the actual ID
from this instance's chrome://extensions and `chrome.runtime.id` in its worker. Match
both observations. If using a fixed manifest public key in future, derive its ID by
SHA-256 of decoded public-key bytes, map the first 16 digest bytes' nibbles to a-p, and
verify against actual Chrome; do not generate/use a production signing key.

Bind that observed ID in `<root>/TEST_EXTENSION_ID` and the test manifest's allowed_origins
before restarting the acceptance listener. They must match exactly. Do not replace the
production authorized IDs. Test controllers using the old placeholder must be parameterized
for the observed ID, not treated as genuine Chrome identity evidence.

Host manifest creation example (approval required, exclusive create; NOT EXECUTED):

```python
# Substitute only the previously verified marked root and observed TEST ID.
from pathlib import Path
import json
root = Path("<root>").resolve(strict=True)
profile = root / "browser-profile"
registration = profile / "NativeMessagingHosts"
registration.mkdir(mode=0o700, exist_ok=False)
manifest = registration / "com.mirathfan.careercompiler.acceptance.json"
with manifest.open("x") as output:
    json.dump({"name": "com.mirathfan.careercompiler.acceptance",
               "description": "SYNTHETIC TEST ONLY",
               "path": str(root / "test-native-host"), "type": "stdio",
               "allowed_origins": ["chrome-extension://<observed-id>/"]}, output)
manifest.chmod(0o600)
```

Never use an overwrite operation or the production host name. If a registration already
exists, inspect only that disposable root and stop before replacing it. Match the exact
wrapper path and digest with the generated artifact. The wrapper must retain the fixed
marked root, not use a configurable production fallback.

## Test extension and trusted metadata

The template uses only `http://127.0.0.1:5297/*` host/content-script scope, not all_urls.
Keep this restriction and the separately named host. Production manifest permissions are
unchanged. To exercise real scan/fill commands, finish a test-only popup/worker driver
within this artifact that reuses production content and shared canonical hashing, while
explicitly allowing only the five test URLs. Do not introduce loopback bypass flags into
production worker/content/native policy. The current TEST_REQUEST worker proves neither
production popup routing nor Chrome DOM attachment on its own.

Record actual Chrome MessageSender metadata at worker/content boundaries: id, origin,
url, tab/frame presence, not candidate contents. Production popup sender must be its
own extension ID, exact popup.html/origin and no tab. Content commands require its own
background.js/origin and no tab. Ignore message-body claims about sender or origin.
[Chrome documents MessageSender fields as optional](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender);
if a required field is absent in genuine worker delivery, stop and review the security
contract. Do not silently weaken checks or synthesize trusted metadata in Chrome tests.
Browser current tab URL must independently match scanned pageContext; app/native boundary
rechecks current approved destination, revisions, content and candidate-source state.

## Genuine handshake and authorization

After explicit approval, start fixture server and acceptance listener only:

```sh
python3 scripts/phase2c/server.py
CC_ACCEPTANCE_ROOT='<root>' CC_ACCEPTANCE_BRIDGE=1 '<acceptance bundle executable>'
```

Inspect current PID/path in bridge-ready.json and native PRAGMA database_list before any
fixture operation. Check no paid/Keychain/discovery/opener/production bridge handlers exist.
Then use `chrome.runtime.connectNative('com.mirathfan.careercompiler.acceptance')` from the
test worker; send protocol 3 ping with observed ID. Capture the Chrome-launched host PID,
frame header lengths and response metadata; distinguish this from manually launched pipes.
Confirm registration lookup and separate socket, wrong origin/ID/version refusal, unknown
command and oversized/malformed frames. The host must reject a missing marker/identity,
symlinked DB/socket or missing app, never fall back to production.

Prepare synthetic approved package, check hashVersion cc-json-sha256-v1 and canonical
payloadHash using the shared production module, then authorize once against current SQLite.
Repeat reordered/nested JSON, replay, expiry, tampering, revocation, replacement, changed
requirements and changed country/sensitive evidence. Simultaneous consumes must have exactly
one success. Repeat through worker/app restarts. Lost response after dispatch is uncertain:
never restore consumed authorization or treat it as permission to replay.

## Forms, upload and failure recovery

Use only greenhouse.html, lever.html, ashby.html, multi-step.html and dynamic.html on
127.0.0.1:5297. The server has exact asset allowlisting, no POST route, CSP form-action none,
connect-src none, and submission traps. Assert zero submit/click/submit()/requestSubmit()
counts; do not intentionally perform a final submit as a test. Next-step navigation remains
manual and uses synthetic type=button controls. Missing country/legal evidence stays empty.

Real upload acceptance requires Chrome's native File/DataTransfer APIs: confirm filename,
MIME, byte count and SHA-256 of only the generated synthetic PDF, attachment state and page
validation, without submitting. No real file/path is permitted. Do not call an assignment
simulation or prepared base64 an attached Chrome file.

Test removed/replaced file input, setter/event interruption, changed form after authorization,
missing DataTransfer, invalid export and partial completion. Successful independent fields
must remain; incomplete fill must not produce a desktop completion acknowledgement. Fresh
retry needs a fresh native token, preserves manual edits and skips identical completed
fields/files. Do not claim DOM/SQLite atomicity or recall already-delivered data.

External-site negative tests should use spoofed message URLs or controlled local-origin
changes, not real ATS navigation. Production policy rejects nonallowlisted destinations;
test artifact must reject every nonloopback origin even when the message body claims a
fixture URL. Do not visit live sites to test this constraint.

## Evidence and cleanup

Record PASS/FAIL/BLOCKED/NOT VERIFIED per case, browser version/executable/profile path,
actual ID/metadata, registration/host/socket paths and PIDs, DB PRAGMA, package/revision/token
state snapshots, screenshots of only synthetic pages, and redacted transport logs. A build,
manual Python IPC, or jsdom pass is not genuine Chrome integration success.

Before cleanup, review exact marked paths and test PIDs. Stop fixture server, acceptance
app and ONLY the disposable browser/process descendants, then verify no listener remains
on the recorded socket/loopback port. Confirm normal-profile paths were never targeted.
Remove only the approved ephemeral host manifest/profile/socket/root using verified canonical
paths and marker checks. If any process still holds it, do not force unrelated process kills.
Verify those paths are absent and native handshake to the stopped test host fails closed.
Retain sanitized reports/logs before removing disposable data. Cleanup must not touch the
production host registration, pairing config, app support database or normal Chrome profile.

## Readiness gate

Local Phase 2D engineering and isolated transport can be GO. Genuine Chrome execution is
BLOCKED until the explicit loading/registration/profile/process side effects above are
approved and the test-only browser driver is completed/observed. Real ATS/autofill and live
OpenAI remain NO-GO; neither is authorized by this plan.

## Phase 2D closure prerequisites (2026-10-14)

Local mocked/UI evidence is recorded in NATIVE_ACCEPTANCE_REPORT.md and phase2d-closure.
Use protocol 3, canonical hash `cc-json-sha256-v1`, and answer policy
`cc-application-answers-v2`; older policy tokens must be rejected, never upgraded.
Verify genuine Chrome sender optional metadata without relaxing strict validation. Exercise
real FileList/DataTransfer and same-metadata file substitution; controlled DOM/native transport
success does not prove Chrome behavior. Cover stale/replayed/concurrent authorization, partial
fill without completion ACK, restart, original token expiry and unknown consumption.
This plan remains review-only: no installation, registration, profile changes or real autofill
were executed. Live OpenAI and real autofill remain NO-GO.

## Phase 2D.1 directly relevant handoff prerequisites

Approved packages now require `cc-pdf-sha256-v1` content provenance and
`cc-match-evidence-v1` reviewed evidence binding. Prepared contentFingerprint includes PDF digest;
issue/consume compare it to current verified approval. Native file preparation requires
expectedDigest and must return contentDigest for the same delivered bytes. Old tokens/approvals
must not be upgraded by the test driver. Add same-path byte replacement, evidence correction,
reapproval/old-token rejection and restart checks to any separately approved Chrome run.
Verified inline bytes do not prove genuine browser attachment; measure actual attached digest.
The execution approval boundary and permissions above remain unchanged.
