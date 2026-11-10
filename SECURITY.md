# セキュリティ / Security

**実験的なソフトウェアです。本番では使わないでください。セキュリティ監査は、まだありません。**

**Experimental software. Do not use it in production. There has not been a security audit.**

このリポジトリの署名は、模試のエージェントと模試の人間が、実行のたびにメモリの中だけで作る鍵で行います。本物の鍵の保管、本物の承認アプリ、回線上の A2A、委任状、中継の受領印、透明性ログはありません。本物の仕事や個人の情報を、このコードに渡さないでください。

The signatures here are made by mock agents and mock humans with keys created in memory for one run. There is no real key storage, no real approval app, no wire A2A, no mandate documents, no relay receipts, and no transparency log. Do not feed this code real jobs or personal data.

## 脆弱性の報告 / Reporting a vulnerability

公開の Issue、Pull Request、Discussion には書かないでください。GitHub の非公開脆弱性報告（private vulnerability reporting）を使います。

Do not open a public issue, pull request, or discussion. Use GitHub private vulnerability reporting.

報告フォーム:

https://github.com/ranma-s/a2aix/security/advisories/new

このフォームは、リポジトリオーナーが Settings → Advanced Security で Private vulnerability reporting をオンにするまで受け付けません。フォームがまだ使えないあいだは、詳細を公開の場に書かず、GitHub の [@ranma-s](https://github.com/ranma-s) に非公開で連絡し、アドバイザリを開いてもらってください。

The form does not accept reports until the repository owner turns on Private vulnerability reporting under Settings → Advanced Security. Until the form works, contact [@ranma-s](https://github.com/ranma-s) on GitHub, do not post the details in public, and ask them to open the advisory.

## 報告に書くこと / What to include

- どのパッケージ、どのコミットか。
- 悪用されたとき、何が起きるか。
- 再現に必要な観察。公開の場に手順を写さないでください。
- 名前を出してよければ、GitHub のハンドル。

- The package and commit.
- What an attacker could do.
- What you observed, enough to reproduce. Do not paste that procedure into a public place.
- Your GitHub handle, if you want to be named.

署名、鍵、JCS、ハッシュ、`prevHash` に関する報告は、[`docs/team.md`](docs/team.md) の人間のセキュリティレビュアーにも見てもらいます。報奨金のプログラムと、返答期限の約束は、まだありません。

Reports about signatures, keys, JCS, the hash, or `prevHash` also go to the human security reviewer named in [`docs/team.md`](docs/team.md). There is no bug bounty and no response-time promise yet.

## 範囲 / Scope

対象は、このリポジトリのコードと文書です。

仕様の文章の議論で、攻撃の手順にならないものは、公開の Issue で構いません。規範になる本文は [`docs/spec/ix-spec-v0.3.md`](docs/spec/ix-spec-v0.3.md) の「交渉の拡張仕様（案 v0.3）」です。いまのコードの動きの短い説明は [`docs/spec/ix-standard.md`](docs/spec/ix-standard.md) です。

This policy covers the code and documents in this repository.

A spec discussion that does not hand over an attack procedure can be a public issue. The normative text is the section 「交渉の拡張仕様（案 v0.3）」 in [`docs/spec/ix-spec-v0.3.md`](docs/spec/ix-spec-v0.3.md). A short description of what the code does today is [`docs/spec/ix-standard.md`](docs/spec/ix-standard.md).
