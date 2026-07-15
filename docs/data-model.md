# Data Model

CareerCompiler persists normal data in a local SQLite database opened by the official Tauri SQL plugin.

Core tables:

- `profile`: one editable profile for Mir Athfan Ali.
- `career_items`: projects, employment, and education.
- `career_facts`: atomic source facts linked to career items.
- `skills`: editable skills grouped by category.
- `jobs`: pasted job descriptions and structured analysis JSON.
- `resume_versions`: generated resume JSON, validation JSON, status, and last export path.
- `app_settings`: local preferences for AI provider, model, template, and export directory.

Arrays such as `skillTags`, `roleTags`, and `metricTokens` are stored as JSON text and parsed through typed repository functions. Foreign keys are enabled for facts and resume versions.

Seed data uses deterministic IDs so it can be run repeatedly without duplicating records.
