# 項目ごとに決める交渉と、合意の形式（案）

状態: 案。ディレクターの方針（2026-11-03）を仕様の形にしたもの。項目の状態の機械と模試のエージェントは T18 で実装した（13章）。`ix-spec-v0.3.md` の「メッセージの型」と「流れとTaskの状態」を置き換える候補。

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
| `codeList` | 選択肢の一覧（`code` と `codes` 型では必須）。一覧も URI とハッシュで指す。実装では `codes` として定義に直接持つ | `ix:file-format/1` |
| `label` | 人に見せる名前。言語ごとに複数持てる。機械は使わない | `{"ja":"金額","en":"Price"}` |

値の型は、機械が比べられるものだけにする。

| `valueType` | 値 | 例 |
| --- | --- | --- |
| `money` | `{"amount": 整数, "currency": 現行の ISO 4217 の通貨コード, "taxIncluded": 真偽}` | `{"amount":180000,"currency":"JPY","taxIncluded":true}` |
| `date` | ISO 8601 の日付 | `"2026-12-10"` |
| `datetime` | RFC 3339 の時刻（時差つき） | `"2026-12-10T18:00:00+09:00"` |
| `deadline` | 期限の一瞬（`at`、RFC 3339 の時差つき）と地域名（`zone`、IANA の名前）。`at` の時差は、その一瞬の `zone` の時差と一致しなければならない（夏時間を含む） | `{"at":"2026-12-10T18:00:00+09:00","zone":"Asia/Tokyo"}` |
| `integer` | 整数（`unit` 付き可） | `2` |
| `duration` | 整数と単位（`day` `hour`） | `{"value":7,"unit":"day"}` |
| `boolean` | 真偽 | `true` |
| `code` | `codeList` の中の1つ | `"application/pdf"` |
| `codes` | `codeList` の中の複数 | `["application/pdf","text/html"]` |
| `count` | 種類コード（英小文字・数字・`-` だけ、64文字まで）と数の組の一覧 | `[{"code":"web-page","n":5}]` |
| `textRef` | 人が読む文書1つの SHA-256。機械は中身を読まない | `{"sha256":"…","mediaType":"text/markdown","bytes":4210}` |
| `documents` | ファイルの組の目録と、その SHA-256（2.1） | `{"manifestSha256":"…","files":[…]}` |

「未定」「要相談」は、どの型でも書けない。値がなければ、その項目はまだ確定していないだけである。

`textRef` は、機械で比べられない取り決め（デザインの方向性など）を、文書の指紋として固定するための逃げ道。文書の中身は合意しても、機械はその良し悪しを判定しない。

### 2.0 期限と時差

- 期限は日付だけでは決めない。必ず、時差つきの一瞬（`at`）と地域名（`zone`）で決める。日付だけだと、何時までか、どの国の日付かが決まらないからである。
- `zone` は tzdb の `zone.tab` にある名前（例: `Asia/Tokyo`、`Asia/Kolkata`、`Europe/Kyiv`）と `UTC` だけを、大文字・小文字も含めてそのまま使う。古い別名（`Asia/Calcutta`、`US/Pacific`、`Japan` など）と、時差だけの名前（`Etc/GMT-9`）は使えない。同じ地域の書き方を1つにするためである。一覧は人が更新する固定の表で、版（今は 2026e）を記録する。
- `at` の時差に `-00:00` は使えない。RFC 3339 では「時差が分からない」という意味だからである。`UTC` なら `Z` か `+00:00` を書く。
- 機械は `at` の一瞬だけで、期限の前か後かを判断する。`zone` は人に見せるためと、時差の書き間違いを見つけるためにある。相手の画面には、相手の地域の時刻に直して見せてよい。
- 各地域の時差と夏時間の規則は、実行環境（Node.js）が持つ tzdb の表から計算する。この表の版が地域名の一覧の版（今は 2026e）と違うと、同じ納期の判定がノードごとに割れる（例: モロッコは 2026e で 2026-09-20 から時差が変わる）。そのため、ノードは表の版が一覧の版と同じときだけ動く。`verify-ix-node` の `doctor` と `drive` は、版が違えば止まる。一覧を新しい版に上げるときは、実行環境の版もそろえる。
- 人がエージェントに渡す納期の委任範囲（最初に出す値、上限、下限）も、値と同じく、その地域の時差で書いたものだけを受け付ける。時差を書き間違えた範囲では、エージェントは動かない。
- 「その日のうちならよい」という取り決めは、その地域のその日の 23:59:59 を `at` に書いて合意する。
- 検収期間などの `duration` の `day` は、暦の24時間（土日祝日も数える）。営業日で数える取り決めは、国の記号つきの別の項目として、あとで足す。

### 2.1 仕様書などのファイルを合意する（`documents`）

仕事の初期仕様書のように、1つまたは複数のファイルを合意するための型。IX はファイルの本体を保存しない。保存するのはファイルごとの SHA-256 と、それをまとめた目録の SHA-256 だけである。

ファイルの1件:

| 欄 | 意味 |
| --- | --- |
| `path` | 目録の中での名前（例: `spec/requirements.pdf`）。`/` 区切りの相対パスで、重複不可。先頭の `/`、`\`、`:`、制御文字、見えない文字（幅のない文字、文字の向きの記号、タグ文字、行・段落の区切りなど）、空の区切り、`.` と `..`、前後に空白のある区切りは使えない。日本語のファイル名は使える |
| `sha256` | ファイルのバイト列そのものの SHA-256（小文字16進） |
| `bytes` | ファイルの大きさ（バイト数） |
| `mediaType` | ファイルの種類（例: `application/pdf`） |

目録（manifest）は `{"files": [...]}` で、`files` を `path` の順に並べる。`manifestSha256` は目録の JCS の SHA-256 である。値として合意するのは目録全体で、`valueHash` も目録を含む値から計算する。ファイルが何個あっても、確定させる指紋は1つになる。

規則:

1. ファイルの受け渡しは IX の外で行う（直接送る、共有ストレージなど）。置き場所の URL を `note` に書いてもよいが、機械は置き場所を信用しない。
2. 受け取った側のエージェントは、手元のファイルから SHA-256 を自分で計算し、目録と一致したときだけ `TermAccept` を送る。一致しなければ受けない。
3. 合意したあとでファイルを直したときは、`TermReopen` で開き直し（相手の同意で `open` に戻る）、新しい目録を `TermPropose` で出す。前の目録も履歴に残る。
4. ハッシュはファイルのバイト列そのものに対するもので、1バイトでも違えば別のファイルになる。開いて保存し直すだけでも変わることがある。合意するファイルは、PDF など保存し直されにくい形を勧める。
5. 双方が、合意したファイルの本体を自分で保管する。IX が持つのは指紋だけなので、両方がファイルをなくすと、中身は取り戻せない。指紋は「手元のファイルが合意したものと同じか」を確かめるためにある。
6. 指紋から中身は読めない。ただし、中身を推測できる小さなファイル（短い文面だけ、など）は、候補を総当たりすれば当てられることがある。秘密にしたい短い文書は、ランダムな文字列を足したファイルにして合意する案がある（11章）。

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
| `ix:deadline` | `deadline` |
| `ix:revision-limit` | `integer` |
| `ix:acceptance-window` | `duration`（納品した一瞬から検収の返事までの期間。`day` は暦の24時間で、土日祝日も数える） |
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
| `ix:initial-spec` | 任意 | `documents`（初期仕様書の一式） |

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
| `TermRefuse` | 相手の `TermAdd` `TermDrop` `TermReopen` だけを断る。交渉は続く | `termId` |
| `DealDecline` | 交渉をやめる | `reason` |

どのメッセージにも `prevHash`（1つ前のメッセージの指紋）、`sentAt`、`expiresAt`、`signature` を付ける。`valueHash` は、値の JCS の SHA-256 である。`note` は人が読む自由文で、機械は判断に使わない。

項目ごとの状態は次のとおり。

| 状態 | 意味 | 次の状態 |
| --- | --- | --- |
| `open` | まだ誰も値を出していない | `proposed`、`dropped` |
| `proposed` | 片方が値を出した | `fixed`（相手が `TermAccept`）、`proposed`（相手が `TermCounter`。出した側が入れ替わる） |
| `fixed` | 双方が同じ値に同意した | `reopen_requested`（`TermReopen`） |
| `add_requested` `drop_requested` `reopen_requested` | 片方が足す・落とす・開き直すことを求めた | 相手の `TermAccept` で `open`、`dropped`、`open`。相手の `TermRefuse` で、足す求めは項目ごと消え、落とす・開き直す求めは元の状態（値と出した側も）に戻る |
| `dropped` | 任意の項目を、双方が決めないことにした | — |

規則:

1. 項目が `fixed` になるのは、相手が `TermAccept` で **同じ `valueHash`** を返したときだけ。自分の出した値を、自分で確定させることはできない。
2. 確定した項目を開き直すには、相手の同意（`TermReopen` への `TermAccept`）が要る。片方だけでは戻せない。
3. `TermDrop` は任意の項目にだけ使える。必須の項目は落とせない。相手の同意で `dropped` になる。
4. `TermAdd` で足した項目は、相手が同意すれば、この交渉の任意の項目になる。必須にするには `TermAdd` に `required: true` を付け、相手が同意する。
5. 往復の上限は、項目ごとに数える（例: 1項目につき対案3回まで）。上限は依頼票に書く。どれかの必須項目が上限を超えたら `no_deal` にする。任意の項目が上限を超えたら、その項目は `dropped`（この交渉では決めない）になり、交渉は続く。
6. 期限（`expiresAt`）を過ぎたメッセージは、出していないものとして扱う。

## 5. エージェントと人間の分担

- 人間は、自分のエージェントに **項目ごとの委任範囲** を渡す（例: `ix:price` は 150,000〜200,000 円、`ix:deadline` は東京時間の 2026-12-20 18:00 まで）。今の `Mandate` を、項目の識別子で書く形に広げる。
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
3. 双方の人間が、`agreementHash` に対して `ApprovalDecision`（`approve` / `reject` / `revise`）を人間の鍵で出す。両方の `approve` がそろったら `agreed` になる。この3つ以外の返事は断る。
4. `revise` は、開き直す項目の一覧 `reopen: [termId…]` を付ける。それらの項目は値を消して `open` に戻り、交渉を続ける。
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
- `ix:initial-spec` を共通の核に入れて、どの仕事でも任意で使えるようにするか。
- 推測されやすい短い文書の指紋を守るため、ランダムな文字列（ソルト）の付け方を決めるか。指紋が個人情報にあたるかは弁護士の確認事項と重なる。
- 1つのファイルの大きさや、目録のファイル数に上限を設けるか。

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
受注側  TermPropose  ix:deadline        {"at":"2026-12-20T18:00:00+09:00","zone":"Asia/Tokyo"}
発注側  TermAccept   ix:deadline        valueHash=…        → fixed
発注側  TermPropose  ix:initial-spec    {"manifestSha256":"9f2c…","files":[
                                          {"path":"requirements.pdf","sha256":"a41b…","bytes":182344,"mediaType":"application/pdf"},
                                          {"path":"sitemap.png","sha256":"07de…","bytes":52011,"mediaType":"image/png"}]}
        （ファイル本体は IX の外で受注側に渡す）
受注側  （手元の2ファイルの SHA-256 を計算し、一致を確認）
受注側  TermAccept   ix:initial-spec    valueHash=…        → fixed
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

## 13. 実装の状態（T18・T19）

- `@ix/a2a-ext-negotiation` の `openTermSession` と `applyTermMessage` が、項目ごとの状態と交渉全体の段階を進める。純粋な関数で、時計は外から渡す。
- 共通の核 `ix:core/1`（`coreSheet`）と、Web サイト制作の項目表 `ix:sheet/web-site/1`（`webSiteSheet`）を持つ。`ix:initial-spec` は共通の核の任意の項目にした。
- 開き直しは、相手の同意で `open` に戻す。相手の求め（追加・取り下げ・開き直し）は `TermRefuse` で1つだけ断れる。
- メッセージは、中身を見る前に形を1か所で確かめ、壊れていれば例外ではなく「断る」で返す。
- 求めと断りの回数には、まだ上限がない。中継を通すときに決める。値を出し直すのは、そのあとの `TermPropose` である。
- `@ix/agents` の `runTermTrial` は、項目ごとの委任範囲を持つ発注側と受注側の模試が、1項目ずつ確定させて合意案を作り、双方の人間（台本）が承認するまでを動かす。範囲が重ならない項目は往復の上限で `no_deal`、仕様書のファイルの指紋が手元と合わないときは人間に戻す。
- 納期（`ix:deadline`）は、時差つきの一瞬と、tzdb 2026e の地域名で決める（2.0）。検収期間の1日は24時間。営業日での数え方はまだない。
- 納期の委任範囲（模試の `deadline-by` / `deadline-from`）は、地域名と、その地域の時差で書いた一瞬で書く。
- まだしていないこと:
  - `valueHash`、`prevHash`、`transcriptHash`、`manifestSha256` は未確認の文字列（`deferred`）。値の一致は、値そのものを比べて確かめている。JCS と SHA-256 は PR #3 でマージ済みで、指紋で比べるのは次の段階（`prevHash` の規則を決めるので、人の確認が要る）。
  - 署名は確かめない（`deferred`）。
  - 模試は `runTermRelay` で中継（relay）を通してメッセージを渡す（T19）。双方は中継に載ったイベントだけから自分の状態を作り直し、同じ合意案になることを確かめる。依頼票は、送り主が発注側のものだけを使う。発注側は、中継の依頼票が自分の出したものと同じことを確かめ、違えば止まる。発注側が先に決めた値は、自分の委任範囲の中でなければ出さない。中継から届くメッセージは、64段より深い入れ子、JSON でない値、知らない欄を、作り変えずに断る。drive と毎晩の検査は、発注側と受注側を別の処理として動かし、この交渉で合意したあと、`@ix/verify` の `verifyTermTranscript` で中継の記録を別に読み直す（T20）。旧来の交渉（提案・対案・自由文の合意案）は、適合テストでまだ使っている。置き換えは次の段階。
  - 新しいメッセージの型は、まだ中継のイベントの種類として登録していない。
