# Runtime Diagnostics

Settings shows a first-run checklist with **Ready**, **Optional**, **Needs attention**, and **Blocking** states for database writability, schema migration, career data, contact completeness, XeLaTeX, export-directory writability, API-key status, provider choice, and template choice. Mock mode remains usable without OpenAI. Missing contact fields block only final export.

## XeLaTeX

CareerCompiler searches fixed macOS TeX locations and then `PATH`, executes `xelatex --version`, and reports availability, resolved path, version, last successful compilation, and duration. Export uses only the exact restricted arguments in Rust and never switches renderers.

Install and verify on macOS:

```bash
brew install --cask mactex-no-gui
/Library/TeX/texbin/xelatex --version
```

TinyTeX is also supported when its `xelatex` is reachable through one of the searched paths or `PATH`. After installation, select **Retry diagnostics**.

## Copyable Report

The local report contains app, operating-system, Tauri, database schema and migration state, XeLaTeX state/version, selected provider and model, last safe error category, and PDF compilation status. Values resembling API keys, email addresses, or phone numbers are redacted.

The report excludes raw prompts, job descriptions, contact details, private career notes, resume content, Keychain values, and LaTeX source. It is copied only after an explicit user action.

## Portable TeX

A later portable runtime is technically possible but currently unattractive: even trimmed distributions add package and font resolution work, update and licensing duties, signing/notarization surface, and significant application size. This milestone keeps the runtime external and makes the dependency observable instead.
