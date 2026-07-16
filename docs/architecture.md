# Architecture

CareerCompiler is a local-first Tauri 2 desktop app with a strict TypeScript React frontend and a Rust command layer for Keychain, files, XeLaTeX, and OpenAI calls.

```text
CareerCompiler
├── src/features
│   ├── candidate-brain
│   ├── career-memory
│   ├── tailoring
│   ├── resume-library
│   ├── applications
│   ├── browser-extension
│   └── copilot
├── src/lib
│   ├── ai
│   ├── applications
│   ├── database
│   ├── import
│   ├── resume
│   ├── search
│   └── tailoring
├── src-tauri
└── apps/careercompiler-extension
```

## Candidate Brain

Candidate Brain records live beside the existing evidence model instead of replacing it. `career_facts` remain the resume-generation source of truth. `candidate_claims`, `sensitive_answers`, `career_stories`, and `approved_application_answers` provide reusable application context.

## Application Autofill

`src/lib/applications/questionClassifier.ts` handles deterministic field normalization. `src/lib/applications/answerEngine.ts` generates structured answers with confidence, review state, warnings, and evidence IDs. `src/lib/applications/applicationReview.ts` persists generated answers to application field records.

`src/lib/extension/requestProcessor.ts` handles native-host extension requests in the running desktop app. It creates or reuses jobs and application drafts, calls the grounded answer engine, authorizes selected exported resume PDFs, saves browser edits as draft fields, and marks filled drafts as ready without marking them applied.

## Persistence

The repository interface has both SQLite and memory implementations. Migrations remain additive. Migration 5 adds Candidate Brain tables, application field records, and autofill metadata columns on `applications`.

## Extension

The extension is a Manifest V3 package with a content script, popup, background service worker, and fixtures. The background worker uses Chrome native messaging host `com.mirathfan.careercompiler` with protocol version `1`.

The packaged CareerCompiler executable doubles as the native host when Chrome starts it with a `chrome-extension://.../` origin argument. CareerCompiler copies that executable to `~/Library/Application Support/CareerCompiler/NativeHost/careercompiler-native-host`, writes the per-user Chrome manifest, and verifies the installed host with a framed ping. Host mode never launches the desktop UI, never logs to stdout, and forwards authenticated requests to the running app over `~/Library/Application Support/CareerCompiler/IPC/native-host.sock`.
