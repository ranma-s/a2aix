import ast
import io
from pathlib import Path
import tokenize
import unittest

ROOT = Path(__file__).resolve().parents[2]
AUTOMATION = ROOT / "automation"
DUMMIES = ROOT / "fixtures" / "guardrails" / "python"


def comment_problems(source: str) -> list[str]:
    problems = []
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type != tokenize.COMMENT:
            continue
        if token.start == (1, 0) and token.string.startswith("#!"):
            continue
        problems.append("comment at line %d" % token.start[0])
    tree = ast.parse(source)
    for node in ast.walk(tree):
        kinds = (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)
        if isinstance(node, kinds) and ast.get_docstring(node, clean=False) is not None:
            problems.append("docstring in %s" % getattr(node, "name", "module"))
    return problems


class NoCommentsTests(unittest.TestCase):
    def test_automation_python_has_no_comments(self):
        files = sorted(AUTOMATION.rglob("*.py"))
        self.assertTrue(files)
        for path in files:
            with self.subTest(path=str(path.relative_to(ROOT))):
                self.assertEqual(comment_problems(path.read_text(encoding="utf-8")), [])

    def test_dummies_fail_and_shebang_passes(self):
        for name in ("code-comment.py", "docstring.py"):
            with self.subTest(name=name):
                self.assertNotEqual(comment_problems((DUMMIES / name).read_text(encoding="utf-8")), [])
        self.assertEqual(comment_problems((DUMMIES / "shebang-ok.py").read_text(encoding="utf-8")), [])


if __name__ == "__main__":
    unittest.main()
