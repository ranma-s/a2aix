# 開発の一周

1件ずつ、ファイルの作業票で渡す。このリポジトリはサーバもキューも置かない。`node scripts/ix-job.mjs` は Node.js 22 の標準ライブラリだけで動く。票の中の文字列は、コマンドとしても、入口としても、実行しない。

終了コード `0` のうち、試験の合格を意味するのは `gate` が `status` を `gated` にしたときだけである。`verdictSource` がその根拠で、モデルの自己申告ではない。`check-result` の終了 `0` は、形が読めたという意味である。

## 役

| 誰 | 何をする | 何をしない |
| --- | --- | --- |
| Grok | 作業票を書く | その票の実装を同じ仕事で終わらせない |
| Claude Code | 許可したパスのパッチを書く | 未試験のまま無人で回さない |
| Qwen 14B | テスト案かログの分類を、ファイルで返す | コマンドを実行しない |
| `ix-job.mjs` | 票、結果、実行証跡の結び付きを検査する | プロセスを起動しない |
| 別の読み手 | `sourceSha` が一致するときだけ、難しい変更を読む | 古い SHA のレビューを流用しない |
| 人 | マージする。署名、鍵、正規化、承認、段階4を見る | 自動マージしない |

ローカルの GPU は、最初は人がその回の開始を承認する。無人の完成形ではない。1件の上限は 15 分、やり直し 2 回、GPU は 1 つ、文脈は 8192 である。この検査は時計を止めない。止めるのは操作する人である。

## 票

`automation/fixtures/request.json` が見本である。`sourceSha` は `bd3dbe4eff2cfa0e34989b718fe6c7eadb4eb77e`。`risk` は `non-security` と書く。その語は、安全であることの証明ではない。`packages/identity`、承認、委任、`packages/jcs`、`packages/log`、ハッシュ実装、`.github/`、この検査自身は、その語があっても拒否する。

`testgen` には、正しい入力の SHA-256、合格対照の SHA-256、拒否の理由、分類名が要る。見本の入力は文書の値（`manifestSha256` と `files`）で、path は `notes:draft.pdf` である。合格対照は同じ欄で、path だけ `readme.md` である。拒否の理由は `a file needs a lowercase SHA-256, a byte size, and a media type` である。分類は `document-path` である。検査はこの形を特別扱いしない。ハッシュが票と一致するかを見る。

`prompt.txt` のバイト列が `promptSha256` と一致しなければならない。指示は票とこのファイルだけを使い、PR のコメントは指示にしない。

## 結果

`result.json` は、モデルの自己申告 (`modelClaim`) と、実行した側の記録 (`execution`) を分ける。`execution.runner` は `repo-test` か、計画のときだけ `none` である。票が runner のコマンドを指定することはできない。

`execution.exitCode` が 0 でないとき、モデルが pass と言っても `rejected` である。理由は `execution-failed` で、IX の欠陥を見つけたという意味にはしない。形が壊れているときは終了 1 の `error` で、検出したバグではない。

合格対照が true でないとき、拒否が何件あっても `negative-without-positive-control` で拒否する。理由の文が票と違うときは `reason-mismatch` である。

`execution.files` のパスは、許可したパスそのもので、証跡ディレクトリの通常ファイルとバイトが一致しなければならない。絶対パス、`..`、シンボリックリンク、許可外、余分なファイルは拒否する。これはマルウェア解析でも、強い隔離の証明でもない。指したディレクトリの通常ファイルを、リンクを辿らずに読むだけである。

## コマンド

```bash
node scripts/ix-job.mjs check-request automation/fixtures/request.json
node scripts/ix-job.mjs check-result automation/fixtures/request.json automation/fixtures/result.json
node scripts/ix-job.mjs gate \
  automation/fixtures/request.json automation/fixtures/result.json \
  --prompt automation/fixtures/prompt.txt \
  --valid-input automation/fixtures/valid-input.json \
  --positive-control automation/fixtures/positive-control.json \
  --evidence automation/fixtures/evidence \
  --head bd3dbe4eff2cfa0e34989b718fe6c7eadb4eb77e
```

`--head` を付けるなら、票の `sourceSha` と同じである必要がある。main が進んだあとに同じ票を通すと `review-invalid`（終了 4）になる。新しい作業は新しい票である。`--head` を付けない終了 0 は、票の中の SHA が互いに一致したことまでで、今の main と照合したことにはしない。

同じ票の再実行は、票ファイル全体（プロンプトのハッシュ、model、options を含む）の SHA-256 で区別する。`--ledger ledger.json --record` は、`gated` または `bound` のときだけ記録する。同じバイト列の結果が既にあれば `recorded` を返し、証跡は読み直さない。同じ票で結果のバイト列が違えば `duplicate-conflict` である。同じ `jobId` で票の中身が違えば `job-id-conflict` である。`jobId` と `sourceSha` が同じでも、モデルの出力が同じとは扱わない。

終了 1 は `error`、終了 2 は `rejected`、終了 4 は `review-invalid` である。

## Claude Code

IX-Ubuntu には `/home/ix-local/.local/bin/claude` 版 2.1.311 があり、`claude auth status` は終了 0、`loggedIn=true`、`authMethod=claude.ai`、Pro である。資格情報のコピーも、API 課金の設定もしていない。

このリポジトリは `claude` を起動しない。作業票を Claude に渡してパッチを受け取る経路は、まだ試験していない。使うのは Pro の OAuth で動く通常の headless である。`--bare` にも、API キー方式にも切り替えない。サブスクリプションの上限を超える自動続行も、API への切り替えもしない。権限の確認、hooks、MCP の確認は外さない。PR のコメントや、票に無いファイルを、実行してよいものとは扱わない。`--dangerously-skip-permissions` は使わない。引数の固定は、ローカルで 1 回試験して記録するまで、この文書には書かない。

マージは人が行う。push は、既にある GitHub の認証で行う。CI はこの検査を、読み取り専用のまま `pnpm job:check` で足している。秘密も、`pull_request_target` も、権限の拡大も足していない。
