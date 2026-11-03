# Vectors

Fixed JCS and canonical-hash vectors live in the package tests, because a package test cannot import a file outside its package.

- `packages/jcs/test/canonicalize.test.ts` locks RFC 8785 section 3.2.3, the UTF-16 key-order sample, appendix B number serialization (including minus zero), string escaping, nested objects, and values that must be rejected.
- `packages/protocol-core/test/hash.test.ts` locks SHA-256 (lowercase hex) of those canonical UTF-8 bytes, including tampered bodies and tampered hashes that must fail `verifyCanonicalBodyHash`.
- The expected hashes were computed outside this package, from the canonical UTF-8, and checked against the RFC 8785 sample bytes.
- `packages/jcs/test/parse.test.ts` rejects duplicate keys and integers outside ±9007199254740991. Appendix B numbers are still passed to `canonicalize` as JavaScript numbers, not through `parseJson`.
- Signature vectors are not here. There are no private keys. `hashCanonicalBody` does not remove a `signature` field. `signingInputExcludingSignature` removes only the top-level field, and that result is canonical text, not a hash.
- These vectors are not a conformance pass. A human security reviewer still has to accept the canonicalization and the hash encoding. See `docs/team.md`.

# ベクトル

JCS と正規化ハッシュの固定ベクトルは、パッケージのテストにあります。パッケージのテストは、パッケージの外のファイルをインポートできないためです。

- `packages/jcs/test/canonicalize.test.ts` が、RFC 8785 の 3.2.3、UTF-16 のキー順、付録 B の数値（マイナスゼロを含む）、文字列のエスケープ、入れ子、拒否すべき値を固定します。
- `packages/protocol-core/test/hash.test.ts` が、その正規化 UTF-8 の SHA-256（小文字の16進）を固定します。改ざんした本文と改ざんしたハッシュは `verifyCanonicalBodyHash` が不一致にします。
- 期待するハッシュは、このパッケージの外で正規化 UTF-8 から計算し、RFC 8785 の見本バイトと照合しています。
- `packages/jcs/test/parse.test.ts` は、重複キーと ±9007199254740991 の外の整数を拒否します。付録 B の数値は、`parseJson` を通さず、JavaScript の数として `canonicalize` に渡しています。
- 署名のベクトルはありません。秘密鍵もありません。`hashCanonicalBody` は `signature` フィールドを消しません。`signingInputExcludingSignature` はトップレベルの欄だけを除き、結果は指紋ではなく正規化文字列です。
- このベクトルは適合合格ではありません。正規化とハッシュの符号化は、人間のセキュリティレビュアーの確認が残っています。`docs/team.md` を見てください。
