#!/usr/bin/env python3
"""Create an isolated native config; does not launch or access production data."""
import json
import pathlib
import tempfile
root = pathlib.Path(tempfile.mkdtemp(prefix="careercompiler-native-")).resolve()
(root / "ISOLATED_ACCEPTANCE").write_text("synthetic-only\n")
database_url = "sqlite:" + str(root / "native.sqlite3")
config = {
    "identifier": "com.mirathfan.careercompiler.acceptance",
    "productName": "CareerCompiler Acceptance",
    "app": {
        "windows": [{"label": "main", "title": "CareerCompiler — SYNTHETIC NATIVE ACCEPTANCE", "width": 1280, "height": 820}],
        "security": {"csp": "default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' data:; style-src 'self' 'unsafe-inline'", "capabilities": [{
            "identifier": "isolated-acceptance", "windows": ["main"], "permissions": ["core:default"]
        }]}
    }
}
(root / "tauri.acceptance.json").write_text(json.dumps(config, indent=2) + "\n")
dev_config = json.loads(json.dumps(config))
dev_config["build"] = {"devUrl": "http://127.0.0.1:5199", "beforeDevCommand": "npm run dev -- --host 127.0.0.1 --port 5199"}
(root / "tauri.acceptance.dev.json").write_text(json.dumps(dev_config, indent=2) + "\n")
(root / "prelaunch.json").write_text(json.dumps({"root": str(root), "databaseUrl": database_url, "databaseExistsBeforeLaunch": (root / "native.sqlite3").exists(), "identifier": config["identifier"], "nativeCommands": ["acceptance_environment", "acceptance_artifact", "render_resume_latex", "acceptance_query", "transaction_begin", "transaction_query", "transaction_finish"], "extensionIPC": False, "externalNetworking": False}, indent=2)+"\n")
print(root)
