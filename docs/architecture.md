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

## Persistence

The repository interface has both SQLite and memory implementations. Migrations remain additive. Migration 5 adds Candidate Brain tables, application field records, and autofill metadata columns on `applications`.

## Extension

The extension is a Manifest V3 package with a content script, popup, background service worker, and fixtures. The background worker is abstracted around native messaging so the bridge can be hardened without rewriting field scanning or highlighting.
