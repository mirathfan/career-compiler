#!/usr/bin/env python3
import concurrent.futures,io,json,pathlib,sqlite3,subprocess,sys,time
from native_host import root_for,frame,read_frame,EXTENSION
root=root_for(sys.argv[1]);host=pathlib.Path(__file__).with_name('native_host.py');report=[]
def send(kind,rid,**kwargs):
    request={'type':kind,'requestId':rid,'protocolVersion':3,'extensionId':EXTENSION,**kwargs}
    output=subprocess.run([sys.executable,str(host),str(root),'chrome-extension://'+EXTENSION+'/'],input=frame(request),stdout=subprocess.PIPE,timeout=10)
    return read_frame(io.BytesIO(output.stdout))
def prepare(rid):return send('prepare_application',rid,pageContext={'url':'http://127.0.0.1:5297/dynamic.html','title':'Software Engineer','companyName':'Synthetic dynamic','jobTitle':'Software Engineer','jobDescription':'Synthetic React role','atsPlatform':'generic'},fields=[])
with sqlite3.connect(root/'native.sqlite3',timeout=2) as connection:
    connection.execute('BEGIN IMMEDIATE')
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        task=pool.submit(prepare,'busy-failure-test');time.sleep(6);response=task.result();connection.rollback()
report.append({'scenario':'busy lock transport timeout','status':'PASS' if not response.get('ok') else 'FAIL','code':response.get('error',{}).get('code')})
# Allow already-started work to settle. Nothing was consumed or submitted.
time.sleep(1)
response=prepare('busy-recovery-test');report.append({'scenario':'explicit retry after lock release','status':'PASS' if response.get('ok') else 'FAIL','code':response.get('error',{}).get('code')})
response=prepare('pre-restart-token')
if response.get('ok'):(root/'restart-unused.json').write_text(json.dumps(response['data']))
with sqlite3.connect(root/'native.sqlite3') as connection:
    snapshots={'packages':connection.execute("select id,resume_version_id,approved_at from application_packages where job_id like 'local-%' order by id").fetchall(),'auditCount':connection.execute("select count(*) from safety_records where kind='package_audit'").fetchone()[0]}
(root/'pre-restart-state.json').write_text(json.dumps(snapshots,indent=2))
(root/'failure-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));sys.exit(any(row['status']=='FAIL' for row in report))
