# Hybrid Retrieval

CareerCompiler does not use vector-only RAG. Retrieval is layered:

1. Exact repository/SQLite reads for factual questions.
2. Normalized `search_documents` for full-text and fallback search.
3. FTS5 index creation when the packaged SQLite build supports it.
4. Deterministic fallback ranking when FTS5 is unavailable.
5. Optional semantic embedding provider abstraction.
6. Metadata boosts for approval, validation, submitted state, and recency.
7. Internal citations generated only from records included in context.

Search documents preserve:

- `entityType` and `entityId`
- parent entity type/id
- normalized text
- metadata JSON
- content hash
- updated timestamp

The repository rebuild action regenerates documents from source records. Search indexes are derived artifacts and are excluded from backup payloads.

FTS query text is sanitized before use. The fallback search still supports terms, phrases, entity-type filtering, metadata filtering, snippets, and deterministic ranking.
