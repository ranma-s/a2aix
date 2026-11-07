# ix-verify

署名を見ない検査です。中継の記録を指紋の鎖の順に最初から読み直し、メッセージの形、送り主の名乗り、項目の状態の進み方、期限、指紋の鎖を見ます。署名と JWS は `deferred` のままです。

## Sub-features

- `verifyTermTranscript` takes the relay events of one job. It uses the first job record from the client issuer, decodes every term message with `decodeTermMessage`, checks that each event's issuer matches the message's sender, refuses messages published at or after their own expiry, and applies each message to a fresh term session with the event's `createdAt` as the clock.
- It returns `schema`, `issuers`, `replay`, and `deadlines` as `pass` or `fail`, the final phase, and the agreed terms. It does not check mandates; the drive checks the agreed terms against both sample mandates itself.
- It applies messages in hash-chain order, checks every `prevHash`, `valueHash`, `transcriptHash`, `agreementHash`, `manifestSha256`, and the job's `sheetSha256` (SHA-256 of JCS), and reports `chain` as `pass` or `fail`. A leftover message whose `prevHash` points to nothing in the chain fails `chain`. A leftover that points to a message already in the chain lost a race (two agents answered the same message) and is counted in `forks`; it is never applied.
- `checkSignature` and `checkJws` return `status: "deferred"`.

## How to get to it (user POV)

There is no screen. Drive prints one JSON object from the localhost trial. `negotiation` is `term-by-term`. `schema`, `issuers`, `replay`, `bounds`, and `deadlines` are `pass` or `fail`. `bounds` checks every agreed term against both sample mandates. `deferred` names the four checks that were not done.

## Driving it with verify-ix-node

`node scripts/verify-ix-node.mjs drive` runs `scripts/ix-trial-evidence.mjs` after the check suite. That script binds `127.0.0.1`, runs the poster and worker as separate processes, and calls `verifyTermTranscript` on the relay events. Evidence lists `ix-verify` in `protocolFeaturesDriven` only when the drive exits 0. `pnpm conformance` also replays its runs with `verifyTermTranscript`.

## Gotchas

- Do not implement JWS or signatures here. Changing the hash-chain rule (T23) is a human door.
- The chain detects rewritten, reordered, or re-pointed messages, and counts forks. It does not show who wrote a message: anyone could build a consistent chain under the poster's or worker's name until signatures are checked.
- Replay can reach `agreed` while every deferred check stays `deferred`. Do not describe that as a checked contract.
