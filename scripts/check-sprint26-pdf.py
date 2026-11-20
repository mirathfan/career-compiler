#!/usr/bin/env python3
"""Read-only verification of the real native PDF acceptance fixture and outputs."""
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile

root = Path(sys.argv[1]).resolve()
assert root.parent == Path(tempfile.gettempdir()).resolve()
assert root.name.startswith("careercompiler-native-")
assert (root / "ISOLATED_ACCEPTANCE").read_text() == "synthetic-only\n"
stage = sys.argv[2] if len(sys.argv) > 2 else "stage-one.json"
assert stage in ["stage-one.json", "stage-two.json"]
report = json.loads((root / stage).read_text())
assert report["environment"]["root"] == str(root)
assert report["actualDatabasePaths"][0]["file"] == str(root / "native.sqlite3")
assert report["results"] and all(item["status"] == "PASS" for item in report["results"])
db = sqlite3.connect(f"file:{root / 'native.sqlite3'}?mode=ro", uri=True)
assert db.execute("pragma database_list").fetchone()[2] == str(root / "native.sqlite3")
db.row_factory = sqlite3.Row
resumes = {row["id"]: dict(row) for row in db.execute("select * from resume_versions order by id")}
assert set(resumes) == {"resume-master", "resume-a", "resume-b"}
assert resumes["resume-master"]["kind"] == "master" and not resumes["resume-master"]["last_export_path"]
assert json.loads(resumes["resume-master"]["content_json"])["header"]["headline"] == "Software Engineer"
outputs = {}
for suffix in ["a", "b"]:
    name = "resume-" + suffix
    path = root / (name + ".pdf")
    content = json.loads(resumes[name]["content_json"])
    assert content["id"] == name and content["header"]["headline"].endswith("version " + suffix.upper())
    assert resumes[name]["last_export_path"] == str(path)
    assert resumes[name]["parent_resume_version_id"] == resumes[name]["base_resume_version_id"] == "resume-master"
    assert path.read_bytes().startswith(b"%PDF-")
    outputs[name] = {"path": str(path), "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
assert outputs["resume-a"]["sha256"] != outputs["resume-b"]["sha256"]
historical = dict(db.execute("select * from applications where id='pdf-historical-submission'").fetchone())
assert historical["status"] == "applied" and historical["submitted_resume_version_id"] == "resume-a"
assert historical["submitted_pdf_path"] == outputs["resume-a"]["path"]
assert historical["submitted_pdf_hash"] == outputs["resume-a"]["sha256"]
assert historical["submitted_at"] == "2026-10-01T12:00:00Z"
integrity = [tuple(row) for row in db.execute("pragma integrity_check")]
foreign_keys = [tuple(row) for row in db.execute("pragma foreign_key_check")]
assert integrity == [("ok",)] and not foreign_keys
pid = report["environment"]["processId"]
temporary = sorted(str(path) for path in root.parent.glob(f"careercompiler-latex-{pid}-*"))
assert not temporary, temporary
print(json.dumps({"status": "PASS", "database": str(root / "native.sqlite3"), "processId": pid,
    "nativeChecksPassed": len(report["results"]), "outputs": outputs,
    "masterRecordSha256": hashlib.sha256(json.dumps(resumes["resume-master"], sort_keys=True).encode()).hexdigest(),
    "resumeRecordsSha256": hashlib.sha256(json.dumps(resumes, sort_keys=True).encode()).hexdigest(),
    "historicalSubmissionSha256": hashlib.sha256(json.dumps(historical, sort_keys=True).encode()).hexdigest(),
    "temporaryRendererDirectoriesRemaining": temporary, "integrity": integrity, "foreignKeys": foreign_keys}, indent=2))
