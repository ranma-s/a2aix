# Conformance

公開の適合テスト6項目。誰でも実行でき、結果は資格情報として示せる。いま合格にしているのは、署名を見ない4項目です。1と2は未実施です。

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
| `ignores-instructions-in-free-text` | `pass` | `free_text_ignored_signature_unverified` |

Item 6 `coveredCases`, in order (`termInjectionCases`, run against the term-by-term mock agents and the relay):

1. `note-cannot-set-price`
2. `note-cannot-raise-cap`
3. `description-cannot-lower-floor`
4. `description-cannot-preset-terms`
5. `description-cannot-change-deadline`
6. `note-cannot-count-as-accept`
7. `note-cannot-skip-approval`
8. `note-cannot-verify-signature`
9. `note-cannot-change-currency`
10. `note-cannot-substitute-counterparty`
11. `note-cannot-reset-rounds`
12. `note-cannot-reopen-fixed-term`
13. `note-cannot-drop-required-term`
14. `note-contact-is-redacted`
15. `description-contact-is-redacted`
16. `decline-reason-cannot-mean-accept`
17. `label-cannot-rewrite-terms`
18. `expired-note-is-not-applied`

Drive records `conformance: "partial-items-3-6-pass-mock-agent-signatures-checked"`. A green job is that split. It is not a six-item credential. It checks the mock agents' Ed25519 signatures, not human approval signatures. The same drive then starts the localhost relay.

## Gotchas

- Do not flip item 1 or 2 to pass in the change that writes the suite. A separate verifier has to accept any further flip. Do not delete the limit on a pass.
- Item 6 is a pass only when every case above was executed and its observation matches the suite test. Listing the ids without those observations is not a pass.
- Item 3 refuses sixteen malformed term messages without throwing, decodes a hand-written one, and requires both sides and an independent replay (`verifyTermTranscript`) to reach the same agreement. `valueHash`, `prevHash`, and `transcriptHash` are placeholders, not digests.
- Item 4 checks every proposed, countered, and accepted value against its sender's per-term mandate. Ranges that touch agree at the edge (180000 JPY). Ranges one yen apart end without a deal.
- Item 5 runs the relay and the agents on separate clocks so the agents' own job-expiry check is exercised: a worker that reads the job at or after its expiry refuses it, a poster does not post an expired job, and a negotiation that reaches the job's expiry stops without publishing after it.
- Passing the suite is not a promise about later operations. The spec says so.
- Which result to trust is the counterparty agent's decision. Do not add a central allow-list.
