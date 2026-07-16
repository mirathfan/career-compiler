# Embedding Privacy

Semantic search is optional and defaults to disabled.

Settings:

- Disabled
- OpenAI embeddings
- Local provider

Remote embeddings require explicit user opt-in through Settings. The current implementation includes provider abstractions and deterministic mock/no-vector providers; OpenAI embedding calls are not made from React and must go through future Tauri commands so the API key never reaches the frontend.

Embedding input is normalized and redacted:

- API-key-like values are blocked/redacted.
- Email addresses are redacted.
- Phone numbers are redacted.
- Private notes are excluded unless explicitly enabled.

Embeddings are keyed by document content hash so unchanged documents can reuse existing vectors.
