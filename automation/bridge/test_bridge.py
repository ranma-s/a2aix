import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

FIXTURES = Path(__file__).resolve().parent / "fixtures"
os.environ.setdefault("IX_BRIDGE_PY", str(Path(__file__).resolve().parent / "ix_bridge.py"))
SOURCE_SHA = "bd3dbe4eff2cfa0e34989b718fe6c7eadb4eb77e"
FLAGS = [
    "-p",
    "--output-format",
    "json",
    "--tools",
    "",
    "--safe-mode",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--permission-prompts",
    "none",
]
ARGV = ["claude", *FLAGS]


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def load_bridge():
    path = os.environ["IX_BRIDGE_PY"]
    spec = importlib.util.spec_from_file_location("ix_bridge", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Fake:
    def __init__(self):
        self.claude_calls = []
        self.ollama_calls = []

    def claude(self, prompt):
        self.claude_calls.append(prompt)
        body = {
            "result": "print('candidate')\n",
            "usage": {"input_tokens": 3, "output_tokens": 4},
            "total_cost_usd": 0.01,
        }
        return {"stdout": json.dumps(body), "returncode": 0}

    def ollama(self, prompt):
        self.ollama_calls.append(prompt)
        return {"text": json.dumps({"response": "review only\n", "prompt_eval_count": 1, "eval_count": 2})}


class BridgeTests(unittest.TestCase):
    def setUp(self):
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop("IX_CLAUDE_BIN", None)
        self.bridge = load_bridge()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.out = self.root / "out"
        self.state = self.root / "state"
        self.out.mkdir()
        self.state.mkdir()
        self.fake = Fake()

    def request(self, **changes):
        data = json.loads((FIXTURES / "request.json").read_text())
        data.update(changes)
        path = self.root / "request.json"
        path.write_text(json.dumps(data, indent=2) + "\n")
        return path

    def execute(self, request_path=None, prompt_path=None, fake=None):
        if request_path is None:
            request_path = FIXTURES / "request.json"
        if prompt_path is None:
            prompt_path = FIXTURES / "prompt.txt"
        if fake is None:
            fake = self.fake
        return self.bridge.run_job(
            str(request_path),
            str(prompt_path),
            str(self.out),
            str(self.state),
            invoke_claude=fake.claude,
            invoke_ollama=fake.ollama,
        )

    def test_argv_is_the_pro_oauth_list(self):
        self.assertEqual(self.bridge.claude_argv(), ARGV)
        self.assertEqual(self.bridge.WALL_TIMEOUT_S, 900)
        source = Path(os.environ["IX_BRIDGE_PY"]).read_text()
        self.assertNotIn("shell=True", source)
        self.assertNotIn("--bare", source)
        self.assertNotIn("max-turns", source)
        self.assertNotIn("dangerously-skip-permissions", source)

    def test_claude_bin_comes_from_the_environment(self):
        os.environ["IX_CLAUDE_BIN"] = "/opt/example/claude"
        self.assertEqual(self.bridge.claude_argv(), ["/opt/example/claude", *FLAGS])
        os.environ["IX_CLAUDE_BIN"] = ""
        self.assertEqual(self.bridge.claude_argv(), ARGV)
        source = Path(os.environ["IX_BRIDGE_PY"]).read_text()
        self.assertNotIn("/home/", source)
        self.assertNotIn("os.system", source)
        self.assertIn("start_new_session=True", source)
        self.assertIn("127.0.0.1:11434", source)

    def test_sample_ticket_is_review_needed_not_gated(self):
        outcome = self.execute()
        self.assertEqual(outcome["status"], "review-needed")
        self.assertNotEqual(outcome["status"], "gated")
        self.assertEqual(outcome["verdictSource"], "none")
        self.assertFalse(outcome["claimIsVerdict"])
        self.assertFalse(outcome["costIsBilling"])
        self.assertEqual(outcome["modelsCalled"], {"claude": True, "ollama": True})
        self.assertEqual(outcome["claude"]["argv"], ARGV)
        self.assertEqual(outcome["claude"]["inputTokens"], 3)
        self.assertEqual(outcome["claude"]["outputTokens"], 4)
        self.assertEqual(outcome["claude"]["costEstimateUsd"], 0.01)
        self.assertEqual(outcome["qwen"]["model"], "qwen2.5-coder:14b")
        self.assertEqual(outcome["qwen"]["url"], "http://127.0.0.1:11434/api/generate")
        self.assertEqual(outcome["requestSha256"], sha_bytes((FIXTURES / "request.json").read_bytes()))
        candidate = (self.out / "claude-output.txt").read_bytes()
        review = (self.out / "qwen-review.txt").read_bytes()
        self.assertEqual(candidate, b"print('candidate')\n")
        self.assertEqual(review, b"review only\n")
        self.assertEqual(outcome["claude"]["outputSha256"], sha_bytes(candidate))
        self.assertEqual(outcome["qwen"]["outputSha256"], sha_bytes(review))
        self.assertEqual(outcome["qwen"]["promptSha256"], sha_bytes(self.fake.ollama_calls[0].encode()))
        by_path = {item["path"]: item for item in outcome["files"]}
        self.assertEqual(by_path["claude-output.txt"]["bytes"], len(candidate))
        self.assertEqual(by_path["qwen-review.txt"]["bytes"], len(review))
        self.assertTrue(self.fake.ollama_calls[0].startswith("Review only. Do not claim tests passed. The candidate was not executed.\n---\n"))
        self.assertIn("print('candidate')", self.fake.ollama_calls[0])
        self.assertEqual(len(self.fake.claude_calls), 1)
        names = sorted(p.name for p in self.out.iterdir())
        self.assertEqual(names, ["bridge-result.json", "claude-output.txt", "qwen-review.txt"])
        marker = self.root / "pwned"
        self.assertFalse(marker.exists())

    def test_model_text_is_not_executed(self):
        def claude(_prompt):
            payload = "open('/tmp/ix-bridge-pwned','w').write('x')\n"
            return {"stdout": json.dumps({"result": payload, "usage": {"input_tokens": 1, "output_tokens": 1}}), "returncode": 0}

        def ollama(_prompt):
            return {"text": json.dumps({"response": "no\n"})}

        target = Path("/tmp/ix-bridge-pwned")
        if target.exists():
            target.unlink()
        outcome = self.bridge.run_job(
            str(FIXTURES / "request.json"),
            str(FIXTURES / "prompt.txt"),
            str(self.out),
            str(self.state),
            invoke_claude=claude,
            invoke_ollama=ollama,
        )
        self.assertEqual(outcome["status"], "review-needed")
        self.assertFalse(target.exists())
        self.assertIn(b"open(", (self.out / "claude-output.txt").read_bytes())

    def test_command_field_calls_nothing(self):
        raw = json.loads((FIXTURES / "request.json").read_text())
        raw["command"] = "rm -rf /"
        path = self.root / "request.json"
        path.write_text(json.dumps(raw) + "\n")
        outcome = self.execute(path)
        self.assertEqual(outcome["status"], "error")
        self.assertEqual(outcome["reasons"], ["unknown-field"])
        self.assertEqual(outcome["modelsCalled"], {"claude": False, "ollama": False})

    def test_duplicate_key_is_an_error(self):
        text = (FIXTURES / "request.json").read_text().rstrip()[:-1] + ',"jobId":"other"}\n'
        path = self.root / "request.json"
        path.write_text(text)
        outcome = self.execute(path)
        self.assertEqual(outcome["status"], "error")
        self.assertEqual(outcome["reasons"], ["invalid-json"])
        self.assertEqual(self.fake.claude_calls, [])

    def test_wrong_mode_risk_and_model_stop(self):
        for key, value, status, reason in (
            ("mode", "plan", "rejected", "bad-mode"),
            ("risk", "security", "error", "bad-risk"),
        ):
            with self.subTest(key=key):
                outcome = self.execute(self.request(**{key: value}))
                self.assertEqual(outcome["status"], status)
                self.assertEqual(outcome["reasons"], [reason])
                self.assertEqual(self.fake.claude_calls, [])
        raw = json.loads((FIXTURES / "request.json").read_text())
        raw["model"]["name"] = "other"
        path = self.root / "named.json"
        path.write_text(json.dumps(raw) + "\n")
        outcome = self.execute(path)
        self.assertEqual(outcome["reasons"], ["model-override"])
        raw["model"]["name"] = "qwen2.5-coder:14b"
        raw["model"]["options"]["url"] = "http://evil"
        path.write_text(json.dumps(raw) + "\n")
        outcome = self.execute(path)
        self.assertEqual(outcome["reasons"], ["model-override"])
        self.assertEqual(self.fake.claude_calls, [])

    def test_paths_and_prompt_hash(self):
        outcome = self.execute(self.request(allowedPaths=["packages/identity/src/key.ts"]))
        self.assertEqual(outcome["reasons"], ["forbidden-path"])
        outcome = self.execute(self.request(allowedPaths=["../etc/passwd"]))
        self.assertEqual(outcome["status"], "error")
        self.assertEqual(outcome["reasons"], ["bad-path"])
        moved = self.root / "prompt.txt"
        moved.write_text("different\n")
        outcome = self.execute(prompt_path=moved)
        self.assertEqual(outcome["reasons"], ["prompt-mismatch"])
        self.assertEqual(self.fake.claude_calls, [])

    def test_claude_failure_does_not_call_ollama_or_retry(self):
        def claude(_prompt):
            self.fake.claude_calls.append("x")
            return {"stdout": "{}", "returncode": 1}

        def ollama(_prompt):
            raise AssertionError("ollama")

        outcome = self.bridge.run_job(
            str(FIXTURES / "request.json"),
            str(FIXTURES / "prompt.txt"),
            str(self.out),
            str(self.state),
            invoke_claude=claude,
            invoke_ollama=ollama,
        )
        self.assertEqual(outcome["reasons"], ["claude-failed"])
        digest = sha_bytes((FIXTURES / "request.json").read_bytes())
        self.assertTrue((self.state / "partials" / digest).exists())
        again = self.bridge.run_job(
            str(FIXTURES / "request.json"),
            str(FIXTURES / "prompt.txt"),
            str(self.out),
            str(self.state),
            invoke_claude=claude,
            invoke_ollama=ollama,
        )
        self.assertEqual(again["reasons"], ["uncertain-no-replay"])
        self.assertEqual(len(self.fake.claude_calls), 1)

    def test_completed_record_is_returned_without_a_second_call(self):
        first = self.execute()
        self.assertEqual(first["status"], "review-needed")
        digest = first["requestSha256"]
        stored = (self.state / "completed" / f"{digest}.json").read_bytes()
        again = self.execute()
        self.assertEqual(again["status"], "recorded")
        self.assertEqual(again["verdictSource"], "ledger")
        self.assertEqual(again["storedStatus"], "review-needed")
        self.assertEqual(again["modelsCalled"], {"claude": False, "ollama": False})
        self.assertEqual((self.state / "completed" / f"{digest}.json").read_bytes(), stored)
        self.assertEqual(len(self.fake.claude_calls), 1)

    def test_lock_and_output_cap(self):
        (self.state / "gpu.lock").write_text("held\n")
        outcome = self.execute()
        self.assertEqual(outcome["reasons"], ["busy"])
        self.assertEqual(self.fake.claude_calls, [])
        (self.state / "gpu.lock").unlink()
        raw = json.loads((FIXTURES / "request.json").read_text())
        raw["outputLimits"]["maxBytes"] = 10
        path = self.root / "small.json"
        path.write_text(json.dumps(raw) + "\n")

        def claude(_prompt):
            self.fake.claude_calls.append("big")
            return {"stdout": json.dumps({"result": "x" * 11}), "returncode": 0}

        outcome = self.bridge.run_job(
            str(path),
            str(FIXTURES / "prompt.txt"),
            str(self.out),
            str(self.state),
            invoke_claude=claude,
            invoke_ollama=self.fake.ollama,
        )
        self.assertEqual(outcome["reasons"], ["over-limit"])
        self.assertEqual(self.fake.ollama_calls, [])

    def test_symlink_out_is_not_followed(self):
        link = self.root / "linked"
        link.symlink_to(self.out, target_is_directory=True)
        outcome = self.bridge.run_job(
            str(FIXTURES / "request.json"),
            str(FIXTURES / "prompt.txt"),
            str(link),
            str(self.state),
            invoke_claude=self.fake.claude,
            invoke_ollama=self.fake.ollama,
        )
        self.assertEqual(outcome["reasons"], ["symlink"])
        self.assertEqual(self.fake.claude_calls, [])


if __name__ == "__main__":
    unittest.main()
