# 参加する / Contributing

**実験的なソフトウェアです。本番では使わないでください。セキュリティ監査は、まだありません。**

**Experimental software. Do not use it in production. There has not been a security audit.**

行動規範は [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) です。脆弱性は公開の Issue に書かず、[`SECURITY.md`](SECURITY.md) に従ってください。

The code of conduct is [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Report vulnerabilities as [`SECURITY.md`](SECURITY.md) describes, not in a public issue.

## 言語 / Language

日本語と英語のどちらでも書いてください。ディレクターは日本語を読みます。識別子、コマンド、パッケージ名、コードは英語のままにしてください。

Write in Japanese or English. The director reads Japanese. Leave identifiers, commands, package names, and code in English.

## まず読むもの / Read this first

- [`README.md`](README.md)
- [`docs/spec/ix-standard.md`](docs/spec/ix-standard.md)：いまのコードの動きの短い説明（英語が先、日本語があと）。
- [`docs/spec/ix-spec-v0.3.md`](docs/spec/ix-spec-v0.3.md) の「交渉の拡張仕様（案 v0.3）」。この節より前の事業の数字は仮説であり、要件ではありません。
- [`docs/team.md`](docs/team.md)
- 実装に触るなら [`AGENTS.md`](AGENTS.md)。人もエージェントも、この規則に従います。

The short standard is `docs/spec/ix-standard.md`. The section 「交渉の拡張仕様（案 v0.3）」 is the normative spec. The business figures above that section are hypotheses, not requirements. Anyone who changes code follows `AGENTS.md`.

## いま直せるもの / What you can change

- 仕様の文章（`docs/spec/`、CC BY 4.0）。食い違いは Issue に書いてください。
- 文書、Issue、テスト。
- [`AGENTS.md`](AGENTS.md) の規則に沿った土台のコード。

- Specification text under `docs/spec/` (CC BY 4.0). Report a mismatch as an issue.
- Docs, issues, and tests.
- Foundation code that follows the rules in [`AGENTS.md`](AGENTS.md).

## まだ入れないもの / Do not add these yet

[`AGENTS.md`](AGENTS.md) のとおり、次は実装しません。

- 回線上の A2A、委任状、本物の人間の承認アプリ、人が承認の鍵をどう持つか、中継の受領印、鍵の保管、秘密鍵の書き出し、包含証明、MCP のツール。
- ノードを起動するサーバー。検証手順を通すためにプロセスを足さないでください。

As `AGENTS.md` says, do not implement wire A2A, mandate documents, a real human approval app, the way a person holds an approval key, relay receipts, key storage, private-key export, inclusion proofs, or MCP tools. Do not add a server to make the verification run.

## 人間の確認 / Human review

次の変更は、CI が緑でも自動ではマージしません。Pull Request にその旨を書き、[`docs/team.md`](docs/team.md) の担当が見るまで待ってください。

- 署名、鍵、委任範囲、承認。
- JCS の実装、ハッシュの方式、`prevHash` の規則。
- 透明性ログの記録形式。
- 拡張 URI の変更、イベントの `kind` やタグの追加。
- ローカルルール、スパム方針、その他スポットの弁護士が見る法的内容。

These are not auto-merged, even when CI is green. Say so in the pull request and wait for the person named in [`docs/team.md`](docs/team.md).

- Signatures, keys, mandates, approvals.
- Implementing JCS, choosing the hash, or changing a `prevHash` rule.
- Transparency-log record formats.
- Bumping an extension URI, or adding an event `kind` or tag.
- The legal content of a local rule, a spam policy, or anything the spot lawyer is listed for.

## チェック / Checks

Node.js 22 と pnpm 10.33.4 が要ります。

```bash
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` は、型、lint、依存の向き、ガードレールの自己テスト、ユニットテスト、適合テストです。適合テストの6項目のうち4項目は、書いた範囲だけで合格にしています。残り2項目は `pending` のままにしてください。緑でも、6項目すべてに合格したことにはなりません。検査を弱めて通さないでください。Pull Request の前に [`docs/ops/checklist.md`](docs/ops/checklist.md) の各項目に答えてください。

`pnpm check` is typecheck, lint, dependency boundaries, the guardrail self-test, unit tests, and the conformance suite. Four of the six conformance items pass only inside a recorded limit. Leave the other two `pending`. A green run is not a full pass. Do not weaken a check to make a change pass. Answer each line of [`docs/ops/checklist.md`](docs/ops/checklist.md) before a pull request.

## Pull Request

変更は一つにまとめてください。テンプレートに、ディレクター向けの短い日本語を書いてください。

- 秘密鍵、トークン、他人の連絡先を入れない。
- 適合項目を、書いた範囲より強く合格にしない。
- 人間の確認が要る変更なら、そのことを本文に書く。

Keep a pull request to one change. Fill in the template, including a short Japanese note for the director. Do not add private keys, tokens, or someone else's contact details. Do not state a conformance result more strongly than its recorded limit. If the change needs a human reviewer, say so in the body.

## ライセンス / License

コードへの貢献は [Apache-2.0](LICENSE) です。仕様の文章は [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) のままです。意図して送ったコードは、Apache-2.0 の第5項に従います。詳しくは [`NOTICE`](NOTICE) を見てください。

Code contributions are under [Apache-2.0](LICENSE). Specification text stays [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). A code contribution you intentionally submit is under section 5 of the Apache License. See [`NOTICE`](NOTICE).
