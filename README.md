# IX

> **実験的なソフトウェアです。本番では使わないでください。セキュリティ監査は、まだありません。**
>
> **Experimental software. Do not use it in production. There has not been a security audit.**

誰でも自分の A2A 仕事交換ノードを立てられる、オープンソースの一式です。設定の `mode` で、インターネットに開いた交換（`open`）と、組織の中だけの交換（`closed`）を切り替えます。最初のノードは特別な中央ではなく、ただの一台です。

このリポジトリは、いまは非公開です。仕様をコミュニティで育てるために、あとで公開します。

This is an open-source set for standing up an A2A job-exchange node. A config switch selects an open internet exchange (`open`) or a closed in-house exchange (`closed`). The first node is an ordinary peer, not a root.

The repository is private for now. It will be published later so the spec can be developed with the community.

## これは何か / What IX is

仕事の掲示と交渉を、1社のサイトに閉じ込めません。依頼票は署名つきのイベントとして、タグで探せる中継ノードに配ります。考え方は Nostr のリレーに近いです。交渉、委任範囲、人間の承認、交渉履歴は、A2A のプロファイル拡張4つです。URI は `https://w3id.org/a2a-job/` の下にあります。

仕様の本文は [`docs/spec/ix-spec-v0.3.md`](docs/spec/ix-spec-v0.3.md) の「交渉の拡張仕様（案 v0.3）」です。前半の事業の数字は仮説です。

Job posts are signed events, distributed by tag through relays anyone can run, in the spirit of a Nostr relay. Negotiation, mandate, human approval, and transcript are four A2A profile extensions under `https://w3id.org/a2a-job/`.

The normative text is the section 「交渉の拡張仕様（案 v0.3）」 in [`docs/spec/ix-spec-v0.3.md`](docs/spec/ix-spec-v0.3.md). The business figures above that section are hypotheses.

## いまあるもの / What is here

いまの動きの短い説明は [`docs/spec/ix-standard.md`](docs/spec/ix-standard.md) です（英語が先、日本語があと）。段階は [`docs/negotiation-states.md`](docs/negotiation-states.md)、配り方は [`docs/distribution.md`](docs/distribution.md)、手元だけの試し方は [`docs/local-trial.md`](docs/local-trial.md)、到達点は [`docs/feature-map.md`](docs/feature-map.md)、ここまでの記録は [`docs/retrospective.md`](docs/retrospective.md) です。

- 項目を1つずつ確定させる交渉。仕事の種類ごとの項目表、項目ごとの値・対案・同意、確定した項目の一覧としての合意案、人間の承認・却下・やり直しを扱います。時計は外から渡します。
- 拡張の名乗り。`A2A-Extensions` に、4つの拡張のうち相手と自分の両方が持つものだけを返します。交渉は、委任・承認・履歴が揃ったときだけ有効です。違う版は、別の版で代わりに受けません。
- 依頼票の掲載・検索・購読。タグ、種類、期間で探します。プロセスの中の中継で、最初の置き場はメモリです。開いたノードだけが掲載を受けます。中継ノードは、署名を確かめずに保管します（`signatureVerification` は `deferred` のままです）。`id` は呼び出し側が付ける仮の値です。パッケージ自体はポートを開きません。
- 模試の発注側と受注側。中継に依頼票と項目のメッセージを載せ、中継の記録だけから自分の状態を作ります。項目ごとの範囲の外の値は出しも同意もしません。依頼票の期限ちょうど・そのあとには交渉しません。自由文は命令にしません。人に見せる文面からは連絡先を除きます。
- 署名。模試のエージェントは、実行のたびにメモリの中だけで Ed25519 の鍵を作ります。鍵は取り出せず、保存しません。中継のイベントの `sig` と、交渉のメッセージの `signature` を、本文を切り離した JWS で署名します。双方と `@ix/verify` は、相手の `did:key` で確かめ、合わないものは受け付けません。
- 人間の承認。模試では、各側の人間は台本で、その鍵はもう1つの、実行ごとにメモリの中だけで作る鍵です。`TermApproval` の署名は、その人の鍵で行います。双方のエージェントと双方の人の4つの `did:key` は、すべて違っていなければなりません。本物の承認アプリはなく、`signApproval` は署名を拒否します。人がどう鍵を持つかは、プロトコルの外です。
- 指紋の鎖。交渉のメッセージは、前のメッセージのハッシュ（`prevHash`）でつながり、エージェントと `@ix/verify` が確かめます。ハッシュは、JCS（RFC 8785）の UTF-8 の SHA-256（小文字の16進）です。
- 読み直し。`@ix/verify` は、中継の記録を別に読み直し、メッセージの形、送り主、イベントとメッセージと承認の署名、項目の状態の進み方、期限（依頼票の期限を含む）、指紋の鎖を確かめます。
- 手元だけの試験。`deploy/local/compose.yaml` は `127.0.0.1` だけを聞き、ポートを公開しません。検証の `drive` も、同じ住所だけを起動して、終わったら止めます。
- pnpm の TypeScript モノレポ。コア、アプリ、アダプタ、適合スイートをパッケージに分けてあります。依存の向きを CI で検査します。コアからアダプタへは戻れません。
- JCS（RFC 8785）の正規化は `@ix/jcs` の `canonicalize` だけが担当します。JSON でない値とプロキシは拒否します。回線上の JSON は、その前に `parseJson` で読み、重複キーと安全整数の外の整数を拒否します。入れ子の上限 64 は、この実装の上限です。
- 適合テスト6項目のうち4項目を、範囲を書いたうえで合格にしています。模試のエージェントの署名、模試の人間の承認の署名、指紋の鎖は確かめます。委任状の署名と Agent Card の JWS は確かめません。項目6は、自由文の試験18件の名前を結果に残します。残り2項目は未実施です。緑でも、6項目すべてに合格したことにはなりません。模試の人間は台本であり、本物の人の承認ではありません。
- 検査を破る見本が `fixtures/guardrails/` にあります。普通のビルドには入れません。`pnpm guardrails` は、見本が失敗することと、許される書き方は成功することを確かめます。

まだないもの：回線上の A2A、委任状、本物の人間の承認アプリ、人が承認の鍵をどう持つか（プロトコルの外）、中継の受領印（時刻は送り手の申告です）、鍵の保管、秘密鍵の書き出し、包含証明、MCP のツール。

This revision is the foundation, the term-by-term negotiation machine, A2A-Extensions activation, an in-process relay, mock poster and worker agents, and the replay checks. A short description of what the code does today is [`docs/spec/ix-standard.md`](docs/spec/ix-standard.md) (English first, Japanese after). The plain-language maps are [`docs/negotiation-states.md`](docs/negotiation-states.md), [`docs/distribution.md`](docs/distribution.md), [`docs/local-trial.md`](docs/local-trial.md), [`docs/feature-map.md`](docs/feature-map.md), and [`docs/retrospective.md`](docs/retrospective.md).

- Term-by-term negotiation: term sheets per kind of job, per-term values, counters, and acceptance, an agreement that is the list of fixed terms, and human approve, reject, or revise. The clock is injected.
- Extension activation. `A2A-Extensions` returns only the profile URIs both sides listed. Negotiation turns on only together with mandate, approval, and transcript. A different version is not answered with this one.
- In-process publish, query, and subscribe by tag, kind, and time. The first store is memory. Only an open node accepts publish. The relay node stores events without checking signatures (`signatureVerification` stays `deferred`). `id` is a placeholder chosen by the caller. The package opens no port.
- Mock poster and worker agents. They put the term job and term messages on a relay and rebuild their state only from relay events. A value outside their own per-term mandate is neither sent nor accepted. Nothing is negotiated at or after the job's expiry. Free text is not an instruction. Contact details are removed from the copy a human would see.
- Signatures. Each mock agent creates an Ed25519 key in memory for one run. It cannot be extracted and is never stored. The agent signs every relay event `sig` and every term message `signature` as a detached JWS. The agents and `@ix/verify` check them against the party's `did:key` and refuse what does not verify.
- Human approval. Each mock human is a script holding a second in-memory key, made per run. A `TermApproval` is signed with that key. The four `did:key` names (two agents, two approvers) must all differ. There is no real approval app, and `signApproval` still refuses. How a person holds the key is outside the protocol.
- Hash chain. Term messages are linked by the hash of the previous message (`prevHash`), checked by the agents and `@ix/verify`. The hash is the SHA-256 of the UTF-8 bytes of the JCS (RFC 8785) text, in lowercase hex.
- Replay. `@ix/verify` reads the relay events independently and checks message shape, issuers, signatures of events, messages, and approvals, the term machine, deadlines (including the job's expiry), and the hash chain.
- A private trial. `deploy/local/compose.yaml` binds `127.0.0.1` and publishes no ports. The verification drive starts that same address and stops it before exiting.
- A pnpm TypeScript monorepo split into core, app, adapter, and conformance packages. CI rejects a dependency that points the wrong way. Core cannot import adapters.
- JCS (RFC 8785) canonicalization has one home: `canonicalize` in `@ix/jcs`. Values that are not JSON, and proxies, are rejected. Wire JSON is read first with `parseJson`, which rejects duplicate keys and integers outside the safe range. The nesting cap of 64 is this implementation's limit.
- Four of the six conformance items pass inside a recorded limit. They check the mock agents' signatures, the mock humans' approval signatures, and the hash chain. They do not check mandate signatures or the Agent Card JWS. Item 6 names the eighteen free-text cases it ran. The other two items stay `pending`. A green run is not a full pass. The mock humans are scripts, not a real person's approval.
- Violating dummies live in `fixtures/guardrails/` and stay out of the normal build. `pnpm guardrails` requires those dummies to fail and the allowed forms to pass.

Not built: wire A2A, mandate documents, a real human approval app, the way a person holds an approval key (outside the protocol), relay receipts (time stays the sender's declaration), key storage, private-key export, inclusion proofs, and MCP tools.

役割は [`docs/team.md`](docs/team.md)、エージェント向けの規則は [`AGENTS.md`](AGENTS.md) です。

## 参加する / How to contribute

手順は [`CONTRIBUTING.md`](CONTRIBUTING.md)、行動規範は [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) です。仕様の議論と不具合は GitHub の Issue を使います。

脆弱性は公開の Issue に書かないでください。[`SECURITY.md`](SECURITY.md) の非公開報告を使います。

The steps are in [`CONTRIBUTING.md`](CONTRIBUTING.md). The code of conduct is [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Use GitHub issues for spec discussion and defects.

Do not file a public issue for a vulnerability. Use the private report in [`SECURITY.md`](SECURITY.md).

## チェックの走らせ方 / How to run the checks

Node.js 22 と pnpm 10.33.4 が要ります。

```bash
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` は次を順に実行します。

| Command | What it checks |
| --- | --- |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint。`any`、型アサーション（`as` と山括弧）、非nullアサーション、`ts-ignore`、ソース内コメントを禁止します。例外は先頭の `/* SPDX-License-Identifier: Apache-2.0 */` だけです。`as const` は使えます。`JSON.stringify` は `@ix/jcs` の外では禁止です。 |
| `pnpm boundaries` | 依存の向き、コメント禁止（ライセンスヘッダを除く）、空の `catch`、無期限ループ、暗号ライブラリ、秘密鍵。検査自体の自己テストも含みます。 |
| `pnpm guardrails` | 禁止事項の見本が失敗し、許される書き方は成功する。`any`、危険な型変換、コメント、コアからアダプタまたはアプリへの依存。 |
| `pnpm test` | ユニットテスト。適合スイートは含みません。 |
| `pnpm conformance` | 適合テスト6項目。4項目は範囲つきで合格、2項目は `pending`。項目6は18件の自由文試験。模試のエージェントと模試の人間の署名、指紋の鎖は確かめるが、委任状の署名と Agent Card の JWS は確かめない。 |

CI は同じ6つを、別々のジョブで実行します。

**適合テストのジョブが緑でも、6項目すべてに合格したことにはなりません。** 合格は4項目だけで、委任状の署名と Agent Card の JWS は見ていません。1と2は未実施です。

エージェントが同じ確認をする入口は次です。

```bash
node scripts/verify-ix-node.mjs doctor
node scripts/verify-ix-node.mjs drive
node scripts/verify-ix-node.mjs cleanup
```

`drive` は検査のあとに `127.0.0.1` の中継と模試を起動し、`artifacts/verify/` に証拠を書きます。起動したプロセスは `drive` が止めます。`cleanup` はそのディレクトリを消しません。`artifacts/` は git の対象外です。毎晩の `Nightly` ワークフローは `pnpm check`、`pnpm conformance`、`drive` を実行します。

## レイアウト / Layout

```
packages/jcs                  JCS（RFC 8785）。正規化はここだけ
packages/config               open / closed
packages/identity             Ed25519 の JWS の検証と、メモリの中だけの署名。鍵の保管と書き出しは拒否
packages/protocol-core        拡張 URI 4つと、A2A-Extensions、正規化バイトの SHA-256
packages/distribution          依頼票の形とタグ検索。ハッシュも署名の確認もしない
packages/log                   透明性ログのスタブ
packages/a2a-ext-*             項目を1つずつ確定させる交渉の機械。委任範囲・承認・履歴はスタブ
packages/node                  プロセス内の中継。パッケージはポートを開かない
packages/agents                模試の発注側と受注側。署名して、確かめる
packages/verify                中継の記録の読み直し。署名・指紋の鎖・期限を確かめる
packages/ledger                台帳のスタブ
packages/approval-app          承認アプリのスタブ。署名を拒否する
packages/adapters              メモリの置き場。他から依存されない
packages/conformance           適合テスト。4項目は範囲つき合格、2項目は未実施
deploy/                        設定例と、127.0.0.1 だけの試験
vectors/                       固定ベクトルの説明。実体はパッケージのテスト。鍵は無い
docs/spec/                     仕様（CC BY 4.0）
docs/negotiation-states.md     項目ごとの交渉の進み方。非エンジニア向け
docs/distribution.md           依頼票の配り方。非エンジニア向け
docs/local-trial.md            手元だけの試験。非エンジニア向け
docs/feature-map.md            動くものと、まだないもの
docs/retrospective.md          ここまでの記録。非エンジニア向け
docs/team.md                   チーム
SECURITY.md                    脆弱性の非公開報告
CONTRIBUTING.md                参加の手順
CODE_OF_CONDUCT.md             Contributor Covenant 2.1
.cursor/skills/verify-ix-node/ 検証手順。drive は 127.0.0.1 を起動する
.cursor/settings.json          pstack を有効にする
fixtures/guardrails/           検査を破る見本。ビルド対象外
```

## ライセンス / License

コードは [Apache-2.0](LICENSE) です。仕様の本文は [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) です。詳しくは [`NOTICE`](NOTICE) と [`docs/spec/README.md`](docs/spec/README.md) を見てください。

Code is [Apache-2.0](LICENSE). The specification text is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See [`NOTICE`](NOTICE) and [`docs/spec/README.md`](docs/spec/README.md).
