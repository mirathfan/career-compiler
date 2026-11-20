#!/usr/bin/env python3
"""Verify preserved inputs without writing to any input workspace or Git index."""
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

def verify(root, files):
    root = Path(root)
    failures = []
    for item in files:
        path = root / item["path"]
        if (not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]
                or oct(stat.S_IMODE(path.stat().st_mode)) != item["mode"]):
            failures.append(item["path"])
    checks.append({"root": str(root), "files": len(files), "differences": failures})
    assert not failures, failures

verify(manifest["source"], manifest["files"])
verify(manifest["snapshot"], manifest["files"])
source_base = Path(manifest["source"]).parent
previous = json.loads((source_base / "manifest.json").read_text())
verify(previous["source"], previous["files"])
verify(previous["snapshot"], previous["files"])
original_manifest = Path(previous["source"]).parent / "manifest.json"
original = json.loads(original_manifest.read_text())
verify(original["source"], original["files"])
verify(original["snapshot"], original["files"])

for root, status_file in [(manifest["source"], base / "sprint2-status.txt"),
        (previous["source"], source_base / "sprint1-status.txt"),
        (original["source"], original_manifest.parent / "original-status.txt")]:
    status = subprocess.check_output(["git", "status", "--porcelain=v1", "--untracked-files=all"], cwd=root, env=env)
    assert status == status_file.read_bytes(), f"Git state changed: {root}"
archive = Path(manifest["sourceArchive"])
assert hashlib.sha256(archive.read_bytes()).hexdigest() == manifest["sourceArchiveSha256"]
with tarfile.open(archive) as tar:
    members = {item.name: item for item in tar.getmembers()}
    assert set(members) == {item["path"] for item in manifest["files"]}
    for item in manifest["files"]:
        member = members[item["path"]]
        assert member.isfile() and oct(member.mode) == item["mode"]
        assert hashlib.sha256(tar.extractfile(member).read()).hexdigest() == item["sha256"]
print(json.dumps({"status": "PASS", "checks": checks, "gitStatesUnchanged": True,
    "sprint2ArchiveVerified": str(archive), "archiveFiles": len(members),
    "productionDatabaseOpened": False}, indent=2))
