# Resume Versioning

Each generated or regenerated resume is saved as a separate `resume_versions` row. Older versions are preserved.

## Lineage

A root version has an empty `parentResumeVersionId`. Regeneration creates a child with the previous version ID as its parent. The saved record also includes provider, model, prompt version, safe generation metadata, validation results, deterministic baseline, status, and last export path.

Duplication and regeneration are distinct:

- Duplication copies a version into an independent new draft.
- Regeneration reloads the original job, current Career Memory, and approved variants; optionally refreshes analysis; reranks evidence; preserves locks; generates new content; validates it; saves a child; and shows a semantic diff.

Semantic diff categories are added, removed, reworded, reordered, skills changed, and section changed. Reworded bullets retain before and after text with their source IDs.

## Review State

The session store tracks AI, deterministic, and user-edited bullets plus accepted, rejected, included, and locked state. A rejected bullet remains excluded for the session until the user explicitly regenerates it. Locked bullets and career items survive regeneration and are protected from compaction removal.

## Approved Variants

An accepted generated or edited bullet can be saved with its career item, source fact IDs, role categories, skill tags, target job, creation source, and approval timestamps. Future generation retrieves variants only when all source facts are selected and the role categories are relevant. Variants preserve source relationships and are preferred, never forced into unrelated resumes.
