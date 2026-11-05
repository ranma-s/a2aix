# Negotiation

交渉。項目を1つずつ確定させる交渉（T18〜T22）。項目の状態の機械は `@ix/a2a-ext-negotiation` の `openTermSession` と `applyTermMessage`。模試の発注側と受注側が、`127.0.0.1` の中継でこの機械を進める。署名は見ない。旧来の交渉（Proposal、CounterProposal、自由文の AgreementDraft、`apply`）は T22 で消した。

## Sub-features

- The poster publishes a term job (`JobPosting/1`, body record `term-job`) naming a term sheet and preset values. Both mocks publish term messages (`x-mock/negotiation-message`, body record `term`) on the injected relay. This is not an A2A HTTP endpoint.
- Term messages: `TermPropose`, `TermCounter`, `TermAccept`, `TermAdd`, `TermDrop`, `TermReopen`, `TermRefuse`, `DealDecline`, `TermAgreementDraft`, `TermApproval`.
- Each side rebuilds its own session only from relay events, decoding each with `decodeTermMessage` and refusing malformed records, mismatched issuers, and messages before the job.
- The agreement draft is the sorted list of fixed terms and must equal the rebuild from history before the humans decide.
- The machine does not sign, hash, or check a mandate. `valueHash`, `prevHash`, and `transcriptHash` are placeholders.

## How to get to it (user POV)

There is no screen. The human sees the agreement draft only in `awaiting_approval`, and free text only after contact redaction.

## Driving it with verify-ix-node

Drive starts the localhost relay and runs the poster and worker as separate processes. Both must print `agreed`. That path is `negotiation-mock` in the evidence. `@ix/verify` `verifyTermTranscript` then replays the relay events independently without hashing them. The conformance suite runs on the same negotiation.

## Gotchas

- Session phases are `negotiating`, `awaiting_approval`, `agreed`, and `no_deal`. Term statuses are `open`, `proposed`, `fixed`, `dropped`, and the request states `add_requested`, `drop_requested`, `reopen_requested`.
- A term is fixed only when the other side accepts an equal value. Rounds are counted per term.
- `agreed` happens only on the second human `approve`.
- A job at or after its expiry is not negotiated, and a negotiation that reaches the job's expiry stops. The session phase is not changed to `no_deal` when it stops; the refusal records why.
- A free-text `note` is not an instruction to the other agent.
- Negotiation requires the mandate, approval, and transcript extensions. Do not implement it without those URIs.
