#!/usr/bin/env python3
import argparse
import hashlib
import json
import math
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request

WALL_TIMEOUT_S = 900

CLAUDE_BIN_ENV = "IX_CLAUDE_BIN"
DEFAULT_CLAUDE_BIN = "claude"
OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
OLLAMA_MODEL = "qwen2.5-coder:14b"
OLLAMA_NUM_CTX = 8192
MAX_OUTPUT_BYTES = 200000
REVIEW_PREFIX = "Review only. Do not claim tests passed. The candidate was not executed.\n---\n"

ALLOWED_KEYS = frozenset({
    "allowedPaths", "jobId", "mode", "model", "outputLimits",
    "promptSha256", "risk", "sourceSha", "domain",
})
REQUIRED_KEYS = ALLOWED_KEYS - {"domain"}
OVERRIDE_OPTIONS = frozenset({"url", "model", "host", "command", "endpoint"})
FORBIDDEN_PATHS = (
    "packages/identity",
    "packages/approval-app",
    "packages/a2a-ext-approval",
    "packages/a2a-ext-mandate",
    "packages/jcs",
    "packages/log",
    "packages/protocol-core/src/hash.ts",
    "packages/protocol-core/src/hash-error.ts",
    "AGENTS.md",
    "decisions.tsv",
    "scripts/ix-job.mjs",
    "scripts/ix-job.test.mjs",
    ".github",
)

OUT_FILES = ("claude-output.txt", "qwen-review.txt", "bridge-result.json")


class _Reject(Exception):
    def __init__(self, status, reason):
        super().__init__(reason)
        self.status = status
        self.reason = reason


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def claude_bin() -> str:
    value = os.environ.get(CLAUDE_BIN_ENV, "")
    return value if value else DEFAULT_CLAUDE_BIN


def claude_argv() -> list[str]:
    return [
        claude_bin(),
        "-p",
        "--output-format", "json",
        "--tools", "",
        "--safe-mode",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--permission-prompts", "none",
    ]


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _no_models() -> dict:
    return {"claude": False, "ollama": False}


def _is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_number(value) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    return isinstance(value, float) and math.isfinite(value)


def _result(status, reason, request_sha=None, called=None) -> dict:
    result = {
        "status": status,
        "reasons": [reason],
        "verdictSource": "none",
        "claimIsVerdict": False,
        "modelsCalled": dict(called) if called else _no_models(),
    }
    if request_sha:
        result["requestSha256"] = request_sha
    return result


def _read_nofollow(path: str) -> bytes:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as f:
        return f.read()


def _write_nofollow(path: str, data: bytes, exclusive: bool = False) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW
    flags |= os.O_EXCL if exclusive else os.O_TRUNC
    fd = os.open(path, flags, 0o644)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())


def _loads_strict(data: bytes):
    def pairs_hook(pairs):
        obj = {}
        for key, value in pairs:
            if key in obj:
                raise ValueError("duplicate key: %r" % key)
            obj[key] = value
        return obj

    def reject_constant(name):
        raise ValueError("non-finite constant: %s" % name)

    return json.loads(data.decode("utf-8"), object_pairs_hook=pairs_hook,
                      parse_constant=reject_constant)


def _check_paths(paths) -> None:
    if not isinstance(paths, list) or not paths:
        raise _Reject("error", "bad-path")
    for path in paths:
        if not isinstance(path, str) or not path:
            raise _Reject("error", "bad-path")
        if path.startswith("/") or "\\" in path or ":" in path or "\x00" in path:
            raise _Reject("error", "bad-path")
        if any(seg in ("", ".", "..") for seg in path.split("/")):
            raise _Reject("error", "bad-path")
    for path in paths:
        for forbidden in FORBIDDEN_PATHS:
            if (path == forbidden or path.startswith(forbidden + "/")
                    or forbidden.startswith(path + "/")):
                raise _Reject("rejected", "forbidden-path")


def _validate_request(req) -> None:
    if not isinstance(req, dict):
        raise _Reject("error", "invalid-json")
    for key in req:
        if key not in ALLOWED_KEYS:
            raise _Reject("error", "unknown-field")
    for key in REQUIRED_KEYS:
        if key not in req:
            raise _Reject("error", "missing-field")

    if req["mode"] != "testgen":
        raise _Reject("rejected", "bad-mode")
    if req["risk"] != "non-security":
        raise _Reject("error", "bad-risk")

    model = req["model"]
    if not isinstance(model, dict):
        raise _Reject("error", "invalid-field")
    if model.get("name") != OLLAMA_MODEL:
        raise _Reject("rejected", "model-override")
    for key in model:
        if key != "name" and str(key).lower() in OVERRIDE_OPTIONS:
            raise _Reject("rejected", "model-override")
    options = model.get("options", {})
    if not isinstance(options, dict):
        raise _Reject("error", "invalid-field")
    for key in options:
        if str(key).lower() in OVERRIDE_OPTIONS:
            raise _Reject("rejected", "model-override")

    for key in ("jobId", "sourceSha", "promptSha256"):
        if not isinstance(req[key], str) or not req[key]:
            raise _Reject("error", "invalid-field")

    limits = req["outputLimits"]
    if not isinstance(limits, dict):
        raise _Reject("error", "invalid-field")
    max_bytes = limits.get("maxBytes")
    if not _is_int(max_bytes) or max_bytes <= 0:
        raise _Reject("error", "invalid-field")

    if "domain" in req and not isinstance(req["domain"], dict):
        raise _Reject("error", "invalid-field")

    _check_paths(req["allowedPaths"])


def _ensure_dir(path: str) -> None:
    if os.path.islink(path):
        raise _Reject("rejected", "symlink")
    os.makedirs(path, exist_ok=True)


def _fresh_scratch(state_dir: str) -> str:
    scratch = os.path.join(state_dir, "scratch")
    if os.path.islink(scratch):
        raise _Reject("rejected", "symlink")
    if os.path.isdir(scratch):
        shutil.rmtree(scratch)
    elif os.path.lexists(scratch):
        os.unlink(scratch)
    os.mkdir(scratch, 0o700)
    return scratch


def _default_claude(prompt_text: str, cwd: str, timeout: float) -> dict:
    proc = subprocess.Popen(
        claude_argv(),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=cwd,
        shell=False,
        start_new_session=True,
    )
    try:
        stdout, _ = proc.communicate(prompt_text.encode("utf-8"), timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.communicate()
        raise
    return {"stdout": stdout.decode("utf-8"), "returncode": proc.returncode}


def _default_ollama(prompt_text: str, timeout: float) -> dict:
    body = json.dumps({
        "model": OLLAMA_MODEL,
        "prompt": prompt_text,
        "stream": False,
        "options": {"num_ctx": OLLAMA_NUM_CTX},
    }).encode("utf-8")
    request = urllib.request.Request(
        OLLAMA_URL, data=body, method="POST",
        headers={"Content-Type": "application/json"},
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())
    with opener.open(request, timeout=timeout) as response:
        return {"text": response.read().decode("utf-8")}


def _is_timeout(exc: BaseException) -> bool:
    if isinstance(exc, (subprocess.TimeoutExpired, TimeoutError)):
        return True
    return isinstance(getattr(exc, "reason", None), TimeoutError)


def _run_locked(req, request_sha, prompt_text, limit, out_dir, state_dir,
                invoke_claude, invoke_ollama, deadline, called) -> dict:
    partials_dir = os.path.join(state_dir, "partials")
    completed_dir = os.path.join(state_dir, "completed")
    partial_path = os.path.join(partials_dir, request_sha)
    completed_path = os.path.join(completed_dir, request_sha + ".json")

    if os.path.lexists(completed_path):
        if os.path.islink(completed_path):
            return _result("rejected", "symlink", request_sha)
        try:
            stored = json.loads(_read_nofollow(completed_path).decode("utf-8"))
        except (OSError, ValueError):
            return _result("error", "ledger-corrupt", request_sha)
        if not isinstance(stored, dict):
            return _result("error", "ledger-corrupt", request_sha)
        return {
            "status": "recorded",
            "reasons": [],
            "verdictSource": "ledger",
            "requestSha256": request_sha,
            "storedStatus": stored.get("status"),
            "claimIsVerdict": False,
            "modelsCalled": _no_models(),
        }
    if os.path.lexists(partial_path):
        return _result("rejected", "uncertain-no-replay", request_sha)

    if invoke_claude is None:
        scratch = _fresh_scratch(state_dir)

        def invoke_claude(text):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("wall clock exhausted")
            return _default_claude(text, scratch, remaining)

    if invoke_ollama is None:
        def invoke_ollama(text):
            return _default_ollama(text, deadline - time.monotonic())

    partial = {
        "requestSha256": request_sha,
        "jobId": req["jobId"],
        "sourceSha": req["sourceSha"],
        "startedAt": time.time(),
    }
    _write_nofollow(partial_path, (json.dumps(partial) + "\n").encode("utf-8"), exclusive=True)

    if deadline - time.monotonic() <= 0:
        return _result("rejected", "timeout", request_sha, called)
    called["claude"] = True
    try:
        claude_raw = invoke_claude(prompt_text)
    except Exception as exc:
        reason = "timeout" if _is_timeout(exc) else "claude-failed"
        return _result("rejected", reason, request_sha, called)

    if not isinstance(claude_raw, dict):
        return _result("rejected", "claude-failed", request_sha, called)
    returncode = claude_raw.get("returncode")
    stdout = claude_raw.get("stdout")
    if isinstance(stdout, bytes):
        try:
            stdout = stdout.decode("utf-8")
        except UnicodeDecodeError:
            stdout = None
    try:
        claude_obj = json.loads(stdout) if isinstance(stdout, str) else None
    except ValueError:
        claude_obj = None
    if (returncode != 0 or not _is_int(returncode) or not isinstance(claude_obj, dict)
            or not isinstance(claude_obj.get("result"), str)):
        return _result("rejected", "claude-failed", request_sha, called)
    try:
        candidate_bytes = claude_obj["result"].encode("utf-8")
    except UnicodeEncodeError:
        return _result("rejected", "claude-failed", request_sha, called)
    if len(candidate_bytes) > limit:
        return _result("rejected", "over-limit", request_sha, called)

    claude_info = {
        "argv": claude_argv(),
        "promptSha256": req["promptSha256"],
        "outputSha256": _sha256(candidate_bytes),
        "returncode": returncode,
    }
    usage = claude_obj.get("usage")
    if isinstance(usage, dict):
        if _is_int(usage.get("input_tokens")):
            claude_info["inputTokens"] = usage["input_tokens"]
        if _is_int(usage.get("output_tokens")):
            claude_info["outputTokens"] = usage["output_tokens"]
    if _is_number(claude_obj.get("total_cost_usd")):
        claude_info["costEstimateUsd"] = claude_obj["total_cost_usd"]

    review_prompt = REVIEW_PREFIX + claude_obj["result"]
    review_prompt_bytes = review_prompt.encode("utf-8")
    if deadline - time.monotonic() <= 0:
        return _result("rejected", "timeout", request_sha, called)
    called["ollama"] = True
    try:
        ollama_raw = invoke_ollama(review_prompt)
    except Exception as exc:
        reason = "timeout" if _is_timeout(exc) else "ollama-failed"
        return _result("rejected", reason, request_sha, called)

    text = ollama_raw.get("text") if isinstance(ollama_raw, dict) else None
    if isinstance(text, bytes):
        try:
            text = text.decode("utf-8")
        except UnicodeDecodeError:
            text = None
    try:
        ollama_obj = json.loads(text) if isinstance(text, str) else None
    except ValueError:
        ollama_obj = None
    if not isinstance(ollama_obj, dict) or not isinstance(ollama_obj.get("response"), str):
        return _result("rejected", "ollama-failed", request_sha, called)
    try:
        review_bytes = ollama_obj["response"].encode("utf-8")
    except UnicodeEncodeError:
        return _result("rejected", "ollama-failed", request_sha, called)
    if len(review_bytes) > limit:
        return _result("rejected", "over-limit", request_sha, called)

    qwen_info = {
        "model": OLLAMA_MODEL,
        "url": OLLAMA_URL,
        "promptSha256": _sha256(review_prompt_bytes),
        "outputSha256": _sha256(review_bytes),
    }
    if _is_int(ollama_obj.get("prompt_eval_count")):
        qwen_info["promptEvalCount"] = ollama_obj["prompt_eval_count"]
    if _is_int(ollama_obj.get("eval_count")):
        qwen_info["evalCount"] = ollama_obj["eval_count"]

    result = {
        "status": "review-needed",
        "reasons": [],
        "requestSha256": request_sha,
        "sourceSha": req["sourceSha"],
        "jobId": req["jobId"],
        "verdictSource": "none",
        "claimIsVerdict": False,
        "costIsBilling": False,
        "modelsCalled": dict(called),
        "claude": claude_info,
        "qwen": qwen_info,
        "files": [
            {"path": "claude-output.txt", "sha256": claude_info["outputSha256"],
             "bytes": len(candidate_bytes)},
            {"path": "qwen-review.txt", "sha256": qwen_info["outputSha256"],
             "bytes": len(review_bytes)},
        ],
    }
    result_bytes = (json.dumps(result, indent=2) + "\n").encode("utf-8")

    _ensure_dir(out_dir)
    for name in OUT_FILES:
        if os.path.islink(os.path.join(out_dir, name)):
            return _result("rejected", "symlink", request_sha, called)
    _write_nofollow(os.path.join(out_dir, "claude-output.txt"), candidate_bytes)
    _write_nofollow(os.path.join(out_dir, "qwen-review.txt"), review_bytes)
    _write_nofollow(os.path.join(out_dir, "bridge-result.json"), result_bytes)

    _write_nofollow(completed_path, result_bytes, exclusive=True)
    os.unlink(partial_path)
    return result


def run_job(request_path: str, prompt_path: str, out_dir: str, state_dir: str,
            invoke_claude=None, invoke_ollama=None) -> dict:
    deadline = time.monotonic() + WALL_TIMEOUT_S

    for path in (request_path, prompt_path, out_dir, state_dir):
        if os.path.islink(path):
            return _result("rejected", "symlink")

    try:
        request_bytes = _read_nofollow(request_path)
    except OSError:
        return _result("error", "unreadable-request")
    request_sha = _sha256(request_bytes)

    try:
        req = _loads_strict(request_bytes)
    except (ValueError, UnicodeDecodeError):
        return _result("error", "invalid-json", request_sha)
    try:
        _validate_request(req)
    except _Reject as r:
        return _result(r.status, r.reason, request_sha)

    try:
        prompt_bytes = _read_nofollow(prompt_path)
    except OSError:
        return _result("error", "unreadable-prompt", request_sha)
    if _sha256(prompt_bytes) != req["promptSha256"]:
        return _result("rejected", "prompt-mismatch", request_sha)
    try:
        prompt_text = prompt_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return _result("error", "invalid-prompt", request_sha)

    limit = min(MAX_OUTPUT_BYTES, req["outputLimits"]["maxBytes"])

    try:
        _ensure_dir(state_dir)
        _ensure_dir(os.path.join(state_dir, "partials"))
        _ensure_dir(os.path.join(state_dir, "completed"))
    except _Reject as r:
        return _result(r.status, r.reason, request_sha)
    except OSError:
        return _result("error", "state-unwritable", request_sha)

    lock_path = os.path.join(state_dir, "gpu.lock")
    try:
        fd = os.open(lock_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        return {
            "status": "rejected",
            "reasons": ["busy"],
            "verdictSource": "lock",
            "modelsCalled": _no_models(),
        }
    except OSError:
        return _result("error", "state-unwritable", request_sha)

    called = _no_models()
    try:
        with os.fdopen(fd, "w") as f:
            f.write("%d\n" % os.getpid())
        return _run_locked(req, request_sha, prompt_text, limit, out_dir, state_dir,
                           invoke_claude, invoke_ollama, deadline, called)
    except _Reject as r:
        return _result(r.status, r.reason, request_sha, called)
    except Exception:
        return _result("error", "internal", request_sha, called)
    finally:
        try:
            os.unlink(lock_path)
        except FileNotFoundError:
            pass


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--request", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--state", required=True)
    args = parser.parse_args(argv)

    result = run_job(args.request, args.prompt, args.out, args.state)
    sys.stdout.write(json.dumps(result) + "\n")
    status = result.get("status")
    if status in ("review-needed", "recorded"):
        return 0
    if status == "rejected":
        return 2
    return 1


if __name__ == "__main__":
    sys.exit(main())
