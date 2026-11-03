# 項目ごとに決める交渉と、合意の形式（案）

状態: 案。ディレクターの方針（2026-11-03）を仕様の形にしたもの。まだ実装しない。`ix-spec-v0.3.md` の「メッセージの型」と「流れとTaskの状態」を置き換える候補。

## 1. 方針

- 機械は、型の決まった **項目（term）** の値だけで判断する。自由文は人が読むためのもので、機械は判断に使わない。TCP/IP のヘッダーと中身の関係と同じ。
- 決めるべき項目は、仕事の種類で変わる。項目の組を **項目表（term sheet）** として宣言する。
- 互いのエージェントが、項目を **1つずつ** 確定（fix）させていく。全部の必須項目が確定したら、確定した値の一覧が **合意** になる。
- 合意は契約書ではない。「この値の組に、双方のエージェントと人間が同意した」という証拠である（`ix-spec-v0.3.md`「IX が裏付けること、裏付けないこと」と同じ立場）。
- 言葉の表現は標準化しない。標準化するのは項目の **識別子と値の型** だけ。どの項目が使われ、定着したかが、そのまま標準化の過程になる（7章）。

## 2. 項目（term）

項目は、次の定義を持つ。

| 欄 | 意味 | 例 |
| --- | --- | --- |
| `termId` | 項目の名前。URI か `名前空間:名前` | `ix:price` |
| `version` | 定義の版。公開した定義は変えない。変えるときは版を上げる | `1` |
| `valueType` | 値の型（下の表） | `money` |
| `unit` | 単位があるとき | `day` |
| `codeList` | 選択肢の一覧（`code` 型のとき）。一覧も URI とハッシュで指す | `ix:file-format/1` |
| `label` | 人に見せる名前。言語ごとに複数持てる。機械は使わない | `{"ja":"金額","en":"Price"}` |

値の型は、機械が比べられるものだけにする。

| `valueType` | 値 | 例 |
| --- | --- | --- |
| `money` | `{"amount": 整数, "currency": ISO 4217, "taxIncluded": 真偽}` | `{"amount":180000,"currency":"JPY","taxIncluded":true}` |
| `date` | ISO 8601 の日付 | `"2026-12-10"` |
| `datetime` | RFC 3339 の時刻 | `"2026-12-10T18:00:00+09:00"` |
| `integer` | 整数（`unit` 付き可） | `2` |
| `duration` | 整数と単位（`day` `hour`） | `{"value":7,"unit":"day"}` |
| `boolean` | 真偽 | `true` |
| `code` | `codeList` の中の1つ | `"application/pdf"` |
| `codes` | `codeList` の中の複数 | `["application/pdf","text/html"]` |
| `count` | 種類コードと数の組の一覧 | `[{"code":"web-page","n":5}]` |
| `textRef` | 人が読む文書の SHA-256 と置き場所。機械は中身を読まない | `{"sha256":"…","mediaType":"text/markdown"}` |

「未定」「要相談」は、どの型でも書けない。値がなければ、その項目はまだ確定していないだけである。

`textRef` は、機械で比べられない取り決め（デザインの方向性など）を、文書の指紋として固定するための逃げ道。文書の中身は合意しても、機械はその良し悪しを判定しない。

## 3. 項目表（term sheet）

仕事の種類ごとに、使う項目の組を項目表として公開する。項目表も、公開したら変えない。

| 欄 | 意味 |
| --- | --- |
| `sheetId` と `version` | 項目表の名前と版 |
| `extends` | 元にした項目表（任意） |
| `required` | 確定しないと合意できない項目 |
| `optional` | 決めてもよい項目 |
| `sha256` | 項目表の JCS の SHA-256。依頼票はこの値で項目表を指す |

すべての項目表は、共通の核 `ix:core/1` を元にする。

| 共通の核の項目 | 型 |
| --- | --- |
| `ix:price` | `money` |
| `ix:deadline` | `date` |
| `ix:revision-limit` | `integer` |
| `ix:acceptance-window` | `duration`（納品から検収の返事までの期間） |
| `ix:deliverables` | `count`（納品物の種類と数） |
| `ix:deliverable-format` | `codes`（ファイルの形式） |

例: Web サイト制作 `ix:sheet/web-site/1`（`extends: ix:core/1`）

| 項目 | 必須 | 型 |
| --- | --- | --- |
| `web:page-count` | 必須 | `integer` |
| `web:responsive` | 必須 | `boolean` |
| `web:browsers` | 任意 | `codes` |
| `web:cms` | 任意 | `code` |
| `web:hosting-included` | 任意 | `boolean` |
| `web:design-brief` | 任意 | `textRef` |

依頼票（`JobPosting`）は、使う項目表の `sheetId` と `sha256` を書く。発注側がすでに決めている項目は、その値を書いておける（12章の例）。

## 4. 1項目ずつ確定させるやり取り

交渉のメッセージは、どれも1つの項目について1つの動作をする。複数の項目を1通にまとめてもよいが、項目ごとの動作として数える。

| `type` | 意味 | 主な欄 |
| --- | --- | --- |
| `TermPropose` | この項目をこの値にしたい | `termId` `value` `note`（任意） |
| `TermAccept` | 相手が出した値に同意する | `termId` `valueHash` |
| `TermCounter` | 別の値を出す | `termId` `value` `note`（任意） |
| `TermAdd` | 項目表にない項目を、この交渉に足したい | `definition`（2章の定義） |
| `TermDrop` | 任意の項目を、この交渉では決めない | `termId` |
| `TermReopen` | 確定した項目を、もう一度開く | `termId` |
| `DealDecline` | 交渉をやめる | `reason` |

どのメッセージにも `prevHash`（1つ前のメッセージの指紋）、`sentAt`、`expiresAt`、`signature` を付ける。`valueHash` は、値の JCS の SHA-256 である。`note` は人が読む自由文で、機械は判断に使わない。

項目ごとの状態は次のとおり。

| 状態 | 意味 | 次の状態 |
| --- | --- | --- |
| `open` | まだ誰も値を出していない | `proposed`、`dropped` |
| `proposed` | 片方が値を出した | `fixed`（相手が `TermAccept`）、`proposed`（相手が `TermCounter`。出した側が入れ替わる） |
| `fixed` | 双方が同じ値に同意した | `proposed`（`TermReopen` に相手が `TermAccept` したとき） |
| `dropped` | 任意の項目を、双方が決めないことにした | — |

規則:

1. 項目が `fixed` になるのは、相手が `TermAccept` で **同じ `valueHash`** を返したときだけ。自分の出した値を、自分で確定させることはできない。
2. 確定した項目を開き直すには、相手の同意（`TermReopen` への `TermAccept`）が要る。片方だけでは戻せない。
3. `TermDrop` は任意の項目にだけ使える。必須の項目は落とせない。相手の同意で `dropped` になる。
4. `TermAdd` で足した項目は、相手が同意すれば、この交渉の任意の項目になる。必須にするには `TermAdd` に `required: true` を付け、相手が同意する。
5. 往復の上限は、項目ごとに数える（例: 1項目につき対案3回まで）。上限は依頼票に書く。どれかの必須項目が上限を超えたら `no_deal` にする。
6. 期限（`expiresAt`）を過ぎたメッセージは、出していないものとして扱う。

## 5. エージェントと人間の分担

- 人間は、自分のエージェントに **項目ごとの委任範囲** を渡す（例: `ix:price` は 150,000〜200,000 円、`ix:deadline` は 2026-12-20 まで）。今の `Mandate` を、項目の識別子で書く形に広げる。
- エージェントは、範囲の中なら自分で `TermAccept` してよい。範囲の外、または委任範囲に書かれていない項目は、自分の人間に聞く。
- 人間は、承認アプリから直接 `TermPropose` `TermAccept` を出してもよい。そのときの `signature` は人間の鍵で付ける。
- 相手のエージェントには、委任範囲を見せない。

## 6. 合意の形式

すべての必須項目が `fixed` になり、`proposed` の項目が残っていないとき、どちらのエージェントも合意案を出せる。

`AgreementDraft`:

| 欄 | 意味 |
| --- | --- |
| `agreementId` | 合意の名前 |
| `jobId` | 依頼票 |
| `sheet` | 項目表の `sheetId` `version` `sha256` |
| `addedTerms` | `TermAdd` で足した項目の定義 |
| `terms` | 確定した項目の一覧 `[{"termId", "value"}]`。`termId` の順に並べる |
| `transcriptHash` | 最後のメッセージの指紋。交渉の履歴全体を指す |

規則:

1. 合意案は、履歴から **機械的に作れる**。双方のエージェントは自分でも合意案を作り、JCS のバイトが一致することを確かめる。一致しなければ受けない。
2. `agreementHash` は、合意案の JCS の SHA-256 である。
3. 双方の人間が、`agreementHash` に対して `ApprovalDecision`（`approve` / `reject` / `revise`）を人間の鍵で出す。両方の `approve` がそろったら `agreed` になる。
4. `revise` は、開き直す項目の一覧 `reopen: [termId…]` を付ける。それらの項目は `proposed` に戻り、交渉を続ける。
5. 合意は、確定した値の組と、双方の承認の証拠である。契約書、支払い、法的な電子署名の代わりではない。契約書が必要なら、合意を元に IX の外で作る。

## 7. 標準化の進み方

項目と項目表は、中央の団体が決めない。使われたものが残る。

1. 誰でも項目の定義と項目表を公開できる。公開したものは変えない（版を上げる）。
2. 交渉の中で `TermAdd` された項目は、合意が成立すると、その定義の指紋が透明性ログに残る。
3. ノードは、どの項目表と項目が何件の合意に使われたかを数えて公開できる。数えるのは定義の指紋で、交渉の中身は数えない。
4. 多くの交渉で足されている項目は、誰かが新しい版の項目表に取り込む。古い版は使い続けてよい。
5. 2つの項目が同じ意味だと分かったら、対応表（`sameAs`）を公開できる。エージェントは対応表を使って読み替えてよいが、合意案には元の `termId` を書く。

これは IETF の「大まかな合意と動くコード」に近い。言語の違いは `label` で吸収し、機械は `termId` だけを見る。

## 8. 自由文の扱い

- 自由文は `note`、依頼票の `description`、`textRef` の文書だけに置く。
- 機械は自由文を判断に使わない。値、確定、合意は、項目のメッセージだけで決まる。
- 自由文も履歴の指紋に含めるので、あとから書き換えれば分かる。
- 人に見せる前に、受け取った側のエージェントが連絡先を取り除く（今のルール4のまま）。

## 9. 今の仕様と実装への影響

| 今 | この案 |
| --- | --- |
| `Proposal` と `CounterProposal`（`changes` に複数の欄） | `TermPropose` `TermCounter` `TermAccept` |
| `deliverables` と `acceptanceCriteria` が自由文 | `ix:deliverables`（`count`）、`ix:acceptance-window`（`duration`）、必要なら `textRef` |
| 往復の上限は交渉全体で1つ | 項目ごとの上限 |
| `Mandate` は金額、期限、時間など決まった欄 | 項目の識別子ごとの範囲 |
| 合意案は発注側が作る | どちらも作れる。履歴から機械的に作る |

- PR #11 の「仮の値」の一覧は、この案では要らなくなる。値がなければ確定していないだけだからである。
- PR #9 の連絡先を取り除く処理は、自由文が残るので必要である。ただし、機械の判断には関わらない。
- PR #3 の JCS と SHA-256 は、`valueHash`、`prevHash`、`agreementHash`、項目表の `sha256` に使う。

## 10. 人の確認が要るところ

`AGENTS.md` の Human doors にあたるもの。

- 新しいメッセージの型（`TermPropose` など）と、項目定義・項目表のイベントの種類を足すこと。
- 交渉の拡張 URI の版を上げること（`…/negotiation/v1` から `v2`）。
- 人間の鍵による `TermAccept` と `ApprovalDecision` の署名（セキュリティレビュアー）。
- 項目の定義や数え方を、個人情報の観点でどう扱うか（弁護士）。

## 11. 決めていないこと

- 共通の核に入れる項目の一覧。上の6つで足りるか。
- 種類コードの一覧（納品物の種類、ファイル形式、ブラウザなど）を、どの既存の体系から取るか。ファイル形式はメディアタイプ（`application/pdf`）を使う案。
- 項目どうしの依存（例: `web:cms` を決めたら `web:hosting-included` が必須になる）を表すか。最初の版では表さない案。
- 往復の上限を、項目ごとにするか、交渉全体と両方にするか。
- 同じ交渉の中で、項目表の版を上げてよいか。最初の版では上げない案。

## 12. 例: Web サイト制作の交渉

依頼票:

```json
{
  "type": "JobPosting",
  "jobId": "job-2026-1103-001",
  "sheet": { "sheetId": "ix:sheet/web-site", "version": 1, "sha256": "…" },
  "preset": [
    { "termId": "web:responsive", "value": true },
    { "termId": "ix:deliverable-format", "value": ["text/html"] }
  ],
  "roundLimitPerTerm": 3,
  "description": "小さな会社のコーポレートサイト（人が読む説明）"
}
```

やり取り（`prevHash` と `signature` は省略）:

```text
受注側  TermPropose  ix:price           {"amount":200000,"currency":"JPY","taxIncluded":true}
発注側  TermCounter  ix:price           {"amount":180000,"currency":"JPY","taxIncluded":true}
受注側  TermAccept   ix:price           valueHash=…        → ix:price は fixed
発注側  TermPropose  web:page-count     5
受注側  TermAccept   web:page-count     valueHash=…        → fixed
受注側  TermPropose  ix:deadline        "2026-12-20"
発注側  TermAccept   ix:deadline        valueHash=…        → fixed
発注側  TermPropose  ix:acceptance-window {"value":7,"unit":"day"}
受注側  TermAccept   ix:acceptance-window valueHash=…      → fixed
受注側  TermAdd      x-studio:photo-shoot  (boolean, 任意)
発注側  TermAccept   x-studio:photo-shoot                   → 項目を追加
受注側  TermPropose  x-studio:photo-shoot false
発注側  TermAccept   x-studio:photo-shoot valueHash=…      → fixed
…（残りの必須項目も同じ）
発注側  AgreementDraft  terms=[…], transcriptHash=…
受注側  （自分でも作って一致を確認）
双方の人間  ApprovalDecision approve agreementHash=…      → agreed
```

`x-studio:photo-shoot` のように交渉の中で足された項目が、多くの合意で使われれば、次の版の `ix:sheet/web-site` に入る候補になる。
