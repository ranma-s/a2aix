# IX

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

土台に、交渉の段階、依頼票の手元の中継、模試の発注側・受注側、そして署名を見ない検査を足してあります。署名は確認しません。段階は [`docs/negotiation-states.md`](docs/negotiation-states.md)、配り方は [`docs/distribution.md`](docs/distribution.md)、手元だけの試し方は [`docs/local-trial.md`](docs/local-trial.md)、到達点は [`docs/feature-map.md`](docs/feature-map.md)、ここまでの記録は [`docs/retrospective.md`](docs/retrospective.md) です。

- 交渉の段階機械。提案、対案、合意案、人間の承認・却下、3往復、期限を扱います。時計は外から渡します。署名の欄は後で確認するための空席で、中身は見ていません。
- 拡張の名乗り。`A2A-Extensions` に、4つの拡張のうち相手と自分の両方が持つものだけを返します。交渉は、委任・承認・履歴が揃ったときだけ有効です。違う版は、別の版で代わりに受けません。
- 依頼票の掲載・検索・購読。タグ、種類、期間で探します。最初の置き場はメモリです。開いたノードだけが掲載を受けます。`id` と署名欄は渡された文字列のままで、確認しません。パッケージ自体はポートを開きません。
- 模試の発注側と受注側。中継に依頼票と交渉メッセージを載せ、段階機械を進めます。金額が自分の上限・下限の外なら出しません。期限ちょうどには返事をしません。自由文は命令にしません。人に見せる文面からは連絡先を除きます。人の承認は台本です。
- 署名を見ない検査。メッセージの形、段階機械への再生、数値の範囲、期限を見ます。署名、JCS、JWS、prevHash は未確認（`deferred`）のままです。
- 手元だけの試験。`deploy/local/compose.yaml` は `127.0.0.1` だけを聞き、ポートを公開しません。検証の `drive` も、同じ住所だけを起動して、終わったら止めます。
- pnpm の TypeScript モノレポ。コア、アプリ、アダプタ、適合スイートをパッケージに分けてあります。
- 依存の向きを CI で検査します。コアからアダプタへは戻れません。
- JCS（RFC 8785）の正規化は `@ix/jcs` の `canonicalize` だけが担当します。JSON でない値とプロキシは拒否します。回線上の JSON は、その前に `parseJson` で読み、重複キーと安全整数の外の整数を拒否します。入れ子の上限 64 は、この実装の上限です。配列の幅に上限はありません。
- 正規化バイトの SHA-256（小文字の16進）は `@ix/protocol-core` にあります。将来の署名の対象は、トップレベルの `signature` を除いた JCS 文字列（`signingInputExcludingSignature`）です。指紋そのものは署名の対象ではありません。`hashCanonicalBody` は `signature` を消しません。署名の実装はまだありません。
- 署名、鍵の生成、鍵の保管は入れていません。人間のセキュリティレビュアーの前には作りません。JCS とハッシュ方式の変更も、その人の確認が要ります。
- 適合テスト6項目のうち、署名なしで確かめられる4項目を、範囲を書いたうえで合格にしています。自由文の試験は18件で、名前は結果に残します。残り2項目は未実施です。緑でも、6項目すべてに合格したことにはなりません。
- 検査を破る見本が `fixtures/guardrails/` にあります。普通のビルドには入れません。`pnpm guardrails` は、見本が失敗することと、許される書き方は成功することを確かめます。

This revision is the foundation, the negotiation phase rules, an in-memory relay, mock poster and worker agents, and the checks that do not look at signatures. Signatures are not checked. The plain-language maps are [`docs/negotiation-states.md`](docs/negotiation-states.md), [`docs/distribution.md`](docs/distribution.md), [`docs/local-trial.md`](docs/local-trial.md), [`docs/feature-map.md`](docs/feature-map.md), and [`docs/retrospective.md`](docs/retrospective.md).

- A negotiation phase machine: proposal, counter-proposal, agreement draft, human approve/reject, a 3-round cap, and deadlines. The clock is injected. The signature field is a placeholder and is not verified.
- Extension activation. `A2A-Extensions` returns only the profile URIs both sides listed. Negotiation turns on only together with mandate, approval, and transcript. A different version is not answered with this one.
- In-process publish, query, and subscribe by tag, kind, and time. The first store is memory. Only an open node accepts publish. `id` and `sig` are stored as given and are not checked. The package opens no port.
- Mock poster and worker agents. They put the job and the negotiation messages on a relay and apply the phase machine. An offer outside their own numeric bound is not sent. Nothing is sent at the deadline. Free text is not an instruction. Contact details are removed from the copy a human would see. Human approval is a script.
- Checks that do not look at a signature: message shape, phase-machine replay, numeric bounds, and deadlines. Signature, JCS, JWS, and prevHash stay `deferred`.
- A private trial. `deploy/local/compose.yaml` binds `127.0.0.1` and publishes no ports. The verification drive starts that same address and stops it before exiting.
- A pnpm TypeScript monorepo split into core, app, adapter, and conformance packages.
- CI rejects a dependency that points the wrong way. Core cannot import adapters.
- JCS (RFC 8785) canonicalization has one home: `canonicalize` in `@ix/jcs`. Values that are not JSON, and proxies, are rejected. Wire JSON is read first with `parseJson`, which rejects duplicate keys and integers outside the safe range. The nesting cap of 64 is this implementation's limit. Array length is not capped.
- SHA-256 of those UTF-8 bytes, lowercase hex, lives in `@ix/protocol-core`. The text a future signature would cover is `signingInputExcludingSignature`: JCS with the top-level `signature` removed. The hash itself is not that text. `hashCanonicalBody` does not remove `signature`. Signing is still absent.
- Signing, key generation, and key storage are absent, and they stay absent until a human security reviewer has accepted them. Changes to JCS or the hash also wait for that reviewer.
- Four of the six conformance items pass inside a recorded limit that does not check signatures. Item 6 names the eighteen free-text cases it ran. The other two stay `pending`. A green run is not a full pass.
- Violating dummies live in `fixtures/guardrails/` and stay out of the normal build. `pnpm guardrails` requires those dummies to fail and the allowed forms to pass.

役割は [`docs/team.md`](docs/team.md)、エージェント向けの規則は [`AGENTS.md`](AGENTS.md) です。

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
| `pnpm conformance` | 適合テスト6項目。4項目は範囲つきで合格、2項目は `pending`。項目6は18件の自由文試験。署名の確認ではありません。 |

CI は同じ6つを、別々のジョブで実行します。

**適合テストのジョブが緑でも、6項目すべてに合格したことにはなりません。** 合格は4項目だけで、署名は見ていません。1と2は未実施です。

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
packages/identity             鍵操作の拒否。鍵そのものは無い
packages/protocol-core        拡張 URI 4つと、A2A-Extensions、正規化バイトの SHA-256
packages/distribution          依頼票の形とタグ検索。署名は見ない
packages/log                   透明性ログのスタブ
packages/a2a-ext-*             交渉の段階機械。委任範囲・承認・履歴はスタブ
packages/node                  プロセス内の中継。パッケージはポートを開かない
packages/agents                模試の発注側と受注側。署名は見ない
packages/verify                署名を見ない検査。署名などは deferred
packages/ledger                台帳のスタブ
packages/approval-app          承認アプリのスタブ。署名しない
packages/adapters              メモリの置き場。他から依存されない
packages/conformance           適合テスト。4項目は範囲つき合格、2項目は未実施
deploy/                        設定例と、127.0.0.1 だけの試験
vectors/                       固定ベクトルの説明。実体はパッケージのテスト。鍵は無い
docs/spec/                     仕様（CC BY 4.0）
docs/negotiation-states.md     交渉の段階。非エンジニア向け
docs/distribution.md           依頼票の配り方。非エンジニア向け
docs/local-trial.md            手元だけの試験。非エンジニア向け
docs/feature-map.md            動くものと、まだないもの
docs/retrospective.md          ここまでの記録。非エンジニア向け
docs/team.md                   チーム
.cursor/skills/verify-ix-node/ 検証手順。drive は 127.0.0.1 を起動する
.cursor/settings.json          pstack を有効にする
fixtures/guardrails/           検査を破る見本。ビルド対象外
```

## ライセンス / License

コードは [Apache-2.0](LICENSE) です。仕様の本文は [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) です。詳しくは [`NOTICE`](NOTICE) と [`docs/spec/README.md`](docs/spec/README.md) を見てください。

Code is [Apache-2.0](LICENSE). The specification text is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See [`NOTICE`](NOTICE) and [`docs/spec/README.md`](docs/spec/README.md).
