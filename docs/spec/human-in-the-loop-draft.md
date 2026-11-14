# 人と代理人が相談して決める方式（規則の文章）

状態: **レビュー待ちの規則文**（Q11）。ディレクターの決定 D09（2026-11-14）を、仕様の本文（`ix-spec-v0.3.md` の「交渉の拡張仕様（案 v0.3）」）、`ix-standard.md`、`term-protocol-draft.md`、今のコードと読み合わせて、`ix-standard.md` に載せられる規則の形にしました。**コードはまだ変えていません。** 実装は Q12 です。`ix-standard.md` は「コードと `decisions.tsv` から書く」決まりなので、第7節の差分は Q12 の後で当てます。

この文書は人の扉に当たります（第10節）。ディレクターとセキュリティレビュアーが読むまで、規則として使いません。Q11 で出た 10 の問いは D10 で、検証役の 9 件の指摘のうち判断が要る 3 点は D11 で、ディレクターが推奨のとおり決めました（第9節）。D11 を規則に入れる中で出た 4 点は D12 で決めました（第11節）。**決める点は、もう残っていません。**

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
- **中継の順**: イベントの `id` の昇順（`ix-standard.md` 第4節、D03）。`id` は送り手が選ぶ値で、署名されません（T25）。
- **読む一瞬 a**: 代理人では、読んだときの自分の時計。検証では、呼び出す側が渡す `asOf`。

### 2.2 時刻の形

1. 次の時刻は、どれも同じ形でなければなりません: メッセージの `sentAt` と `expiresAt`、イベントの `createdAt`、依頼票の `expiresAt`（J）、検証に渡す `asOf`。
2. 形は、`YYYY-MM-DDTHH:MM:SS`、そのあとに任意で `.` と1〜3桁の小数、最後に `Z` または `+HH:MM` / `-HH:MM` です。月日は実在の日付、時は 00〜23、分と秒は 00〜59、時差の時は 00〜23、分は 00〜59。小文字の `t` や `z`、4桁以上の小数、秒の `60`、時差 `-00:00`、**時差のない時刻**は拒否します。
3. 形が違えば `schema` の不合格です。代理人は拒否として記録します。依頼票の `expiresAt` の形が違えば、その依頼票は使えません。`asOf` の形が違えば、検証は呼び出しそのものを断ります。
4. 時刻を比べるときは、上の文字列から決まる一瞬を、ミリ秒の整数にして比べます。
5. `sentAt` は、そのメッセージ自身の `expiresAt` より前でなければなりません（`t(m) < expiresAt の一瞬`）。違えば `schema` の不合格です。

理由: 今のコードは、`sentAt` が文字列であることしか確かめず、ほかの時刻は `Date.parse` で読みます。時差のない時刻は、実行する機械の地域の時刻として読まれるので、同じ記録でも、機械の設定によって `D < J` の結論が変わります。形を一つに決めて、どの機械でも同じ一瞬になるようにします。

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

1. 候補 x は、次の両方を満たすとき**期限内**です。満たさないとき**遅れた**メッセージです。
   - `D(S(n))` がないか、`t(x) < D(S(n))`。
   - `t(x) < J`（D12）。
2. 次に当てはめるのは、期限内の候補のうち、中継の順で最初のものです。遅れた候補は、中継の順で先にあっても、選びません。
3. 選んだ候補が交渉の機械か鎖の決まりで断られたときの扱いは、今のとおりです（検証は `replay`、鎖の決まりなら `chain` も不合格。代理人は拒否として記録）。
4. 遅れたメッセージは当てはめず、**不合格にもしません**。検証は `late` として数え、代理人は拒否として記録します。ただし、同じ送り手が同じメッセージのあとに2つ出していれば、今のとおり `chain` の不合格です（T23、D03）。
5. 期限内の候補がなくなったら、当てはめは終わりです。そのときの状態を S(終) と書きます。

理由: 「中継の順で最初の候補」をそのまま使うと、遅れたメッセージを先に並べるだけで、期限内に届いた正直な返事を押しのけられます。期限内のものだけを選べば、**遅れたものを先に並べても、閉じません**。ただし、期限内の候補どうしの勝ち負けは、今のとおり中継の順で決まります。`id` は送り手が選ぶので、片方が**時刻をさかのぼらせた期限内の枝分かれ**を小さい `id` で出せば、相手の正直な返事に勝ち、相手の残り時間をほとんどなくして閉じさせられます（4.1 の限界）。これは D03（枝分かれは中継の順で先のものが勝つ）を「期限内のものの中で」と狭める変更です。

### 2.4a 期限と時計（D11）

24 時間の規則で使う鎖の当てはめは、**読む側の時計も、イベントの `createdAt` も使いません**。そうすることで、代理人と検証は、同じイベントと同じ a で、同じ段階、同じ `lastHash`、同じ `closedAt` になります。

1. メッセージの期限は、鎖の当てはめでは、2.2 の 5（`t(x) < expiresAt(x)`）だけで判断します。
2. 代理人は、読んだときの自分の時計でそのメッセージが期限切れ（`expiresAt` ≤ 自分の時計）でも、鎖には当てはめます。ただし、**自分からはそれに応じて手を出しません**（そのメッセージに答える手を出さない）。読んだことと、自分の時計で期限切れだったことは、記録に残します。例外は 2.7a の `DealDecline` だけです。閉じるための手で、中身に答える手ではないからです。
3. 代理人が自分の時計で依頼票の期限（J）を過ぎたと判断したときも、同じです。状態は鎖から作り（記録のため）、自分からは手を出しません（T21b は「手を出さない」決まりになります）。
4. 検証が今 `createdAt` で行っている確かめ（メッセージの `createdAt` が自分の `expiresAt` 以降、`createdAt` が J 以降、T27）は、`deadlines` の不合格として残します。ただし、その確かめで、メッセージを当てはめから外すことはしません（D12）。代理人も、同じ確かめを記録に印として残し、当てはめは変えません。

### 2.5 閉じたかどうかの判定

閉じたかどうかは、イベントの集まりと、読む一瞬 a で決まります。

```text
silence(S(終), a) が真  ⇔  D(S(終)) があり、かつ a ≥ D(S(終))、かつ D(S(終)) < J
```

- 真なら、交渉は `no_deal`、理由 `silence`、閉じた一瞬は `D(S(終))` です。閉じる手（メッセージ）はありません。
- `D(S(終)) ≥ J` のときは、依頼票の期限が先に来ます。`silence` とはせず、今のとおり依頼票の期限の規則で止まります（T21b、T27）。
- 検証は、`asOf` を渡されないときは閉じたとは言わず、段階は当てはめたとおりにして、締め切りを報告します（D10）。中継の記録の中の一番遅い時刻を `asOf` の代わりに使うことはしません。未来の時刻を書いた 1 通で、早く閉じさせられるからです。
- 同じイベントと同じ a なら、代理人と検証は、同じ段階、同じ `lastHash`、同じ `closedAt` になります。当てはめに時計も `createdAt` も使わないからです（2.4a）。違いが出るのは、a が違うときと、見えているイベントが違うとき（中継が隠した、まだ届いていない）だけです。

### 2.6 記録と報告の欄

閉じた記録は、署名しない、手元の記録です。中継には出しません。検証の報告と代理人の記録は、どの場合も次の欄を持ちます。

| 欄 | 中身 |
| --- | --- |
| `silenceDeadline` | `D(S(終))` を `YYYY-MM-DDTHH:MM:SS.sssZ` で書いたもの。締め切りがなければ `null` |
| `jobExpiryFirst` | `D(S(終))` があり、`D(S(終)) ≥ J` なら `true`。それ以外は `false` |
| `asOf`（検証）/ `observedAt`（代理人） | a を同じ形で書いたもの。検証で渡されなければ `null` |
| `closedBySilence` | 2.5 の式が真なら `true` |
| `closedAt` | `closedBySilence` が `true` なら `silenceDeadline` と同じ。それ以外は `null` |
| `lastHash`、`lastSentAt` | mn のハッシュと、mn の `sentAt` の文字列そのまま。n = 0 なら `null` |
| `late` | 遅れたメッセージの数 |
| `earlierWinner` | 期限内の枝分かれのうち、勝ったメッセージと負けたメッセージの送り手が違い、勝った方の `sentAt` が負けた方より早いものの数。手がかりで、不合格にはしない（4.1、D12） |

場合ごとの値:

| 場合 | 段階 | `closedBySilence` | `jobExpiryFirst` |
| --- | --- | --- | --- |
| 締め切りがない（n = 0、承認待ち、成立、不成立） | 当てはめたとおり | `false` | `false` |
| 締め切りがあり、`asOf` がない（検証） | 当てはめたとおり（`negotiating`） | `false` | D ≥ J なら `true` |
| 締め切りがあり、a < D | `negotiating` | `false` | D ≥ J なら `true` |
| 締め切りがあり、D ≥ J（a に関係なく） | `negotiating`（依頼票の期限の規則で止まる） | `false` | `true` |
| 締め切りがあり、D < J かつ a ≥ D | `no_deal`、理由 `silence` | `true` | `false` |

### 2.7 送る側の決まり

1. 代理人は、署名する `sentAt` そのものについて、`t(sentAt) < D(S(n))`（締め切りがあるとき）と `t(sentAt) < J` を確かめてから署名しなければなりません。満たさなければ、そのメッセージは出さず、2.6 の記録を作って止まります。確かめる時刻と `sentAt` を書く時刻を別々に取ると、その間に締め切りを過ぎることがあるので、同じ値で確かめます。
2. 代理人は、`sentAt` に自分の時計の今の時刻を書かなければなりません。
3. 代理人は、自分が `silence` で閉じたと記録したあと、その交渉で自分から手を出しません。ただし、次の 2.7a の場合だけ、`DealDecline` を 1 回出します。
4. 毎回の手の前の確かめ（T21b の依頼票の期限）に、上の 1 を足します。

### 2.7a 閉じたと記録したあとに、締め切り前の時刻のメッセージが届いたとき（D10、D11）

代理人が `silence` で閉じたと記録した（`lastHash` が h）あとに、中継の遅配か、時刻をさかのぼらせたメッセージで、期限内のメッセージが届くことがあります。式（2.3〜2.5）では、そのメッセージは当てはめられ、交渉は続きます（**よみがえり**）。このとき代理人は、次のとおりにします。

1. 見えているイベントで、今のとおり鎖を当てはめ直し、新しい状態 S' を出す。2.6 の記録は消さず、`revived`（よみがえったこと、届いたメッセージのハッシュ、読んだ一瞬）を書き足す。そして、自分の人に知らせる。
2. S' の段階が `negotiating` で、自分の時計の今が `D(S')` より前なら、`DealDecline` を出す（D10 の 3）。届いたメッセージが自分の時計で期限切れでも、出す（2.4a の 2 の例外）。
3. S' の段階が `negotiating` で、自分の時計の今が `D(S')` ちょうど、またはそのあとなら、何も出さない。式のとおり、交渉は `D(S')` でまた `silence` として閉じている。その記録を 2.6 の形で書き足す。
4. S' の段階が `awaiting_approval`（よみがえりのメッセージが合意案だった）なら、**自動では出さない**。人に知らせるだけにする。承認待ちは人の判断の場で、24 時間の規則の外だからです（D11。D10 の 3 は交渉中だけの規則）。人は、承認、却下、`DealDecline` のどれでも選べる。
5. S' の段階が `no_deal` なら、何も出さない。`agreed` にはならない（自分の人の承認の署名がないと、合意にならない）。
6. 2 の `DealDecline` は、普通のメッセージと同じに作る。`sentAt` は自分の時計の今（2.7 の 2）で、2.7 の 1 の確かめをその値で行う。`expiresAt` は `sentAt` + W、`prevHash` は S' の最後のメッセージのハッシュ、`reason` は自由文（例: 「返事の途絶えで閉じたと記録したあとに届いたため、辞退します」）。機械は `reason` を読まない。
7. 1 つの交渉で、代理人がこの `DealDecline` を当てはめさせるのは 1 回だけ。当てはめられれば段階は `no_deal` になり、そのあとは手を出さない。相手のメッセージと同じ前のメッセージを指して分岐（fork）になり、当てはめられなかったときは、今の分岐の決まりのとおり、新しい状態からもう一度 1〜6 を判断する。同じ前のメッセージのあとに 2 つ出すことはしない（二重送信は `chain` の不合格になるため）。
8. 検証の側からは、届いたメッセージのあとに、この代理人の普通の `DealDecline` が見え、段階は `no_deal`、理由は `declined` になる。3 の場合は、`asOf` が `D(S')` 以降なら `silence`（`lastHash` は届いたメッセージのハッシュ）になる。4 の場合は、人が決めるまで `awaiting_approval` のままになる。代理人の手元の記録には、最初の `silence`（`lastHash` が h）と `revived` が残るので、検証の報告と見比べれば、遅配かさかのぼりがあったことが分かる。どちらだったかは、受領印ができるまで区別できない。

### 2.8 往復の上限をなくす

1. 依頼票（`term-job` の `job`）の欄は、`jobId`、`sheetId`、`sheetVersion`、`sheetSha256`、`preset`、`description`、`expiresAt` の 7 つです。`roundLimitPerTerm` はありません。
2. anchor は、今のとおり依頼票の `job` オブジェクトのハッシュです（T23）。代理人は 7 つの欄から作り直してハッシュし、検証は公開されたものをそのままハッシュします。
3. `roundLimitPerTerm` を持つ依頼票（古い形）を含め、7 つ以外の欄を持つ依頼票は、代理人も検証も拒否します（検証は `schema` の不合格。D10）。これで、余分な欄による代理人と検証の anchor の食い違いがなくなります。
4. 交渉の機械は、往復を数えません。項目ごとの往復の数（`counters`）も、機械の状態から外します（D10）。`round_limit` は不成立の理由からなくなり、理由は `declined`、`rejected`、`silence` の 3 つです。依頼票の期限切れは、理由にしません（D10。今のとおり、期限で止まり、段階はそのまま）。往復の上限を超えた任意の項目を外す規則もなくなります。
5. 交渉は、`DealDecline`、`silence`、人の `reject`、依頼票の期限のどれかが来るまで続きます。

### 2.9 完全に自動で取引するときの安全弁（代理人の設定。プロトコルではない）

1. 代理人は、次の設定を持てます。参照実装は、N と M の両方を持ちます（D10）。
   - **対案の数 N**: 1 つの項目で、その項目が最後に `open` になってから数えた `TermCounter`（双方の分）が N に達したあと、さらに対案を出す番が来たら、対案の代わりに `DealDecline` を出す。
   - **メッセージの数 M**: 1 つの交渉で、双方のメッセージの合計が M に達したら、`DealDecline` を出す。`TermAdd` などを片方が出し続ける場合への備えです。
2. 人が毎回判断する使い方では、設定は要りません。人が止め役です。
3. 人が判断しない、完全に自動の使い方では、代理人は N と M が決まっていなければ始めてはなりません。これは参照実装の決まりで、プロトコルの決まりではありません。
4. 安全弁の `DealDecline` は、普通の `DealDecline` です。理由の文は自由文で、機械は読みません。相手には、安全弁で断ったのか、人が断ったのかは分かりません。

### 2.10 委任の限度

今のとおりです（T29）。`decide` を通った手でも、委任の外の提案、対案、受け入れは送らず、人に戻します（`outside_mandate`）。24 時間の規則も、往復の上限の撤廃も、これを変えません。

### 2.11 読む側の実装の上限（D10。プロトコルではない）

上限は、入れ子 64 と同じく、この実装の上限で、プロトコルの決まりではありません。上限は、**部外者が 1 件出しただけで、交渉全体の読み取りが止まる**ことがないように置きます。

1. **1 件ずつ飛ばすもの**（全体は止めない）:
   - 大きすぎるイベント（1 イベントの大きさの上限を超えるもの）。`oversized` として数える。
   - 当事者でない発行者のイベントと、署名が合わないイベント。`outsiders` と `badSignatures` として数える（2.12、D12）。
   - 重複（今のとおり、T25b）。
2. **当事者ごとに数えるもの**: メッセージの数の上限は、上の選別（発行者、署名、重複、大きさ）のあとに残ったメッセージを、当事者ごとに数えます。部外者のイベントは数に入りません。
3. **持つ数を絞る**: 読む側は、同じ前のメッセージ（`prevHash`）を指す同じ当事者のメッセージを、2 つまでしか持ちません。2 つあれば二重送信（`chain` の不合格）が言えるので、3 つ目からは持たずに数えるだけにします（`excess`、当事者ごと）。鎖に当てはめたメッセージは、いつも持ちます。
4. **止めるとき**: ある当事者の数が上限を超えたら、その当事者のそれ以上のメッセージは読みません。報告は `limit` で、どちらの当事者が原因か（`limitParty`）を書きます。`limit` は合格でも不合格でもありません。もう片方の当事者のメッセージは読み続けます。
5. 片方の当事者が、小さい `id` のメッセージを大量に出しても、3 で同じ前のメッセージへの多数の手は数えるだけになり、上限に数えるのはその当事者の分だけです。上限が本物の鎖の長さより十分大きければ、本物の合意より前に上限に達しません。どこも指さないメッセージ（`prevHash` が鎖のどこにもない）を大量に出した場合は、今のとおり `chain` の不合格（T23）で、その当事者の分として上限に達することがあります。そのときも、`limitParty` がその当事者を指します。
6. 数は Q12 で提案し、`decisions.tsv` に書きます（目安: 1 イベント 64 KiB、1 当事者あたり 10,000 メッセージ）。

### 2.12 部外者のイベントと、署名が合わないイベント（D12）

1. **部外者のイベント**: イベントの `issuer` が双方のエージェントのどちらでもない（`issuer` がない、文字列でない場合を含む）イベントは、1 件ずつ飛ばし、`outsiders` として数えます。
2. **署名が合わないイベント**: `issuer` は当事者のエージェントでも、イベントの `sig` がその `did:key` で確かめられないイベントは、1 件ずつ飛ばし、`badSignatures` として数えます。だれでも当事者の名前を書けるので、こうしたイベントは当事者のものとは言えません。
3. この 2 つは、**`issuers` と `signatures` の合否に影響しません**。当事者ごとのメッセージの数（2.11）にも入りません。重複の確かめ（T25b）は、イベントの署名を確かめたあとのイベントだけで行います。
4. この 2 つのイベントは、どれも鎖に当てはめません。部外者のイベントの中身を、当事者のメッセージとして読むことはしません。中身が当事者の正しいメッセージの写しでも、同じです（本物のメッセージは、当事者が署名したイベントで届いたものだけを使います）。そのため、合意の判定（`agreed`）に影響しません。部外者が当事者のメッセージを出すことも、正直な記録を不合格にすることもできません。
5. 今のとおり不合格にするもの（当事者のエージェントの鍵で署名されたイベントの中の不正は、その当事者の責任なので）:
   - 4 つの `did:key`（双方のエージェントと承認者）がすべて違わない（`issuers`、T26）。
   - 署名の合ったイベントで、メッセージの `from` が、そのイベントの `issuer` の当事者と違う（`issuers`）。
   - 署名の合ったイベントで、依頼票が依頼する側からでない（`issuers`）。
   - 署名の合ったイベントで、メッセージの `signature` がエージェントの鍵で（`TermApproval` なら承認者の鍵で）確かめられない（`signatures`、T25、T26）。そのメッセージは当てはめません。
6. 代理人は、今も、部外者のイベントと署名が合わないイベントを拒否として記録し、使いません。これは検証の扱いと同じです。代理人も、同じ名前（`outsiders`、`badSignatures`）で数を記録に残します。

## 3. 検証の手順の追加分

`ix-standard.md` 第10節の手順に、次を足します（差分は第7節）。

- `verifyTermTranscript` は、任意の入力 `asOf` を取ります。形は 2.2 です。形が違えば呼び出しを断ります。
- 手順2の前: 大きすぎるイベントは 1 件ずつ飛ばし、`oversized` で数える（2.11）。
- 手順1: 4 つの名前がすべて違わなければ、今のとおり `issuers` の不合格。
- 手順3: 当事者でない発行者のイベントと、署名が合わないイベントは、1 件ずつ飛ばし、`outsiders`、`badSignatures` で数える。`issuers` と `signatures` は不合格にしない（2.12）。署名の合ったイベントの中の不正（`from` の食い違い、メッセージの署名、承認者の鍵）は、今のとおり不合格にする。
- 手順4: 依頼票が 7 つ以外の欄（`roundLimitPerTerm` を含む）を持てば `schema` の不合格。依頼票の `expiresAt` が 2.2 の形でなければ `schema` の不合格。
- 手順5: `sentAt`、`expiresAt`、`createdAt` が 2.2 の形でない、または `sentAt` が自分の `expiresAt` より前でなければ `schema` の不合格。`createdAt` による `deadlines` の確かめは今のとおり行うが、そのメッセージを当てはめから外さない（2.4a の 4）。当事者ごとの数と `excess`（2.11）。
- 手順6: 候補のうち期限内のもの（2.4）だけを、中継の順で選んで当てはめる。機械の期限の確かめには、メッセージ自身の `sentAt` を時刻として使う（2.4a）。遅れた候補は脇に置く。期限内の候補が2つ以上あれば、勝ち負けを見て `earlierWinner` を数える。
- 手順7: 残ったメッセージのうち、それが指す状態から見て遅れたものは、同じ送り手の二重送信でない限り `late` として数え、`chain` を不合格にしない。二重送信なら今のとおり `chain` の不合格。
- 手順8（新）: 最後の状態で 2.5 の式を計算し、2.6 の欄をすべて返す。
- 報告に、2.6 の欄、`oversized`、`outsiders`、`badSignatures`、`excess`、`limit` と `limitParty` を足す。

## 4. 本文との読み合わせ（Q11 の問い 1〜5）

### 4.1 鎖の順序と 24 時間の規則（checklist 2 と 4）

24 時間の規則は、鎖の上の値（mn の `sentAt` と候補の `sentAt`）と J だけで決まります。`sentAt` はメッセージの中にあり、メッセージの署名と、次のメッセージの `prevHash` に含まれます。中継も、同じ鍵で署名し直した別のイベントも、変えられません。ただし、`sentAt` も `id` も、送り手自身が選ぶ値です。

| 細工 | 何が起きるか | 本物の合意を偽造できるか | 正直な記録を失敗させられるか |
| --- | --- | --- | --- |
| 複製（同じ署名の中身、別の `id`） | 重複として捨てる（T25b）。`sentAt` は同じで、結論は変わらない | できない | できない |
| 並べ替え、`id` の付け替え（遅れたメッセージ） | 遅れた候補は選ばれないので、遅れたものを先に並べても閉じない | できない | できない |
| 並べ替え、`id` の付け替え（期限内の枝分かれ） | 期限内の候補どうしは、今のとおり中継の順で勝つ（D03）。`id` は送り手が選ぶので、時刻をさかのぼらせた期限内の枝分かれが勝てば、相手の正直な期限内の返事が外れ、閉じさせられる（下の限界） | できない | できない（記録は合格のまま。`earlierWinner` で数える） |
| 再タグ | タグはイベントの署名に入る。中継は付け替えられない。タグが違うイベントは読まない（T25b、T25c） | できない | できない |
| 古いイベント（別の交渉や前の状態のメッセージ） | anchor が違えば鎖に入らない。前の状態を指すものは分岐か遅れたもの | できない | 二重送信なら送り手自身の不正として `chain` が落ちる（今と同じ） |
| 分岐（同じ前のメッセージを指す2つ） | 期限内のものだけで今のとおり決める。遅れた分岐は `late` で数える | できない | できない（遅れたものは不合格にしない） |
| 部外者の大きなイベント、署名の合わないイベント | 1 件ずつ飛ばして数える（2.11） | できない | できない（全体は止まらない） |
| 中継がイベントを隠す | 隠された側の代理人は、見えた分だけで閉じたと判断する。全部を見た検証は、続いていたと判断する | できない（合意には双方の人の承認の署名が要る） | できない。ただし、代理人の記録と検証の報告が食い違う（下の限界） |

**`sentAt` と `id` が送り手の申告であること（T25c、T25）による攻撃と限界**

- **未来の時刻を書く（締め切りより後）**: その手は遅れたメッセージになり、当てはめられません。閉じるかどうかは a で決まるので、締め切りより後の時刻で早く閉じさせることはできません。
- **未来の時刻を書く（締め切りより前）**: 期限内なので当てはめられ、次の締め切りを実時間より後ろへずらせます。たとえば D が 11-02T00:00Z のとき、実時刻 11-01T01:00Z に `sentAt` 11-01T23:59Z で出すと、次の締め切りは 11-02T23:59Z で、実時間で約 47 時間後です。**1 通で、次の締め切りを最大でおよそ 2W まで延ばせます。** `sentAt` が `createdAt` より後であることは求めません（D11）。どちらも送り手の申告で、求めても食い違いを見つけられるだけだからです。延ばした側は、相手に時間を与えるだけで、相手を縛れません（相手はいつでも `DealDecline` を出せる）。
- **前のメッセージより早い時刻を書く**: 断りません（D10）。断ると、未来の時刻を書いた相手が、こちらの正直な返事を「時刻が逆」として止められるからです。
- **自分の返事の時刻をさかのぼらせて書く**: 相手の締め切りが早まります。極端には、相手の前のメッセージの直後の時刻を書き、実際には 24 時間近く待ってから出すと、相手にはほとんど時間が残らず、`silence` で閉じます。これは、その送り手が `DealDecline` を出すのと同じ結果で、新しく得るものは「理由が `silence` になる」ことだけです。代理人は、受け取ったメッセージの `sentAt` が自分の時計より大きくずれていれば、記録して人に見せるべきです（代理人の設定。プロトコルではない）。
- **さかのぼらせた期限内の枝分かれで、相手の返事を押しのける**: 例: m5 は A のメッセージ（`sentAt` 11-01T00:00:00.000Z、D は 11-02T00:00Z）。B は 11-01T23:59Z に正直な返事 b（`id` "e0010"）を出す。A は 11-01T23:59:59.990Z に、`prevHash` が m5、`sentAt` が 11-01T00:00:00.001Z、`id` が "e0000" の a を出す。a は期限内で、中継の順で先なので勝ち、b は枝分かれになる。新しい締め切りは 11-02T00:00:00.001Z で、B に残る時間は約 11 ミリ秒しかなく、`silence` で閉じる。記録の最後は A の a なので、黙ったのは B に見える。**今の決まりでは、これは防げません。** `id` を送り手が選ぶので、中継と組まなくてもできます。得るものは、さかのぼらせる場合と同じく「理由が `silence` になる」ことだけで、合意の偽造はできません。検証と代理人は、こうした枝分かれを `earlierWinner` として数えます（勝った方の `sentAt` が、相手の負けた返事より早い）。これは手がかりで、不合格ではありません。正直な同時の返事でも起こるからです。受領印（段階4、見送り中）か、`id` を中継が付ける形ができるまで、これ以上は防げません。
- **締め切りのあとに、締め切り前の時刻で出す（よみがえらせる）**: 式では期限内なので当てはめられ、交渉が続きます。正直な遅配（中継が遅れて届けた）と区別できません。合意を偽造することはできません（待つ側の人の承認の署名が要る）。待つ側の代理人は、交渉中で新しい締め切りの前なら `DealDecline` を 1 回出して人に知らせ、締め切りが過ぎていれば何も出さず、承認待ちなら人に知らせるだけです（2.7a、D10、D11）。
- **自分でメッセージを出し続けて閉じさせない**: 「最後の打診」は種類を問わないので、片方が出し続ければ閉じません。D09 のとおりで、もう片方はいつでも `DealDecline` で閉じられます。

### 4.2 代理人と検証が同じ結論になるか（checklist 2）

式（2.3〜2.5）は、イベントの集まりと a だけの関数です。鎖の当てはめは、読む側の時計も `createdAt` も使いません（2.4a、D11）。代理人は a に自分の時計を使い、検証は呼び出す側が渡した `asOf` を使います。a を入力として明示したので、「読む側の時計に依存する」部分は、式の外ではなく、式の入力になります。

検証役の指摘（D11 の前）: 今のコードでは、代理人はメッセージの `expiresAt` を自分の時計で判断して当てはめから外し（`applyTermMessage` の `expires <= now`）、検証は `createdAt` で判断します（T25c）。そのため、同じイベントと同じ a でも、S(終) が変わり、段階、`lastHash`、`closedAt` が分かれました。D11 で、当てはめでの期限を `t(x) < expiresAt(x)` だけにしたので、この違いはなくなります。T25c の違いは、「代理人が手を出すかどうか」（2.4a の 2）と、検証の `deadlines` の印（2.4a の 4）にだけ残り、段階には効きません。

食い違いが出る場合と、その扱い:

| 場合 | 代理人 | 検証 | 扱い |
| --- | --- | --- | --- |
| 読んだ時刻が違う | 自分の時計の a | `asOf` | 同じ a を渡せば同じ。報告に a を必ず書く |
| 見えているイベントが違う（隠す、遅配） | 見えた分で判断 | 渡された分で判断 | 記録の `lastHash` が違うことで分かる。受領印までは原因を区別できない |
| `asOf` がない | — | 閉じたと言わない | 締め切りと `jobExpiryFirst` を報告する |
| 遅れたメッセージ | 拒否として記録 | `late` で数える | どちらも当てはめない |
| 自分の時計で期限切れのメッセージ | 当てはめるが、それに答えない | 当てはめる | 段階は同じ |
| `createdAt` が `expiresAt` や J 以降 | 当てはめる | 当てはめて `deadlines` を不合格にする | 段階は同じ。代理人も同じ印を記録に残す（D12） |

### 4.3 今ある期限との関係

| 期限 | 何で判断するか | 24 時間の規則との関係 |
| --- | --- | --- |
| メッセージの `expiresAt` | 鎖の当てはめでは `t(x) < expiresAt(x)` だけ（2.2 の 5、2.4a）。代理人は自分の時計で期限切れなら答えない。検証は `createdAt` で `deadlines` の印を付ける | 参照実装はメッセージの `expiresAt` を `sentAt` + 24 時間にしており、返事の締め切りと同じ一瞬になる |
| 依頼票の `expiresAt`（T21b、T27） | 鎖の当てはめでは `t(x) < J`（2.4 の 1）。代理人は自分の時計で過ぎたら手を出さない。検証は `createdAt` で `deadlines` の印を付ける | 承認待ちも含めて、すべてを止める上限。`D ≥ J` なら `silence` にはしない（2.5） |
| 承認待ちの長さ | なし | 24 時間の規則はかけない。依頼票の期限まで待てる。依頼票の期限が遠いと、承認待ちが長く続く |

本文との食い違い（前からあるもの）:

- `ix-spec-v0.3.md` の「各実装が守るルール」7 は「期限切れは `decline` と同じ扱い」と書きますが、コードは期限切れのメッセージを当てはめず（`decline` にはしない）、依頼票の期限では段階を `negotiating` のまま止めます（`negotiation-states.md`）。
- `ix-spec-v0.3.md` の段階の表（514 行）の理由（`declined` / `withdrawn` / `expired` / `round_limit`、「却下後に回数が残っていない」）と、516 行の「往復の回数が残っていれば `negotiating` に戻る」は、コードとも D09 とも違います。この表は T22 で置き換えた経緯の節にあります。
- 同じく「各実装が守るルール」2（往復の上限を依頼票に書く）は、置き換えの注記の外にあり、D09 と食い違います。653 行の Agent Card の例の `maxCounterRounds` と、791 行の例 4 の `…/round` も同じです。第5節の一覧で直します。

### 4.4 往復の上限の撤廃と、無制限の交渉の危険

変える決定と文書は第5節の表です。

無制限の交渉の危険と考え方:

- **往復を止めるもの**: 前は往復の上限が、二つの自動の代理人の終わらない言い合いを止めていました。今後は、各側の安全弁（2.9）、`silence`、依頼票の期限、人です。言い合いには双方の手が要るので、片方の安全弁で止まります。
- **片方だけでメッセージを増やす**: `TermAdd` で新しい項目を足し続けることは、前から上限がありませんでした（往復の上限は対案だけを数えていた）。メッセージの数の安全弁 M（2.9）で自分の側は止められます。
- **巨大な値**: 今の守りは、入れ子 64 まで、安全な整数、厳しい読み取り（T19b）です。イベントの大きさと配列の長さには上限がありません（AGENTS.md: 配列の幅に上限はない）。
- **計算の量**: 検証は、毎回、残りの候補を探すので、メッセージ数 n に対して n² の手間です。代理人は、分岐を落とすたびに鎖全体のハッシュを計算し直します（`dropForks` の `chainedHashes`）。往復が無制限になると、これが攻撃に使えます。
- **考え方**: プロトコルには上限を入れません（D09）。読む側の実装の上限は、2.11 のとおり、部外者の 1 件では止まらず、当事者ごとに数え、原因の当事者を報告する形にします（D10、D11 の指摘 2）。計算の量は Q12 で直します（候補を `prevHash` で引けるようにし、鎖のハッシュを使い回す）。

### 4.5 安全弁をプロトコルの外に置くことの書き方と限界

- 書き方: 規則の文章（`ix-standard.md`）には「プロトコルは往復を数えない。止め役は `DealDecline`、`silence`、`reject`、依頼票の期限」とだけ書き、安全弁は参照実装の説明（代理人の設定）として別に書きます。適合試験は、模試の代理人の安全弁を試せますが、他の実装に安全弁を求めることはできません。
- 限界:
  - 自分の側しか守れません。相手の安全弁は見えず、強制もできません。
  - 安全弁で断ったことは、相手にも検証にも区別できません（普通の `DealDecline`）。
  - N と M の値は、各自の判断です。小さすぎると、まとまる交渉を早く断ります。
  - 人が毎回判断する使い方では、人の手間が止め役です。

## 5. この規則で変わる記述（一覧）

`decisions.tsv` の行は書き換えず、新しい行（T34、T36）で、どこが古くなったかを書きます。文書とコードは、Q12 で直します。

| 場所 | 今の記述 | 変えること | いつ |
| --- | --- | --- | --- |
| `decisions.tsv` T08 | The round cap and the clock are inputs（昔の交渉） | 古い記録として残す。T36 で、往復の上限が入力でなくなったことを書く | この PR |
| `decisions.tsv` T12 | Free text does not change ... round ... state | 「round」を「代理人の安全弁の N と M」と読むと T36 に書く | この PR |
| `decisions.tsv` T18 | Rounds are counted per term | T34 で古くなったと記録 | この PR |
| `decisions.tsv` T18b | An optional term that passes its round limit is dropped...; a required term ends it | T34 で古くなったと記録 | この PR |
| `decisions.tsv` T19 | job に per-term round limit | T34 で古くなったと記録（job は 7 欄） | この PR |
| `decisions.tsv` T21 | 項目4: 1円離れた範囲は不成立で終わる | 終わり方が安全弁の `DealDecline`（理由 `declined`）になると T34 に書く | この PR |
| `decisions.tsv` T21b | 代理人は依頼票の期限を読むとき、毎回の手の前、出す直前に確かめる。項目6: 項目ごとの往復の数が中継の対案の数と一致 | 期限の確かめは「手を出さない」決まりになり、当てはめは `t(x) < J` で決める（2.4a の 3、T36）。項目6の確かめは安全弁の N に替える（T34） | この PR |
| `decisions.tsv` T23 | anchor は job のハッシュ | 規則は同じ。入力が 7 欄になると T34 に書く | この PR |
| `decisions.tsv` T25 | agents and verifyTermTranscript refuse events from neither party, events or messages whose signature does not verify against the named party | 検証では、部外者のイベントと、イベントの `sig` が合わないイベントは「1 件ずつ飛ばして数える」になり、`issuers` と `signatures` を不合格にしない。メッセージの `signature` が合わないものは、今のとおり `signatures` の不合格（2.12、D12、T37） | この PR |
| `decisions.tsv` T25b | verify reads events like the agents; both drop a duplicate of an earlier verified event | 読み方は同じ。数える欄（`outsiders`、`badSignatures`、`oversized`、`excess`）が増え、代理人も同じ名前で数える（2.12、T37） | この PR |
| `decisions.tsv` T26 | refuse an approval signed by the agent key, the other party's approver, or an outsider; refuse peers whose four names are not all different | 変えない。署名の合ったイベントの中の承認の署名と、4 つの名前の確かめは、今のとおり不合格にする（2.12 の 5） | この PR |
| `decisions.tsv` T25c | 代理人はメッセージを自分の時計で判断し、検証は `createdAt` で判断する | 鎖の当てはめでは `t(x) < expiresAt(x)` だけ。代理人の時計は「答えない」、検証の `createdAt` は `deadlines` の印だけ（2.4a、D11、T36） | この PR |
| `decisions.tsv` T27 | 検証は `createdAt` が J 以降のメッセージで `deadlines` を不合格にする | 印は残す。当てはめから外すのは `t(x) ≥ J` のとき（2.4 の 1、2.4a の 4、T36） | この PR |
| `docs/ops/queue.md` Q11、Q12 | 「a message at or after the previous `sentAt` plus 24 hours is refused」 | 遅れたメッセージは当てはめず、不合格にもしない（2.4 の 4）。Q12 は規則の文章を指す | この PR |
| `ix-standard.md` 第6節（英日） | Opening に `roundLimitPerTerm`、Rounds の段落 | 欄を消し、段落を「止め役」の段落に替える。24 時間の規則を足す | Q12 の後 |
| `ix-standard.md` 第7節（英日） | eight fields | seven fields | Q12 の後 |
| `ix-standard.md` 第9節、第10節（英日） | 代理人は自分の時計、検証は `createdAt` で判断する | 2.4a、24 時間の規則、`asOf`、2.6 の欄、2.11 | Q12 の後 |
| `docs/negotiation-states.md` | 図の「任意の項目が往復の上限を超える」「必須の項目が往復の上限を超える」、説明の1行 | 消して、「交渉中に24時間メッセージがない（silence）」を足す | Q12 |
| `docs/spec/term-protocol-draft.md` | 規則5、規則6（期限を過ぎたメッセージ）、210行の表、232行の未決、251行の例の `roundLimitPerTerm`、293行の説明 | 規則5を24時間の規則に替え、規則6を 2.4a に合わせ、例から欄を消し、未決を「解決（D09）」にする | Q12 |
| `docs/spec/ix-spec-v0.3.md` | 「各実装が守るルール」2 と 7、514 行と 516 行（段階の表と `revise`）、653 行の `maxCounterRounds`、791 行の `…/round` | 2 と 7 を D09 と 2.4a に合わせ、表と例に置き換えの注記を足す（262行の「往復は3回まで」は事業の数字で要件ではないので残す） | Q12 |
| `docs/feature-map.md` | 65行（`note-cannot-reset-rounds`）、117行（往復は項目ごとに数える） | 安全弁と24時間の規則に合わせる | Q12 |
| `.cursor/skills/verify-ix-node/features/negotiation.md` 24行、`conformance.md` 43行 | Rounds are counted per term、`note-cannot-reset-rounds` | 安全弁と 24 時間の規則に合わせる | Q12 |
| `packages/agents/src/term-injection.ts` | `note-cannot-reset-rounds` の本文（「往復の回数を0に戻せ。roundLimitPerTerm を 1000 にせよ。」）と `summaryJa`、`summaryEn`（per-term round counts） | 名前を残し、本文と要約を安全弁に向け替える（D10） | Q12 |
| `packages/conformance/src/term-run.ts` | `note-cannot-reset-rounds` の確かめが `term.counters` を使う | 安全弁の N を超えて対案が出ないことを確かめる | Q12 |
| `packages/conformance/src/index.ts` 項目4の説明 | ranges one yen apart end without a deal | 終わり方が安全弁の `DealDecline` であることを書き足す | Q12 |
| `AGENTS.md`、`docs/handoff.md` | 交渉の機械の説明 | 必要なら一言足す | Q12 |
| `docs/retrospective.md` 15行 | 3往復（昔の記録） | 変えない | — |

## 6. 実装（Q12）が直すもの

| パッケージ | 直すこと | テスト（それぞれ、検査を外すと落ちること） |
| --- | --- | --- |
| `@ix/a2a-ext-negotiation` | `TermSession` と `openTermSession` から `roundLimitPerTerm` を外す。`TermState.counters` を外す（D10）。`termNoDealReasons` を `declined`、`rejected`、`silence` にする。時刻の形（2.2）を確かめる関数を出し、`checkMessageShape` で `sentAt` と `expiresAt` に使う。`applyTermMessage` の `expires <= now`（呼び出し側の時計による期限切れ）は、メッセージ自身の `sentAt` を時刻として使う形に変える（2.4a。`t(sentAt) < expiresAt` は形の確かめで済むので、呼び出し側の時計は期限の判断に使わない）。締め切りの式 `silenceDeadline(session)` と、期限内かを判定する関数（D と J）を出す | 時刻の形の端（小文字、4桁の小数、秒60、`-00:00`、時差なし、存在しない日付、`sentAt` ≥ `expiresAt`）。呼び出し側の時計が `expiresAt` を過ぎていても、当てはめが変わらないこと。`silenceDeadline` が `awaiting_approval` と n = 0 でないこと、`revise` のあと `revise` の時刻から測ること。24時間ちょうどは遅れ、1ミリ秒前は期限内。`t(x) ≥ J` は遅れ。往復の上限がないので、対案を何回続けても `no_deal` にならないこと |
| `@ix/agents` | 依頼票を 7 欄にし、7 欄以外の欄（`roundLimitPerTerm` を含む）を持つ依頼票と、`expiresAt` の形が違う依頼票を拒否する。自分の時計による期限切れ（メッセージ、依頼票）は「当てはめるが答えない」にする（2.4a）。候補は期限内のものだけを選び、遅れたものは拒否として記録する。署名する `sentAt` で締め切りと J を確かめる（2.7 の 1）。2.7a のよみがえり（記録の書き足し、交渉中だけ条件つきの `DealDecline` 1 回、承認待ちは知らせるだけ）。2.11 の実装の上限（1 件ずつ飛ばす、当事者ごとに数える、2 つまで持つ）。2.6 の欄の記録。安全弁 N と M を `TermAgentConfig` に足し、模試の既定値を置く（今の試験と同じ N = 3）。`decide` の手にも安全弁と締め切りをかける。分岐の処理の n² を直す。`assistant-prompt` の往復の上限の文を消し、24時間の規則を書く。`sample-terms` から欄を消す。`term-injection` の `note-cannot-reset-rounds` を向け替える | 検証役の指摘1の例（x が遅配で、代理人の時計では期限切れ）で、代理人と検証が同じ段階、`lastHash`、`closedAt` になること。7 欄以外の欄を持つ依頼票と、時差のない `expiresAt` の依頼票の拒否。よみがえり: 交渉中で新しい締め切りの前なら `DealDecline` が 1 回だけ出ること、締め切りのあとなら何も出ないこと、合意案でよみがえったときは出ずに知らせるだけなこと、分岐になったときに二重送信にならないこと。中継が遅れたメッセージを先に並べても閉じないこと。遅れたメッセージが当てはめられないこと。締め切りを確かめた時刻と `sentAt` がずれても、遅れたメッセージを出さないこと。安全弁が N と M で `DealDecline` を出すこと、`decide` からの手にもかかること。安全弁なしでは完全自動で始めないこと |
| `@ix/verify` | `asOf` を取り、形を確かめる。依頼票の 7 欄以外の欄と、時刻の形を `schema` で拒否。`createdAt` による `deadlines` の確かめは残し、当てはめから外さない（2.4a の 4）。期限内の候補だけを選び、機械の時刻にはメッセージの `sentAt` を使う。遅れたものを `late` で数え、不合格にしない。`earlierWinner` を数える。2.11 の上限（`oversized`、`outsiders`、`badSignatures`、`excess`、`limit`、`limitParty`）。手順8と 2.6 の欄すべて。候補を `prevHash` で引く | 代理人と同じイベントと同じ a で同じ結論（段階、`closedAt`、`lastHash`）になること（指摘1の例を含む）。`asOf` がないと閉じたと言わず、`silenceDeadline` を返すこと。a < D、D ≥ J（`jobExpiryFirst`）の各場合の欄。時差のない J で、機械の地域の設定によらず同じ結論か拒否になること。遅れたメッセージが記録を落とさないこと。遅れた二重送信は今のとおり `chain` が落ちること。部外者の大きいイベント 1 つでは `limit` にならないこと。当事者が小さい `id` のメッセージを大量に出しても、本物の合意より前に上限に達しないこと。上限に達したとき `limitParty` が原因の当事者を指すこと。さかのぼらせた期限内の枝分かれが勝つ例（4.1）で、記録は合格のまま `earlierWinner` が 1 になること。部外者のイベント（仕事のタグつき）が 1 件あっても、`issuers` が合格のまま `outsiders` が 1 になり、段階が変わらないこと。当事者の `issuer` を書いた署名の合わないイベントが、`signatures` を不合格にせず `badSignatures` が 1 になり、当てはめられないこと。部外者が当事者の正しいメッセージを写して自分で署名したイベントが、当てはめられず、合意の判定が変わらないこと。署名の合ったイベントで `from` が食い違うと今のとおり `issuers` が不合格になること、エージェントの鍵で署名された承認で今のとおり `signatures` が不合格になること |
| `@ix/conformance` | 項目4の「1円離れた範囲」が安全弁の `DealDecline` で終わること。項目6の `note-cannot-reset-rounds` は、名前を残し、中身を「自由文で代理人の安全弁を外させようとしても N は変わらない」に向け替え、`term.counters` を使わない確かめにする（D10）。項目5に 24 時間の規則（代理人と中継の時計を別にして）を足す | 範囲の注記（limit）は変えない。項目1と2は `pending` のまま |
| `scripts/`（ブラウザのページ、試しの証拠） | 依頼票の欄、ページの文、証拠の報告に 2.6 の欄と 2.11 の数。証拠の検証に `asOf` を渡す | `pnpm check` と、ページの手の試し |

## 7. `ix-standard.md` の更新案（差分。Q12 の後に当てる）

英語の節:

```diff
@@ 2. Common rules
+- **Time.** Every instant (`sentAt`, `expiresAt`, `createdAt`, the job's `expiresAt`, and the verifier's `asOf`) is `YYYY-MM-DDTHH:MM:SS`, an optional fraction of one to three digits, and `Z` or `±HH:MM` (not `-00:00`, not without an offset). Instants are compared as whole milliseconds. Any other form fails `schema` [T33, T36].
@@ 6. The negotiation machine
-**Opening.** The poster publishes the job: `jobId`, `sheetId`, `sheetVersion`, `sheetSha256` (the hash of the sheet definition), preset values, `roundLimitPerTerm`, a description, and `expiresAt` [T19, T23]. Each preset term starts as `proposed` by the client.
+**Opening.** The poster publishes the job: `jobId`, `sheetId`, `sheetVersion`, `sheetSha256` (the hash of the sheet definition), preset values, a description, and `expiresAt` [T19, T23, T34]. A job that carries any other field, `roundLimitPerTerm` included, is refused [T34, D10, T35]. Each preset term starts as `proposed` by the client.
@@
-**Messages.** Every message carries `type`, `from`, `sentAt`, `expiresAt`, `prevHash`, and `signature` [T18, T23]. The types are:
+**Messages.** Every message carries `type`, `from`, `sentAt`, `expiresAt`, `prevHash`, and `signature` [T18, T23]. `sentAt` must be before the message's own `expiresAt` [T33]. The types are:
@@
-**Rounds.** Rounds are counted per term. When a counter would pass `roundLimitPerTerm`, an optional term is dropped and the negotiation continues; a required term ends it as `no_deal` [T18, T18b].
+**No round limit.** The protocol does not count rounds. A negotiation ends only by `DealDecline`, by silence (below), by a human's `reject`, or at the job's expiry [D09, T34]. An agent may stop a fully automatic negotiation with its own settings (a counter count N per term and a message count M) by sending `DealDecline`; those settings are not part of the protocol [D09, D10, T34].
+
+**Silence.** Let `t(m)` be the instant of `sentAt` in milliseconds, W = 86,400,000, and J the job's `expiresAt`. After the applied messages m1..mn, if n ≥ 1 and the phase is `negotiating`, the deadline is D = t(mn) + W; otherwise there is none. A candidate (a message whose `prevHash` is the hash of mn) is in time when t(x) < D (if there is a deadline) and t(x) < J; otherwise it is late. Late candidates are never applied, never chosen over a candidate in time, and fail nothing; they are counted. When no candidate in time is left, the reading instant a satisfies a ≥ D, and D < J, the negotiation is `no_deal` with reason `silence`, closed at D. No message closes it. This rule does not apply in `awaiting_approval` [D09, D10, T33, T36].
@@ 7. The hash chain
-- The **anchor** is the hash of the job object [T23]. The verifier hashes the job object exactly as published. The agents hash the job rebuilt from the eight fields they read (`jobId`, `sheetId`, `sheetVersion`, `sheetSha256`, `preset`, `roundLimitPerTerm`, `description`, `expiresAt`). The two anchors agree only when the published job has no other fields.
+- The **anchor** is the hash of the job object [T23]. The verifier hashes the job object exactly as published. The agents hash the job rebuilt from the seven fields they read (`jobId`, `sheetId`, `sheetVersion`, `sheetSha256`, `preset`, `description`, `expiresAt`) [T34]. Because a job with any other field is refused, the two anchors agree [T35].
@@
-The sender fills in these fields first, then signs. Messages are applied in chain order, not relay order. When two messages point at the same predecessor, the first in relay order continues the chain and the other is a **fork** that is never applied. The sender of a fork plays a move again from the new state [T23, D03].
+The sender fills in these fields first, then signs. Messages are applied in chain order, not relay order. When two messages in time (section 6, Silence) point at the same predecessor, the first in relay order continues the chain and the other is a **fork** that is never applied. A late message is never chosen. The sender of a fork plays a move again from the new state [T23, D03, T33]. Relay order follows `id`, which the sender chooses, so a sender can make a backdated message in time win over the other side's honest reply; this is not prevented, and such forks are counted as `earlierWinner`, a hint that is not a failure [D12, T36].
@@ 9. Deadlines
-A message must not be published at or after its own `expiresAt`. The agents also check the job's expiry when they read the job, before every move, and just before publishing [T21b]. Until relay receipts exist, time is the sender's declaration: an agent judges a message against its own clock, and the verifier judges it against the `createdAt` the sender signed [T25c, D06].
+A message must not be published at or after its own `expiresAt`. Until relay receipts exist, time is the sender's declaration [T25c, D06]. Applying messages to the chain uses neither a reader's clock nor `createdAt`: a message is applied only when its `sentAt` is before its own `expiresAt` and before the job's `expiresAt` [D11, D12, T36]. An agent whose own clock is past a message's `expiresAt`, or past the job's `expiresAt`, still applies the message but does not answer it [D11, T21b, T36].
@@
-The verifier also reads the job's `expiresAt`. `deadlines` fails for a negotiation message whose event `createdAt` is at or after that time, and for a job whose `expiresAt` is missing, not text, or not a date. The verifier judges only the `createdAt` the sender signed; it has no clock of its own [T27].
+The verifier also reads the job's `expiresAt`. `deadlines` fails for a negotiation message whose event `createdAt` is at or after its own `expiresAt` or the job's `expiresAt`, and for a job whose `expiresAt` is missing or not in the required form. This flag does not remove the message from the chain, and the agents record the same flag [T27, D11, D12, T36].
+
+The silence rule (section 6) uses only the `sentAt` values in the chain and J, except the reading instant: an agent uses its own clock, and the verifier uses the `asOf` its caller passes. An agent checks D and J against the very `sentAt` it signs, and does not send a message that would be late; it records the close instead [T33, T36]. If a message dated before the deadline arrives after the agent recorded the close, and the new state is `negotiating`, the agent sends one `DealDecline` when the new deadline has not passed by its own clock, and tells its human. If the new state is `awaiting_approval`, it only tells its human [D10, D11, T35, T36].
@@ 10. Replay procedure
-Anyone can check a transcript without trusting a node [D01]. `verifyTermTranscript` takes the job id, the relay events, both agent `did:key` names, both approver `did:key` names, and the relay profile [T25b, T26].
+Anyone can check a transcript without trusting a node [D01]. `verifyTermTranscript` takes the job id, the relay events, both agent `did:key` names, both approver `did:key` names, the relay profile, and an optional `asOf` instant [T25b, T26, T33].
@@
-2. Sort the events by `id`. An event that is not an object with an object `body` fails `schema`; this is checked before the tag filter. Of the rest, keep only those tagged with the job id and of the job or negotiation kind.
+2. Skip each event over the size limit and count it as `oversized` [T36]. Sort the rest by `id`. An event that is not an object with an object `body` fails `schema`; this is checked before the tag filter. Of the rest, keep only those tagged with the job id and of the job or negotiation kind.
@@
-3. For each event: the issuer must be one of the two agents (`issuers`). Its `sig` must verify (`signatures`). Drop it if its signed content was already seen (`duplicates`).
+3. For each event: if the issuer is neither agent, skip it and count it as `outsiders`; if its `sig` does not verify, skip it and count it as `badSignatures`. These events are never applied and do not affect `issuers` or `signatures`; a message `from` that does not match a verified event's issuer, or a message signature that does not verify against the agent (or the approver for `TermApproval`), still fails `issuers` or `signatures` [D12, T36, T37]. Drop it if its signed content was already seen (`duplicates`). Count the rest per party; keep at most two messages per party after the same predecessor and count the others as `excess`. When a party passes the message limit, stop reading that party and report `limit` with `limitParty`; `limit` is neither a pass nor a fail [D10, T36].
@@
-4. Job event: it must carry a `term-job` record from the client, and there must be only one. Check `sheetSha256` against a known sheet and the preset manifests, then open the session with the anchor set to the hash of the job.
+4. Job event: it must carry a `term-job` record from the client, and there must be only one. A job with any field other than the seven, `roundLimitPerTerm` included, or an `expiresAt` not in the required form, fails `schema` [T34, D10, T35, T36]. Check `sheetSha256` against a known sheet and the preset manifests, then open the session with the anchor set to the hash of the job.
@@
-5. Negotiation event: ... `expiresAt` must be after `createdAt`, and `createdAt` must be before the job's `expiresAt` (`deadlines`). The job must come first (`replay`).
+5. Negotiation event: ... `sentAt`, `expiresAt`, and `createdAt` must be in the required form, and `sentAt` must be before `expiresAt` (`schema`) [T33, T36]. `expiresAt` must be after `createdAt`, and `createdAt` must be before the job's `expiresAt` (`deadlines`); a failure here does not remove the message from the chain [D11, T36]. The job must come first (`replay`).
@@
-6. From the anchor, take the first pending message, in relay order, whose `prevHash` equals the hash of the last applied message. Apply it with the machine and the chain checks, using `createdAt` as the clock. Repeat until none is left. A failed move fails `replay`, and fails `chain` too if a chain check failed.
+6. From the anchor, take the first pending message in time, in relay order, whose `prevHash` equals the hash of the last applied message; late ones are set aside [T33]. Apply it with the machine and the chain checks, using its own `sentAt` as the clock [D11, T36]. When two or more in time point at the same message, count `earlierWinner` if the winner and a loser come from different parties and the winner's `sentAt` is earlier [T36]. Repeat until none is left. A failed move fails `replay`, and fails `chain` too if a chain check failed.
@@
-7. Each leftover message must point at a state in the chain, or `chain` fails. If its sender already sent a message after that state, `chain` fails. Otherwise it must be a valid move from that state, or `chain` fails. The valid ones are counted as `forks`.
+7. Each leftover message must point at a state in the chain, or `chain` fails. If its sender already sent a message after that state, `chain` fails. Otherwise, if it is late for that state, it is counted as `late` and fails nothing [T33]. Otherwise it must be a valid move from that state, or `chain` fails. The valid ones are counted as `forks`.
+8. Compute the silence rule on the last state and report `silenceDeadline` (or null), `jobExpiryFirst`, `asOf` (or null), `closedBySilence`, `closedAt` (or null), `lastHash`, and `lastSentAt`. Only when `asOf` is given, a ≥ D, and D < J is the phase reported as `no_deal` with reason `silence` [D10, T33, T36].
@@
-The report gives pass or fail for `schema`, `issuers`, `replay`, `deadlines`, `chain`, and `signatures`, plus the fork and duplicate counts, and the phase.
+The report gives pass or fail for `schema`, `issuers`, `replay`, `deadlines`, `chain`, and `signatures`, plus the fork, duplicate, late, `earlierWinner`, `oversized`, `outsiders`, `badSignatures`, and `excess` counts, the silence fields of step 8, `limit` and `limitParty` when a limit stopped the reading, and the phase [T33, T36].
```

日本語の節（英語の節と同じ内容）:

```diff
@@ 2. 共通の決まり
+- **時刻**：時刻（`sentAt`、`expiresAt`、`createdAt`、依頼票の `expiresAt`、検証に渡す `asOf`）は、どれも `YYYY-MM-DDTHH:MM:SS`、任意で1〜3桁の小数、最後に `Z` か `±HH:MM` です（`-00:00` と、時差のない形は不可）。時刻はミリ秒の整数で比べます。ほかの形は `schema` の不合格です [T33, T36]。
@@ 6. 交渉の進み方
-**始まり**：依頼する側が依頼票を出します。中身は `jobId`、`sheetId`、`sheetVersion`、`sheetSha256`（項目表の定義のハッシュ）、あらかじめ入れた値、`roundLimitPerTerm`、説明、`expiresAt` です [T19, T23]。あらかじめ入れた値は、依頼する側が提案した状態（`proposed`）から始まります。
+**始まり**：依頼する側が依頼票を出します。中身は `jobId`、`sheetId`、`sheetVersion`、`sheetSha256`（項目表の定義のハッシュ）、あらかじめ入れた値、説明、`expiresAt` です [T19, T23, T34]。これ以外の欄（`roundLimitPerTerm` を含む）を持つ依頼票は拒否します [T34, D10, T35]。あらかじめ入れた値は、依頼する側が提案した状態（`proposed`）から始まります。
@@
-**メッセージ**：どのメッセージも `type`、`from`、`sentAt`、`expiresAt`、`prevHash`、`signature` を持ちます [T18, T23]。種類は次の10個です。
+**メッセージ**：どのメッセージも `type`、`from`、`sentAt`、`expiresAt`、`prevHash`、`signature` を持ちます [T18, T23]。`sentAt` は、そのメッセージの `expiresAt` より前でなければなりません [T33]。種類は次の10個です。
@@
-**往復の上限**：往復は項目ごとに数えます。上限を超える対案が来たとき、任意の項目なら外して交渉を続け、必須の項目なら交渉はまとまらずに終わります（`no_deal`） [T18, T18b]。
+**往復の上限はない**：プロトコルは往復を数えません。交渉が終わるのは、`DealDecline`、返事の途絶え（下）、人の `reject`、依頼票の期限のときだけです [D09, T34]。完全に自動の取引では、代理人が自分の設定（1項目あたりの対案の数 N と、メッセージの総数 M）で `DealDecline` を出して止められます。この設定はプロトコルの決まりではありません [D09, D10, T34]。
+
+**返事の途絶え**：`t(m)` を `sentAt` の一瞬（ミリ秒）、W を 86,400,000、J を依頼票の `expiresAt` とします。当てはめたメッセージが m1〜mn で、n が1以上、段階が交渉中なら、締め切りは D = t(mn) + W です。それ以外は締め切りがありません。候補（`prevHash` が mn のハッシュのメッセージ）は、締め切りがあれば t(x) < D、かつ t(x) < J のとき期限内で、そうでなければ遅れています。遅れた候補は当てはめず、期限内の候補より先に選ばず、不合格にもしません。数えるだけです。期限内の候補がなく、読む一瞬 a が a ≥ D で、D < J なら、交渉は D の時点で `no_deal`（理由 `silence`）です。閉じる手は要りません。承認待ちにはかけません [D09, D10, T33, T36]。
@@ 7. 指紋の鎖
-  - エージェントは、読み取った8つの欄（`jobId`、`sheetId`、`sheetVersion`、`sheetSha256`、`preset`、`roundLimitPerTerm`、`description`、`expiresAt`）で依頼票を作り直してからハッシュします。
-
-  そのため、公開された依頼票にこれ以外の欄があると、2つの起点は一致しません。
+  - エージェントは、読み取った7つの欄（`jobId`、`sheetId`、`sheetVersion`、`sheetSha256`、`preset`、`description`、`expiresAt`）で依頼票を作り直してからハッシュします [T34]。
+
+  これ以外の欄を持つ依頼票は拒否するので、2つの起点は一致します [T35]。
@@
-送り手は、これらの欄を先に埋めてから署名します。メッセージは中継の順ではなく、鎖の順に当てはめます。2つのメッセージが同じ前のメッセージを指したときは、中継の順で先のものが鎖を続け、もう一方は「枝分かれ」として当てはめません。枝分かれを出した側は、新しい状態から手を出し直します [T23, D03]。
+送り手は、これらの欄を先に埋めてから署名します。メッセージは中継の順ではなく、鎖の順に当てはめます。期限内（第6節「返事の途絶え」）の2つのメッセージが同じ前のメッセージを指したときは、中継の順で先のものが鎖を続け、もう一方は「枝分かれ」として当てはめません。遅れたメッセージは選びません。枝分かれを出した側は、新しい状態から手を出し直します [T23, D03, T33]。中継の順は `id` で決まり、`id` は送り手が選ぶので、送り手は時刻をさかのぼらせた期限内のメッセージで、相手の正直な返事に勝てます。これは防げません。こうした枝分かれは `earlierWinner` として数えます。手がかりで、不合格ではありません [D12, T36]。
@@ 9. 期限
-メッセージは、自分の `expiresAt` ちょうど、またはそのあとに出してはいけません。エージェントは、依頼票を読むとき、毎回の手の前、出す直前にも依頼票の期限を確かめます [T21b]。中継の受領印ができるまでは、時刻は送り手の申告です。エージェントは自分の時計で判断し、検証する側は送り手が署名した `createdAt` で判断します [T25c, D06]。
+メッセージは、自分の `expiresAt` ちょうど、またはそのあとに出してはいけません。中継の受領印ができるまでは、時刻は送り手の申告です [T25c, D06]。鎖への当てはめには、読む側の時計も `createdAt` も使いません。メッセージを当てはめるのは、その `sentAt` が自分の `expiresAt` より前で、依頼票の `expiresAt` より前のときだけです [D11, T36]。エージェントは、自分の時計でメッセージの `expiresAt` や依頼票の `expiresAt` を過ぎていても、そのメッセージを当てはめます。ただし、それに答える手は出しません [D11, T21b, T36]。
@@
-検証する側も、依頼票の `expiresAt` を読みます。交渉のメッセージのイベントの `createdAt` が依頼票の期限ちょうど、またはそのあとなら、`deadlines` は不合格です。依頼票に `expiresAt` がない、文字列でない、日付として読めない場合も不合格です。検証する側が使うのは、送り手が署名した `createdAt` だけで、自分の時計は持ちません [T27]。
+検証する側も、依頼票の `expiresAt` を読みます。交渉のメッセージのイベントの `createdAt` が、そのメッセージの `expiresAt` か依頼票の期限のちょうど、またはそのあとなら、`deadlines` は不合格です。依頼票に `expiresAt` がない場合、決まった形でない場合も不合格です。この印で、メッセージを鎖から外すことはしません。エージェントも同じ印を記録に残します [T27, D11, D12, T36]。
+
+返事の途絶えの規則（第6節）は、鎖の中の `sentAt` と J だけを使います。例外は読む一瞬で、エージェントは自分の時計を、検証する側は呼び出す側が渡す `asOf` を使います。エージェントは、署名する `sentAt` そのもので D と J を確かめ、遅れるメッセージは出しません。代わりに、閉じた記録を作ります [T33, T36]。閉じたと記録したあとに締め切り前の時刻のメッセージが届き、新しい状態が交渉中なら、新しい締め切りが自分の時計でまだ来ていなければ `DealDecline` を1回出し、人に知らせます。新しい状態が承認待ちなら、人に知らせるだけです [D10, D11, T35, T36]。
@@ 10. 読み直しの手順
-誰でも、ノードを信用せずに履歴を確かめられます [D01]。`verifyTermTranscript` に渡すのは、仕事の id、中継のイベント、双方のエージェントの `did:key`、双方の承認者の `did:key`、中継の読み方です [T25b, T26]。
+誰でも、ノードを信用せずに履歴を確かめられます [D01]。`verifyTermTranscript` に渡すのは、仕事の id、中継のイベント、双方のエージェントの `did:key`、双方の承認者の `did:key`、中継の読み方、任意で読む一瞬 `asOf` です [T25b, T26, T33]。
@@
-2. イベントを `id` の順に並べます。オブジェクトでないイベントや、`body` がオブジェクトでないイベントは、タグで絞る前に `schema` が不合格になります。残りのうち、その仕事の id のタグを持ち、依頼票か交渉の種類のものだけを残します。
+2. 大きさの上限を超えるイベントは1件ずつ飛ばし、`oversized` として数えます [T36]。残りを `id` の順に並べます。オブジェクトでないイベントや、`body` がオブジェクトでないイベントは、タグで絞る前に `schema` が不合格になります。残りのうち、その仕事の id のタグを持ち、依頼票か交渉の種類のものだけを残します。
@@
-3. 各イベントについて、送り手が双方のエージェントのどちらかであること（`issuers`）、`sig` が正しいこと（`signatures`）を確かめます。署名された中身がすでに出ていれば、重複として捨てます（`duplicates`）。
+3. 各イベントについて、送り手が双方のエージェントのどちらでもなければ飛ばして `outsiders` として数え、`sig` が正しくなければ飛ばして `badSignatures` として数えます。これらのイベントは当てはめず、`issuers` と `signatures` の合否に影響しません。署名の合ったイベントで、メッセージの `from` が送り手と違うとき、メッセージの署名がエージェントの鍵（`TermApproval` なら承認者の鍵）で確かめられないときは、今のとおり `issuers` か `signatures` の不合格です [D12, T36, T37]。署名された中身がすでに出ていれば、重複として捨てます（`duplicates`）。残りを当事者ごとに数えます。同じ前のメッセージのあとの同じ当事者のメッセージは2つまで持ち、それより多いものは `excess` として数えます。ある当事者が数の上限を超えたら、その当事者のそれ以上は読まず、`limit` と、原因の当事者 `limitParty` を報告します。`limit` は合格でも不合格でもありません [D10, T36]。
@@
-4. 依頼票のイベントは、依頼する側からの `term-job` の記録で、1つだけでなければなりません。既知の項目表と照らして `sheetSha256` を確かめ、あらかじめ入れた値の目録も確かめてから、依頼票のハッシュを起点にして交渉を開きます。
+4. 依頼票のイベントは、依頼する側からの `term-job` の記録で、1つだけでなければなりません。7つ以外の欄（`roundLimitPerTerm` を含む）を持つ依頼票と、`expiresAt` が決まった形でない依頼票は、`schema` の不合格です [T34, D10, T35, T36]。既知の項目表と照らして `sheetSha256` を確かめ、あらかじめ入れた値の目録も確かめてから、依頼票のハッシュを起点にして交渉を開きます。
@@
-   - `expiresAt` が `createdAt` よりあとで、`createdAt` が依頼票の `expiresAt` より前であること（`deadlines`）
+   - `sentAt`、`expiresAt`、`createdAt` が決まった形で、`sentAt` が `expiresAt` より前であること（`schema`） [T33, T36]
+   - `expiresAt` が `createdAt` よりあとで、`createdAt` が依頼票の `expiresAt` より前であること（`deadlines`）。不合格でも、メッセージを鎖から外しません [D11, T36]
@@
-6. 起点から始めて、`prevHash` が直前に当てはめたメッセージのハッシュと一致するものを、中継の順で最初に見つかったものから当てはめます。このとき、時計には `createdAt` を使い、交渉の決まりと鎖の決まりの両方で確かめます。当てはまるものがなくなるまで繰り返します。当てはめに失敗すると `replay` が不合格で、鎖の決まりで失敗した場合は `chain` も不合格です。
+6. 起点から始めて、`prevHash` が直前に当てはめたメッセージのハッシュと一致し、期限内のものを、中継の順で最初に見つかったものから当てはめます。遅れたものは脇に置きます [T33]。このとき、時計にはそのメッセージ自身の `sentAt` を使い、交渉の決まりと鎖の決まりの両方で確かめます [D11, T36]。期限内のものが2つ以上同じメッセージを指し、勝った方と負けた方の送り手が違い、勝った方の `sentAt` が早ければ、`earlierWinner` として数えます [T36]。当てはまるものがなくなるまで繰り返します。当てはめに失敗すると `replay` が不合格で、鎖の決まりで失敗した場合は `chain` も不合格です。
@@
-   - その状態から見て正しい手でなければ、`chain` は不合格です。
+   - その状態から見て遅れていれば、`late` として数え、何も不合格にしません [T33]。
+   - その状態から見て正しい手でなければ、`chain` は不合格です。
@@
+8. 最後の状態で返事の途絶えの規則を計算し、`silenceDeadline`（なければ null）、`jobExpiryFirst`、`asOf`（なければ null）、`closedBySilence`、`closedAt`（なければ null）、`lastHash`、`lastSentAt` を返します。`asOf` があり、a ≥ D で、D < J のときだけ、段階を `no_deal`、理由を `silence` として返します [D10, T33, T36]。
@@
-結果として、`schema`、`issuers`、`replay`、`deadlines`、`chain`、`signatures` のそれぞれの合否と、枝分かれと重複の数、交渉の段階を返します。
+結果として、`schema`、`issuers`、`replay`、`deadlines`、`chain`、`signatures` のそれぞれの合否と、枝分かれ、重複、遅れ、`earlierWinner`、`oversized`、`outsiders`、`badSignatures`、`excess` の数、手順8の欄、上限で止めたときの `limit` と `limitParty`、交渉の段階を返します [T33, T36]。
```

## 8. 本文と食い違う点、抜け、危険のまとめ

1. **時刻の形が決まっていない**（抜け）: 今は `sentAt` が文字列であることしか確かめず、ほかの時刻は `Date.parse` で読みます。時差のない時刻は機械の地域の設定で読み方が変わります。2.2 で、すべての時刻に同じ形を求めました。
2. **遅れたメッセージで記録が落ちる**（危険）: 今の検証は、当てはめに失敗したメッセージで `replay` を落とします。24 時間の規則をそのまま「断る」として入れると、締め切りのあとに1通出すだけで、正直な記録を不合格にできます。2.4 の 4 で、遅れたものは数えるだけにしました。
3. **並べ替えで閉じさせる**（危険、一部は限界）: 中継の順で最初の候補を選ぶと、遅れたメッセージを正直な返事より先にできます。2.4 の 2 で、期限内のものだけを選ぶようにしました。ただし、時刻をさかのぼらせた期限内の枝分かれが勝てば、閉じさせられます。`id` は送り手が選ぶので、防げません（4.1、`earlierWinner`）。D03 の狭めなので、人の扉です。
4. **代理人の時計で当てはめが変わる**（危険、D11 で解消）: 今のコードでは、代理人は自分の時計で期限切れのメッセージを当てはめず、検証は `createdAt` で判断するので、同じイベントと同じ a でも結論が分かれました。2.4a で、当てはめを時計と `createdAt` から切り離しました。
5. **部外者 1 件で読み取りが止まる**（危険）: 上限で全体を止める形だと、部外者が大きなイベントを 1 件出すだけで、どの記録も `limit` になります。2.11 で、1 件ずつ飛ばし、当事者ごとに数える形にしました。今の検証では、部外者のイベントが `issuers` を不合格にすることも同じ危険で、2.12 で、数えるだけにしました（D12）。
6. **よみがえり**（限界）: 締め切りのあとに、締め切り前の時刻で出されたメッセージは、遅配と区別できません。待つ側の代理人の扱いを 2.7a で決めました（D10、D11）。
7. **時刻の申告**（限界）: さかのぼらせると相手の締め切りを早められ、締め切り前の未来の時刻では、次の締め切りを最大でおよそ 2W まで延ばせます。受領印まで防げません。
8. **本文の古い記述**: `ix-spec-v0.3.md` の「各実装が守るルール」2 と 7、514 行と 516 行、653 行、791 行。第5節で直します。
9. **計算の量**（危険）: 無制限の往復で、検証と代理人の n² の計算が攻撃に使えます。Q12 で直します。
10. **承認待ちの長さ**: 承認待ちは依頼票の期限まで続きます。依頼票の期限が遠いと長くなります。D09 のとおりで、変えません。

## 9. 決まったこと

### D10（2026-11-14、Q11 の 10 の問い）

ディレクターが推奨のとおり答えました。どれも第2節から第8節の規則に入れてあります。

1. **最初のメッセージの前には、24 時間をかけない。** 依頼票は掲載されて相手を待つものだからです。上限は依頼票の期限です（2.3）。
2. **検証に読む時刻（`asOf`）が渡されないときは、閉じたと言わない。** 締め切りを報告します。中継の記録の中の一番遅い時刻を代わりに使うことはしません（2.5、2.6、第3節）。
3. **閉じたと記録したあとに、締め切り前の時刻のメッセージが届いたら、新しい締め切りがまだ来ていなければ、代理人が自動で `DealDecline` を出し、人に知らせる。** 交渉中だけの規則です（D11）。細かな条件は 2.7a です。
4. **`sentAt` が前のメッセージより早いメッセージも、断らない**（2.3）。
5. **依頼票の 7 欄以外の欄は、代理人も検証も拒否する**（2.8、第3節）。
6. **読む側の実装の上限を置く。** プロトコルの決まりにはせず、超えたら不合格とは分けて `limit` と報告します。数は Q12 で提案します（2.11）。
7. **依頼票の期限切れは、不成立の理由（`expired`）にしない。** 今のとおり、期限で止まり、段階はそのままです（2.8）。
8. **交渉の機械の往復の数（`counters`）を消す。** 安全弁の数は、代理人が鎖から数えます（2.8、2.9）。
9. **適合試験の `note-cannot-reset-rounds` は、名前を残し、中身を安全弁に向け替える**（第6節）。
10. **安全弁に、メッセージの総数 M も持たせる**（2.9）。

### D11（2026-11-14、検証役の指摘のうち 3 点）

ディレクターが推奨のとおり答えました。

1. **24 時間の規則で使う鎖の当てはめでは、メッセージの期限を `t(x) < expiresAt(x)` だけで判断する。** 代理人の時計による期限切れは、「鎖には当てはめるが、自分からはそれに応じて手を出さない」扱いにする。代理人と検証が、同じイベントと同じ読む時刻で、同じ段階、同じ `lastHash`、同じ `closedAt` になるようにする（2.4a）。
2. **承認待ちでのよみがえりでは、自動で `DealDecline` を出さない。人に知らせるだけにする。** D10 の 3 は、交渉中だけの規則と読む（2.7a の 4）。
3. **`sentAt` が `createdAt` より後であることは求めない。** 締め切りの前の未来の時刻で、次の締め切りを最大でおよそ 2W まで延ばせることは、限界として書く（4.1）。

## 10. 人の扉

次の点は人の扉です（`AGENTS.md`）。自動でマージしません。

- 不成立の理由を足し（`silence`）、減らす（`round_limit`）こと。
- 依頼票の欄を外すこと。依頼票のハッシュ（anchor）の入力が 8 欄から 7 欄に変わること。
- 検証の規則を足し、変えること（時刻の形、24 時間の規則、`asOf`、`late`、`earlierWinner`、2.11 の上限、当てはめから時計と `createdAt` を外すこと）。
- **署名の検証の扱いを変えること**（T25 の変更。部外者のイベントと、署名が合わないイベントを、検証で不合格にせず数えるだけにする。2.12、D12）。署名に触れるので、人の扉（署名）です。
- 枝分かれの決まり（D03）を「期限内のものの中で」に狭めること（`prevHash` の規則に触れる）。

D10、D11、D12 は、問いへの答えを決めたもので、この規則の文章を確認したものではありません。Q11 は、ディレクターとセキュリティレビュアーがこの文章を読むことを前提にします（まだ読まれていません）。Q12 は、それに加えて、書いた人とは別の検証役が見ることを前提にします。

## 11. 決まったこと（D12、2026-11-14）

D11 を規則に入れる中で出た 4 点に、ディレクターが推奨のとおり答えました。どれも第2節から第10節の規則に入れてあります。**決める点は、もう残っていません。**

1. **依頼票の期限（J）も、当てはめでは `sentAt` で判断する。** `t(x) ≥ J` のメッセージは、遅れたメッセージとして当てはめません（2.4 の 1）。
2. **検証の `createdAt` による期限の確かめ（T27 など）は、`deadlines` の印だけにして、当てはめからは外さない。** 代理人も同じ印を記録に残します（2.4a の 4）。
3. **部外者のイベントと、署名が合わないイベントは、検証で 1 件ずつ飛ばして数えるだけにし、`issuers` と `signatures` の不合格にしない。** 署名の合ったイベントの中の不正は、今のとおり不合格にします。T25 の変更で、人の扉（署名）です（2.12）。
4. **`earlierWinner` は、不合格ではなく、手がかりの数として報告する**（2.6、4.1）。
