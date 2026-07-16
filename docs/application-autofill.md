# Application Autofill

CareerCompiler now has app-side primitives for job-application autofill and review.

## Flow

1. A browser extension scans an application page and sends detected fields to CareerCompiler.
2. CareerCompiler normalizes each field into an `ApplicationQuestionType`.
3. The answer engine chooses fixed profile data, locked sensitive answers, approved reusable answers, or newly assembled grounded answers.
4. Each answer is saved as an `application_fields` row with confidence, evidence IDs, story IDs, warnings, and review state.
5. The user reviews and edits answers in the Applications screen.
6. The extension fills safe fields and highlights review/missing fields.
7. The user manually submits in the browser.

## Review States

- Green: fixed profile or locked sensitive answer.
- Blue: previously approved reusable answer.
- Yellow: newly tailored or edited answer requiring review.
- Red: missing, unsupported, sensitive, conflicting, or low-confidence answer.

Every field stores the final answer separately from the generated answer. User edits are never overwritten automatically.

## Manual Submission

CareerCompiler does not submit applications. The extension does not implement a final-submit click path, does not call form submission APIs, and does not bypass CAPTCHA, login, or confirmation screens.

## Current Limitations

The first implementation includes deterministic classification, app-side answer generation, field review persistence, and a Manifest V3 extension scaffold. Production native-messaging host registration is documented but not automated yet.
