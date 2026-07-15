# AI Pipeline

Milestone 1 has two AI providers:

- `MockAIProvider`: deterministic, offline, and used by default.
- `OpenAIProvider`: calls a Rust Tauri command that invokes the OpenAI Responses API.

The browser never sends the API key directly. The Rust backend resolves the key from macOS Keychain or `OPENAI_API_KEY`, then requests Structured Outputs using the JSON schema corresponding to the Zod `JobAnalysis` contract.

After job analysis, evidence ranking is deterministic and local:

1. Disabled and prohibited facts are excluded.
2. Facts are scored for required skills, preferred skills, role tags, importance, metrics, evidence status, and item ordering.
3. The resume plan selects the strongest facts and skills.
4. The first resume generator composes concise bullets only from selected source facts.
5. Local validation runs independently of AI output before export.
