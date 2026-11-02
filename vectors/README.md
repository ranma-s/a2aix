# Vectors

Fixed vectors for JCS, signatures, and `prevHash` chains will live here.

Do not add them in this revision.

- JCS vectors are TODO. The names of the RFC 8785 cases are listed as `it.todo` in `packages/jcs/test/canonicalize.test.ts`. Expected bytes are not invented here.
- Signature vectors and `prevHash` vectors wait until a human security reviewer has accepted the canonicalization and the signature scheme.
- Do not commit sample private keys, or hashes computed with `JSON.stringify`.

# ベクトル

JCS、署名、`prevHash` 連鎖の固定ベクトルは、ここに置きます。

このリビジョンでは置きません。

- JCS のベクトルは未着手です。RFC 8785 の項目名だけを `packages/jcs` のテストの `it.todo` に書いてあります。期待するバイト列は作っていません。
- 署名と `prevHash` のベクトルは、人間のセキュリティレビュアーが正規化と署名方式を認めるまで置きません。
- 試しの秘密鍵や、`JSON.stringify` で計算したハッシュは入れません。
