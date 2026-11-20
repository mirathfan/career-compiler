#!/usr/bin/env python3
"""Verify Sprint 2.5 inputs/archive and all earlier protected source trees."""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import tarfile

base = Path(__file__).resolve().parents[2]
manifest = json.loads((base / "preservation-manifest.json").read_text())
env = {**os.environ, "GIT_OPTIONAL_LOCKS": "0"}
checks = []
for label, root in [("Sprint 2.5 source", Path(manifest["source"])), ("Sprint 2.6 recovery", Path(manifest["snapshot"]))]:
    for item in manifest["files"]:
        path = root / item["path"]
        assert path.is_file(), path
        assert hashlib.sha256(path.read_bytes()).hexdigest() == item["sha256"], path
        assert oct(stat.S_IMODE(path.stat().st_mode)) == item["mode"], path
    checks.append({"name": label, "root": str(root), "files": len(manifest["files"]), "differences": 0})
status = subprocess.check_output(["git", "status", "--porcelain=v1", "--untracked-files=all"], cwd=manifest["source"], env=env)
assert status == (base / "sprint25-status.txt").read_bytes()
archive = Path(manifest["sourceArchive"])
assert hashlib.sha256(archive.read_bytes()).hexdigest() == manifest["sourceArchiveSha256"]
with tarfile.open(archive) as tar:
    members = {member.name: member for member in tar.getmembers()}
    assert set(members) == {item["path"] for item in manifest["files"]}
    for item in manifest["files"]:
        member = members[item["path"]]
        assert member.isfile() and oct(member.mode) == item["mode"]
        assert hashlib.sha256(tar.extractfile(member).read()).hexdigest() == item["sha256"]
previous = json.loads(subprocess.check_output(["python3", str(Path(manifest["source"]) / "scripts/verify-sprint25-preservation.py")], env=env))
before = json.loads((base / "development/docs/sprint2-6-evidence/toolchain-before.json").read_text())
for item in before["configurationFiles"]:
    path = Path(item["path"])
    assert path.exists() == item["exists"]
    assert not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() == item["sha256"]
# Read the global installation explicitly, unaffected by QA shell overrides.
global_env = {**env, "RUSTUP_HOME": "/Users/athfan/.local/share/rustup"}
components = subprocess.check_output(["/Users/athfan/.local/share/cargo/bin/rustup", "component", "list", "--installed"], env=global_env, text=True)
assert components == before["rustup component list --installed"]["output"]
print(json.dumps({"status": "PASS", "checks": checks, "earlierPreservation": previous,
    "sprint25ArchiveVerified": True, "globalRustComponentsUnchanged": True,
    "globalConfigurationHashesUnchanged": True, "productionDatabaseOpened": False}, indent=2))
