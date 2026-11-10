## 概要 / Summary

## ディレクター向け / For the director

（非エンジニアが読める、短い日本語。何が変わるか、まだ危険なままなことは何か。）

## 人間の確認 / Human review

次のどれかに触れるときは、CI が緑でもマージしません。[`docs/team.md`](docs/team.md) の担当を書いてください。

- [ ] 署名、鍵、委任範囲、承認には触れていない
- [ ] JCS の実装、ハッシュの方式、`prevHash` の規則には触れていない
- [ ] 透明性ログの記録形式には触れていない
- [ ] 拡張 URI、イベントの `kind`、タグには触れていない
- [ ] ローカルルールやスパム方針の法的内容には触れていない
- [ ] 触れている場合、セキュリティレビュアーまたは `docs/team.md` の担当が受け入れるまでマージしない

Do not merge a change that touches signatures, keys, mandates, approvals, JCS, the hash, a `prevHash` rule, transparency-log record formats, an extension URI, an event `kind` or tag, or the legal content of a local rule, until the person in `docs/team.md` has accepted it. Green CI is not that acceptance.

## 確認 / Checks

- [ ] `pnpm check` が通る
- [ ] 適合テストの結果を、書いた範囲より強く言っていない（`pending` の2項目を `pass` にしていない）
- [ ] 秘密鍵、トークン、他人の連絡先を入れていない
- [ ] [`docs/ops/checklist.md`](docs/ops/checklist.md) の各項目に、ok か該当なしで答えた

`pnpm check` passes. No conformance result is stated more strongly than its recorded limit, and no `pending` item was flipped to `pass`. No private keys, tokens, or someone else's contact details. Each line of [`docs/ops/checklist.md`](docs/ops/checklist.md) is answered.
