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
5. Copy the unpacked extension ID from Chrome.

## Register The Native Host

Open CareerCompiler, go to **Browser Extension**, paste the Chrome extension ID, then choose **Install native host** and **Verify native host**.

CareerCompiler installs the host executable here:

```text
~/Library/Application Support/CareerCompiler/NativeHost/careercompiler-native-host
```

It writes the Chrome per-user native messaging manifest here:

```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.mirathfan.careercompiler.json
```

The manifest uses host name:

```text
com.mirathfan.careercompiler
```

The manifest contains `type: "stdio"` and an explicit `allowed_origins` entry for the pasted extension ID. Wildcards are never written.

The installed host binary is a copy of the CareerCompiler executable. When Chrome starts it with a `chrome-extension://.../` origin argument, it enters native-host mode instead of launching the desktop UI. Host mode uses Chrome's four-byte little-endian native messaging frame format and forwards authenticated requests to the running desktop app through:

```text
~/Library/Application Support/CareerCompiler/IPC/native-host.sock
```

## Pairing

1. In CareerCompiler, choose **Generate pairing code**.
2. In the extension popup, enter the six-digit code and choose **Pair extension**.
3. CareerCompiler verifies the short-lived code, the Chrome origin extension ID, and the registered manifest ID.
4. CareerCompiler stores the authorized extension ID and a generated credential hash in:

```text
~/Library/Application Support/CareerCompiler/Extension/connection.json
```

The extension stores the credential in `chrome.storage.local`. Future fill and edit-save requests must include the credential. Use **Revoke extension** or **Reset connection** from the setup screen to invalidate it.

## Verify

The setup screen checks:

- manifest exists and parses as JSON
- manifest host name, `stdio` type, path, and explicit origin are valid
- installed host binary exists and is executable
- configured extension ID is a valid Chrome ID
- installed host responds to a native-message ping through the running app

## Fixtures

Fixture forms are included for:

- Generic HTML
- Greenhouse-style fields
- Lever-style fields
- Ashby-style fields

Workday remains unsupported.

## Production Extension ID

For an unpacked development extension, paste the ID shown in `chrome://extensions`.

For a Chrome Web Store build, use the final fixed Web Store extension ID in the Browser Extension setup screen. Reinstalling the native host preserves already authorized IDs unless the user resets the connection.

## Reset And Remove

To reset pairing only, use **Reset connection**.

To remove the native host manually:

```bash
rm -f "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.mirathfan.careercompiler.json"
rm -f "$HOME/Library/Application Support/CareerCompiler/NativeHost/careercompiler-native-host"
rm -f "$HOME/Library/Application Support/CareerCompiler/Extension/connection.json"
```

Then remove the unpacked extension from `chrome://extensions`.
