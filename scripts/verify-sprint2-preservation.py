#!/usr/bin/env python3
"""Read-only check of both preserved workspaces; never applies a patch."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

base = Path(__file__).resolve().parents[2]
manifest = json.loads((base / 'manifest.json').read_text())
failures = []
for label, root in [('Sprint 1 source', Path(manifest['source'])), ('Sprint 2 recovery', Path(manifest['snapshot']))]:
    changed = [item['path'] for item in manifest['files'] if not (root / item['path']).is_file() or hashlib.sha256((root / item['path']).read_bytes()).hexdigest() != item['sha256']]
    print(f'{label}: {len(manifest["files"])} files; {len(changed)} differences')
    failures.extend(changed)
env = {**os.environ, 'GIT_OPTIONAL_LOCKS': '0'}
status = subprocess.check_output(['git', 'status', '--porcelain=v1', '--untracked-files=all'], cwd=manifest['source'], env=env)
if status != (base / 'sprint1-status.txt').read_bytes():
    failures.append('Sprint 1 Git status changed')
visible = set(subprocess.check_output(['git', 'ls-files', '-c', '-o', '--exclude-standard', '-z'], cwd=manifest['source'], env=env).decode().split('\0')) - {''}
if visible - {item['path'] for item in manifest['files']}:
    failures.append('Unmanifested Sprint 1 files')
original_manifest = Path(manifest['source']).parent / 'manifest.json'
check = subprocess.run([sys.executable, str(Path(manifest['source']) / 'scripts/verify-sprint1-preservation.py'), str(original_manifest)], env=env)
if check.returncode:
    failures.append('Original preservation check failed')
print('PASS' if not failures else '\n'.join(failures))
sys.exit(bool(failures))
