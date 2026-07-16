# Extension Setup

The Chrome extension lives in `apps/careercompiler-extension`.

## Build

```bash
npm run extension:build
```

The built extension is written to:

```text
apps/careercompiler-extension/dist
```

For development rebuilds:

```bash
npm run extension:dev
```

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select `apps/careercompiler-extension/dist`.
5. Open a fixture page from `apps/careercompiler-extension/dist/fixtures` or a real application page.
6. Click the CareerCompiler extension icon and choose **Re-scan**.

## Native Messaging

The extension background worker is written around Chrome native messaging with host name:

```text
com.mirathfan.careercompiler
```

The macOS host manifest should be installed at:

```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.mirathfan.careercompiler.json
```

Windows support should use Chrome's native messaging registry location for the same host name. This repository currently documents the host boundary but does not yet install a production native host from Tauri.

## Fixtures

Fixture forms are included for:

- Generic HTML
- Greenhouse-style fields
- Lever-style fields
- Ashby-style fields

Workday is intentionally a future adapter because reliable support requires more platform-specific handling.

## Reset

Remove the unpacked extension from `chrome://extensions`, rebuild, and load the `dist` folder again. Clear highlights from the popup if a page remains open.
