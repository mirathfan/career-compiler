# Resume Rendering

The first template is ATS-safe, US Letter, one column, no icons, no skill bars, and no core-content tables.

Rendering flow:

1. The editor stores resume JSON with sections, bullets, and `sourceFactIds`.
2. Validation checks source facts, prohibited facts, numeric tokens, percentages, and skill references.
3. `@react-pdf/renderer` creates a deterministic PDF using built-in Helvetica fonts.
4. `pdf-lib` checks the actual page count.
5. Export is blocked unless validation has no errors and the generated PDF is one page.

Compaction is deterministic:

1. Remove optional summary.
2. Remove lowest-scoring optional bullets.
3. Condense skills.
4. Keep unresolved overflow visible to the user rather than silently exporting two pages.
