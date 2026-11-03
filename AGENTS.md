# AGENTS.md

Rules for agents working on IX. Japanese is the director's language. The table is normative in both columns. Identifiers and commands stay in English.

Read `docs/spec/ix-spec-v0.3.md`, section `交渉の拡張仕様（案 v0.3）`, before changing protocol packages. The business numbers above that section are not requirements. `docs/team.md` names who must look at a change.

This revision is the foundation, the negotiation phase machine in `@ix/a2a-ext-negotiation`, A2A-Extensions activation in `@ix/protocol-core`, an in-process publish/query/subscribe relay, and mock poster and worker agents in `@ix/agents`. The agents publish and query through an injected relay board and then apply the phase machine. `@ix/node` takes an injected event store and does not import `@ix/adapters`. `@ix/adapters` provides the in-memory store and `createLocalRelay`. `@ix/agents` does not import `@ix/adapters`. The private trial script `scripts/local-ix.mjs` is the composition root: it may import `@ix/adapters` and `@ix/agents`. Event `id`, `sig`, `prevHash`, and `transcriptHash` are unverified placeholders. `deploy/local/compose.yaml` binds the trial to `127.0.0.1` and publishes no ports. Do not start that listener from the verification drive. Do not implement wire A2A, mandate documents, approval cryptography, transcripts, inclusion proofs, MCP tools, JCS, JWS, or signature checks.

## Rules

| Rule | 規則 | What enforces it |
| --- | --- | --- |
| Core packages do not import app, adapter, or suite packages. App packages do not import adapters or other apps. Nothing imports `@ix/adapters` or `@ix/conformance`. | コアはアプリ・アダプタ・適合スイートに依存しない。アプリはアダプタや他のアプリに依存しない。`@ix/adapters` と `@ix/conformance` をインポートするものはない。 | `policy/boundaries.json` and `pnpm boundaries`. The checker rejects a bad edge even if `package.json` declares it. Its self-test must keep failing on a reversed edge. `pnpm guardrails` runs that checker on disk fixtures: core importing an adapter fails, core importing an app fails, and core importing core passes. |
| A new `@ix/*` dependency is declared in both `package.json` (`workspace:*`) and `policy/boundaries.json`. | 新しい `@ix/*` 依存は `package.json` と `policy/boundaries.json` の両方に書く。 | `pnpm boundaries` fails on drift either way. |
| Packages do not import Node built-ins, crypto libraries, or other external packages. Test files may import `vitest`. | パッケージは Node の組み込み、暗号ライブラリ、その他の外部パッケージをインポートしない。テストだけ `vitest` をインポートしてよい。 | `pnpm boundaries`. |
| Canonical bytes for hashing or signing come from `canonicalize` in `@ix/jcs`. Do not call `JSON.stringify` for that, and do not define another `canonicalize`. | ハッシュや署名の対象バイトは `@ix/jcs` の `canonicalize` だけが作る。その目的で `JSON.stringify` を使わない。`canonicalize` を別に定義しない。 | ESLint `no-restricted-syntax` outside `packages/jcs/src`, and `pnpm boundaries`. `@ix/jcs` still throws `JCS_NOT_IMPLEMENTED`. |
| Do not implement JCS, JWS, key generation, key storage, or signing. `@ix/identity` `refuseKeyOperation` and `@ix/approval-app` `signApproval` stay refusals. | JCS、JWS、鍵の生成、鍵の保管、署名を実装しない。`refuseKeyOperation` と `signApproval` は拒否のままにする。 | The unit tests expect the refusal. Crypto module names are banned. A human security reviewer must accept the design before those tests change. See `docs/team.md`. |
| No private keys in the tree. | 秘密鍵をリポジトリに置かない。 | `pnpm boundaries` rejects PEM private-key blocks. |
| No `any`, no type assertions (`value as Type` or `<Type>value`), no non-null assertions, no `ts-ignore` or `ts-expect-error`. `as const` is allowed. | `any`、型アサーション（`value as Type` と `<Type>value`）、非nullアサーション、`ts-ignore`、`ts-expect-error` を使わない。`as const` は使ってよい。 | `pnpm lint` (`strictTypeChecked`, `no-explicit-any`, `consistent-type-assertions: never`, `no-non-null-assertion`, `ban-ts-comment`). `pnpm guardrails` proves a fixture fails for each of those, and proves `as const` passes. |
| Do not swallow an error. Do not retry forever. | エラーを握りつぶさない。無期限に再試行しない。 | ESLint `no-empty`, and `pnpm boundaries` (empty `catch`, empty `.catch`, `while (true)`, `for (;;)`). |
| No comments in the source files named by `sourceCommentBanFiles` in `scripts/type-guard-rules.mjs`: `packages/**/*.ts`, `vitest.config.ts`, `vitest.conformance.config.ts`, `scripts/**/*.mjs`, `eslint.config.js`, and `eslint.guardrails.config.js`. The only permitted comment is a license header. It is one block comment at the top of the file, with only whitespace or a shebang before it, and the only text inside it is `SPDX-License-Identifier: Apache-2.0` (surrounding whitespace is allowed). No `*` decoration, no second line of prose, no `//` form, and no other SPDX identifier. Put any other reason in a type, a test, or this file. Doc files are not source: Markdown, `docs/**`, `LICENSE`, `NOTICE`, `decisions.tsv`, JSON, and YAML. | `scripts/type-guard-rules.mjs` の `sourceCommentBanFiles` に書いたソースにコメントを書かない。対象は `packages/**/*.ts`、`vitest.config.ts`、`vitest.conformance.config.ts`、`scripts/**/*.mjs`、`eslint.config.js`、`eslint.guardrails.config.js`。許されるのはライセンスヘッダだけ。ファイル先頭（空白か shebang のあと）のブロックコメント1つで、中身は `SPDX-License-Identifier: Apache-2.0` だけ（周りの空白は可）。`*` の飾り、2行目の文章、`//`、他の SPDX 識別子は不可。それ以外の理由は型、テスト、このファイルに書く。文書はソースではない。Markdown、`docs/**`、`LICENSE`、`NOTICE`、`decisions.tsv`、JSON、YAML は対象外。 | `pnpm lint` (`ix/no-code-comments`) and `pnpm boundaries`. `pnpm guardrails` proves a code comment fails and the Apache-2.0 SPDX header passes. Normal lint ignores `fixtures/**`. |
| Conformance items `messages-match-types`, `proposals-stay-inside-mandate`, and `responds-within-deadline` may be `pass` only with the limit recorded on the result: message structure, a local numeric bound, or an injected clock. Those passes do not verify signatures, JCS, or JWS. The other three items stay `pending`. A green conformance job is not a full pass and is not a signature pass. Flipping another item to `pass`, or dropping a limit, needs a verifier who did not write the change. | 適合項目 `messages-match-types`、`proposals-stay-inside-mandate`、`responds-within-deadline` は、結果に書いた範囲だけ `pass` にしてよい。範囲は、メッセージの形、手元の数値の上限下限、外から渡した時計である。これらの合格は署名も JCS も JWS も確認しない。残り3項目は `pending` のままにする。緑でも、6項目すべての合格でも、署名の確認でもない。別の項目を `pass` にすること、範囲の注記を消すことは、書いた人とは別の検証役が要る。 | `pnpm conformance` and the unit test in `@ix/conformance`. |
| Do not weaken a check to make a change pass. A skipped lint, a broader allow-list, a dummy under `fixtures/guardrails/` edited so a violation passes, or a conformance item flipped to pass needs a verifier who did not write the change, plus the human named in `docs/team.md` when the row above says so. | 通すために検査を緩めない。lint の無効化、許可リストの拡大、`fixtures/guardrails/` の見本を違反が通るように直すこと、適合項目の合格への変更は、書いた人とは別の検証役が要る。上の行が人の確認を求めているときは、その人も要る。 | CI has no `eslint-disable` path in package source, because comments are rejected. The SPDX header cannot carry an `eslint-disable`. `pnpm guardrails` fails if a required dummy passes. Policy diffs are visible. |

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
| `packages/protocol-core` | core | The four extension URIs and A2A-Extensions activation. Exact match. No version substitution. |
| `packages/distribution` | core | Event shape, tag filters, and the store port. No hash and no signature check. |
| `packages/log` | core | Record-kind names and a refusal for inclusion proofs. |
| `packages/a2a-ext-*` | core | Profile-extension stubs, plus the negotiation phase machine. Negotiation depends on the other three. The machine does not sign, hash, or enforce a mandate. |
| `packages/node` | app | In-process relay. `open` accepts public publish. `closed` refuses it. The package opens no port. |
| `packages/ledger` | app | Recognizes log record kinds. Does not write a chain. |
| `packages/approval-app` | app | Refuses to sign. This is not `@ix/a2a-ext-approval`. |
| `packages/agents` | app | Mock poster and worker. Injected relay board. No adapter import. No signature check. |
| `packages/conformance` | suite | Items 3–5 pass inside the recorded limit. Items 1, 2, and 6 stay pending. |
| `packages/adapters` | adapter | In-memory event store and `createLocalRelay`. Only the private trial script may import it. |
| `deploy/` | — | Example configs, plus `deploy/local/` for the localhost trial. |
| `vectors/` | — | Reserved. Empty of fixtures on purpose. |
| `fixtures/guardrails/` | — | Violating dummies for lint and dependency direction. Excluded from the build. |
| `.cursor/settings.json` | — | Enables the pstack plugin. |
| `docs/spec/` | — | CC BY 4.0 text. |
| `.cursor/skills/verify-ix-node/` | — | Verification drive. It runs the checks and does not start the localhost trial. |

## Checks

```bash
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` is typecheck, lint, boundaries, the guardrail self-test, unit tests, and the conformance suite. The suite passes three items inside a recorded limit and leaves three pending. `pnpm guardrails` lints with the type and comment guards, requires each dummy in `fixtures/guardrails/lint/` to fail for its rule, and runs the dependency checker on `fixtures/guardrails/boundaries/`. Those dummies are outside `pnpm typecheck`, `pnpm lint`, `pnpm test`, and the workspace package set. The verifier entrypoint is `node scripts/verify-ix-node.mjs doctor`, then `drive`, then `cleanup`. Drive writes `artifacts/verify/` and cleanup leaves that directory in place. `artifacts/` is gitignored.

Decisions that are not enforced by a check go in `decisions.tsv`, one row at a time.
