# 人と代理人が相談して決める方式（規則の文章）

状態: **レビュー待ちの規則文**（Q11）。ディレクターの決定 D09（2026-11-14）を、仕様の本文（`ix-spec-v0.3.md` の「交渉の拡張仕様（案 v0.3）」）、`ix-standard.md`、`term-protocol-draft.md`、今のコードと読み合わせて、`ix-standard.md` に載せられる規則の形にしました。**コードはまだ変えていません。** 実装は Q12 です。`ix-standard.md` は「コードと `decisions.tsv` から書く」決まりなので、第7節の差分は Q12 の後で当てます。

この文書は人の扉に当たります（第10節）。ディレクターとセキュリティレビュアーが読むまで、規則として使いません。**決める点は、もう残っていません。** Q11 で出た 10 の問いは、ディレクターが 2026-11-14 に推奨のとおり決めました（D10、第9節）。その答えは、第2節から第8節の規則の文章に入れてあります。

## 1. 方針（ディレクターの決定、D09。動かさない）

- 人と代理人が相談しながら、金額などの条件を決めます。代理人が依頼票を探して人に報告し、人が指示し、代理人がもう片方に打診します。これを繰り返します。
- 掲載と検索は、依頼票だけです。
- 閉じ方は2つです。片方の `DealDecline`。または、交渉中（`negotiating`）に、直前に適用されたメッセージの `sentAt` から 24 時間たっても次のメッセージがないとき。承認待ち（`awaiting_approval`）にはかけません。
- 「最後の打診」は、最後のメッセージ全部です（種類を問いません）。
- 24 時間は、依頼票の欄ではなく、プロトコルの決まった値です。経過時間は、メッセージに書かれた `sentAt` の差だけで決めます。閉じる手は要りません。新しい理由 `silence` の `no_deal` として扱います。待つ側が閉じ忘れても、自動で閉じます。
- 閉じた履歴は、検証の報告と代理人の記録だけに残します。署名つきの中継の記録（新しい種類の記録）は作りません。
- 往復の上限は、プロトコルからなくします。`roundLimitPerTerm` を依頼票から外し、依頼票のハッシュ（anchor）の入力は 8 つの欄から 7 つになります。往復の数え方、`round_limit`、往復の上限を超えた任意の項目を外す規則もなくなります。完全に自動で取引するときの安全弁は、各側の代理人の設定で、プロトコルの決まりではありません。
- 委任の限度は残します。限度の外の手は、人が指示しても止めます。

## 2. 規則の文章

ここが規則の本体です。「しなければならない」「してはならない」は、読む側（代理人と `@ix/verify`）と送る側の両方を縛ります。

### 2.1 言葉

- **適用済みの鎖**: 依頼票（anchor）から、鎖の順（`prevHash`）に、交渉の機械と鎖の決まりで受け付けたメッセージの列 m1, m2, …, mn（n は 0 以上）。分岐（fork）として当てはめなかったもの、重複、遅れたメッセージ（2.4）は入りません。
- **S(n)**: m1〜mn を当てはめたあとの交渉の状態。段階は `phase(S(n))`。
- **t(m)**: メッセージ m の `sentAt` が表す一瞬を、UTC の 1970-01-01T00:00:00Z からのミリ秒の整数にしたもの。
- **W**: 86,400,000 ミリ秒（24 時間ちょうど）。暦の1日ではなく、経過時間です。夏時間、うるう秒、時差は関係しません。
- **J**: 依頼票の `expiresAt` の一瞬（ミリ秒）。
- **中継の順**: イベントの `id` の昇順（`ix-standard.md` 第4節、D03）。

### 2.2 `sentAt` の形

1. どのメッセージの `sentAt` も、次の形でなければなりません。`YYYY-MM-DDTHH:MM:SS`、そのあとに任意で `.` と1〜3桁の小数、最後に `Z` または `+HH:MM` / `-HH:MM`。月日は実在の日付、時は 00〜23、分と秒は 00〜59、時差の時は 00〜23、分は 00〜59。小文字の `t` や `z`、4桁以上の小数、秒の `60`、時差 `-00:00` は拒否します。形が違うメッセージは `schema` の不合格です（代理人は拒否として記録します）。
2. `t(m)` は、上の文字列から決まる一瞬です。比べるのはミリ秒の整数だけです。
3. `sentAt` は、そのメッセージ自身の `expiresAt` より前でなければなりません（`t(m) < expiresAt の一瞬`）。

理由: 今のコードは `sentAt` が文字列であることしか確かめていません（`checkMessageShape`）。24 時間の規則は `sentAt` だけで決まるので、形を一つに決めないと、実装ごとに `Date.parse` の読み方が違い、結論が分かれます。

### 2.3 締め切りの式

```text
D(S(n)) = t(mn) + W   ただし n ≥ 1 かつ phase(S(n)) = negotiating のとき
D(S(n)) = なし        それ以外（n = 0、awaiting_approval、agreed、no_deal）
```

- n = 0（依頼票だけで、まだメッセージがない）ときは、締め切りはありません。依頼票は掲載されて待つものだからです（D10）。
- `awaiting_approval` には、締め切りはありません。人が `revise` を出して `negotiating` に戻ったときは、その `TermApproval`（`revise`）が mn なので、締め切りはその `sentAt` から 24 時間です。
- `sentAt` が前のメッセージより早くても（時刻が逆に並んでいても）、断りません。締め切りは、いつも「直前に適用されたメッセージ」の `sentAt` から測ります（D10）。

### 2.4 次のメッセージの選び方と、遅れたメッセージ

状態 S(n) のあと、`prevHash` が mn のハッシュ（n = 0 なら anchor）と一致するメッセージを**候補**と呼びます。

1. 候補 x は、`D(S(n))` がないか、`t(x) < D(S(n))` のとき**期限内**です。`t(x) ≥ D(S(n))` のとき**遅れた**メッセージです。
2. 次に当てはめるのは、期限内の候補のうち、中継の順で最初のものです。遅れた候補は、中継の順で先にあっても、選びません。
3. 選んだ候補が交渉の機械か鎖の決まりで断られたときの扱いは、今のとおりです（検証は `replay`、鎖の決まりなら `chain` も不合格。代理人は拒否として記録）。
4. 遅れたメッセージは当てはめず、**不合格にもしません**。検証は `late` として数え、代理人は拒否として記録します。ただし、同じ送り手が同じメッセージのあとに2つ出していれば、今のとおり `chain` の不合格です（T23、D03）。
5. 期限内の候補がなくなったら、当てはめは終わりです。そのときの状態を S(終) と書きます。

理由: 「中継の順で最初の候補」をそのまま使うと、中継が `id` を付け替えて遅れたメッセージを先に並べるだけで、期限内に届いた正直な返事を押しのけられます。期限内のものだけを選べば、並べ替えで交渉を閉じさせることはできません。これは D03（枝分かれは中継の順で先のものが勝つ）を「期限内のものの中で」と狭める変更です。

### 2.5 閉じたかどうかの判定

閉じたかどうかは、イベントの集まりと、**読む一瞬 a**（ミリ秒）で決まります。

```text
silence(S(終), a) が真  ⇔  D(S(終)) があり、かつ a ≥ D(S(終))、かつ D(S(終)) < J
```

- 真なら、交渉は `no_deal`、理由 `silence`、閉じた一瞬は `D(S(終))` です。閉じる手（メッセージ）はありません。
- `D(S(終)) ≥ J` のときは、依頼票の期限が先に来ます。`silence` とはせず、今のとおり依頼票の期限の規則で止まります（T21b、T27）。
- 代理人の a は、読んだときの自分の時計です。検証の a は、呼び出す側が渡す値です（`asOf`）。`asOf` を渡さないときは、検証は閉じたとは言わず、段階は当てはめたとおり（`negotiating`）にして、締め切り `D(S(終))` を報告します（D10）。中継の記録の中の一番遅い時刻を `asOf` の代わりに使うことはしません。未来の時刻を書いた 1 通で、早く閉じさせられるからです。
- 同じイベントと同じ a なら、代理人と検証は同じ結論になります。違いが出るのは、a が違うとき（読んだ時刻が違う）と、見えているイベントが違うとき（中継が隠した、まだ届いていない）だけです。

### 2.6 記録

閉じた記録は、署名しない、手元の記録です。中継には出しません。

- 代理人の記録: `reason: "silence"`、`lastHash`（mn のハッシュ）、`lastSentAt`（mn の `sentAt` の文字列そのまま）、`closedAt`（`D(S(終))` を `YYYY-MM-DDTHH:MM:SS.sssZ` で書いたもの）、`observedAt`（a を同じ形で書いたもの）、`late`（遅れたメッセージの数）。
- 検証の報告: 上と同じ欄（`observedAt` の代わりに `asOf`）と、段階 `no_deal`、理由 `silence`。`asOf` がないときは `silenceDeadline` だけ。

### 2.7 送る側の決まり

1. 代理人は、自分の時計で `D(S(n))` ちょうど、またはそのあとに、交渉のメッセージを出してはなりません（出しても遅れたメッセージになり、当てはめられません）。代わりに、2.6 の記録を作って止まります。
2. 代理人は、`sentAt` に自分の時計の今の時刻を書かなければなりません。
3. 代理人は、自分が `silence` で閉じたと記録したあと、その交渉で自分から手を出しません。ただし、次の 2.7a の場合だけ、`DealDecline` を 1 回出します。
4. 毎回の手の前の確かめ（T21b の依頼票の期限）に、上の 1 を足します。

### 2.7a 閉じたと記録したあとに、締め切り前の時刻のメッセージが届いたとき（D10）

代理人が `silence` で閉じたと記録した（`lastHash` が h）あとに、中継の遅配か、時刻をさかのぼらせたメッセージで、期限内のメッセージが届くことがあります。式（2.3〜2.5）では、そのメッセージは当てはめられ、交渉は続きます（**よみがえり**）。このとき代理人は、次のとおりにします。

1. 見えているイベントで、今のとおり鎖を当てはめ直し、新しい状態 S' を出す。2.6 の記録は消さず、`revived`（よみがえったこと、届いたメッセージのハッシュ、読んだ一瞬）を書き足す。そして、自分の人に知らせる。
2. S' の段階が `negotiating` で、自分の時計の今が `D(S')` より前なら、`DealDecline` を出す。S' の段階が `awaiting_approval`（よみがえりのメッセージが合意案だった）なら、締め切りはないので、依頼票の期限の前であれば `DealDecline` を出す。
3. S' の段階が `negotiating` で、自分の時計の今が `D(S')` ちょうど、またはそのあとなら、何も出さない。式のとおり、交渉は `D(S')` でまた `silence` として閉じている。その記録を 2.6 の形で書き足す。
4. S' の段階が `no_deal` なら、何も出さない。`agreed` にはならない（自分の人の承認の署名がないと、合意にならない）。
5. この `DealDecline` は、普通のメッセージと同じに作る。`sentAt` は自分の時計の今（2.7 の 2）、`expiresAt` は `sentAt` + W、`prevHash` は S' の最後のメッセージのハッシュ、`reason` は自由文（例: 「返事の途絶えで閉じたと記録したあとに届いたため、辞退します」）。機械は `reason` を読まない。依頼票の期限の前でなければ出さない（T21b）。
6. 1 つの交渉で、代理人がこの `DealDecline` を当てはめさせるのは 1 回だけ。当てはめられれば段階は `no_deal` になり、そのあとは手を出さない。相手のメッセージと同じ前のメッセージを指して分岐（fork）になり、当てはめられなかったときは、今の分岐の決まりのとおり、新しい状態からもう一度 1〜5 を判断する。同じ前のメッセージのあとに 2 つ出すことはしない（二重送信は `chain` の不合格になるため）。
7. 検証の側からは、届いたメッセージのあとに、この代理人の普通の `DealDecline` が見え、段階は `no_deal`、理由は `declined` になる。2 の場合で `DealDecline` が出せなかったとき（3 の場合）は、`asOf` が `D(S')` 以降なら `silence`（`lastHash` は届いたメッセージのハッシュ）になる。代理人の手元の記録には、最初の `silence`（`lastHash` が h）と `revived` が残るので、検証の報告と見比べれば、遅配かさかのぼりがあったことが分かる。どちらだったかは、受領印ができるまで区別できない。

### 2.8 往復の上限をなくす

1. 依頼票（`term-job` の `job`）の欄は、`jobId`、`sheetId`、`sheetVersion`、`sheetSha256`、`preset`、`description`、`expiresAt` の 7 つです。`roundLimitPerTerm` はありません。
2. anchor は、今のとおり依頼票の `job` オブジェクトのハッシュです（T23）。代理人は 7 つの欄から作り直してハッシュし、検証は公開されたものをそのままハッシュします。
3. `roundLimitPerTerm` を持つ依頼票（古い形）を含め、7 つ以外の欄を持つ依頼票は、代理人も検証も拒否します（検証は `schema` の不合格。D10）。これで、余分な欄による代理人と検証の anchor の食い違いがなくなります。
4. 交渉の機械は、往復を数えません。項目ごとの往復の数（`counters`）も、機械の状態から外します（D10）。`round_limit` は不成立の理由からなくなり、理由は `declined`、`rejected`、`silence` の 3 つです。依頼票の期限切れは、理由にしません（D10。今のとおり、期限で止まり、段階はそのまま）。往復の上限を超えた任意の項目を外す規則もなくなります。
5. 交渉は、`DealDecline`、`silence`、人の `reject`、依頼票の期限のどれかが来るまで続きます。

### 2.9 完全に自動で取引するときの安全弁（代理人の設定。プロトコルではない）

1. 代理人は、次の設定を持てます。
   - **対案の数 N**: 1 つの項目で、その項目が最後に `open` になってから数えた `TermCounter`（双方の分）が N に達したあと、さらに対案を出す番が来たら、対案の代わりに `DealDecline` を出す。
   - **メッセージの数 M**: 1 つの交渉で、双方のメッセージの合計が M に達したら、`DealDecline` を出す。`TermAdd` などを片方が出し続ける場合への備えです（D10）。参照実装は、N と M の両方を持ちます。
2. 人が毎回判断する使い方では、設定は要りません。人が止め役です。
3. 人が判断しない、完全に自動の使い方では、代理人は N（と M）が決まっていなければ始めてはなりません。これは参照実装の決まりで、プロトコルの決まりではありません。
4. 安全弁の `DealDecline` は、普通の `DealDecline` です。理由の文は自由文で、機械は読みません。相手には、安全弁で断ったのか、人が断ったのかは分かりません。

### 2.10 委任の限度

今のとおりです（T29）。`decide` を通った手でも、委任の外の提案、対案、受け入れは送らず、人に戻します（`outside_mandate`）。24 時間の規則も、往復の上限の撤廃も、これを変えません。

### 2.11 読む側の実装の上限（D10。プロトコルではない）

1. 参照実装の代理人と検証は、1 イベントの大きさ、1 交渉のメッセージ数、足した項目の数に、上限を持ちます。入れ子 64 と同じく、これはこの実装の上限で、プロトコルの決まりではありません。
2. 上限を超えたら、そこで読むのをやめ、「上限で止めた」（`limit`）と報告します。`schema` などの不合格とは分けます。上限で止めた報告は、その交渉が正しいとも、正しくないとも言いません。
3. 数は Q12 で提案し、`decisions.tsv` に書きます（目安: 1 イベント 64 KiB、1 交渉 10,000 メッセージ）。

## 3. 検証の手順の追加分

`ix-standard.md` 第10節の手順に、次を足します（差分は第7節）。

- `verifyTermTranscript` は、任意の入力 `asOf`（RFC 3339 の一瞬。2.2 と同じ形）を取ります。
- 手順4: 依頼票が 7 つ以外の欄（`roundLimitPerTerm` を含む）を持てば `schema` の不合格。
- 手順5: `sentAt` が 2.2 の形でない、または `sentAt` が自分の `expiresAt` より前でなければ `schema` の不合格。
- 手順6: 候補のうち期限内のもの（2.4）だけを、中継の順で選んで当てはめる。遅れた候補は脇に置く。
- 手順7: 残ったメッセージのうち、それが指す状態から見て遅れたものは、同じ送り手の二重送信でない限り `late` として数え、`chain` を不合格にしない。二重送信なら今のとおり `chain` の不合格。
- 手順8（新）: 最後の状態で 2.5 の式を計算する。`asOf` があり、式が真なら、段階を `no_deal`、理由を `silence` として報告し、2.6 の欄を返す。`asOf` がなければ `silenceDeadline` だけを返す。
- 報告に `late`（数）と `silence`（欄）を足す。
- 実装の上限（2.11）に達したら、読むのをやめ、`limit` を報告する。不合格とは分ける。

## 4. 本文との読み合わせ（Q11 の問い 1〜5）

### 4.1 鎖の順序と 24 時間の規則（checklist 2 と 4）

24 時間の規則は、鎖の上の値（mn の `sentAt` と候補の `sentAt`）だけで決まります。`sentAt` はメッセージの中にあり、メッセージの署名と、次のメッセージの `prevHash` に含まれます。イベントの `createdAt` や `id` と違い、中継も、同じ鍵で署名し直した別のイベントも、変えられません。

| 細工 | 何が起きるか | 本物の合意を偽造できるか | 正直な記録を失敗させられるか |
| --- | --- | --- | --- |
| 複製（同じ署名の中身、別の `id`） | 重複として捨てる（T25b）。`sentAt` は同じで、結論は変わらない | できない | できない |
| 並べ替え、`id` の付け替え | 期限内の候補どうしでは、今のとおり中継の順で勝ちが決まる（D03）。遅れた候補は選ばれないので、遅れたものを先に並べても閉じない | できない | できない |
| 再タグ | タグはイベントの署名に入る。中継は付け替えられない。タグが違うイベントは読まない（T25b、T25c） | できない | できない |
| 古いイベント（別の交渉や前の状態のメッセージ） | anchor が違えば鎖に入らない。前の状態を指すものは分岐か遅れたもの | できない | 二重送信なら送り手自身の不正として `chain` が落ちる（今と同じ） |
| 分岐（同じ前のメッセージを指す2つ） | 期限内のものだけで今のとおり決める。遅れた分岐は `late` で数える | できない | できない（遅れたものは不合格にしない） |
| 中継がイベントを隠す | 隠された側の代理人は、見えた分だけで閉じたと判断する。全部を見た検証は、続いていたと判断する | できない（合意には双方の人の承認の署名が要る） | できない。ただし、代理人の記録と検証の報告が食い違う（下の「限界」） |

**`sentAt` が送り手の申告であること（T25c）による攻撃と限界**

- **自分のメッセージの時刻を遅らせて書く（未来の時刻）**: その手は遅れたメッセージになり、無視されるだけです。閉じるかどうかは a で決まるので、未来の時刻で早く閉じさせることはできません。前のメッセージの時刻より後でなければならない、という決まりを置かないので、相手の正直な返事が「時刻が逆」として断られることもありません。
- **自分の返事の時刻をさかのぼらせて書く**: 相手の締め切りが早まります。極端には、相手の前のメッセージの直後の時刻を書き、実際には 24 時間近く待ってから出すと、相手にはほとんど時間が残らず、`silence` で閉じます。これは、その送り手が `DealDecline` を出すのと同じ結果で、送り手はいつでも断れるので、新しく得るものは「理由が `silence` になる」ことだけです。記録の最後のメッセージはさかのぼらせた側のものなので、黙ったのはもう片方に見えます。代理人は、受け取ったメッセージの `sentAt` が自分の時計より大きくずれていれば、記録して人に見せるべきです（代理人の設定。プロトコルではない）。中継の受領印（段階4、見送り中）ができるまで、これ以上は防げません。
- **締め切りのあとに、締め切り前の時刻で出す（よみがえらせる）**: 式では期限内なので当てはめられ、交渉が続きます。正直な遅配（中継が遅れて届けた）と区別できません。合意を偽造することはできません（待つ側の人の承認の署名が要る）。待つ側の代理人は、新しい締め切りの前なら `DealDecline` を 1 回出して人に知らせ、締め切りが過ぎていれば何も出しません（2.7a、D10）。どちらの場合も、記録ははっきり `declined` か `silence` で終わります。
- **自分でメッセージを出し続けて閉じさせない**: 「最後の打診」は種類を問わないので、片方が出し続ければ閉じません。D09 のとおりで、もう片方はいつでも `DealDecline` で閉じられます。

### 4.2 代理人と検証が同じ結論になるか（checklist 2）

式（2.3〜2.5）は、イベントの集まりと a だけの関数です。代理人は a に自分の時計を使い、検証は呼び出す側が渡した `asOf` を使います。a を入力として明示したので、「読む側の時計に依存する」部分は、式の外ではなく、式の入力になります。

食い違いが出る場合と、その扱い:

| 場合 | 代理人 | 検証 | 扱い |
| --- | --- | --- | --- |
| 読んだ時刻が違う | 自分の時計の a | `asOf` | 同じ a を渡せば同じ。報告に a を必ず書く |
| 見えているイベントが違う（隠す、遅配） | 見えた分で判断 | 渡された分で判断 | 記録の `lastHash` が違うことで分かる。受領印までは原因を区別できない |
| `asOf` がない | — | 閉じたと言わない | 締め切りだけを報告する |
| 遅れたメッセージ | 拒否として記録 | `late` で数える | どちらも当てはめない |

今ある違い（T25c: メッセージの `expiresAt` を、代理人は自分の時計で、検証は `createdAt` で判断する）は、この規則では増えません。24 時間の規則は `createdAt` を使わないからです。

### 4.3 今ある期限との関係

| 期限 | 何で判断するか | 24 時間の規則との関係 |
| --- | --- | --- |
| メッセージの `expiresAt` | 代理人は自分の時計、検証は `createdAt`（T25c） | 別の規則のまま。期限切れで断られたメッセージは当てはめないので、締め切りを延ばさない。参照実装はメッセージの `expiresAt` を `sentAt` + 24 時間にしており、返事の締め切りと同じ一瞬になる。新しく 2.2 の 3（`sentAt` < `expiresAt`）を足す |
| 依頼票の `expiresAt`（T21b、T27） | 代理人は自分の時計、検証は `createdAt` | 承認待ちも含めて、すべてを止める上限。`D ≥ J` なら `silence` にはしない（2.5） |
| 承認待ちの長さ | なし | 24 時間の規則はかけない。依頼票の期限まで待てる。依頼票の期限が遠いと、承認待ちが長く続く |

本文との食い違い（前からあるもの）:

- `ix-spec-v0.3.md` の「各実装が守るルール」7 は「期限切れは `decline` と同じ扱い」と書きますが、コードは期限切れのメッセージを当てはめず（`decline` にはしない）、依頼票の期限では段階を `negotiating` のまま止めます（`negotiation-states.md`）。
- `ix-spec-v0.3.md` の段階の表の理由（`declined` / `withdrawn` / `expired` / `round_limit`）は、コード（`declined` / `rejected` / `round_limit`）と違います。この表は T22 で置き換えた経緯の節にあります。
- 同じく「各実装が守るルール」2（往復の上限を依頼票に書く）は、置き換えの注記の外にあり、D09 と食い違います。第5節の一覧で直します。

### 4.4 往復の上限の撤廃と、無制限の交渉の危険

変える決定と文書は第5節の表です。

無制限の交渉の危険と考え方:

- **往復を止めるもの**: 前は往復の上限が、二つの自動の代理人の終わらない言い合いを止めていました。今後は、各側の安全弁（2.9）、`silence`、依頼票の期限、人です。言い合いには双方の手が要るので、片方の安全弁で止まります。
- **片方だけでメッセージを増やす**: `TermAdd` で新しい項目を足し続けることは、前から上限がありませんでした（往復の上限は対案だけを数えていた）。メッセージの数の安全弁 M（2.9）で自分の側は止められます。
- **巨大な値**: 今の守りは、入れ子 64 まで、安全な整数、厳しい読み取り（T19b）です。イベントの大きさと配列の長さには上限がありません（AGENTS.md: 配列の幅に上限はない）。
- **計算の量**: 検証は、毎回、残りの候補を探すので、メッセージ数 n に対して n² の手間です。代理人は、分岐を落とすたびに鎖全体のハッシュを計算し直します（`dropForks` の `chainedHashes`）。往復が無制限になると、これが攻撃に使えます。
- **考え方**: プロトコルには上限を入れません（D09）。読む側の実装の上限（1 イベントの大きさ、1 交渉のメッセージ数、足した項目の数）は、入れ子 64 と同じく「この実装の上限」として持ち、超えたら「上限で読むのをやめた」と報告して、プロトコル違反（不合格）とは分けます（2.11、D10）。計算の量は Q12 で直します（候補を `prevHash` で引けるようにし、鎖のハッシュを使い回す）。

### 4.5 安全弁をプロトコルの外に置くことの書き方と限界

- 書き方: 規則の文章（`ix-standard.md`）には「プロトコルは往復を数えない。止め役は `DealDecline`、`silence`、`reject`、依頼票の期限」とだけ書き、安全弁は参照実装の説明（代理人の設定）として別に書きます。適合試験は、模試の代理人の安全弁を試せますが、他の実装に安全弁を求めることはできません。
- 限界:
  - 自分の側しか守れません。相手の安全弁は見えず、強制もできません。
  - 安全弁で断ったことは、相手にも検証にも区別できません（普通の `DealDecline`）。
  - N と M の値は、各自の判断です。小さすぎると、まとまる交渉を早く断ります。
  - 人が毎回判断する使い方では、人の手間が止め役です。

## 5. 往復の上限の撤廃で変わる記述（一覧）

`decisions.tsv` の行は書き換えず、新しい行（T34）で、どこが古くなったかを書きます。文書は、コードに合わせて Q12 で直します。

| 場所 | 今の記述 | 変えること | いつ |
| --- | --- | --- | --- |
| `decisions.tsv` T18 | Rounds are counted per term | T34 で古くなったと記録 | この PR |
| `decisions.tsv` T18b | An optional term that passes its round limit is dropped...; a required term ends it | T34 で古くなったと記録 | この PR |
| `decisions.tsv` T19 | job に per-term round limit | T34 で古くなったと記録（job は 7 欄） | この PR |
| `decisions.tsv` T23 | anchor は job のハッシュ | 規則は同じ。入力が 7 欄になると T34 に書く | この PR |
| `decisions.tsv` T21 | 項目4: 1円離れた範囲は不成立で終わる | 終わり方が安全弁の `DealDecline`（理由 `declined`）になると T34 に書く | この PR |
| `decisions.tsv` T21b | 項目6: 項目ごとの往復の数が中継の対案の数と一致 | 確かめる内容を、安全弁の N を超えて対案が出ないことに替えると T34 に書く | この PR |
| `ix-standard.md` 第6節（英日） | Opening に `roundLimitPerTerm`、Rounds の段落 | 欄を消し、段落を「止め役」の段落に替える。24 時間の規則を足す | Q12 の後 |
| `ix-standard.md` 第7節（英日） | eight fields | seven fields | Q12 の後 |
| `ix-standard.md` 第9節、第10節（英日） | — | 24 時間の規則、`asOf`、`late`、`silence` | Q12 の後 |
| `docs/negotiation-states.md` | 図の「任意の項目が往復の上限を超える」「必須の項目が往復の上限を超える」、説明の1行 | 消して、「交渉中に24時間メッセージがない（silence）」を足す | Q12 |
| `docs/spec/term-protocol-draft.md` | 規則5、210行の表、232行の未決、251行の例の `roundLimitPerTerm`、293行の説明 | 規則5を24時間の規則に替え、例から欄を消し、未決を「解決（D09）」にする | Q12 |
| `docs/spec/ix-spec-v0.3.md` | 「各実装が守るルール」2、段階の表の理由 | 2 を D09 に合わせ、表に置き換えの注記を足す（262行の「往復は3回まで」は事業の数字で要件ではないので残す） | Q12 |
| `docs/feature-map.md` | 65行（`note-cannot-reset-rounds`）、117行（往復は項目ごとに数える） | 安全弁と24時間の規則に合わせる | Q12 |
| `AGENTS.md`、`docs/handoff.md` | 交渉の機械の説明 | 必要なら一言足す | Q12 |
| `docs/retrospective.md` 15行 | 3往復（昔の記録） | 変えない | — |

## 6. 実装（Q12）が直すもの

| パッケージ | 直すこと | テスト（それぞれ、検査を外すと落ちること） |
| --- | --- | --- |
| `@ix/a2a-ext-negotiation` | `TermSession` と `openTermSession` から `roundLimitPerTerm` を外す。`TermState.counters` を外す（D10）。`termNoDealReasons` を `declined`、`rejected`、`silence` にする。`sentAt` の形（2.2）を `checkMessageShape` で確かめる。締め切りの式 `silenceDeadline(session)` と、期限内かを判定する関数を出す | `sentAt` の形の端（小文字、4桁の小数、秒60、`-00:00`、存在しない日付、`sentAt` ≥ `expiresAt`）。`silenceDeadline` が `awaiting_approval` と n = 0 でないこと、`revise` のあと `revise` の時刻から測ること。24時間ちょうどは遅れ、1ミリ秒前は期限内。往復の上限がないので、対案を何回続けても `no_deal` にならないこと |
| `@ix/agents` | 依頼票を 7 欄にし、7 欄以外の欄（`roundLimitPerTerm` を含む）を持つ依頼票を拒否する。2.7a のよみがえりの扱い（記録の書き足し、条件つきの `DealDecline` 1 回、人への知らせ）。2.11 の実装の上限。候補は期限内のものだけを選び、遅れたものは拒否として記録する。毎回の手の前と出す直前に締め切りを確かめ、過ぎていれば 2.6 の記録を作って止まる。安全弁 N と M を `TermAgentConfig` に足し、模試の既定値を置く（今の試験と同じ N = 3）。`decide` の手にも安全弁と締め切りをかける。分岐の処理の n² を直す。`assistant-prompt` の往復の上限の文を消し、24時間の規則を書く。`sample-terms` から欄を消す | 7 欄以外の欄を持つ依頼票の拒否。よみがえり: 新しい締め切りの前なら `DealDecline` が 1 回だけ出ること、締め切りのあとなら何も出ないこと、合意案でよみがえったときも `DealDecline` が出ること、分岐になったときに二重送信にならないこと。実装の上限で止めたときに `limit` になり、不合格にならないこと。中継が遅れたメッセージを先に並べても閉じないこと。遅れたメッセージが当てはめられないこと。締め切りを過ぎた代理人が手を出さないこと。安全弁が N で `DealDecline` を出すこと、`decide` からの手にもかかること。安全弁なしでは完全自動で始めないこと |
| `@ix/verify` | `asOf` を取る。依頼票の 7 欄以外の欄を `schema` で拒否。実装の上限と `limit` の報告。`sentAt` の形。期限内の候補だけを選ぶ。遅れたものを `late` で数え、不合格にしない。手順8と報告の欄。候補を `prevHash` で引く | 代理人と同じイベントと同じ a で同じ結論（`silence`、`closedAt`、`lastHash`）になること。`asOf` がないと閉じたと言わないこと。遅れたメッセージが記録を落とさないこと。遅れた二重送信は今のとおり `chain` が落ちること。`D ≥ J` では `silence` にしないこと |
| `@ix/conformance` | 項目4の「1円離れた範囲」が安全弁の `DealDecline` で終わること。項目6の `note-cannot-reset-rounds` は、名前を残し、中身を「自由文で代理人の安全弁を外させようとしても N は変わらない」に向け替える（D10）。項目5に 24 時間の規則（代理人と中継の時計を別にして）を足す | 範囲の注記（limit）は変えない。項目1と2は `pending` のまま |
| `scripts/`（ブラウザのページ、試しの証拠） | 依頼票の欄、ページの文、証拠の報告に `silence` と `late` | `pnpm check` と、ページの手の試し |

## 7. `ix-standard.md` の更新案（差分。Q12 の後に当てる）

英語の節:

```diff
@@ 6. The negotiation machine
-**Opening.** The poster publishes the job: `jobId`, `sheetId`, `sheetVersion`, `sheetSha256` (the hash of the sheet definition), preset values, `roundLimitPerTerm`, a description, and `expiresAt` [T19, T23]. Each preset term starts as `proposed` by the client.
+**Opening.** The poster publishes the job: `jobId`, `sheetId`, `sheetVersion`, `sheetSha256` (the hash of the sheet definition), preset values, a description, and `expiresAt` [T19, T23, T34]. A job that carries any other field, `roundLimitPerTerm` included, is refused [T34, D10, T35]. Each preset term starts as `proposed` by the client.
@@
-**Messages.** Every message carries `type`, `from`, `sentAt`, `expiresAt`, `prevHash`, and `signature` [T18, T23]. The types are:
+**Messages.** Every message carries `type`, `from`, `sentAt`, `expiresAt`, `prevHash`, and `signature` [T18, T23]. `sentAt` is `YYYY-MM-DDTHH:MM:SS`, an optional fraction of one to three digits, and `Z` or `±HH:MM` (not `-00:00`), and it must be before the message's own `expiresAt` [T33]. The types are:
@@
-**Rounds.** Rounds are counted per term. When a counter would pass `roundLimitPerTerm`, an optional term is dropped and the negotiation continues; a required term ends it as `no_deal` [T18, T18b].
+**No round limit.** The protocol does not count rounds. A negotiation ends only by `DealDecline`, by silence (below), by a human's `reject`, or at the job's expiry [D09, T34]. An agent may stop a fully automatic negotiation with its own setting by sending `DealDecline`; that setting is not part of the protocol [D09, T34].
+
+**Silence.** Let `t(m)` be the instant of `sentAt` in milliseconds and W = 86,400,000. After the applied messages m1..mn, if n ≥ 1 and the phase is `negotiating`, the deadline is D = t(mn) + W; otherwise there is none. A candidate (a message whose `prevHash` is the hash of mn) is late when t(x) ≥ D. Late candidates are never applied and never chosen over a candidate in time. When no candidate in time is left and the reading instant a satisfies a ≥ D and D is before the job's `expiresAt`, the negotiation is `no_deal` with reason `silence`, closed at D. No message closes it. This rule does not apply in `awaiting_approval` [D09, T33].
@@ 7. The hash chain
-- The **anchor** is the hash of the job object [T23]. The verifier hashes the job object exactly as published. The agents hash the job rebuilt from the eight fields they read (`jobId`, `sheetId`, `sheetVersion`, `sheetSha256`, `preset`, `roundLimitPerTerm`, `description`, `expiresAt`). The two anchors agree only when the published job has no other fields.
+- The **anchor** is the hash of the job object [T23]. The verifier hashes the job object exactly as published. The agents hash the job rebuilt from the seven fields they read (`jobId`, `sheetId`, `sheetVersion`, `sheetSha256`, `preset`, `description`, `expiresAt`) [T34]. The two anchors agree only when the published job has no other fields.
@@
-The sender fills in these fields first, then signs. Messages are applied in chain order, not relay order. When two messages point at the same predecessor, the first in relay order continues the chain and the other is a **fork** that is never applied. The sender of a fork plays a move again from the new state [T23, D03].
+The sender fills in these fields first, then signs. Messages are applied in chain order, not relay order. When two messages in time (section 6, Silence) point at the same predecessor, the first in relay order continues the chain and the other is a **fork** that is never applied. A late message is never chosen. The sender of a fork plays a move again from the new state [T23, D03, T33].
@@ 9. Deadlines
+The silence rule (section 6) uses only the `sentAt` values in the chain, not `createdAt` and not any clock, except the reading instant: an agent uses its own clock, and the verifier uses the `asOf` its caller passes. An agent does not send a message at or after the deadline by its own clock; it records the close instead [T33]. If a message dated before the deadline arrives after the agent recorded the close, the agent sends one `DealDecline` when the new deadline has not passed by its own clock, and tells its human [D10, T35].
@@ 10. Replay procedure
-Anyone can check a transcript without trusting a node [D01]. `verifyTermTranscript` takes the job id, the relay events, both agent `did:key` names, both approver `did:key` names, and the relay profile [T25b, T26].
+Anyone can check a transcript without trusting a node [D01]. `verifyTermTranscript` takes the job id, the relay events, both agent `did:key` names, both approver `did:key` names, the relay profile, and an optional `asOf` instant [T25b, T26, T33].
@@
-4. Job event: it must carry a `term-job` record from the client, and there must be only one. Check `sheetSha256` against a known sheet and the preset manifests, then open the session with the anchor set to the hash of the job.
+4. Job event: it must carry a `term-job` record from the client, and there must be only one. A job with any field other than the seven, `roundLimitPerTerm` included, fails `schema` [T34, D10, T35]. Check `sheetSha256` against a known sheet and the preset manifests, then open the session with the anchor set to the hash of the job.
@@
-5. Negotiation event: ... `expiresAt` must be after `createdAt`, and `createdAt` must be before the job's `expiresAt` (`deadlines`). The job must come first (`replay`).
+5. Negotiation event: ... A `sentAt` that is not in the required form, or not before the message's `expiresAt`, fails `schema` [T33]. `expiresAt` must be after `createdAt`, and `createdAt` must be before the job's `expiresAt` (`deadlines`). The job must come first (`replay`).
@@
-6. From the anchor, take the first pending message, in relay order, whose `prevHash` equals the hash of the last applied message. Apply it ...
+6. From the anchor, take the first pending message in time, in relay order, whose `prevHash` equals the hash of the last applied message; late ones are set aside [T33]. Apply it ...
@@
-7. Each leftover message must point at a state in the chain, or `chain` fails. If its sender already sent a message after that state, `chain` fails. Otherwise it must be a valid move from that state, or `chain` fails. The valid ones are counted as `forks`.
+7. Each leftover message must point at a state in the chain, or `chain` fails. If its sender already sent a message after that state, `chain` fails. Otherwise, if it is late for that state, it is counted as `late` and fails nothing [T33]. Otherwise it must be a valid move from that state, or `chain` fails. The valid ones are counted as `forks`.
+8. Compute the silence deadline of the last state. If `asOf` is given and the silence rule closes the negotiation, report phase `no_deal`, reason `silence`, `closedAt`, `lastHash`, and `lastSentAt`. Without `asOf`, report only `silenceDeadline` [T33].
@@
-The report gives pass or fail for `schema`, `issuers`, `replay`, `deadlines`, `chain`, and `signatures`, plus the fork and duplicate counts, and the phase.
+The report gives pass or fail for `schema`, `issuers`, `replay`, `deadlines`, `chain`, and `signatures`, plus the fork, duplicate, and late counts, the silence fields, and the phase [T33]. When the reader stops at an implementation limit (event size, message count, added terms), it reports `limit`, which is neither a pass nor a fail [D10, T35].
```

日本語の節（同じ内容。要所だけ）:

```diff
@@ 6. 交渉の進み方
-**始まり**：依頼する側が依頼票を出します。中身は `jobId`、`sheetId`、`sheetVersion`、`sheetSha256`（項目表の定義のハッシュ）、あらかじめ入れた値、`roundLimitPerTerm`、説明、`expiresAt` です [T19, T23]。
+**始まり**：依頼する側が依頼票を出します。中身は `jobId`、`sheetId`、`sheetVersion`、`sheetSha256`（項目表の定義のハッシュ）、あらかじめ入れた値、説明、`expiresAt` です [T19, T23, T34]。7つ以外の欄（`roundLimitPerTerm` を含む）を持つ依頼票は拒否します [T34, D10, T35]。
@@
-**往復の上限**：往復は項目ごとに数えます。上限を超える対案が来たとき、任意の項目なら外して交渉を続け、必須の項目なら交渉はまとまらずに終わります（`no_deal`） [T18, T18b]。
+**往復の上限はない**：プロトコルは往復を数えません。交渉が終わるのは、`DealDecline`、返事の途絶え（下）、人の `reject`、依頼票の期限のときだけです [D09, T34]。完全に自動の取引では、代理人が自分の設定で `DealDecline` を出して止められます。この設定はプロトコルの決まりではありません [D09, T34]。
+
+**返事の途絶え**：`t(m)` を `sentAt` の一瞬（ミリ秒）、W を 86,400,000 とします。当てはめたメッセージが m1〜mn で、n が1以上、段階が交渉中なら、締め切りは D = t(mn) + W です。それ以外は締め切りがありません。候補（`prevHash` が mn のハッシュのメッセージ）は、t(x) ≥ D なら遅れています。遅れた候補は当てはめず、期限内の候補より先に選びません。期限内の候補がなく、読む一瞬 a が a ≥ D で、D が依頼票の `expiresAt` より前なら、交渉は D の時点で `no_deal`（理由 `silence`）です。閉じる手は要りません。承認待ちにはかけません [D09, T33]。
@@ 7. 指紋の鎖
-  - エージェントは、読み取った8つの欄（`jobId`、`sheetId`、`sheetVersion`、`sheetSha256`、`preset`、`roundLimitPerTerm`、`description`、`expiresAt`）で依頼票を作り直してからハッシュします。
+  - エージェントは、読み取った7つの欄（`jobId`、`sheetId`、`sheetVersion`、`sheetSha256`、`preset`、`description`、`expiresAt`）で依頼票を作り直してからハッシュします [T34]。
@@ 9. 期限
+返事の途絶えの規則（第6節）は、鎖の中の `sentAt` だけを使います。`createdAt` も時計も使いません。例外は読む一瞬で、エージェントは自分の時計を、検証する側は呼び出す側が渡す `asOf` を使います。エージェントは、自分の時計で締め切りちょうど、またはそのあとに、メッセージを出しません。代わりに、閉じた記録を作ります [T33]。閉じたと記録したあとに締め切り前の時刻のメッセージが届いたら、新しい締め切りが自分の時計でまだ来ていなければ `DealDecline` を1回出し、人に知らせます [D10, T35]。
@@ 10. 読み直しの手順
+（英語の節の手順 4〜8 と報告の差分を、同じ内容で足す）
```

## 8. 本文と食い違う点、抜け、危険のまとめ

1. **`sentAt` の形が決まっていない**（抜け）: 今は文字列であることしか確かめません。2.2 で決めました。
2. **遅れたメッセージで記録が落ちる**（危険）: 今の検証は、当てはめに失敗したメッセージで `replay` を落とします。24 時間の規則をそのまま「断る」として入れると、締め切りのあとに1通出すだけで、正直な記録を不合格にできます。2.4 の 4 で、遅れたものは数えるだけにしました。
3. **並べ替えで閉じさせる**（危険）: 中継の順で最初の候補を選ぶと、`id` の付け替えで、遅れたメッセージを正直な返事より先にできます。2.4 の 2 で、期限内のものだけを選ぶようにしました。D03 の狭めなので、人の扉です。
4. **読む側の時計**（食い違いの元）: 「閉じた」を時計なしで言えるのは、閉じない場合（次のメッセージが期限内に来た）だけです。閉じた側は、読む一瞬 a を入力にしました（2.5）。
5. **よみがえり**（限界）: 締め切りのあとに、締め切り前の時刻で出されたメッセージは、遅配と区別できません。待つ側の代理人の扱いを 2.7a で決めました（D10）。
6. **さかのぼらせた時刻**（限界）: 相手の締め切りを早められます。得るものは「理由が `silence` になる」だけです。受領印まで防げません。
7. **本文の古い記述**: `ix-spec-v0.3.md` の「各実装が守るルール」2 と 7、段階の表の理由。第5節で直します。
8. **計算の量**（危険）: 無制限の往復で、検証と代理人の n² の計算が攻撃に使えます。Q12 で直します。
9. **承認待ちの長さ**: 承認待ちは依頼票の期限まで続きます。依頼票の期限が遠いと長くなります。D09 のとおりで、変えません。

## 9. 決まったこと（D10、2026-11-14）

Q11 で出た 10 の問いに、ディレクターが推奨のとおり答えました。どれも第2節から第8節の規則に入れてあります。

1. **最初のメッセージの前には、24 時間をかけない。** 依頼票は掲載されて相手を待つものだからです。上限は依頼票の期限です（2.3）。
2. **検証に読む時刻（`asOf`）が渡されないときは、閉じたと言わない。** 締め切りだけを報告します。中継の記録の中の一番遅い時刻を代わりに使うことはしません（2.5、第3節）。
3. **閉じたと記録したあとに、締め切り前の時刻のメッセージが届いたら、新しい締め切りがまだ来ていなければ、代理人が自動で `DealDecline` を出し、人に知らせる。** 細かな条件は 2.7a です。
4. **`sentAt` が前のメッセージより早いメッセージも、断らない**（2.3）。
5. **依頼票の 7 欄以外の欄は、代理人も検証も拒否する**（2.8、第3節）。
6. **読む側の実装の上限を置く。** プロトコルの決まりにはせず、超えたら不合格とは分けて `limit` と報告します。数は Q12 で提案します（2.11）。
7. **依頼票の期限切れは、不成立の理由（`expired`）にしない。** 今のとおり、期限で止まり、段階はそのままです（2.8）。
8. **交渉の機械の往復の数（`counters`）を消す。** 安全弁の数は、代理人が鎖から数えます（2.8、2.9）。
9. **適合試験の `note-cannot-reset-rounds` は、名前を残し、中身を安全弁に向け替える**（第6節）。
10. **安全弁に、メッセージの総数 M も持たせる**（2.9）。

## 10. 人の扉

次の点は人の扉です（`AGENTS.md`）。自動でマージしません。

- 不成立の理由を足し（`silence`）、減らす（`round_limit`）こと。
- 依頼票の欄を外すこと。依頼票のハッシュ（anchor）の入力が 8 欄から 7 欄に変わること。
- 検証の規則を足すこと（`sentAt` の形、24 時間の規則、`asOf`、`late`）。
- 枝分かれの決まり（D03）を「期限内のものの中で」に狭めること（`prevHash` の規則に触れる）。

D10 は、問いへの答えを決めたもので、この規則の文章を確認したものではありません。Q11 は、ディレクターとセキュリティレビュアーがこの文章を読むことを前提にします（まだ読まれていません）。Q12 は、それに加えて、書いた人とは別の検証役が見ることを前提にします。
