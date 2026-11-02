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

土台だけです。プロトコルの動作はまだありません。

- pnpm の TypeScript モノレポ。コア、アプリ、アダプタ、適合スイートをパッケージに分けてあります。
- 依存の向きを CI で検査します。コアからアダプタへは戻れません。
- JCS（RFC 8785）の正規化は `@ix/jcs` の `canonicalize` だけが担当します。中身は未実装で、呼ぶと失敗します。テストベクトルは TODO です。
- 署名、鍵の生成、鍵の保管は入れていません。人間のセキュリティレビュアーの前には作りません。
- 適合テスト6項目の置き場所はあります。結果はすべて未実施（`pending`）です。
- 検査を破る見本が `fixtures/guardrails/` にあります。普通のビルドには入れません。`pnpm guardrails` は、見本が失敗することと、許される書き方は成功することを確かめます。

This revision is the foundation. Protocol behavior is not implemented.

- A pnpm TypeScript monorepo split into core, app, adapter, and conformance packages.
- CI rejects a dependency that points the wrong way. Core cannot import adapters.
- JCS (RFC 8785) canonicalization has one home: `canonicalize` in `@ix/jcs`. It throws. Test vectors are TODO.
- Signing, key generation, and key storage are absent, and they stay absent until a human security reviewer has accepted them.
- The six conformance items have a home. Every result is `pending`.
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
| `pnpm conformance` | 適合テスト6項目の仮実行。すべて `pending` であることを確かめます。 |

CI は同じ6つを、別々のジョブで実行します。

**適合テストのジョブが緑でも、6項目は未実施です。** 緑は「仮の一覧がまだ未実施のまま」という意味です。

エージェントが同じ確認をする入口は次です。

```bash
node scripts/verify-ix-node.mjs doctor
node scripts/verify-ix-node.mjs drive
node scripts/verify-ix-node.mjs cleanup
```

`drive` は `artifacts/verify/` に証拠を書きます。`cleanup` はそのディレクトリを消しません。`artifacts/` は git の対象外です。ノードのプロセスは、まだ起動しません。

## レイアウト / Layout

```
packages/jcs                  JCS の置き場所（未実装）
packages/config               open / closed
packages/identity             鍵操作の拒否。鍵そのものは無い
packages/protocol-core        拡張 URI 4つ
packages/log                   透明性ログのスタブ
packages/a2a-ext-*             交渉・委任範囲・承認・履歴のスタブ
packages/node                  ノードのスタブ。ポートは開かない
packages/ledger                台帳のスタブ
packages/approval-app          承認アプリのスタブ。署名しない
packages/adapters              アダプタ。他から依存されない
packages/conformance           適合テストの仮実装
deploy/                        設定例だけ
vectors/                       固定ベクトルの置き場所。中身はまだ無い
docs/spec/                     仕様（CC BY 4.0）
docs/team.md                   チーム
.cursor/skills/verify-ix-node/ 検証手順のスタブ
.cursor/settings.json          pstack を有効にする
fixtures/guardrails/           検査を破る見本。ビルド対象外
```

## ライセンス / License

コードは [Apache-2.0](LICENSE) です。仕様の本文は [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) です。詳しくは [`NOTICE`](NOTICE) と [`docs/spec/README.md`](docs/spec/README.md) を見てください。

Code is [Apache-2.0](LICENSE). The specification text is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See [`NOTICE`](NOTICE) and [`docs/spec/README.md`](docs/spec/README.md).
