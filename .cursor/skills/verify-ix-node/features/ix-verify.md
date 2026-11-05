# ix-verify

署名を見ない検査です。メッセージの形、段階機械への履歴の再生、数値の上限と下限、期限を見ます。署名、JCS、JWS、prevHash のハッシュ照合は `deferred` のままです。

## Sub-features

- `checkMessageSchema` accepts a negotiation message whose fields match the phase-machine types. Money is a non-negative integer. Instants parse. `signature.verification` must be the placeholder `deferred`. A marker of `verified` is rejected as the wrong shape. The material is not checked.
- `replayTranscript` feeds those messages to `apply` in order. It does not hash `prevHash` or `transcriptHash`. An approval is accepted by the machine only when its `agreementHash` string equals the draft's `transcriptHash` string.
- `checkBounds` compares proposal and draft amounts, hours, and scope with a supplied numeric bound. Free-text notes are not amounts.
- `checkDeadlines` requires `now` to be strictly before each message `expiresAt`.
- `checkSignature`, `checkJcs`, `checkJws`, and `checkPrevHash` return `status: "deferred"`. They do not canonicalize, hash, or verify.

## How to get to it (user POV)

There is no screen. Drive prints one JSON object from the localhost trial. `negotiation` is `term-by-term`. `schema`, `issuers`, `replay`, `bounds`, and `deadlines` are `pass` or `fail`. `bounds` checks every agreed term against both sample mandates. `deferred` names the four checks that were not done.

## Driving it with verify-ix-node

`node scripts/verify-ix-node.mjs drive` runs `scripts/ix-trial-evidence.mjs` after the check suite. That script binds `127.0.0.1`, runs the poster and worker as separate processes, and calls `verifyTermTranscript` on the relay events. Evidence lists `ix-verify` in `protocolFeaturesDriven` only when the drive exits 0.

`pnpm conformance` also calls `verifyTranscript` on one injection-resistant exchange. A pass there is the same non-cryptographic check.

## Gotchas

- Do not implement JWS or a prevHash rule here. JCS and SHA-256 live in `@ix/jcs` and `@ix/protocol-core` (PR #3). Wiring them into prevHash is a human door.
- A schema rejection of `verification: "verified"` is a shape rule. It is not a signature verification.
- Currency is any non-empty string at this layer. The mock codec still accepts only JPY. The trial messages are JPY.
- Replay can reach `agreed` while every deferred check stays `deferred`. Do not describe that as a checked contract.
