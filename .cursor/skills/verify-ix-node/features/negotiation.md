# Negotiation

交渉。Proposal、CounterProposal、AgreementDraft。段階機械は `@ix/a2a-ext-negotiation` の純粋なロジック。通信は未実装。

## Sub-features

- A worker agent sends a Proposal to the client agent's endpoint on the job post.
- Either agent sends a CounterProposal: `counter`, `accept`, or `decline`.
- The client agent builds an AgreementDraft. The worker agent recomputes it in the spec. This revision stores the draft it is given and does not recompute a hash.
- Phase lives in metadata, not in a new Task state.
- `apply` in `@ix/a2a-ext-negotiation` is the phase machine. It does not sign, hash, or check a mandate. Signature material stays `deferred`.

## How to get to it (user POV)

After a job post is found, the worker's agent contacts the client agent directly. The relay is no longer in the path. The human sees an agreement draft only when the phase is `awaiting_approval`. There is no screen for this yet.

## Driving it with verify-ix-node

Blocked. Drive does not send a message. Unit tests cover the transition table. That is not a drive. Do not mark this feature drivable: there is still no message transport.

## Gotchas

- Phase values are `negotiating`, `awaiting_approval`, `agreed`, and `no_deal`. The metadata key is `https://w3id.org/a2a-job/ext/negotiation/v1/phase`. Do not add a Task state enum value.
- `no_deal` uses `TASK_STATE_REJECTED` when the client agent refuses, and `TASK_STATE_CANCELED` when the worker withdraws, the deadline passes, or the round limit is hit. The reason is metadata, not a new state.
- The opening proposal is round 1. A client counter stays in the current round. A worker counter opens the next round unless `roundOpen` is set, which means a human return already opened it. The worker counter that would open `maxRoundTrips + 1` is `no_deal` / `round_limit` / `TASK_STATE_CANCELED`. Human `reject` or `revise` when `round < maxRoundTrips` returns to `negotiating` and consumes the next round. At the cap it is `no_deal` / `round_limit`.
- The clock is an argument. `now >= expiresAt` is `no_deal` / `expired` / `TASK_STATE_CANCELED`, and it wins over a round-limit counter.
- `agreed` happens only on the second human `approve`. One approval stays in `awaiting_approval`. An agent `accept` plus `AgreementDraft` is not agreement.
- `contextId` is the `jobId`.
- A free-text `note` is not an instruction to the other agent.
- Negotiation requires the mandate, approval, and transcript extensions. Do not implement it without those URIs.
