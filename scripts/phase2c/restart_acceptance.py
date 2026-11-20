#!/usr/bin/env python3
import io,json,pathlib,sqlite3,subprocess,sys
from native_host import root_for,frame,read_frame,EXTENSION
root=root_for(sys.argv[1]);host=pathlib.Path(__file__).with_name('native_host.py');results=[]
def send(payload):
    data=subprocess.run([sys.executable,str(host),str(root),'chrome-extension://'+EXTENSION+'/'],input=frame(payload),stdout=subprocess.PIPE,timeout=10)
    return read_frame(io.BytesIO(data.stdout))
previous=json.loads((root/'pre-restart-state.json').read_text())
with sqlite3.connect(root/'native.sqlite3') as db:
    state={'packages':[list(row) for row in db.execute("select id,resume_version_id,approved_at from application_packages where job_id like 'local-%' order by id")],'auditCount':db.execute("select count(*) from safety_records where kind='package_audit'").fetchone()[0]}
results.append({'scenario':'package selections approvals and audit survive native restart','status':'PASS' if state==previous else 'FAIL'})
p=json.loads((root/'replay-payload.json').read_text());r=send({'type':'authorize_fill','protocolVersion':3,'extensionId':EXTENSION,'requestId':'restart-replay','prepared':p,'pageUrl':'http://127.0.0.1:5297/multi-step.html'})
results.append({'scenario':'consumed token remains unusable after restart','status':'PASS' if not r.get('ok') else 'FAIL','code':r.get('error',{}).get('code'),'limitation':'Expiry may also reject; persisted consumed state checked independently'})
for name in ['greenhouse','lever','ashby']:
    r=send({'type':'prepare_application','protocolVersion':3,'extensionId':EXTENSION,'requestId':'restart-stale-'+name,'pageContext':{'url':'http://127.0.0.1:5297/'+name+'.html','companyName':'Synthetic '+name,'jobTitle':'Software Engineer','jobDescription':'Changed requirements' if name=='ashby' else 'Synthetic React role','atsPlatform':name},'fields':[]})
    results.append({'scenario':'stale '+name+' not reapproved on restart','status':'PASS' if not r.get('ok') else 'FAIL','code':r.get('error',{}).get('code')})
(root/'restart-results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2));sys.exit(any(row['status']=='FAIL' for row in results))
