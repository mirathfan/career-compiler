#!/usr/bin/env python3
"""Unregistered, synthetic-only Chrome stdio framing adapter. Never resolves HOME."""
import json, pathlib, socket, struct, sys, os, re
MAX = 1024 * 1024
EXTENSION = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
def root_for(path):
    root = pathlib.Path(path).resolve(strict=True)
    import tempfile
    if any((root/name).is_symlink() for name in ['ISOLATED_ACCEPTANCE','native.sqlite3','s']) or root.stat().st_uid != os.getuid():
        raise ValueError('isolation_path_denied')
    if root.parent != pathlib.Path(tempfile.gettempdir()).resolve() or not root.name.startswith('careercompiler-native-') or (root/'ISOLATED_ACCEPTANCE').read_text() != 'synthetic-only\n':
        raise ValueError('isolation_marker_required')
    return root

def expected_extension(root):
    path=root/'TEST_EXTENSION_ID'
    if path.is_symlink(): raise ValueError('identity_path_denied')
    value=path.read_text().strip()
    if not re.fullmatch('[a-p]{32}',value):raise ValueError('identity_invalid')
    return value

def read_frame(source):
    header = source.read(4)
    if len(header) != 4: raise ValueError('truncated_message')
    size = struct.unpack('<I', header)[0]
    if not 0 < size <= MAX: raise ValueError('message_too_large')
    payload = source.read(size)
    if len(payload) != size: raise ValueError('truncated_message')
    return json.loads(payload)
def frame(value):
    data = json.dumps(value,separators=(',',':')).encode()
    if len(data)>MAX: raise ValueError('response_too_large')
    return struct.pack('<I',len(data))+data
def main():
    try:
        if len(sys.argv) != 3: raise ValueError('root_and_origin_required')
        root = root_for(sys.argv[1]);origin = sys.argv[2]
        if origin != 'chrome-extension://'+expected_extension(root)+'/': raise ValueError('extension_denied')
        request = read_frame(sys.stdin.buffer)
        with socket.socket(socket.AF_UNIX) as sock:
            sock.settimeout(7);sock.connect(str(root/'s'));sock.sendall(frame({'origin':origin,'requestJson':json.dumps(request,separators=(',',':'))}))
            print('SYNTHETIC_IPC_FORWARDED',file=sys.stderr,flush=True)
            response = read_frame(sock.makefile('rb'))
            if isinstance(response,str): response=json.loads(response)
    except Exception as exc:
        code = str(exc) if isinstance(exc, ValueError) else 'transport_unavailable'
        response={'protocolVersion':3,'ok':False,'error':{'code':code,'message':'Synthetic host request rejected','retryable':False}}
    sys.stdout.buffer.write(frame(response));sys.stdout.buffer.flush()
if __name__ == '__main__': main()
