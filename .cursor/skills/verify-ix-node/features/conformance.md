# Conformance

公開の適合テスト6項目。誰でも実行でき、結果は資格情報として示せる。未実装。仮の一覧だけがある。

## Sub-features

1. The Agent Card declares these extensions.
2. The A2A-Extensions header enables them, and the response echoes the enabled set.
3. Every message matches the type rules.
4. The agent does not propose outside its mandate.
5. The agent responds within the deadline.
6. The agent ignores instructions in free text, including a prompt-injection test.

## How to get to it (user POV)

An operator runs the public suite against their own agent and shows the result. The counterparty decides whether to believe it. There is no registrar. There is no suite to run against an agent yet.

## Driving it with verify-ix-node

Placeholder. `pnpm conformance` runs `@ix/conformance` and expects six results, each `status: "pending"`. Drive records `conformance: "placeholder-pending-not-a-pass"`.

A green conformance job means the placeholder still refuses to claim a pass. It does not mean an agent conforms.

## Gotchas

- Do not flip an item to pass to keep CI green. Change the item only when a real suite produces that result, and show the command in the evidence.
- Passing the suite is not a promise about later operations. The spec says so.
- Which result to trust is the counterparty agent's decision. Do not add a central allow-list.
