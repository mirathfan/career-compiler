#!/usr/bin/env python3
"""Read-only acceptance snapshot. Only a marked, named temporary SQLite is permitted."""
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile

root = Path(sys.argv[1]).resolve()
if root.parent != Path(tempfile.gettempdir()).resolve() or not root.name.startswith('careercompiler-native-') or (root / 'ISOLATED_ACCEPTANCE').read_text() != 'synthetic-only\n':
    raise SystemExit('A marked isolated temporary root is required')
connection = sqlite3.connect('file:' + str(root / 'native.sqlite3') + '?mode=ro', uri=True)
paths = connection.execute('pragma database_list').fetchall()
assert Path(paths[0][2]).resolve() == root / 'native.sqlite3'
tables = ['jobs', 'applications', 'career_copilot_threads', 'career_copilot_messages', 'safety_records']
digests = {}
for table in tables:
    rows = connection.execute(f'SELECT * FROM {table} ORDER BY 1').fetchall()
    digests[table] = {'rows': len(rows), 'sha256': hashlib.sha256(json.dumps(rows, separators=(',', ':')).encode()).hexdigest()}
actions = [action for row in connection.execute('select pending_actions_json from career_copilot_messages') for action in json.loads(row[0])]
history = [json.loads(row[0]) for row in connection.execute("select value_json from safety_records where kind='application_history_entry'")]
result = {
    'database': str(root / 'native.sqlite3'), 'integrity': connection.execute('pragma integrity_check').fetchall(),
    'foreignKeys': connection.execute('pragma foreign_key_check').fetchall(),
    'schemaSha256': hashlib.sha256(json.dumps(connection.execute('select name,sql from sqlite_master where sql is not null order by name').fetchall()).encode()).hexdigest(),
    'digests': digests, 'restoredJobNote': connection.execute("select notes from jobs where id='fit-job-0'").fetchone()[0],
    'actions': [{'type': action['type'], 'status': action['status'], 'target': action['afterJson'].get('jobId'), 'undo': bool(action['afterJson'].get('undoOf'))} for action in actions],
    'history': [{'rowId': item.get('rowId'), 'originalRole': item.get('original', {}).get('role'), 'correctedRole': item.get('normalized', {}).get('role'), 'evidenceState': item.get('evidenceState'), 'applicationId': item.get('applicationId')} for item in history],
    'aiBudgetRecords': connection.execute("select count(*) from safety_records where kind='ai_budget'").fetchone()[0],
    'startup': json.loads((root / 'ui-startup.json').read_text()),
}
assert result['integrity'] == [('ok',)] and not result['foreignKeys']
print(json.dumps(result, indent=2))
