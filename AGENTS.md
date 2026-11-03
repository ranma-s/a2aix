# AGENTS.md

Rules for agents working on IX. Japanese is the director's language. The table is normative in both columns. Identifiers and commands stay in English.

Read `docs/spec/ix-spec-v0.3.md`, section `交渉の拡張仕様（案 v0.3）`, before changing protocol packages. The business numbers above that section are not requirements. `docs/team.md` names who must look at a change.

This revision is the foundation. Do not implement publish, query, subscribe, negotiation, mandates, approvals, transcripts, inclusion proofs, or MCP tools. Do not add a server to make the verification skill look runnable.

## Rules

| Rule | 規則 | What enforces it |
| --- | --- | --- |
| Core packages do not import app, adapter, or suite packages. App packages do not import adapters or other apps. Nothing imports `@ix/adapters` or `@ix/conformance`. | コアはアプリ・アダプタ・適合スイートに依存しない。アプリはアダプタや他のアプリに依存しない。`@ix/adapters` と `@ix/conformance` をインポートするものはない。 | `policy/boundaries.json` and `pnpm boundaries`. The checker rejects a bad edge even if `package.json` declares it. Its self-test must keep failing on a reversed edge. |
| A new `@ix/*` dependency is declared in both `package.json` (`workspace:*`) and `policy/boundaries.json`. | 新しい `@ix/*` 依存は `package.json` と `policy/boundaries.json` の両方に書く。 | `pnpm boundaries` fails on drift either way. |
| Packages do not import Node built-ins, crypto libraries, or other external packages. Test files may import `vitest`. The one built-in exception is `import { types } from "node:util"` in `packages/jcs/src`, used only as `types.isProxy`. | パッケージは Node の組み込み、暗号ライブラリ、その他の外部パッケージをインポートしない。テストだけ `vitest` をインポートしてよい。組み込みの例外は `packages/jcs/src` の `import { types } from "node:util"` だけで、使い道は `types.isProxy` だけ。 | `pnpm boundaries`. `node:crypto` and other built-ins stay rejected. `node:util` outside `@ix/jcs`, or any `types` member other than `isProxy`, is rejected. The only platform hash call is `crypto.subtle.digest("SHA-256", ...)` in `packages/protocol-core/src`, next to `TextEncoder`. `.sign` and Web Crypto key methods are rejected in every package. |
| Canonical bytes for hashing or signing come from `canonicalize` in `@ix/jcs`. Do not call `JSON.stringify` for that, and do not define another `canonicalize`. Inside `packages/jcs/src`, `JSON.stringify` may encode only a JSON primitive or a property name. `canonicalize` writes objects and arrays and sorts keys by UTF-16 code units. It rejects data that is not JSON, including `undefined`, non-finite numbers, lone surrogates, sparse arrays, accessors, and `toJSON`. Nesting stops at 64 arrays or objects. | ハッシュや署名の対象バイトは `@ix/jcs` の `canonicalize` だけが作る。その目的で `JSON.stringify` を使わない。`canonicalize` を別に定義しない。`packages/jcs/src` の中では、`JSON.stringify` は JSON のプリミティブかプロパティ名だけに使ってよい。オブジェクトと配列は `canonicalize` が書き、キーは UTF-16 符号単位で並べる。JSON でない値（`undefined`、有限でない数、孤立サロゲート、穴あき配列、アクセサ、`toJSON`）は拒否する。配列またはオブジェクトの入れ子は 64 まで。 | ESLint `no-restricted-syntax` outside `packages/jcs/src`, and `pnpm boundaries` (a second `canonicalize` is rejected). The checker does not separately prove that `JSON.stringify` inside `@ix/jcs` is primitive-only; review those call sites. |
| Do not implement JWS, key generation, key storage, or signing. `@ix/identity` `refuseKeyOperation` and `@ix/approval-app` `signApproval` stay refusals. JCS (RFC 8785) and SHA-256 of its UTF-8 bytes are implemented. Changing canonicalization, the hash, or the lowercase-hex encoding still needs the security reviewer. A green check is not that acceptance. | JWS、鍵の生成、鍵の保管、署名は実装しない。`refuseKeyOperation` と `signApproval` は拒否のままにする。JCS（RFC 8785）と、その UTF-8 バイトの SHA-256 は実装した。正規化、ハッシュ、小文字16進の符号化を変えるときは、セキュリティレビュアーが要る。検査が緑でも、その承認ではない。 | Identity and approval unit tests expect the refusal. `pnpm boundaries` rejects crypto-module imports, Web Crypto sign and key methods, and any `digest` except the SHA-256 literal in `packages/protocol-core/src`. See `docs/team.md`. |
| Wire JSON is read with `parseJson` before canonicalization. Duplicate keys are rejected, including names that match only after escape decoding. An integer outside ±9007199254740991 is rejected from the text. `canonicalize` still accepts a JavaScript number that is already outside that range, so the RFC 8785 appendix B samples stay valid. | 回線上の JSON は、正規化の前に `parseJson` で読む。エスケープを解いたあと同じ名前になるキーも、重複として拒否する。±9007199254740991 の外の整数は、文章の時点で拒否する。すでに JavaScript の数になっている値は、RFC 8785 付録 B を含め、`canonicalize` が受け付ける。 | `packages/jcs/test/parse.test.ts`. |
| Proxies and other non-plain objects are rejected. Each own property is read once, and that value is the one that is hashed. | プロキシと、素のオブジェクトでない値は拒否する。自分のプロパティは一度だけ読み、その値を指紋にする。 | Unit tests. `types.isProxy` does not run traps. |
| The text a future JWS would sign is `signingInputExcludingSignature`: JCS of the value with the top-level `signature` property removed. `hashCanonicalBody` does not remove it. That hash, and `hashExcludingSignature`, are digests, not the signing input. A nested `signature` key is left in place. | 将来の JWS が署名する文字列は `signingInputExcludingSignature`。トップレベルの `signature` を除いた値の JCS である。`hashCanonicalBody` はそれを除かない。その指紋も `hashExcludingSignature` も、署名する文字列ではない。入れ子の `signature` は残す。 | `packages/protocol-core/test/hash.test.ts`. |
| Nesting deeper than 64 arrays or objects is rejected. 64 is this implementation's cap, not a number from RFC 8785. Array length is not capped. | 配列またはオブジェクトの入れ子が 64 を超えると拒否する。64 は RFC 8785 の数ではなく、この実装の上限である。配列の幅に上限はない。 | Depth tests. The error text contains `64`. |
| No private keys in the tree. | 秘密鍵をリポジトリに置かない。 | `pnpm boundaries` rejects PEM private-key blocks. |
| No `any`, no type assertions, no non-null assertions, no `ts-ignore` or `ts-expect-error`. `as const` is allowed. | `any`、型アサーション、非nullアサーション、`ts-ignore`、`ts-expect-error` を使わない。`as const` は使ってよい。 | `pnpm lint` (`strictTypeChecked`, `consistent-type-assertions: never`). |
| Do not swallow an error. Do not retry forever. | エラーを握りつぶさない。無期限に再試行しない。 | ESLint `no-empty`, and `pnpm boundaries` (empty `catch`, empty `.catch`, `while (true)`, `for (;;)`). |
| No comments in `packages/**/*.ts`. Put the reason in a type, a lint, a test, or this file. | `packages/**/*.ts` にコメントを書かない。理由は型、lint、テスト、このファイルに書く。 | `pnpm boundaries`. |
| The conformance job stays a placeholder. Six items, every status `pending`. A green job is not a conformance pass. | 適合テストのジョブは仮のままにする。6項目はすべて `pending`。緑でも適合したことにはならない。 | `pnpm conformance` and the unit test in `@ix/conformance`. |
| Do not weaken a check to make a change pass. A skipped lint, a broader allow-list, or a conformance item flipped to pass needs a verifier who did not write the change, plus the human named in `docs/team.md` when the row above says so. | 通すために検査を緩めない。lint の無効化、許可リストの拡大、適合項目の合格への変更は、書いた人とは別の検証役が要る。上の行が人の確認を求めているときは、その人も要る。 | CI has no `eslint-disable` path in package source, because comments are rejected. Policy diffs are visible. |

## Human doors

These are not auto-merged, even when CI is green. Stop and name them in the PR. The coordinator asks the director to bring the right person.

- Signatures, keys, mandates, approvals.
- Implementing JCS, choosing the hash, or changing a `prevHash` rule.
- Transparency-log record formats.
- Bumping an extension URI, or adding an event `kind` or tag.
- The legal content of a local rule, spam policy, or anything the spot lawyer is listed for.

## Layout

| Path | Layer | Holds |
| --- | --- | --- |
| `packages/jcs` | core | The only JCS function. RFC 8785. `parseJson` rejects duplicate keys and unsafe integers. Proxies are rejected. |
| `packages/config` | core | `open` or `closed`. |
| `packages/identity` | core | Refusal for key operations. No keys. |
| `packages/protocol-core` | core | The four extension URIs, and SHA-256 lowercase hex of canonical UTF-8. `signingInputExcludingSignature` is the JWS text, not a hash. `hashCanonicalBody` does not remove `signature`. It does not sign. |
| `packages/log` | core | Record-kind names and a refusal for inclusion proofs. |
| `packages/a2a-ext-*` | core | Profile-extension stubs. Negotiation depends on the other three. |
| `packages/node` | app | How `open` and `closed` differ. No port. |
| `packages/ledger` | app | Recognizes log record kinds. Does not write a chain. |
| `packages/approval-app` | app | Refuses to sign. This is not `@ix/a2a-ext-approval`. |
| `packages/conformance` | suite | Six pending items. |
| `packages/adapters` | adapter | May sit outside the core. Nothing may depend on it. |
| `deploy/` | — | Example configs only. |
| `vectors/` | — | Points at the package tests. No second copy of the vectors, no signature fixtures, and no keys. |
| `docs/spec/` | — | CC BY 4.0 text. |
| `.cursor/skills/verify-ix-node/` | — | Verification stub. It does not drive a node, because there is no node. |

## Checks

```bash
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` is typecheck, lint, boundaries, unit tests, and the conformance placeholder. The verifier entrypoint is `node scripts/verify-ix-node.mjs doctor`, then `drive`, then `cleanup`. Drive writes `artifacts/verify/` and cleanup leaves that directory in place. `artifacts/` is gitignored.

Decisions that are not enforced by a check go in `decisions.tsv`, one row at a time.
