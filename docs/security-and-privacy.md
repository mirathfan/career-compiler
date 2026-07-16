# Security And Privacy

CareerCompiler treats candidate data as local sensitive data.

## Local Storage

The desktop app stores profile data, evidence, Candidate Brain records, resumes, jobs, applications, and reviewed answers in local SQLite. The browser development fallback stores the same repository state in localStorage.

OpenAI API keys are never stored in SQLite, localStorage, source code, logs, backups, or the extension bundle. The Tauri app uses macOS Keychain service `com.mirathfan.careercompiler` and account `openai-api-key`.

## AI Provider Data

Resume generation and application-answer generation use explicit allow-lists. The app sends only selected evidence, selected profile fields, job context, and relevant reviewed memory needed for the request. Sensitive/legal answers are not inferred by AI.

## Extension Access

The extension can read fields on the active application page when the user clicks the extension. It has no OpenAI key and no direct database access. The bridge protocol is versioned and schema-validated.

## Submission Safety

The extension does not click final submit buttons, does not dispatch submit events, does not call `form.submit()`, and does not bypass authentication, CAPTCHA, or confirmation screens. The user must manually submit every application.

## Backups

Backups include Candidate Brain records and application field records. Backup import rejects oversized payloads and secret-like strings. Keychain data and API keys are outside the backup model.
