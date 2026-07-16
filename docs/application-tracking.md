# Application Tracking

Application records are local workflow notes, not an automated submission system. Each record contains company, role, job URL, linked job ID, linked resume-version ID, status, applied date, referral contact, notes, and created/updated timestamps.

Supported statuses are `preparing`, `ready`, `applied`, `interview`, `rejected`, `offer`, and `withdrawn`. Moving a record to `applied` stamps the current date when no explicit date exists. The Applications screen supports status changes, notes, marking applied, opening the associated resume in the library, revealing an existing exported PDF, deletion, and duplication for a related role.

The quick-generation flow creates a record only after the user selects **Save application**. Application records are included in schema-5 backups and excluded from evaluation summaries and diagnostics.

Application review adds field-level records. Each field stores the original question, normalized question type, detected field type, generated answer, final answer, answer source, confidence, review state, user-edit state, approved state, evidence IDs, story IDs, warnings, and a concise selection summary.

Filling a browser form does not mark an application as submitted. The user must manually submit in the browser and then mark the application as applied/submitted inside CareerCompiler.
