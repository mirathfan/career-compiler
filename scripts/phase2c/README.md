# Synthetic-only Phase 2C harness

Nothing here registers a host, installs an extension, or launches a normal browser.
Read `docs/NATIVE_ACCEPTANCE_REPORT.md` before execution. Use only the generated marked
temporary root. Never reuse production records or credentials.

1. Run `python3 scripts/phase2c/prepare.py`. Inspect its `prelaunch.json` and config.
2. Build the acceptance bundle with `npm run tauri:build -- --config <root>/tauri.acceptance.json --bundles app`.
3. Launch that **acceptance** bundle with `CC_ACCEPTANCE_ROOT=<root> CC_ACCEPTANCE_BRIDGE=1`.
   Verify `bridge-ready.json` paths and current process ID before injecting requests.
4. Run `python3 scripts/phase2c/server.py` for exact loopback-only fixtures on port 5297.
5. Run `python3 scripts/phase2c/transport_acceptance.py <root>` once against fresh local
   packages. Phase 2D expects the original JSON-key ordering diagnostic to PASS through
   actual production canonicalization. Earlier Phase 2C failure evidence is retained. Synthetic fault injection revokes
   or corrupts three local packages; do not restore them to hide failed authorization.
6. Run `failure_acceptance.py <root>` and `interruption_acceptance.py <root>` for lock,
   timeout and host-loss tests. `restart_acceptance.py <root>` checks saved restart state.
7. `node scripts/phase2c/dom_transport.mjs <root>` combines real IPC and **jsdom**, excluding
   file attachment because jsdom lacks native DataTransfer. Its country diagnostic must now PASS by leaving missing country evidence unresolved. This is not Chrome acceptance.
8. Stop the app before explicitly removing only its temporary socket `<root>/s` for
   restart. Existing sockets are never automatically overwritten. Never touch production
   IPC, native registrations, normal profiles, candidate records or provider settings.

The generated extension/native-host manifest is UNREGISTERED with a placeholder identity.
Do not load/register it under this iteration's scope. Future Chrome testing requires
explicit permission and an observed extension ID bound to a separate disposable profile.
The test transport now applies Rust JSON Value normalization in both directions,
matching production key reordering. Production canonical payload hashing handles it. The credential-free host is not production-safe.
