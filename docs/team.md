# チーム

IX の役です。人の名前が書いていない役は、まだ特定のアカウントに固定していません。ディレクターが指名します。

## ディレクター

このリポジトリのオーナーです。非エンジニアです。何を作るか、いつ公開するか、何を危険と見るかの最終判断を持ちます。

## コーディネーター

A です。仕様の読み合わせ、チケットの切り方、実装エージェントと検証エージェントへの依頼を担います。

## 実装エージェント

Cursor のクラウドエージェントです。チケット単位で実装します。自分の出力だけで完了にしません。

## 検証エージェント

実装したエージェントとは別のクラウドエージェントです。`.cursor/skills/verify-ix-node/` と CI で確かめます。実装と検証を同じ実行にまとめません。

## セキュリティレビュアー（人間）

署名、鍵、委任範囲（mandate）、承認（approval）に触れる作業の前に入れます。JCS の実装、ハッシュの方式、透明性ログの記録形式も、この人の確認が要ります。開発環境と CI に本物の鍵は置きません。テスト鍵も、このレビューの前には作りません。

## 署名の空席（T09・T10）

拡張ヘッダーと、依頼票の掲載・検索・購読は、署名を確かめません。依頼票の `sig` は空席です。プログラムは `signatureVerification` を `deferred` と記録し、中身を見ません。`id` も、正規化した本文のハッシュとしては計算しません。呼び出し側が渡した文字列を、そのまま保管します。

JCS（正規化）とハッシュは、未マージの PR #3 にあります。人間のセキュリティレビュアーが受け入れるまで、署名の検証、鍵、JWS には進みません。この空席を、確認済みの署名と読まないでください。

## 署名の空席（T11・T14）

模試の発注側と受注側は、中継を通して交渉の段階を進めます。適合テストのうち3項目は、署名を見ない範囲だけで合格にしています。メッセージの形、自分の数値の上限・下限、渡した時計での期限です。署名、JCS、JWS が要る項目は未実施のままです。`prevHash` と `transcriptHash` とイベントの `id` と `sig` は、呼び出し側が渡した文字列で、計算も確認もしていません。人の承認は台本です。承認アプリは、今も署名を拒否します。委任の拡張パッケージはスタブのままです。

この合格を、署名が確認された契約や、6項目すべての適合と読まないでください。未マージの PR #3 が正規化です。人間のセキュリティレビュアーが受け入れるまで、署名の検証には進みません。手元の試験は `127.0.0.1` だけを聞き、外には開きません。

## 自由文と未確認の検査（T12・T15）

適合の6番は、自由文の18件を模試と中継に対して実行したときだけ合格です。名前は [`feature-map.md`](feature-map.md) にあります。署名、JCS、JWS、prevHash が本物のハッシュかは、未確認（`deferred`）のままです。検証の `drive` は `127.0.0.1` の中継と模試を起動し、終わったら止めます。毎晩の検査も同じです。この合格を、署名が確認されたことと読まないでください。

## 弁護士（スポット）

常駐しません。必要なときに依頼します。最初に見るのは次です。

- ローカルルールが法律に合うか。
- 職業紹介の許可が要る範囲か。
- 証明のハッシュを、個人情報として消せるか。

## 進め方

最初のノードは、ただの一台です。中央ではありません。段階0では、実装を1本ずつ人間が見られる大きさに保ちます。署名、鍵、公開後に消せない記録は、自動マージしません。

# Team

Roles for IX. A role without a named account is not assigned yet. The director names the person.

| Role | Who | What they decide |
| --- | --- | --- |
| Director | The repository owner. Not an engineer. | What to build, when to publish, and what is out of bounds. |
| Coordinator | A. | Reading the spec, cutting tickets, and sending work to cloud agents. |
| Implementer | A Cursor cloud agent. | One ticket at a time. Its own report is not completion. |
| Verifier | A different Cursor cloud agent. | Runs `.cursor/skills/verify-ix-node/` and CI. Not the same run as the implementer. |
| Security reviewer | A human, engaged when needed. | Must review before any work on signatures, keys, mandates, or approvals. Also JCS, hash rules, and transparency-log record formats. No real keys in dev or CI. No test keys before this review. |
| Lawyer | Spot, not resident. | Whether a local rule matches the law, whether job-introduction licensing applies, and whether a proof hash can be erased as personal data. |

The first node is an ordinary peer. It is not a root. Signature, key, and append-only record changes are not auto-merged.

## Signature placeholders in T11 and T14

The mock poster and worker drive the negotiation phases through the relay. Three conformance items pass only where a signature is not required: message structure, a private numeric bound, and an injected clock. Items that need signatures, JCS, or JWS stay pending. `prevHash`, `transcriptHash`, event `id`, and `sig` are caller-supplied strings. They are not computed and not checked. Human approval in the mock is a script. The approval app still refuses to sign. The mandate package stays a stub.

Do not read those passes as a checked contract or as a six-item credential. Unmerged PR #3 is the canonicalization work. Signature checks stay stopped until a human security reviewer accepts that design. The private trial listens on `127.0.0.1` only.

## Free text and deferred checks (T12 and T15)

Conformance item 6 passes only when the eighteen free-text cases ran against the mock agents and the relay. The names are in [`feature-map.md`](feature-map.md). Signature, JCS, JWS, and whether `prevHash` is a real hash stay `deferred`. The verification drive starts the relay and the mocks on `127.0.0.1` and stops them. The nightly job does the same. Do not read that pass as a checked signature.

## Signature placeholders in T09 and T10

The extension header and publish/query/subscribe do not check signatures. An event's `sig` is a placeholder. The relay records `signatureVerification` as `deferred` and does not read the material. `id` is not computed as a hash of canonical bytes. The caller-supplied string is stored as given.

JCS and hashing are in unmerged PR #3. Signature checks, keys, and JWS stay stopped until a human security reviewer accepts that design. Do not read the placeholder as a verified signature.
