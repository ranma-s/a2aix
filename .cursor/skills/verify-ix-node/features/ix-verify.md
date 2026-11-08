# ix-verify

中継の記録を指紋の鎖の順に最初から読み直し、メッセージの形、送り主の名乗り、模試のエージェントの Ed25519 署名（イベントとメッセージ）、模試の人間の承認の署名、項目の状態の進み方、期限、指紋の鎖を見ます。

## Sub-features

- `verifyTermTranscript` takes the relay events of one job. It uses the first job record from the client issuer, decodes every term message with `decodeTermMessage`, checks that each event's issuer matches the message's sender, refuses messages published at or after their own expiry, and applies each message to a fresh term session with the event's `createdAt` as the clock.
- It returns `schema`, `issuers`, `replay`, and `deadlines` as `pass` or `fail`, the final phase, and the agreed terms. It does not check mandates; the drive checks the agreed terms against both sample mandates itself.
- It applies messages in hash-chain order, checks every `prevHash`, `valueHash`, `transcriptHash`, `agreementHash`, `manifestSha256`, and the job's `sheetSha256` (SHA-256 of JCS), and reports `chain` as `pass` or `fail`. A leftover message whose `prevHash` points to nothing in the chain fails `chain`. A leftover that points to a message already in the chain lost a race (two agents answered the same message). It is checked as a move against the state it points at and is never applied; it fails `chain` if it is not a valid move or if the same party already sent a message after that same message. The rest are counted in `forks`.
- It takes `profile` (`termRelayProfile` from `@ix/agents`) and reads only events tagged with the job id, by `kind`, as the agents do. An exact copy of a signed event under another `id` counts in `duplicates` and is not applied.
- It takes `issuers` as the two parties' `did:key` names. An event from neither party fails `issuers`. Each event's `sig` must verify as a detached EdDSA JWS by its issuer over `eventSigningInput`, and each term message's `signature` must be `{ verification: "jws-eddsa", material }` verifying by the named sender over `signingInputExcludingSignature`; otherwise `signatures` is `fail` and the event is not applied.
- It takes `approvers` as the two parties' mock human `did:key` names. A `TermApproval` must be signed by the sending party's approver, not its agent; every other message by the agent. If an approver equals its own agent, or the four names are not all different, `issuers` fails.

## How to get to it (user POV)

There is no screen. Drive prints one JSON object from the localhost trial. `negotiation` is `term-by-term`. `schema`, `issuers`, `replay`, `bounds`, and `deadlines` are `pass` or `fail`. `bounds` checks every agreed term against both sample mandates. `signatures` is `pass` or `fail`, and `signer` is `ed25519-in-memory`. The poster and worker each make an agent key and a mock human approver key in memory, print `did <agent did:key> <approver did:key>`, and read `peer <agent did:key> <approver did:key>` from stdin. `approver` is `ed25519-in-memory-mock-human`.

## Driving it with verify-ix-node

`node scripts/verify-ix-node.mjs drive` runs `scripts/ix-trial-evidence.mjs` after the check suite. That script binds `127.0.0.1`, runs the poster and worker as separate processes, and calls `verifyTermTranscript` on the relay events. Evidence lists `ix-verify` in `protocolFeaturesDriven` only when the drive exits 0. `pnpm conformance` also replays its runs with `verifyTermTranscript`.

## Gotchas

- Do not sign here; signing lives in `@ix/identity`. Changing the hash-chain rule (T23) or the signature rules (D04, T25) is a human door.
- The chain detects rewritten, reordered, or re-pointed messages, and counts forks. Signatures show which `did:key` wrote each event and message. Which person or company owns a `did:key` is told from outside until mandates exist.
- `agreed` with `signatures: pass` is not a human-approved contract: each approval is signed by a mock human's in-memory `did:key` (stage 3, T26), but the mock human is a script.
- `deadlines: pass` means each message was published before its own expiry by the `createdAt` its sender signed. The agents judge expiry by their own clock, so a party colluding with a relay can make the two differ until relay receipts (stage 4, T25c).
