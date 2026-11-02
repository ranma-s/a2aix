# AGENTS.md

Rules for agents working on IX. Japanese is the director's language. The table is normative in both columns. Identifiers and commands stay in English.

Read `docs/spec/ix-spec-v0.3.md`, section `交渉の拡張仕様（案 v0.3）`, before changing protocol packages. The business numbers above that section are not requirements. `docs/team.md` names who must look at a change.

This revision is the foundation. Do not implement publish, query, subscribe, negotiation, mandates, approvals, transcripts, inclusion proofs, or MCP tools. Do not add a server to make the verification skill look runnable.

## Rules

| Rule | 規則 | What enforces it |
| --- | --- | --- |
| Core packages do not import app, adapter, or suite packages. App packages do not import adapters or other apps. Nothing imports `@ix/adapters` or `@ix/conformance`. | コアはアプリ・アダプタ・適合スイートに依存しない。アプリはアダプタや他のアプリに依存しない。`@ix/adapters` と `@ix/conformance` をインポートするものはない。 | `policy/boundaries.json` and `pnpm boundaries`. The checker rejects a bad edge even if `package.json` declares it. Its self-test must keep failing on a reversed edge. |
| A new `@ix/*` dependency is declared in both `package.json` (`workspace:*`) and `policy/boundaries.json`. | 新しい `@ix/*` 依存は `package.json` と `policy/boundaries.json` の両方に書く。 | `pnpm boundaries` fails on drift either way. |
| Packages do not import Node built-ins, crypto libraries, or other external packages. Test files may import `vitest`. | パッケージは Node の組み込み、暗号ライブラリ、その他の外部パッケージをインポートしない。テストだけ `vitest` をインポートしてよい。 | `pnpm boundaries`. |
| Canonical bytes for hashing or signing come from `canonicalize` in `@ix/jcs`. Do not call `JSON.stringify` for that, and do not define another `canonicalize`. | ハッシュや署名の対象バイトは `@ix/jcs` の `canonicalize` だけが作る。その目的で `JSON.stringify` を使わない。`canonicalize` を別に定義しない。 | ESLint `no-restricted-syntax` outside `packages/jcs/src`, and `pnpm boundaries`. `@ix/jcs` still throws `JCS_NOT_IMPLEMENTED`. |
| Do not implement JCS, JWS, key generation, key storage, or signing. `@ix/identity` `refuseKeyOperation` and `@ix/approval-app` `signApproval` stay refusals. | JCS、JWS、鍵の生成、鍵の保管、署名を実装しない。`refuseKeyOperation` と `signApproval` は拒否のままにする。 | The unit tests expect the refusal. Crypto module names are banned. A human security reviewer must accept the design before those tests change. See `docs/team.md`. |
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
| `packages/jcs` | core | The only JCS function. Stub. |
| `packages/config` | core | `open` or `closed`. |
| `packages/identity` | core | Refusal for key operations. No keys. |
| `packages/protocol-core` | core | The four extension URIs. |
| `packages/log` | core | Record-kind names and a refusal for inclusion proofs. |
| `packages/a2a-ext-*` | core | Profile-extension stubs. Negotiation depends on the other three. |
| `packages/node` | app | How `open` and `closed` differ. No port. |
| `packages/ledger` | app | Recognizes log record kinds. Does not write a chain. |
| `packages/approval-app` | app | Refuses to sign. This is not `@ix/a2a-ext-approval`. |
| `packages/conformance` | suite | Six pending items. |
| `packages/adapters` | adapter | May sit outside the core. Nothing may depend on it. |
| `deploy/` | — | Example configs only. |
| `vectors/` | — | Reserved. Empty of fixtures on purpose. |
| `docs/spec/` | — | CC BY 4.0 text. |
| `.cursor/skills/verify-ix-node/` | — | Verification stub. It does not drive a node, because there is no node. |

## Checks

```bash
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` is typecheck, lint, boundaries, unit tests, and the conformance placeholder. The verifier entrypoint is `node scripts/verify-ix-node.mjs doctor`, then `drive`, then `cleanup`. Drive writes `artifacts/verify/` and cleanup leaves that directory in place. `artifacts/` is gitignored.

Decisions that are not enforced by a check go in `decisions.tsv`, one row at a time.
