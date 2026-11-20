#!/usr/bin/env python3
"""Generate artifacts only. Does not install/register/launch a browser or host."""
import pathlib,json,subprocess,sys,shutil,shlex
base=pathlib.Path(__file__).resolve().parents[2]
root=pathlib.Path(subprocess.check_output([sys.executable,str(base/'scripts/prepare-native-acceptance.py')],text=True).strip())
(root/'TEST_EXTENSION_ID').write_text('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n')
(root/'browser-profile').mkdir(mode=0o700)
ext=root/'test-extension';ext.mkdir(mode=0o700)
manifest=json.loads((base/'apps/careercompiler-extension/manifest.json').read_text())
manifest.update(name='CareerCompiler SYNTHETIC TEST ONLY',host_permissions=['http://127.0.0.1:5297/*'])
manifest['content_scripts'][0]['matches']=['http://127.0.0.1:5297/*']
(ext/'manifest.json').write_text(json.dumps(manifest,indent=2))
for name in ['content.js','content.css']:
    shutil.copy2(base/'apps/careercompiler-extension/src'/name,ext/name)
# Test artifact has no pairing/storage credentials, settings, or generic privileged command route.
(ext/'background.js').write_text('''const host="com.mirathfan.careercompiler.acceptance";
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(sender.id!==chrome.runtime.id || !sender.url?.startsWith("chrome-extension://"+chrome.runtime.id+"/")){respond({ok:false,error:{code:"sender_denied"}});return;}
 if(message.type!=="TEST_REQUEST"){respond({ok:false,error:{code:"command_denied"}});return;}
 chrome.runtime.sendNativeMessage(host,{...message.request,protocolVersion:3,extensionId:chrome.runtime.id,credential:""},respond);return true;
});''')
(ext/'popup.html').write_text('<!doctype html><h1>Synthetic test only</h1><p>Unregistered. No live website or provider access.</p>')
# Chrome supplies origin argument; wrapper supplies immutable marked root. Never overwrite a registration.
wrapper=root/'test-native-host';wrapper.write_text('#!/bin/sh\nexec '+shlex.quote(shutil.which('python3'))+' '+shlex.quote(str(base/'scripts/phase2c/native_host.py'))+' '+shlex.quote(str(root))+' "$@"\n');wrapper.chmod(0o700)
(root/'com.mirathfan.careercompiler.acceptance.json').write_text(json.dumps({'name':'com.mirathfan.careercompiler.acceptance','description':'UNREGISTERED SYNTHETIC TEST ONLY','path':str(wrapper),'type':'stdio','allowed_origins':['chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/']},indent=2))
(root/'TEST_ONLY_UNREGISTERED').write_text('Do not install into a normal profile. No native host registration performed.\n')
print(root)
