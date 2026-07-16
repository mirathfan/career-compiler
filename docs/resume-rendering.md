# Resume Rendering

CareerCompiler renders resumes with XeLaTeX. `Mir Resume` is the primary personal template; `Mir Standard` and `AI and Full-Stack` remain compatible content presets.

## Rendering Flow

1. `TailoredResume` stores the approved sections, bullets, links, and layout values.
2. `ResumeTemplateSettingsSchema` validates the approved font, bounded dimensions, ordering, URL labels, summary policy, and project/bullet limits.
3. `renderResumeLatex` escapes every user or model value and converts only validated options into a fixed Letter-size document.
4. React lazy-loads PDF utilities and invokes the Rust `render_resume_latex` command.
5. Rust finds XeLaTeX, verifies its version, writes `resume.tex` to a unique temporary directory, and compiles with an exact argument allow-list including `-no-shell-escape`, `-halt-on-error`, and noninteractive mode.
6. Rust reads the bounded PDF and deletes the `.tex`, log, auxiliary files, and temporary directory.
7. `pdf-lib` verifies the actual page count before the native save dialog writes the file.

The template is one column with Helvetica Neue, textual links, no graphics, no icons, no skill bars, and no content tables. XeTeX ActualText preserves ordinary extracted characters behind shaped glyphs. Automatic hyphenation is disabled to avoid synthetic ATS tokens.

## One-Page Fitting

Compaction is deterministic and records every action:

1. Remove an optional summary.
2. Remove one lowest-relevance unlocked optional bullet.
3. Condense skill formatting.
4. Reduce spacing no lower than `0.8`.
5. Reduce body text no lower than `9pt`.
6. In OpenAI mode only, request a shorter version of one unlocked AI bullet using the same source IDs.
7. Stop and request a manual edit if content still does not fit.

Compaction never removes locked content, changes dates, deletes contact data, shrinks below the readable minimum, or automatically truncates prose. Undo restores the pre-compaction review state. Export blocks on any validation error, unapproved included bullet, LaTeX failure, or page count other than exactly one.

The sample artifact is generated at `output/pdf/Mir_Athfan_Ali_Loop_2026_New_Grad_Software_Engineer_Full_Stack.pdf`. Poppler is used during development to verify page size, extracted text, annotations, and the final rasterized layout.

## Runtime Tradeoff

Settings reports the resolved executable, version, last successful compile, and duration, with copyable macOS installation commands. CareerCompiler does not silently fall back. A portable TeX distribution could simplify installation but would add substantial bundle size, font/package maintenance, update obligations, and signing risk. Bundling one is deferred until a small, reproducible, licensed runtime can be verified.

Six role artifacts are generated under `output/pdf/evaluation` by `scripts/generate-evaluation-pdfs.ts` through the same serializer and restricted XeLaTeX arguments.
