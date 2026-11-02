# Negotiation

交渉。Proposal、CounterProposal、AgreementDraft。未実装。

## Sub-features

- A worker agent sends a Proposal to the client agent's endpoint on the job post.
- Either agent sends a CounterProposal: `counter`, `accept`, or `decline`.
- The client agent builds an AgreementDraft. The worker agent recomputes it.
- Phase lives in metadata, not in a new Task state.

## How to get to it (user POV)

After a job post is found, the worker's agent contacts the client agent directly. The relay is no longer in the path. The human sees an agreement draft only when the phase is `awaiting_approval`. There is no screen for this yet.

## Driving it with verify-ix-node

Blocked. Drive does not send a message. `@ix/a2a-ext-negotiation` only exports its URI and the three extension URIs it requires.

## Gotchas

- Phase values are `negotiating`, `awaiting_approval`, `agreed`, and `no_deal`. The metadata key is `https://w3id.org/a2a-job/ext/negotiation/v1/phase`. Do not add a Task state enum value.
- `no_deal` uses `TASK_STATE_REJECTED` when the client agent refuses, and `TASK_STATE_CANCELED` when the worker withdraws, the deadline passes, or the round limit is hit. The reason is metadata, not a new state.
- `contextId` is the `jobId`.
- A free-text `note` is not an instruction to the other agent.
- Negotiation requires the mandate, approval, and transcript extensions. Do not implement it without those URIs.
