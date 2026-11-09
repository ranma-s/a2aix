import ast
import io
from pathlib import Path
import re
import tokenize
import unittest

ROOT = Path(__file__).resolve().parents[2]
AUTOMATION = ROOT / "automation"
DUMMIES = ROOT / "fixtures" / "guardrails" / "python"
SHEBANG = re.compile(r"^#!/\S+( \S+)?$")
FAILING = (
    "code-comment.py",
    "docstring.py",
    "bare-string-statement.py",
    "class-attribute-docstring.py",
    "string-in-block.py",
    "prose-shebang.py",
)


def comment_problems(source: str) -> list[str]:
    problems = []
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type != tokenize.COMMENT:
            continue
        if token.start == (1, 0) and SHEBANG.match(token.string):
            continue
        problems.append("comment at line %d" % token.start[0])
    for node in ast.walk(ast.parse(source)):
        if (isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant)
                and isinstance(node.value.value, str)):
            problems.append("string statement at line %d" % node.lineno)
    return problems


class NoCommentsTests(unittest.TestCase):
    def test_automation_python_has_no_comments(self):
        files = sorted(AUTOMATION.rglob("*.py"))
        self.assertTrue(files)
        for path in files:
            with self.subTest(path=str(path.relative_to(ROOT))):
                self.assertEqual(comment_problems(path.read_text(encoding="utf-8")), [])

    def test_dummies_fail_and_shebang_passes(self):
        for name in FAILING:
            with self.subTest(name=name):
                self.assertNotEqual(comment_problems((DUMMIES / name).read_text(encoding="utf-8")), [])
        self.assertEqual(comment_problems((DUMMIES / "shebang-ok.py").read_text(encoding="utf-8")), [])


if __name__ == "__main__":
    unittest.main()
