import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BRIDGE = Path(__file__).resolve().parent / "ix_bridge.py"
SECRET = "sk-ant-example"


def load_bridge():
    spec = importlib.util.spec_from_file_location("ix_bridge_integration", BRIDGE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Loop(BaseHTTPRequestHandler):
    def do_POST(self):
        self.server.hits.append(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        self.rfile.read(length)
        if self.server.mode == "redirect":
            body = b"go"
            self.send_response(302)
            self.send_header("Location", "http://127.0.0.1:%d/exfil" % self.server.server_address[1])
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        body = json.dumps({"response": "review only\n", "prompt_eval_count": 1, "eval_count": 2}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        return


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.bridge = load_bridge()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Loop)
        self.server.hits = []
        self.server.mode = "ok"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.shutdown)
        self.addCleanup(self.server.server_close)
        self.bridge.OLLAMA_URL = "http://127.0.0.1:%d/api/generate" % self.server.server_address[1]
        self.saved_proxy = {key: os.environ.get(key) for key in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY")}
        os.environ["http_proxy"] = "http://127.0.0.1:9"
        os.environ["https_proxy"] = "http://127.0.0.1:9"

    def tearDown(self):
        for key, value in self.saved_proxy.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_subprocess_and_loopback_store_text_only(self):
        script = self.root / "stub.py"
        script.write_text(
            "import json,sys\n"
            "sys.stderr.write(%r)\n"
            "sys.stdout.write(json.dumps({'result':'print(1)\\n','usage':{'input_tokens':1,'output_tokens':1},'total_cost_usd':0.01}))\n"
            % SECRET
        )
        self.bridge.claude_argv = lambda: [sys.executable, str(script)]
        out = self.root / "out"
        state = self.root / "state"
        out.mkdir()
        state.mkdir()
        request = self.root / "request.json"
        prompt = self.root / "prompt.txt"
        prompt.write_text("hello\n")
        body = {
            "allowedPaths": ["packages/agents/test/example.test.ts"],
            "jobId": "job-1",
            "mode": "testgen",
            "model": {"name": "qwen2.5-coder:14b", "options": {"context": 8192, "retries": 2}},
            "outputLimits": {"maxBytes": 4000, "maxFiles": 1},
            "promptSha256": __import__("hashlib").sha256(b"hello\n").hexdigest(),
            "risk": "non-security",
            "sourceSha": "bd3dbe4eff2cfa0e34989b718fe6c7eadb4eb77e",
        }
        request.write_text(json.dumps(body) + "\n")
        outcome = self.bridge.run_job(str(request), str(prompt), str(out), str(state))
        self.assertEqual(outcome["status"], "review-needed")
        self.assertEqual((out / "claude-output.txt").read_text(), "print(1)\n")
        self.assertEqual((out / "qwen-review.txt").read_text(), "review only\n")
        self.assertEqual(self.server.hits, ["/api/generate"])
        blob = "\n".join(p.read_text(errors="replace") for p in list(out.iterdir()) + list(state.rglob("*")) if p.is_file())
        self.assertNotIn(SECRET, blob)
        self.assertNotIn(SECRET, json.dumps(outcome))

    def test_timeout_kills_the_process_group_and_does_not_replay(self):
        pidfile = self.root / "pid"
        code = "import os,sys,time\nopen(sys.argv[1],'w').write(str(os.getpid()))\ntime.sleep(30)\n"
        self.bridge.claude_argv = lambda: [sys.executable, "-c", code, str(pidfile)]
        self.bridge.WALL_TIMEOUT_S = 0.4
        out = self.root / "out2"
        state = self.root / "state2"
        out.mkdir()
        state.mkdir()
        request = self.root / "request2.json"
        prompt = self.root / "prompt2.txt"
        prompt.write_text("hello\n")
        body = {
            "allowedPaths": ["packages/agents/test/example.test.ts"],
            "jobId": "job-2",
            "mode": "testgen",
            "model": {"name": "qwen2.5-coder:14b", "options": {}},
            "outputLimits": {"maxBytes": 4000, "maxFiles": 1},
            "promptSha256": __import__("hashlib").sha256(b"hello\n").hexdigest(),
            "risk": "non-security",
            "sourceSha": "bd3dbe4eff2cfa0e34989b718fe6c7eadb4eb77e",
        }
        request.write_text(json.dumps(body) + "\n")
        started = time.monotonic()
        outcome = self.bridge.run_job(str(request), str(prompt), str(out), str(state))
        self.assertLess(time.monotonic() - started, 5)
        self.assertEqual(outcome["reasons"], ["timeout"])
        pid = int(pidfile.read_text())
        with self.assertRaises(ProcessLookupError):
            os.kill(pid, 0)
        again = self.bridge.run_job(str(request), str(prompt), str(out), str(state))
        self.assertEqual(again["reasons"], ["uncertain-no-replay"])
        self.assertEqual(self.server.hits, [])

    def test_redirect_is_not_followed(self):
        self.server.mode = "redirect"
        code = "import json,sys\nsys.stdout.write(json.dumps({'result':'x'}))\n"
        self.bridge.claude_argv = lambda: [sys.executable, "-c", code]
        out = self.root / "out3"
        state = self.root / "state3"
        out.mkdir()
        state.mkdir()
        request = self.root / "request3.json"
        prompt = self.root / "prompt3.txt"
        prompt.write_text("hello\n")
        body = {
            "allowedPaths": ["packages/agents/test/example.test.ts"],
            "jobId": "job-3",
            "mode": "testgen",
            "model": {"name": "qwen2.5-coder:14b", "options": {}},
            "outputLimits": {"maxBytes": 4000, "maxFiles": 1},
            "promptSha256": __import__("hashlib").sha256(b"hello\n").hexdigest(),
            "risk": "non-security",
            "sourceSha": "bd3dbe4eff2cfa0e34989b718fe6c7eadb4eb77e",
        }
        request.write_text(json.dumps(body) + "\n")
        outcome = self.bridge.run_job(str(request), str(prompt), str(out), str(state))
        self.assertEqual(outcome["reasons"], ["ollama-failed"])
        self.assertEqual(self.server.hits, ["/api/generate"])
        self.assertFalse((out / "qwen-review.txt").exists())
