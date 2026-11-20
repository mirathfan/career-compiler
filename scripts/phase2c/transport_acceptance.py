#!/usr/bin/env python3
"""Actual subprocess stdio -> Unix socket -> packaged WebView/SQLite acceptance.
No Chrome claim: caller origin is simulated by this OS-level test controller.
"""
import concurrent.futures,copy,json,pathlib,sqlite3,struct,subprocess,sys,time
from native_host import root_for,frame,read_frame,EXTENSION
root=root_for(sys.argv[1]);host=pathlib.Path(__file__).with_name('native_host.py');results=[]
def send(request,origin=None,raw=None):
    data=frame(request) if raw is None else raw
    child=subprocess.run([sys.executable,str(host),str(root),origin or 'chrome-extension://'+EXTENSION+'/'],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10)
    import io
    return read_frame(io.BytesIO(child.stdout))
counter=0
def request(kind,**kwargs):
    global counter
    counter+=1
    return {'type':kind,'protocolVersion':3,'extensionId':EXTENSION,'requestId':'phase2c-'+str(counter),**kwargs}
def check(name,condition,detail):
    results.append({'scenario':name,'status':'PASS' if condition else 'FAIL','detail':detail})
def prepare(name='multi-step'):
    response=send(request('prepare_application',pageContext={'url':'http://127.0.0.1:5297/'+name+'.html','title':'Software Engineer','companyName':'Synthetic '+name,'jobTitle':'Software Engineer','jobDescription':'Synthetic React role','atsPlatform':'greenhouse'},fields=[{'id':'first','label':'First Name','inputType':'text','detectedFieldType':'input'},{'id':'email','label':'Email','inputType':'email','detectedFieldType':'input'},{'id':'unknown','label':'Unknown unsupported question','inputType':'text','detectedFieldType':'input'},{'id':'resume','label':'Resume','inputType':'file','detectedFieldType':'input'}]))
    if not response.get('ok'):raise RuntimeError('prepare rejected: '+str(response.get('error')))
    return response['data']
def authorize(prepared,**kwargs):return send(request('authorize_fill',prepared=prepared,pageUrl='http://127.0.0.1:5297/'+kwargs.pop('name','multi-step')+'.html',**kwargs))
def fault(sql,args):
    # Deliberate corruption/fault injection into marked synthetic DB only.
    with sqlite3.connect(root/'native.sqlite3',timeout=2) as db: db.execute(sql,args)
check('real stdio/socket handshake',send(request('ping')).get('ok'), 'Python host process -> packaged native listener; simulated caller, not Chrome')
for name,payload in [('version',request('ping',protocolVersion=1)),('provider',request('run_openai_structured')),('file',request('read_file',path='/etc/passwd')),('database',request('acceptance_query',query='SELECT 1',path='sqlite:careercompiler.db')),('external',request('prepare_application',pageContext={'url':'https://boards.greenhouse.io/real'},fields=[]))]:
    response=send(payload);check(name+' denied',not response.get('ok'),response.get('error',{}).get('code'))
check('unauthorized caller denied',not send(request('ping'),origin='chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/').get('ok'),'host origin mismatch')
for name,raw in [('malformed',struct.pack('<I',1)+b'{'),('oversized',struct.pack('<I',2**32-1)),('truncated',struct.pack('<I',5)+b'{')]:
    response=send({},raw=raw);check(name+' framing denied',not response.get('ok'),response.get('error',{}).get('code'))
p=prepare();check('synthetic payload/file preparation',bool(p.get('authorization') and p.get('resume',{}).get('fileBase64')), 'Approved package + bounded synthetic PDF')
check('missing evidence unresolved',any(f['answerSource']=='user_required' for f in p['fields'] if f['fieldId']=='unknown'),'Unsupported answer was not invented')
r=authorize(p);check('valid authority consumed',r.get('ok'), str(r.get('error') or 'Current SQLite approval/revision/content checked by app'))
(root/'replay-payload.json').write_text(json.dumps(p))
check('replay rejected',not authorize(p).get('ok'),'Same durable token sent through a new host process')
p=prepare();reordered=json.loads(json.dumps(p,sort_keys=True));ordering=authorize(reordered);check('production transport JSON key ordering',ordering.get('ok'), 'Production canonical digest accepts native key reordering')
p=prepare();tampered=copy.deepcopy(p);tampered['packageId']='forged';check('forged package metadata rejected',not authorize(tampered).get('ok'),'Full payload digest mismatch')
tampered=copy.deepcopy(p);tampered['contentFingerprint']['resume']='forged';check('tampered fingerprint rejected',not authorize(tampered).get('ok'),'Authoritative binding mismatch')
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    responses=list(pool.map(lambda _:authorize(p),range(2)))
check('concurrent consumption serialized',sum(bool(r.get('ok')) for r in responses)==1,'Exactly one success for the same token')
p=prepare();token=p['authorization']['id']
with sqlite3.connect(root/'native.sqlite3') as db:
    value=json.loads(db.execute("SELECT value_json FROM safety_records WHERE kind='fill_token' AND id=?",(token,)).fetchone()[0]);value['expiresAtMs']=1
    db.execute("UPDATE safety_records SET value_json=? WHERE kind='fill_token' AND id=?",(json.dumps(value),token))
p['authorization']['expiresAtMs']=1;check('expired token rejected',not authorize(p).get('ok'),'Synthetic expiry fault injection')
for name,sql,args in [('greenhouse','UPDATE application_packages SET approved_at=? WHERE job_id=?',('', 'local-greenhouse')),('lever','UPDATE application_packages SET resume_version_id=? WHERE job_id=?',('resume-a','local-lever')),('ashby','UPDATE jobs SET raw_description=?,description_text=? WHERE id=?',('Changed requirements','Changed requirements','local-ashby'))]:
    p=prepare(name);fault(sql,args);check(name+' changed authority rejected',not authorize(p,name=name).get('ok'),'Synthetic SQLite fault injection; not a UI mutation/audit workflow')
duplicate=request('prepare_application',pageContext={'url':'http://127.0.0.1:5297/dynamic.html','title':'Software Engineer','companyName':'Synthetic dynamic','jobTitle':'Software Engineer','jobDescription':'Synthetic React role','atsPlatform':'generic'},fields=[])
first=send(duplicate);second=send(duplicate);check('duplicate request ID rejected',first.get('ok') and not second.get('ok'),'In-process request ID replay protection')
p=prepare('dynamic');req=request('authorize_fill',prepared=p,pageUrl='http://127.0.0.1:5297/dynamic.html')
child=subprocess.Popen([sys.executable,str(host),str(root),'chrome-extension://'+EXTENSION+'/'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
child.stdin.write(frame(req));child.stdin.flush();time.sleep(.3);child.kill();child.communicate()
# Either dispatched and consumed, or not dispatched. Retry must never make the same token usable twice.
r=authorize(p,name='dynamic');again=authorize(p,name='dynamic')
check('interrupted host consumption safe',not again.get('ok'),'First retry may succeed only if original dispatch never consumed; second cannot')
with sqlite3.connect(root/'native.sqlite3',timeout=2) as db:
    check('SQLite integrity',db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','Synthetic database only')
    check('no submission',db.execute("SELECT count(*) FROM applications WHERE submitted_at<>'' OR status='applied'").fetchone()[0]==0,'No tracker marked submitted')
    tokenstates=dict(db.execute("SELECT json_extract(value_json,'$.state'),count(*) FROM safety_records WHERE kind='fill_token' GROUP BY 1"))
report={'transport':'REAL subprocess stdio + Unix socket + packaged app; NO Chrome execution','database':str(root/'native.sqlite3'),'results':results,'tokenStates':tokenstates,'chrome':'BLOCKED: extension loading/native host registration not performed under constrained execution boundary'}
(root/'transport-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));sys.exit(any(x['status']=='FAIL' for x in results))
