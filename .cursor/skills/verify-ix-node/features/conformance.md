# Conformance

公開の適合テスト6項目。誰でも実行でき、結果は資格情報として示せる。いま合格にしているのは、署名を見ない3項目だけです。

## Sub-features

1. The Agent Card declares these extensions.
2. The A2A-Extensions header enables them, and the response echoes the enabled set.
3. Every message matches the type rules.
4. The agent does not propose outside its mandate.
5. The agent responds within the deadline.
6. The agent ignores instructions in free text, including a prompt-injection test.

## How to get to it (user POV)

An operator runs the public suite against their own agent and shows the result. The counterparty decides whether to believe it. There is no registrar. `pnpm conformance` runs the suite against the mock poster and worker through `createRelay`.

## Driving it with verify-ix-node

`pnpm conformance` expects this split:

| id | status | limit |
| --- | --- | --- |
| `agent-card-declares-extensions` | `pending` | `not_run` |
| `extensions-header-echo` | `pending` | `not_run` |
| `messages-match-types` | `pass` | `structure_only_signature_unverified` |
| `proposals-stay-inside-mandate` | `pass` | `local_numeric_bound_signature_unverified` |
| `responds-within-deadline` | `pass` | `injected_clock` |
| `ignores-instructions-in-free-text` | `pending` | `not_run` |

Drive records `conformance: "partial-items-3-5-pass-signatures-pending"`. A green job is that split. It is not a six-item credential and it does not check a signature. Drive does not start `deploy/local/compose.yaml`.

## Gotchas

- Do not flip item 1, 2, or 6 to pass in the change that writes the suite. A separate verifier has to accept any further flip. Do not delete the limit on a pass.
- Item 3 rejects non-RFC-3339 dates, non-JPY money, and job posts missing `agentCard`, `budgetMin`, or `requiredSkills`. The agreement placeholder is `transcript-unverified-<amount>`. It is not a digest.
- Item 4 re-checks that amount before a draft is applied and before approval. An offer exactly at the cap or floor may proceed. One yen outside may not.
- Passing the suite is not a promise about later operations. The spec says so.
- Which result to trust is the counterparty agent's decision. Do not add a central allow-list.
