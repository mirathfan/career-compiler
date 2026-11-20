#!/usr/bin/env python3
"""Read-only verification of the Sprint 1 snapshot and untouched original tree."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

manifest_path = Path(sys.argv[1] if len(sys.argv) > 1 else "../manifest.json").resolve()
manifest = json.loads(manifest_path.read_text())
failures = []
for label, root in [("preserved", Path(manifest["snapshot"])), ("original", Path(manifest["source"]))]:
    changed = []
    for item in manifest["files"]:
        path = root / item["path"]
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
            changed.append(item["path"])
    print(f"{label}: {len(manifest['files'])} files checked; {len(changed)} differences")
    failures.extend(f"{label}: {path}" for path in changed)
status = subprocess.check_output(["git", "status", "--porcelain=v1", "--untracked-files=all"], cwd=manifest["source"])
if status != (manifest_path.parent / "original-status.txt").read_bytes():
    failures.append("Original Git status differs from preservation baseline")
verification = subprocess.run(["git", "bundle", "verify", str(manifest_path.parent / "history.bundle")], cwd=manifest["source"], capture_output=True)
if verification.returncode:
    failures.append("Git history bundle verification failed")
for failure in failures:
    print(failure)
print("PASS" if not failures else "FAIL (do not overwrite or reconcile automatically)")
sys.exit(bool(failures))
