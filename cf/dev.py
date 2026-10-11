"""Local 97a.io: serves web/ live (edits show on reload), "/" -> homepage like the Cloudflare Worker.
    python3 web/cf/dev.py [port]      then open http://localhost:8797
The contact form does not send from here; it answers with a local notice."""
import http.server, json, os, sys
from functools import partial

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def do_GET(self):
        if self.path.split("?")[0] == "/":
            self.path = "/site/index.html" + (self.path[1:] if "?" in self.path else "")
        super().do_GET()
    def do_POST(self):
        if self.path.startswith("/api/contact"):
            body = json.dumps({"ok": False, "error": "local preview: messages are only sent from 97a.io"}).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers()
            self.wfile.write(body); return
        self.send_error(404)
    def log_message(self, *a): pass

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8797
http.server.ThreadingHTTPServer(("127.0.0.1", port), partial(H, directory=ROOT)).serve_forever()
