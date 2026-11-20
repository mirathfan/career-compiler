#!/usr/bin/env python3
"""Exact file allowlist, loopback-only synthetic fixture server."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]/'apps/careercompiler-extension/fixtures/isolated'
ALLOWED={'/'+name for name in ['greenhouse.html','lever.html','ashby.html','multi-step.html','dynamic.html','trap.js']}
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ALLOWED: self.send_error(404); return
        data=(ROOT/self.path[1:]).read_bytes();self.send_response(200)
        self.send_header('Content-Type','application/javascript' if self.path.endswith('.js') else 'text/html')
        self.send_header('Content-Security-Policy',"default-src 'self'; connect-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'none'")
        self.end_headers();self.wfile.write(data)
    def do_POST(self): self.send_error(405,'Submission prohibited')
    def log_message(self,*args): pass
if __name__=='__main__':HTTPServer(('127.0.0.1',5297),Handler).serve_forever()
