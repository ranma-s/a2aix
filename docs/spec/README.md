# Specification text

`ix-spec-v0.3.md` is the current IX document. It contains three parts that arrived in one file:

1. The business note.
2. The negotiation extension draft (v0.3): Nostr-relay-style signed events, and four A2A profile extensions under `https://w3id.org/a2a-job/`.
3. A recruiting draft.

The normative protocol text for implementation is the section **交渉の拡張仕様（案 v0.3）**. Business numbers in the first part are hypotheses, not requirements.

The negotiation itself is now the term-by-term draft, [`term-protocol-draft.md`](term-protocol-draft.md). How it moves, in plain language, is [`../negotiation-states.md`](../negotiation-states.md).

The short standard, written from the code and `decisions.tsv`, is [`ix-standard.md`](ix-standard.md): term-by-term negotiation, the hash chain, agent and approval signatures, and the replay procedure, in English and Japanese.

## License

This text is **CC BY 4.0**: <https://creativecommons.org/licenses/by/4.0/>

Code in the rest of the repository is **Apache-2.0**. See `/LICENSE` and `/NOTICE`. The two licenses are separate. Editing the spec does not relicense the code, and editing the code does not relicense the spec.

# 仕様の本文

`ix-spec-v0.3.md` が、いまの IX の文書です。次の3つが1つのファイルに入っています。

1. 事業のメモ。
2. 交渉の拡張仕様（案 v0.3）。署名つきイベントを Nostr のリレーのように配り、`https://w3id.org/a2a-job/` の下に A2A のプロファイル拡張を4つ置く。
3. 副業人材への誘い文句の案。

実装が従う本文は **交渉の拡張仕様（案 v0.3）** です。前半の事業の数字は仮説であり、要件ではありません。

交渉そのものは、項目を1つずつ確定させる案 [`term-protocol-draft.md`](term-protocol-draft.md) に置き換えました。進み方をエンジニア以外向けに書いたものが [`../negotiation-states.md`](../negotiation-states.md) です。

コードと `decisions.tsv` から書き起こした短い標準が [`ix-standard.md`](ix-standard.md) です。項目ごとの交渉、指紋の鎖、エージェントと承認の署名、読み直しの手順を、英語と日本語で書いています。

## ライセンス

この本文は **CC BY 4.0** です。

リポジトリのコードは **Apache-2.0** です。`/LICENSE` と `/NOTICE` を見てください。仕様を直してもコードのライセンスは変わりません。コードを直しても仕様のライセンスは変わりません。
