# Application Autofill

CareerCompiler supports supervised browser autofill through the Manifest V3 Chrome extension and the macOS native messaging host.

## Flow

1. The extension scans visible application fields, job context, ATS type, required state, options, and character limits.
2. The background worker sends `prepare_application` through Chrome native messaging protocol version `1`.
3. The installed native host validates framing and forwards the request to the running desktop app over a Unix socket.
4. CareerCompiler creates or reuses the job and application draft.
5. The answer engine chooses fixed profile data, locked sensitive answers, approved reusable answers, or newly assembled grounded answers.
6. Each answer is saved as an `application_fields` row with confidence, evidence IDs, story IDs, warnings, and review state.
7. The selected exported resume PDF is copied to a short-lived app-controlled export location and authorized for that application.
8. The extension fills supported controls, uploads small authorized resume PDFs, and highlights every field.
9. Browser edits are tracked locally and can be saved back to the application draft.
10. The user manually submits in the browser.

## Review States

- Green: fixed profile, locked sensitive answer, or authorized resume upload.
- Blue: previously approved reusable answer.
- Yellow: newly tailored answer, unsupported control, oversized resume payload, or edited answer requiring review.
- Red: missing, unsupported, sensitive, conflicting, or low-confidence answer.

Every field stores the final answer separately from the generated answer. User edits are not overwritten automatically. If a second fill would replace edited browser fields, the popup asks for explicit confirmation first.

## Supported Controls

- text inputs
- textareas
- selects
- radio groups
- checkbox groups
- visible resume file inputs when the authorized PDF is small enough to transfer through native messaging

Hidden fields, password fields, CAPTCHA fields, honeypots, submit buttons, reset buttons, and image buttons are ignored.

## Resume Upload Security

The extension never requests an arbitrary local path. CareerCompiler authorizes only the selected exported resume PDF for the current application, copies it under:

```text
~/Library/Application Support/CareerCompiler/AuthorizedResumeExports
```

Small PDFs are returned as an inline authorized payload so the extension can construct a browser `File` object. Larger PDFs remain authorized in the app but must be selected manually because Chrome native messaging responses are bounded.

## Saving Browser Edits

The extension tracks:

- originally filled value
- current value
- edit time
- normalized question type
- whether the edit is safe to save

**Save edits to CareerCompiler** updates only the application draft fields. It does not promote edits to approved answers, Candidate Brain claims, or locked sensitive answers automatically.

## Manual Submission

CareerCompiler does not submit applications. The extension does not call form submission APIs, does not dispatch submit events, does not click final submit buttons, does not send direct ATS submission requests, and does not bypass CAPTCHA, login, or confirmation screens.

The extension can mark an application draft as `ready` after filling. It never marks an application as `applied`; only the user can do that in CareerCompiler.

## Compatibility

Current support is fixture-tested for:

- Generic HTML forms
- Greenhouse-style fields
- Lever-style fields
- Ashby-style fields

Workday and custom shadow-DOM application builders remain unsupported until specific adapters are implemented and tested.
