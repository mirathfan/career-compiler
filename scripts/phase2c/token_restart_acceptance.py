#!/usr/bin/env python3
"""Own two acceptance processes; keep token restart inside its unchanged 60s TTL.
Never registers a native host, launches Chrome, or opens a production database.
"""
import io, json, os, pathlib, plistlib, socket, stat, subprocess, sys, time
from native_host import EXTENSION, frame, read_frame, root_for
root = root_for(sys.argv[1])
binary = pathlib.Path(sys.argv[2]).resolve()
info = binary.parent.parent / 'Info.plist'
assert plistlib.loads(info.read_bytes())['CFBundleIdentifier'] == 'com.mirathfan.careercompiler.acceptance'
assert not (root / 'native.sqlite3').is_symlink()
env = dict(os.environ, CC_ACCEPTANCE_ROOT=str(root), CC_ACCEPTANCE_BRIDGE='1')
env.pop('CC_ACCEPTANCE_UI', None)
process = None
log = (root / 'token-restart-controller.log').open('w')
def clear_dead_socket():
    path = root / 's'
    if not path.exists(): return
    assert stat.S_ISSOCK(path.lstat().st_mode)
    with socket.socket(socket.AF_UNIX) as client:
        try:
            client.connect(str(path))
        except ConnectionRefusedError:
            path.unlink()
            return
    raise RuntimeError('A live test listener exists; refusing to replace it')
def start():
    global process
    clear_dead_socket()
    process = subprocess.Popen([str(binary)], env=env, stdout=log, stderr=log)
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if process.poll() is not None: raise RuntimeError('Acceptance app exited before ready')
        try:
            ready = json.loads((root / 'bridge-ready.json').read_text())
            if ready['processId'] == process.pid:
                assert ready['paths'][0]['file'] == str(root / 'native.sqlite3')
                return process.pid
        except (FileNotFoundError, json.JSONDecodeError): pass
        time.sleep(.05)
    raise RuntimeError('Acceptance readiness timeout')
def stop():
    global process
    if process:
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=5)
        process = None
counter = 0
def send(kind, **kwargs):
    global counter
    counter += 1
    packet = dict(protocolVersion=3, extensionId=EXTENSION, requestId='controlled-restart-'+str(time.time_ns())+'-'+str(counter), type=kind, **kwargs)
    child = subprocess.run([sys.executable, str(pathlib.Path(__file__).with_name('native_host.py')), str(root), 'chrome-extension://'+EXTENSION+'/'], input=frame(packet), stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
    return read_frame(io.BytesIO(child.stdout))
try:
    first_pid = start()
    prepared = send('prepare_application', pageContext=dict(url='http://127.0.0.1:5297/dynamic.html', companyName='Synthetic dynamic', jobTitle='Software Engineer', jobDescription='Synthetic React role', atsPlatform='generic'), fields=[])
    assert prepared['ok'], prepared.get('error')
    payload = prepared['data']; started = time.monotonic()
    stop(); second_pid = start()
    remaining_ms = payload['authorization']['expiresAtMs'] - int(time.time()*1000)
    consumed = send('authorize_fill', prepared=payload, pageUrl='http://127.0.0.1:5297/dynamic.html')
    replay = send('authorize_fill', prepared=payload, pageUrl='http://127.0.0.1:5297/dynamic.html')
    report = dict(scenario='fresh unused token survives native restart and remains single-use', status='PASS' if remaining_ms>0 and consumed['ok'] and not replay['ok'] else 'FAIL', firstProcessId=first_pid, secondProcessId=second_pid, remainingTtlMsBeforeConsume=remaining_ms, elapsedSeconds=round(time.monotonic()-started,3), firstAccepted=consumed['ok'], replayAccepted=replay['ok'], errors=[consumed.get('error'), replay.get('error')], chrome='NOT VERIFIED; synthetic stdio caller only')
    (root/'fresh-token-restart-results.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    assert report['status']=='PASS'
finally:
    stop(); log.close()
