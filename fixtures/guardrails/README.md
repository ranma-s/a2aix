# Guardrail fixtures

These files are supposed to be wrong. `pnpm guardrails` runs the real lint and dependency checks against them and requires the violating ones to fail. Normal typecheck, lint, unit tests, and the workspace package set skip this directory.

Do not edit a dummy so the self-test stays green. A violation that starts passing means the guard stopped biting.

`python/` holds Python dummies for the no-comments check in `automation/bridge/test_no_comments.py`, which `pnpm bridge:check` runs.

Allowed samples (`license-header-ok.ts`, `const-assertion-ok.ts`, `clean.ts`, `shebang-and-header.mjs`, `python/shebang-ok.py`, and `boundaries/legal-core-imports-core/`) must keep passing.

# 検査の見本

ここのファイルは、壊れているのが正しいです。`pnpm guardrails` が本物の lint と依存検査をかけ、違反は失敗しなければならない、と確かめます。通常の型検査、lint、ユニットテスト、ワークスペースのパッケージ一覧は、このディレクトリを見ません。

自己テストを通すために見本を直さないでください。違反が成功するようになったら、検査が効いていません。

`python/` は、`pnpm bridge:check` が実行する `automation/bridge/test_no_comments.py` のための Python の見本です。

許される見本（`license-header-ok.ts`、`const-assertion-ok.ts`、`clean.ts`、`shebang-and-header.mjs`、`python/shebang-ok.py`、`boundaries/legal-core-imports-core/`）は、成功したままにします。
