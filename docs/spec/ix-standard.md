# IX standard: term-by-term negotiation (draft)

Status: draft. This text describes what the code on `main` does and what `decisions.tsv` records. It adds no rule of its own. Where it and the code disagree, the code and the decision rows win, and this text is the bug. The Japanese version follows the English one.

Decision ids in brackets, such as [T23], are rows in `decisions.tsv`.

## 1. Scope

Two agents, a poster (`client`) and a worker (`worker`), agree on a job one typed term at a time over a relay. A human on each side then approves the result. IX proves what was said over A2A: who sent each message, that nothing was altered, removed, or reordered, and that each human approved the exact agreement. Contracts, payment, delivery quality, and the truth of what people enter are outside IX [D01]. Signatures here are for non-repudiation of the exchange, not a legal e-signature [D01].

Not covered yet: wire A2A, mandate documents, the Agent Card JWS, relay receipts, a transparency log, and how a person holds an approval key [D06].

## 2. Common rules

- **Canonical bytes.** Every hash and every signing input is the RFC 8785 (JCS) text of a JSON value [T03, D02]. JSON from the wire is parsed first with duplicate keys refused, including names equal only after escape decoding, and integers outside ±9007199254740991 refused [T03-review]. Nesting deeper than 64 arrays or objects is refused; 64 is this implementation's limit, not RFC 8785's [T03-review].
- **Hash.** A hash is the SHA-256 of the UTF-8 bytes of the JCS text, written as 64 lowercase hex digits [T03, D02].
- **Signature.** A signature is a compact JWS with a detached payload, written `header..signature`. The protected header holds exactly `alg: "EdDSA"` and `kid`, where `kid` is the signer's Ed25519 `did:key`. The bytes signed are `BASE64URL(header) "." BASE64URL(UTF-8 payload)` [D04, T24]. A verifier refuses a payload that is not well-formed Unicode text, a header with any other member or a byte order mark, and an Ed25519 public key that is non-canonical or of small order [T24, T24b].
- **Keys.** In the reference implementation each key is created in memory, cannot be extracted, and lives for one run. Only the `did:key` is printed [T25, D05].

## 3. Extension activation

The four profile extensions are:

- `https://w3id.org/a2a-job/ext/negotiation/v1`
- `https://w3id.org/a2a-job/ext/mandate/v1`
- `https://w3id.org/a2a-job/ext/approval/v1`
- `https://w3id.org/a2a-job/ext/transcript/v1`

The active set is the exact intersection of the URIs requested in `A2A-Extensions` and the URIs supported. An unsupported URI is ignored and is never answered with another version. Negotiation is active only when mandate, approval, and transcript are active in the same request [T09].

## 4. Relay events

Each message travels as a signed relay event with `issuer`, `kind`, `tags`, `createdAt`, `expiresAt`, `body`, `id`, and `sig` [T10, T25].

- `sig` is a detached JWS by the issuer's agent key. Its payload is the JCS of `{issuer, kind, tags, createdAt, expiresAt, body}`, so `id` and `sig` are not signed [T25].
- `id` is a placeholder chosen by the caller. "Relay order" in this text means events sorted by ascending `id`, which is how the agents and the verifier read them [T25].
- A reader uses only events tagged `x-job` with the job's id, and dispatches them by kind [T25b, T25c]. The job uses kind `JobPosting/1` with body record `term-job`. Negotiation messages use kind `x-mock/negotiation-message` with body record `term`, plus the `A2A-Extensions` header that activates negotiation [T19, T25b]. Adding an event kind or tag is a human door, so these names stay as they are.
- An event whose signed content equals that of an earlier verified event is a duplicate. It is dropped and counted [T25b].
- The relay node stores events without checking signatures [T25].

## 5. Term sheets and values

A **term** has a `termId`, a `version`, a `valueType`, and optional `unit`, `codes`, and `label`. A **term sheet** lists required and optional terms. Two sheets exist: `ix:core/1` and `ix:sheet/web-site/1`, which extends the core [T18]. The core terms are `ix:price`, `ix:deadline`, `ix:revision-limit`, `ix:acceptance-window`, `ix:deliverables`, and `ix:deliverable-format`, plus the optional `ix:initial-spec` [T18].

Value types: `money`, `date`, `datetime`, `deadline`, `integer`, `duration`, `boolean`, `code`, `codes`, `count`, `textRef`, `documents`. Their exact checks are `checkTermValue` in `@ix/a2a-ext-negotiation` and decisions T18b to T18g. Machines decide only on typed values; free text is for people and never changes a value, bound, deadline, or decision [T12].

## 6. The negotiation machine

**Opening.** The poster publishes the job: `jobId`, `sheetId`, `sheetVersion`, `sheetSha256` (the hash of the sheet definition), preset values, `roundLimitPerTerm`, a description, and `expiresAt` [T19, T23]. Each preset term starts as `proposed` by the client.

**Messages.** Every message carries `type`, `from`, `sentAt`, `expiresAt`, `prevHash`, and `signature` [T18, T23]. The types are:

| Type | Effect |
| --- | --- |
| `TermPropose`, `TermCounter` | Sets a value on an `open` or `proposed` term. A side cannot propose again while its own value waits. A counter needs a value to counter. |
| `TermAccept` | Accepts the other side's value or request. A side cannot accept its own. |
| `TermAdd` | Asks to add a new term (`add_requested`). |
| `TermDrop` | Asks to drop an optional term that is `open` or `proposed`. A required term cannot be dropped. |
| `TermReopen` | Asks to reopen a `fixed` term. |
| `TermRefuse` | Declines the other side's add, drop, or reopen. An add disappears; a drop or reopen restores the term's earlier status, value, and proposer [T18c]. |
| `DealDecline` | Ends the negotiation as `no_deal`. |
| `TermAgreementDraft` | Proposes the agreement. |
| `TermApproval` | A human's `approve`, `reject`, or `revise`. |

**Fixing.** A term is `fixed` only when the other side accepts an equal value. Adding, dropping, and reopening also need the other side's accept [T18].

**Rounds.** Rounds are counted per term. When a counter would pass `roundLimitPerTerm`, an optional term is dropped and the negotiation continues; a required term ends it as `no_deal` [T18, T18b].

**Agreement.** A draft is allowed when every required term is fixed and no request is pending. The agreement is `{agreementId, jobId, sheet, addedTerms, terms, transcriptHash}`, with the fixed terms sorted by `termId`. A receiver rebuilds it from the history and accepts the draft only when every field matches [T18, T18b]. The phase becomes `awaiting_approval`, and terms are frozen [D03].

**Approval.** `approve` from both sides makes the phase `agreed`, and nothing changes after that [D03]. `reject` makes it `no_deal`. `revise` must name fixed terms; they reopen and the phase returns to `negotiating`. Only `approve` counts as approval [T18b].

## 7. The hash chain

Messages form a chain [T23]:

- The **anchor** is the hash of the job object as published.
- `prevHash` is the hash of the whole previous message, signature included, or the anchor for the first message.
- `valueHash` on `TermAccept` is the hash of the accepted value. For an add it is the hash of `{termId, request, definition, required}`, and for a drop or reopen the hash of `{termId, request}`.
- A draft's `transcriptHash` equals its own `prevHash`.
- An approval's `agreementHash` is the hash of the draft agreement.
- A `documents` value's `manifestSha256` is the hash of `{files}`, and the job's `sheetSha256` is the hash of the term sheet.

The sender fills in these fields first, then signs. Messages are applied in chain order, not relay order. When two messages point at the same predecessor, the first in relay order continues the chain and the other is a **fork** that is never applied. The sender of a fork plays a move again from the new state [T23, D03].

## 8. Signatures on messages and approvals

- A message's `signature` is `{verification: "jws-eddsa", material}`, where `material` is a detached JWS over the JCS of the message with only the top-level `signature` removed [T25].
- Every message except `TermApproval`, and every relay event, is signed by the sending party's **agent** key [T25, T26].
- A `TermApproval` is signed by that party's **approver** key, the human's own `did:key`. The event that carries the approval is still signed by the agent [D06, T26].
- The four names (two agents, two approvers) must all differ. In particular, each approver must differ from the same party's agent [D06, T26].
- An unsigned message, a signature by the wrong key, or an approval by an agent, by the other side's approver, or by an outsider is refused [T25, T26].

## 9. Deadlines

A message must not be published at or after its own `expiresAt`. The agents also check the job's expiry when they read the job, before every move, and just before publishing [T21b]. Until relay receipts exist, time is the sender's declaration: an agent judges a message against its own clock, and the verifier judges it against the `createdAt` the sender signed [T25c, D06].

## 10. Replay procedure

Anyone can check a transcript without trusting a node [D01]. `verifyTermTranscript` takes the job id, the relay events, both agent `did:key` names, both approver `did:key` names, and the relay profile [T25b, T26]. It reads the events the same way the agents do:

1. Check that the four names all differ; if not, `issuers` fails.
2. Sort the events by `id`. Keep only those tagged with the job id and of the job or negotiation kind.
3. For each event: the issuer must be one of the two agents (`issuers`). Its `sig` must verify (`signatures`). Drop it if its signed content was already seen (`duplicates`).
4. Job event: it must carry a `term-job` record from the client, and there must be only one. Check `sheetSha256` against a known sheet and the preset manifests, then open the session with the anchor set to the hash of the job.
5. Negotiation event: it must be a `term` record with the activating header (`schema`). Decode the message (`schema`). `from` must match the issuer (`issuers`). The message signature must verify against the agent, or against the approver for `TermApproval` (`signatures`). `expiresAt` must be after `createdAt` (`deadlines`). The job must come first (`replay`).
6. From the anchor, take the first pending message, in relay order, whose `prevHash` equals the hash of the last applied message. Apply it with the machine and the chain checks, using `createdAt` as the clock. Repeat until none is left. A failed move fails `replay`, and fails `chain` too if a chain check failed.
7. Each leftover message must point at a state in the chain, or `chain` fails. If its sender already sent a message after that state, `chain` fails. Otherwise it must be a valid move from that state, or `chain` fails. The valid ones are counted as `forks`.

The report gives pass or fail for `schema`, `issuers`, `replay`, `deadlines`, `chain`, and `signatures`, plus the fork and duplicate counts, the phase, and the agreed terms.

---

# IX 標準：項目を1つずつ決める交渉（案）

状態：案です。この文は、`main` のコードの動きと `decisions.tsv` に記録された決定を書き写したもので、独自の決まりは足していません。コードや決定の記録と食い違うときは、それらが正しく、この文のほうが誤りです。

[T23] のような括弧の中の番号は、`decisions.tsv` の行を指します。

## 1. 範囲

依頼する側（`client`）と受ける側（`worker`）のエージェントが、中継を通じて仕事の条件を、型の決まった項目ごとに1つずつ決めます。そのあと、それぞれの側の人間が結果を承認します。IX が証明するのは A2A の上で何が言われたかです。誰が送ったか、改ざん・削除・順番の入れ替えがないか、各側の人間がまさにその合意を承認したか、を確かめられるようにします。契約、支払い、納品物の質、人が入力した内容が本当かどうかは、IX の外です [D01]。署名は、やり取りを後から否定させないためのもので、法的な電子署名ではありません [D01]。

まだ扱わないもの：回線上の A2A、委任状、Agent Card の JWS、中継の受領印、透明性ログ、人が承認の鍵をどう持つか [D06]。

## 2. 共通の決まり

- **正規化**：ハッシュと署名の対象は、すべて JSON の値を RFC 8785（JCS）で書いた文字列です [T03, D02]。回線から来た JSON は先に読み、重複したキー（エスケープを解くと同じになる名前を含む）と、±9007199254740991 の外の整数を拒否します [T03-review]。配列やオブジェクトの入れ子が 64 を超えたら拒否します。64 はこの実装の上限で、RFC 8785 の数ではありません [T03-review]。
- **ハッシュ**：JCS の文字列を UTF-8 にしたバイトの SHA-256 を、小文字の16進64桁で書きます [T03, D02]。
- **署名**：本文を切り離したコンパクトな JWS（`header..signature`）です。ヘッダーは `alg: "EdDSA"` と `kid` の2つだけで、`kid` は署名した人の Ed25519 の `did:key` です。署名するバイトは `BASE64URL(header) "." BASE64URL(本文の UTF-8)` です [D04, T24]。検証する側は、Unicode として壊れた本文、ほかの欄や BOM を含むヘッダー、正規形でない公開鍵や位数の小さい公開鍵を拒否します [T24, T24b]。
- **鍵**：参照実装では、鍵はメモリの中で作り、取り出せず、1回の実行の間だけ使います。表に出すのは `did:key` だけです [T25, D05]。

## 3. 拡張の有効化

拡張は4つです。交渉・委任・承認・履歴で、URI は英語の節にあります。有効になるのは、`A2A-Extensions` で求められた URI と自分が持つ URI の、ちょうど重なる部分だけです。持っていない URI は無視し、別の版で代わりに応えることはしません。交渉は、委任・承認・履歴が同じリクエストで有効になったときだけ有効です [T09]。

## 4. 中継のイベント

メッセージは、署名つきの中継イベントで運びます。欄は `issuer`、`kind`、`tags`、`createdAt`、`expiresAt`、`body`、`id`、`sig` です [T10, T25]。

- `sig` は、送り手のエージェントの鍵による切り離し JWS です。署名の対象は `{issuer, kind, tags, createdAt, expiresAt, body}` の JCS で、`id` と `sig` は含みません [T25]。
- `id` は送り手が付ける仮の値です。この文で「中継の順」と言うときは、`id` の昇順を指します。エージェントも検証する側も、この順で読みます [T25]。
- 読む側が使うのは、その仕事の id を `x-job` タグに持つイベントだけで、種類（`kind`）ごとに振り分けます [T25b, T25c]。依頼票は種類 `JobPosting/1` で、本文の記録名は `term-job` です。交渉のメッセージは種類 `x-mock/negotiation-message` で、記録名 `term` と、交渉を有効にする `A2A-Extensions` ヘッダーを持ちます [T19, T25b]。種類やタグを足すのは人の確認が要る変更なので、これらの名前は今のまま使います。
- 署名された中身が、すでに確かめたイベントと同じなら重複です。捨てて、数を数えます [T25b]。
- 中継ノード自身は、署名を確かめずに保存します [T25]。

## 5. 項目表と値

**項目**には `termId`、`version`、`valueType` があり、必要に応じて `unit`、`codes`、`label` を持ちます。**項目表**は、必須の項目と任意の項目を並べたものです。いまある項目表は `ix:core/1` と、それを広げた `ix:sheet/web-site/1` の2つです [T18]。共通の必須項目は `ix:price`、`ix:deadline`、`ix:revision-limit`、`ix:acceptance-window`、`ix:deliverables`、`ix:deliverable-format` で、任意の項目に `ix:initial-spec` があります [T18]。

値の型は12種類です（一覧は英語の節）。細かな検査は `@ix/a2a-ext-negotiation` の `checkTermValue` と、T18b〜T18g の決定のとおりです。機械が判断に使うのは型の決まった値だけです。自由文は人が読むためのもので、値・範囲・期限・決定を変えません [T12]。

## 6. 交渉の進み方

**始まり**：依頼する側が依頼票を出します。中身は `jobId`、`sheetId`、`sheetVersion`、`sheetSha256`（項目表の定義のハッシュ）、あらかじめ入れた値、`roundLimitPerTerm`、説明、`expiresAt` です [T19, T23]。あらかじめ入れた値は、依頼する側が提案した状態（`proposed`）から始まります。

**メッセージ**：どのメッセージも `type`、`from`、`sentAt`、`expiresAt`、`prevHash`、`signature` を持ちます [T18, T23]。種類は10個で、それぞれの働きは英語の節の表のとおりです。要点は次のとおりです。

- 自分の値が相手の返事を待っている間は、同じ項目にもう一度提案できません。自分の提案や依頼を自分で受け入れることもできません。
- 項目が確定（`fixed`）するのは、相手が同じ値を受け入れたときだけです。項目を足す・外す・確定を開き直すときも、相手の受け入れが要ります [T18]。
- `TermRefuse` は、相手からの追加・削除・開き直しの依頼を断ります。追加の依頼は消え、削除や開き直しの依頼は元の状態・値・提案者に戻ります [T18c]。

**往復の上限**：往復は項目ごとに数えます。上限を超える対案が来たとき、任意の項目なら外して交渉を続け、必須の項目なら交渉はまとまらずに終わります（`no_deal`） [T18, T18b]。

**合意案**：必須の項目がすべて確定し、返事待ちの依頼がないときだけ出せます。合意案は `{agreementId, jobId, sheet, addedTerms, terms, transcriptHash}` で、確定した項目を `termId` の順に並べたものです。受け取った側は履歴から同じものを作り直し、すべての欄が一致したときだけ受け付けます [T18, T18b]。この時点で人の判断待ち（`awaiting_approval`）になり、項目はもう動きません [D03]。

**承認**：双方の人が `approve` すると合意（`agreed`）で、そのあとは何も変わりません [D03]。`reject` なら交渉はまとまらずに終わります。`revise` は、確定済みの項目を名指しして開き直し、交渉に戻します。承認として数えるのは `approve` だけです [T18b]。

## 7. 指紋の鎖

メッセージは鎖のようにつながります [T23]。

- 鎖の起点は、公開した依頼票のハッシュです。
- `prevHash` は、1つ前のメッセージ全体（署名を含む）のハッシュです。最初のメッセージは起点を指します。
- `TermAccept` の `valueHash` は、受け入れる値のハッシュです。追加の依頼なら `{termId, request, definition, required}`、削除や開き直しの依頼なら `{termId, request}` のハッシュです。
- 合意案の `transcriptHash` は、その合意案自身の `prevHash` と同じ値です。
- 承認の `agreementHash` は、合意案のハッシュです。
- `documents` の値の `manifestSha256` は `{files}` のハッシュで、依頼票の `sheetSha256` は項目表のハッシュです。

送り手は、これらの欄を先に埋めてから署名します。メッセージは中継の順ではなく、鎖の順に当てはめます。2つのメッセージが同じ前のメッセージを指したときは、中継の順で先のものが鎖を続け、もう一方は「枝分かれ」として当てはめません。枝分かれを出した側は、新しい状態から手を出し直します [T23, D03]。

## 8. メッセージと承認の署名

- メッセージの `signature` は `{verification: "jws-eddsa", material}` です。`material` は、メッセージからトップレベルの `signature` だけを除いたものの JCS に対する、切り離し JWS です [T25]。
- `TermApproval` 以外のすべてのメッセージと、すべての中継イベントは、その側の**エージェント**の鍵で署名します [T25, T26]。
- `TermApproval` は、その側の**承認者**（人間自身の `did:key`）の鍵で署名します。承認を運ぶイベントは、これまでどおりエージェントが署名します [D06, T26]。
- 4つの名前（双方のエージェントと双方の承認者）は、すべて違っていなければなりません。特に、承認者は同じ側のエージェントと違う鍵です [D06, T26]。
- 署名のないメッセージ、違う鍵の署名、エージェント・相手側の承認者・部外者が署名した承認は、拒否します [T25, T26]。

## 9. 期限

メッセージは、自分の `expiresAt` ちょうど、またはそのあとに出してはいけません。エージェントは、依頼票を読むとき、毎回の手の前、出す直前にも依頼票の期限を確かめます [T21b]。中継の受領印ができるまでは、時刻は送り手の申告です。エージェントは自分の時計で判断し、検証する側は送り手が署名した `createdAt` で判断します [T25c, D06]。

## 10. 読み直しの手順

誰でも、ノードを信用せずに履歴を確かめられます [D01]。`verifyTermTranscript` に渡すのは、仕事の id、中継のイベント、双方のエージェントの `did:key`、双方の承認者の `did:key`、中継の読み方です [T25b, T26]。読み方はエージェントと同じです。

1. 4つの名前がすべて違うか確かめます。同じものがあれば `issuers` は不合格です。
2. イベントを `id` の順に並べ、その仕事の id のタグを持ち、依頼票か交渉の種類のものだけを残します。
3. 各イベントについて、送り手が双方のエージェントのどちらかであること（`issuers`）、`sig` が正しいこと（`signatures`）を確かめます。署名された中身がすでに出ていれば、重複として捨てます（`duplicates`）。
4. 依頼票のイベントは、依頼する側からの `term-job` の記録で、1つだけでなければなりません。`sheetSha256` と、あらかじめ入れた値の目録を確かめ、依頼票のハッシュを起点にして交渉を開きます。
5. 交渉のイベントでは、次を順に確かめます。
   - 交渉を有効にするヘッダーを持つ `term` の記録であること、メッセージとして読めること（`schema`）
   - `from` が送り手と一致すること（`issuers`）
   - メッセージの署名が、エージェントの鍵で正しいこと。`TermApproval` なら承認者の鍵で正しいこと（`signatures`）
   - `expiresAt` が `createdAt` よりあとであること（`deadlines`）
   - 依頼票より前に来ていないこと（`replay`）
6. 起点から始めて、`prevHash` が直前に当てはめたメッセージのハッシュと一致するものを、中継の順で最初に見つかったものから当てはめます。このとき、時計には `createdAt` を使い、交渉の決まりと鎖の決まりの両方で確かめます。当てはまるものがなくなるまで繰り返します。当てはめに失敗すると `replay` が不合格で、鎖の決まりで失敗した場合は `chain` も不合格です。
7. 残ったメッセージは、次の順に確かめます。
   - 鎖の中のどれかの状態を指していなければ、`chain` は不合格です。
   - その状態のあとに、同じ送り手がすでに別のメッセージを出していれば、`chain` は不合格です。
   - その状態から見て正しい手でなければ、`chain` は不合格です。
   - 正しい手なら、枝分かれ（`forks`）として数えます。

結果として、`schema`、`issuers`、`replay`、`deadlines`、`chain`、`signatures` のそれぞれの合否と、枝分かれと重複の数、交渉の段階、合意した項目を返します。

---

This text is CC BY 4.0, like the rest of `docs/spec/`. / この文は、`docs/spec/` のほかの文と同じく CC BY 4.0 です。
