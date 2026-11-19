# Test server for version-control-check.sh: git over HTTP, login alice / s3cret-XYZ, on 127.0.0.1:8765.
import http.server, subprocess, base64, os, sys
ROOT=sys.argv[1]
BACKEND=os.path.join(subprocess.check_output(['git','--exec-path'],text=True).strip(),'git-http-backend')
class H(http.server.BaseHTTPRequestHandler):
    def go(self):
        if self.headers.get('Authorization')!='Basic '+base64.b64encode(b'alice:s3cret-XYZ').decode():
            self.send_response(401); self.send_header('WWW-Authenticate','Basic realm="t"'); self.end_headers(); return
        path,_,q=self.path.partition('?'); n=int(self.headers.get('Content-Length') or 0); body=self.rfile.read(n)
        env=dict(os.environ,GIT_PROJECT_ROOT=ROOT,GIT_HTTP_EXPORT_ALL='1',PATH_INFO=path,QUERY_STRING=q,REQUEST_METHOD=self.command,CONTENT_TYPE=self.headers.get('Content-Type',''),CONTENT_LENGTH=str(n),REMOTE_USER='alice',GIT_PROTOCOL=self.headers.get('Git-Protocol',''))
        out=subprocess.run([BACKEND],input=body,env=env,capture_output=True).stdout
        head,_,data=out.partition(b'\r\n\r\n'); st=200; hs=[]
        for l in head.split(b'\r\n'):
            k,_,v=l.decode().partition(': ')
            if k=='Status': st=int(v.split()[0])
            elif k: hs.append((k,v))
        self.send_response(st); [self.send_header(k,v) for k,v in hs]; self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
    do_GET=go; do_POST=go
    def log_message(self,*a): pass
http.server.HTTPServer(('127.0.0.1',8765),H).serve_forever()
