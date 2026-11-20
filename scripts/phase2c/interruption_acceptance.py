#!/usr/bin/env python3
import io,json,pathlib,sqlite3,subprocess,sys,time
from native_host import frame,read_frame,root_for,EXTENSION
root=root_for(sys.argv[1]);host=pathlib.Path(__file__).with_name('native_host.py')
def packet(kind,rid,**kwargs):return {'type':kind,'requestId':rid,'protocolVersion':3,'extensionId':EXTENSION,**kwargs}
def send(p):
    c=subprocess.run([sys.executable,str(host),str(root),'chrome-extension://'+EXTENSION+'/'],input=frame(p),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10);return read_frame(io.BytesIO(c.stdout))
p=send(packet('prepare_application','interrupt-blocked-prepare',pageContext={'url':'http://127.0.0.1:5297/dynamic.html','companyName':'Synthetic dynamic','jobTitle':'Software Engineer','jobDescription':'Synthetic React role','atsPlatform':'generic'},fields=[]))
assert p['ok'],p;p=p['data'];token=p['authorization']['id']
with sqlite3.connect(root/'native.sqlite3',timeout=2) as db:
    db.execute('BEGIN IMMEDIATE')
    child=subprocess.Popen([sys.executable,str(host),str(root),'chrome-extension://'+EXTENSION+'/'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    child.stdin.write(frame(packet('authorize_fill','interrupt-blocked-consume',prepared=p,pageUrl='http://127.0.0.1:5297/dynamic.html')));child.stdin.flush()
    marker=child.stderr.readline().decode().strip();assert marker=='SYNTHETIC_IPC_FORWARDED',marker
    # A separate committed reader proves consumption cannot commit while held.
    with sqlite3.connect(root/'native.sqlite3') as reader:before=json.loads(reader.execute("select value_json from safety_records where kind='fill_token' and id=?",(token,)).fetchone()[0])['state']
    time.sleep(.2);alive=child.poll() is None;child.kill();child.communicate();db.rollback()
state=None
for _ in range(50):
    with sqlite3.connect(root/'native.sqlite3') as reader:state=json.loads(reader.execute("select value_json from safety_records where kind='fill_token' and id=?",(token,)).fetchone()[0])['state']
    if state=='consumed':break
    time.sleep(.1)
retry=send(packet('authorize_fill','interrupt-blocked-retry',prepared=p,pageUrl='http://127.0.0.1:5297/dynamic.html'))
report={'scenario':'host killed after forwarding before SQLite consumption could commit','status':'PASS' if alive and before=='prepared' and state=='consumed' and not retry['ok'] else 'FAIL','marker':marker,'hostWasAlive':alive,'beforeState':before,'afterState':state,'retryAccepted':retry['ok'],'meaning':'Authority may commit after host loss; response is uncertain and consumed authorization is never released.'}
(root/'interruption-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));sys.exit(report['status']!='PASS')
