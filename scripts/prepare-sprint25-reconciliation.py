#!/usr/bin/env python3
"""Seal source deliverables and replay patches only in NEW disposable copies.

No commits, original-repository writes, index changes, or existing replay deletion.
The archive/manifest preserve full POSIX modes; Git preserves executable bits only.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tarfile
import tempfile

dev = Path(__file__).resolve().parents[1]
base = dev.parent
preservation = json.loads((base / "preservation-manifest.json").read_text())
previous = {item["path"]: item for item in preservation["files"]}
original_manifest_path = Path("/Users/athfan/Desktop/career-compiler-sprint1-20261111-074953/manifest.json")
original_manifest = json.loads(original_manifest_path.read_text())
original = {item["path"]: item for item in original_manifest["files"]}
env = {**os.environ, "GIT_OPTIONAL_LOCKS": "0"}

def git(*args, cwd=dev, environment=env):
    return subprocess.check_output(["git", *args], cwd=cwd, env=environment)

subprocess.run(["python3", str(dev / "scripts/verify-sprint25-preservation.py")], check=True,
               stdout=subprocess.DEVNULL, env=env)
visible = set(git("ls-files", "-c", "-o", "--exclude-standard", "-z").decode().split("\0")) - {""}
excluded = {path for path in visible if "__pycache__" in Path(path).parts or path.endswith(".pyc")}
paths = set(previous) | (visible - excluded)
# Evidence logs are deliberately ignored by Git; include them explicitly.
paths |= {str(path.relative_to(dev)) for path in (dev / "docs/sprint2-5-evidence").rglob("*") if path.is_file()}
assert all((dev / path).is_file() for path in paths), "Unexpected source deletion"
assert not any(path.endswith((".sqlite3", ".db", ".pem", ".key")) or Path(path).name == ".env" for path in paths)

files = []
for name in sorted(paths):
    path = dev / name
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    mode = oct(stat.S_IMODE(path.stat().st_mode))
    before = previous.get(name)
    initial = original.get(name)
    files.append({"path": name, "sha256": digest, "bytes": path.stat().st_size, "mode": mode,
        "originalState": before["originalState"] if before else "new",
        "sprint25Change": "added" if not before else "unchanged" if (digest, mode) == (before["sha256"], before["mode"]) else "modified",
        "cumulativeChange": "added" if not initial else "unchanged" if (digest, mode) == (initial["sha256"], initial["mode"]) else "modified"})

index = base / "reconciliation.index"
index_env = {**env, "GIT_INDEX_FILE": str(index)}
git("read-tree", "HEAD", environment=index_env)
subprocess.run(["git", "add", "-f", "--pathspec-from-file=-", "--pathspec-file-nul"],
               input=("\0".join(sorted(paths)) + "\0").encode(), cwd=dev, env=index_env, check=True)
tree = git("write-tree", environment=index_env).decode().strip()
snapshot_head = git("rev-parse", "HEAD").decode().strip()
assert snapshot_head == "adb3c083f079fa06a1f431cbf15d0aa07dc1d3b9"
baseline = json.loads((base / "preservation-verification.json").read_text())["baselineTree"]
manifest = {"development": str(dev), "original": original_manifest["source"],
    "originalWorkingTreeSnapshotCommit": snapshot_head, "sprint2BaselineTree": baseline,
    "currentTree": tree, "integrationExecuted": False, "commitsCreated": 0,
    "excludedGeneratedCaches": sorted(excluded), "files": files}
(base / "reconciliation-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
archive = base / "complete-source.tar.gz"
with tarfile.open(archive, "w:gz") as tar:
    for name in sorted(paths):
        tar.add(dev / name, arcname=name, recursive=False)
with tarfile.open(archive) as tar:
    members = {member.name: member for member in tar.getmembers()}
    assert set(members) == paths
    for item in files:
        member = members[item["path"]]
        assert member.isfile() and oct(member.mode) == item["mode"]
        assert hashlib.sha256(tar.extractfile(member).read()).hexdigest() == item["sha256"]

patches = {}
for name, ref, source, source_files in [
    ("sprint2-5.patch", baseline, Path(preservation["snapshot"]), preservation["files"]),
    ("sprint1-through-sprint2-5.patch", snapshot_head, Path(original_manifest["snapshot"]), original_manifest["files"]),
]:
    patch = base / name
    patch.write_bytes(git("diff", "--cached", "--binary", "--full-index", ref, environment=index_env))
    replay = Path(tempfile.mkdtemp(prefix="replay-" + name.removesuffix(".patch") + "-", dir=base))
    for item in source_files:
        destination = replay / item["path"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / item["path"], destination)
    subprocess.run(["git", "apply", "--check", str(patch)], cwd=replay, env=env, check=True)
    subprocess.run(["git", "apply", str(patch)], cwd=replay, env=env, check=True)
    mode_differences = []
    for item in files:
        path = replay / item["path"]
        assert path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == item["sha256"], item["path"]
        mode = stat.S_IMODE(path.stat().st_mode)
        assert mode & 0o111 == int(item["mode"], 8) & 0o111, "Executable bit mismatch: " + item["path"]
        if oct(mode) != item["mode"]:
            mode_differences.append({"path": item["path"], "expected": item["mode"], "gitReplay": oct(mode)})
    patches[name] = {"sha256": hashlib.sha256(patch.read_bytes()).hexdigest(),
        "bytes": patch.stat().st_size, "replayDirectory": str(replay),
        "matchedFiles": len(files), "contentFailures": 0, "executableBitFailures": 0,
        "modeDifferences": mode_differences}

verification = {"status": "PASS", "files": len(files),
    "sprint25ChangedFiles": sum(item["sprint25Change"] != "unchanged" for item in files),
    "cumulativeChangedFiles": sum(item["cumulativeChange"] != "unchanged" for item in files),
    "originalUntrackedOrIgnoredFilesPreserved": sum(item["originalState"] == "untracked-or-relevant-ignored" for item in files),
    "patches": patches, "completeSourceArchive": {"path": str(archive),
        "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "verifiedMembers": len(files),
        "modeAndContentDifferences": 0}, "integrationExecuted": False, "commitsCreated": 0}
(base / "reconciliation-verification.json").write_text(json.dumps(verification, indent=2) + "\n")
(base / "sprint25-changed-files.txt").write_text("\n".join(item["sprint25Change"] + " " + item["path"] for item in files if item["sprint25Change"] != "unchanged") + "\n")
print(json.dumps({key: value for key, value in verification.items() if key != "patches"}, indent=2))
