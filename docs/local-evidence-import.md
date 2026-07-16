# Local Evidence Import

Career Memory can read an explicitly selected Markdown, JSON, TOML, or text file up to 1 MB. Typical inputs are `README.md`, `package.json`, `pyproject.toml`, `Cargo.toml`, test output, build output, and project summaries.

The Rust command canonicalizes the selected path, verifies an allowlisted filename or extension, checks that it is a regular bounded UTF-8 file, and returns text. It never scans a directory, follows an import manifest, executes a script, runs a package manager, or sends imported text to a model.

Deterministic extraction recognizes package names, script names, dependency names, project headings, repository URLs, test counts/results, and build-success lines. Prompt-like instructions such as requests to ignore system rules are treated as untrusted text and excluded from candidates.

Every candidate appears in a review list with its source path. Approving and rejecting are explicit per-candidate actions. Only approved, non-rejected candidates can be saved; saved facts start as `needs_review`, retain source type/reference, and are never marked externally verified automatically.
