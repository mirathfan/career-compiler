# Security And Privacy

CareerCompiler treats candidate data as local sensitive data.

## Local Storage

The desktop app stores profile data, evidence, Candidate Brain records, resumes, jobs, applications, and reviewed answers in local SQLite. The browser development fallback stores the same repository state in localStorage.

OpenAI API keys are never stored in SQLite, localStorage, source code, logs, backups, or the extension bundle. The Tauri app uses macOS Keychain service `com.mirathfan.careercompiler` and account `openai-api-key`.

## AI Provider Data

Resume generation and application-answer generation use explicit allow-lists. The app sends only selected evidence, selected profile fields, job context, and relevant reviewed memory needed for the request. Sensitive/legal answers are not inferred by AI.

## Extension Access

The extension can read fields on the active application page when the user clicks the extension. It has no OpenAI key and no direct database access.

Chrome talks to the native host through the standard stdio frame format. The host name is `com.mirathfan.careercompiler`, the protocol version is `1`, and the manifest allow-list contains explicit Chrome extension origins only. The host forwards requests to the running app through a Unix socket under `~/Library/Application Support/CareerCompiler/IPC`; it does not expose a network port.

Pairing requires a short-lived code generated in the desktop app. Successful pairing stores an authorized extension ID and credential hash in the app support directory. The extension stores only the returned credential in `chrome.storage.local`; revoking from CareerCompiler invalidates future requests.

Resume upload is application-scoped. CareerCompiler copies only the selected exported resume PDF to a short-lived authorized export location and returns an authorized reference. The extension cannot ask the host to read arbitrary paths.

## Submission Safety

The extension does not click final submit buttons, does not dispatch submit events, does not call `form.submit()`, and does not bypass authentication, CAPTCHA, or confirmation screens. The user must manually submit every application.

## Backups

Backups include Candidate Brain records and application field records. Backup import rejects oversized payloads and secret-like strings. Keychain data and API keys are outside the backup model.
