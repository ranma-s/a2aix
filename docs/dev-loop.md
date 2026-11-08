# 開発の一周

1件ずつ、ファイルの作業票で渡す。このリポジトリはサーバもキューも置かない。`node scripts/ix-job.mjs` は Node.js 22 の標準ライブラリだけで動く。票の中の文字列は、コマンドとしても、入口としても、実行しない。

終了コード `0` のうち、試験の合格を意味するのは `gate` が `status` を `gated` にしたときだけである。`verdictSource` がその根拠で、モデルの自己申告ではない。`check-result` の終了 `0` は、形が読めたという意味である。

## 役

| 誰 | 何をする | 何をしない |
| --- | --- | --- |
| Grok | 作業票を書く。最後に差分と証跡を見る | その票の実装を同じ仕事で終わらせない。マージしない |
| Claude Code | 許可したパスを書く。実際の問題があるときだけ、直し方を決める | 試験の前に直さない |
| 手元の 14B と決定的な試験 | 候補を見て、試験する | 直し方の前にファイルを変えない。自分の文章を合格にしない |
| 手元の 14B の修正 | Claude の直し方に書いたファイルだけを直し、もう一度試験する | 直し方が無いのに変えない。モデルの文章をホストのコマンドにしない |
| `ix-job.mjs` | 票、結果、実行証跡の結び付きを検査する | プロセスを起動しない |
| 人 | 明示して頼まれてからマージを決める。署名、鍵、正規化、承認、段階4を見る | 自動マージしない |

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

## Claude Code と手元の Qwen

Claude Code CLI が入っていて、サインイン済みの機械で動かす。CLI は 2.1.311 以上で、`claude auth status` が終了 0 になること。資格情報のコピーも、API 課金の設定もこのリポジトリには置かない。

`automation/bridge/ix_bridge.py` は、人が起動したときだけ、Claude CLI を次の引数で一度呼ぶ。CLI の場所は環境変数 `IX_CLAUDE_BIN` で指定する。空か未設定なら `claude` を PATH から探す。引数は場所によらず同じである。`--bare`、`--max-turns`、`--dangerously-skip-permissions` は使わない。ツールは空、`--safe-mode`、`--strict-mcp-config`、`--no-session-persistence`、`--permission-prompts none` である。標準エラーは保存しない。続けて `http://127.0.0.1:11434/api/generate` の `qwen2.5-coder:14b` にレビュー文を送る。票が URL やモデル名を差し替えることはできない。モデルの文章はファイルにするだけで、実行しない。

橋の約束は次のとおりである。

- 文章を保存するだけで、候補を実行せず、コンテナを起動せず、試験に合格したとは言わない。
- 禁止パスは、そのパス自身、その下のパス、それを含む親のパスのどれも拒否する。
- Ollama への POST はプロキシを使わず、リダイレクトにも従わない。手元の URL だけに送る。
- Claude を呼ぶ前に途中記録（partial）を書く。そのあとで失敗すると途中記録が残り、同じ票は二度と流さない（`uncertain-no-replay`）。
- `costEstimateUsd` は CLI が報告した見積もりで、請求額ではない。

成功時の `status` は `review-needed` である。これは `gated` ではない。`bridge-result.json` を `scripts/ix-job.mjs check-result` に渡すと、形が違うので終了 1 の `error` になる。試験を実行した証跡は、別の Podman の手順が作る。この橋はそれを作らない。

最初の手順は次の二つだけである。デーモンにはしない。

```bash
python3 -m unittest discover -s automation/bridge -p 'test_*.py'
python3 automation/bridge/ix_bridge.py \
  --request automation/bridge/canary/request.json \
  --prompt automation/bridge/canary/prompt.txt \
  --out automation/bridge/canary/out \
  --state automation/bridge/canary/state
```

一つ目は偽の Claude と、この機械の中だけの HTTP で、課金しない。二つ目は Claude を 1 回と、手元の 14B を 1 回使う。

`automation/bridge/canary/` の票は見本である。そこに書いた `sourceSha` は、書いた時点の main で、今の main ではない。手で別の SHA に直しても、次のマージでまた古くなる。最初に二つ目を動かす直前に、人か Grok が今の `main` に対して新しい canary の票を書き、`git rev-parse origin/main` と票の `sourceSha` が同じであることを人が見て、`node scripts/ix-job.mjs check-request` が終了 0 になることを確かめる。違っていれば、その票は古い。二つ目は、この変更を書いたときには動かしていない。

`risk` が `non-security` であることは、安全の証明ではない。署名、鍵、正規化、承認のパスは、その語があっても拒否する。ロックファイルが残ったときは、橋のプロセスがいないことを確認してから人が消す。

マージは人が行う。CI は `pnpm job:check` と `pnpm bridge:check` を、読み取り専用のまま足している。

## 決まった順

人が決めた順は、Grok が票を書き、Claude Code が作り、手元の 14B と決定的な試験が確かめ、実際の問題があるときだけ Claude Code が直し方を決め、手元の 14B がその範囲を直して再試験し、Grok が差分と証跡を見て、人にマージしてよいかを聞く。自動マージはしない。問題が無いときは、直しも追加のモデル呼び出しもしない。

今の `ix_bridge.py` は、その最初の受け渡しだけである。Claude の文章を受け、Qwen には固定の短い前置きとその文章だけを渡す。その Qwen の出力は助言であり、合格でも不合格でもない。直しが要るときは、Grok が別の小さな票を切る。その票が許すファイルだけを、試験の証跡のあとで直す。票も試験も、直し方の前には変えない。この順を自動で進める仕組みは、まだこのリポジトリには無い。

署名、鍵、正規化、承認、段階4は、`non-security` の票では直さない。人のセキュリティレビューが要る。モデルの提案は、それだけではホストで実行しない。
