#!/usr/bin/env python3
"""Read-only, all-table evidence for a marked synthetic native acceptance root."""
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
db = sqlite3.connect(f"file:{root / 'native.sqlite3'}?mode=ro", uri=True)
assert Path(db.execute("pragma database_list").fetchone()[2]).resolve() == root / "native.sqlite3"

def digest(rows):
    return hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

tables = {}
for (name,) in db.execute("select name from sqlite_master where type='table' order by name"):
    quoted = '"' + name.replace('"', '""') + '"'
    rows = db.execute(f"select * from {quoted}").fetchall()
    rows.sort(key=lambda row: json.dumps(row, sort_keys=True))
    tables[name] = {"rows": len(rows), "sha256": digest(rows)}
groups = {}
for (kind,) in db.execute("select distinct kind from safety_records order by kind"):
    rows = db.execute("select * from safety_records where kind=? order by id", (kind,)).fetchall()
    groups[kind] = {"rows": len(rows), "sha256": digest(rows)}
entries = [json.loads(row[0]) for row in db.execute("select value_json from safety_records where kind='application_history_entry' order by id")]
db.row_factory = sqlite3.Row
applications = [dict(row) for row in db.execute("select * from applications order by id")]
integrity = [tuple(row) for row in db.execute("pragma integrity_check")]
foreign_keys = [tuple(row) for row in db.execute("pragma foreign_key_check")]
assert integrity == [("ok",)] and not foreign_keys
print(json.dumps({"database": str(root / "native.sqlite3"), "tables": tables,
    "safetyKinds": groups, "historyEntries": entries, "applications": applications,
    "integrity": integrity, "foreignKeys": foreign_keys,
    "startup": json.loads((root / "ui-startup.json").read_text())}, indent=2))
