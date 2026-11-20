# Application Autofill Security

CareerCompiler uses the existing browser-extension/native-host bridge. Autofill is a user-triggered convenience for an approved application package, not an application-submission agent.

## Trust and approval boundaries

- A package is local, belongs to exactly one job, and must link to an existing resume version.
- Package approval requires an exported PDF and no blocking resume validation errors.
- The extension receives only the current approved package, detected fields, approved answers, and a short-lived authorized resume-file reference.
- Opening or filling a page does not update application status to `applied`. Only the user can mark the tracker after manual submission.
- An AI match result—even a valid high score—cannot approve a package, select consequential answers, open an application, or mark it applied. Resume generation remains manual in this milestone, and package approval remains a distinct explicit action.
- The code contains no ATS submission request, final-submit click, CAPTCHA bypass, authenticated LinkedIn scraper, proxy rotation, or account rotation.

## Consequential fields

Work authorization, sponsorship, citizenship, clearance, salary, disability, veteran status, gender, race/ethnicity, criminal history, legal attestations, and signatures are always marked sensitive and require manual confirmation. They are never guessed. Verified answer-vault entries remain excluded from AI context unless the user explicitly approves the exact key for that use.

Job-match AI never receives answer-vault entries. Its bounded evidence packet is limited to relevant enabled skills, permitted career items, verified/user-provided facts, numeric tokens, and resume-profile IDs. Failed, invalid, and stale output cannot affect an active score or application package.

## Extension contract

`PreparedApplication` in `src/lib/extension/protocol.ts` contains application/job identifiers, optional authorized resume metadata, fill instructions, warnings, and hard conflicts. Each field includes provenance, confidence, and `requiresReview`. Resume authorization is scoped to an application and resume version and expires. The content script highlights unresolved or sensitive questions and never clicks submit.

Future integrations must preserve this contract even when new ATS field mappings are added.
