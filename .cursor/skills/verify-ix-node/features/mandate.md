# Mandate

委任範囲。人間が自分のエージェントに渡す。相手には送らない。未実装。

## Sub-features

- A human sets an amount bound, a deadline window, excluded work, and an expiry.
- The human signs the mandate in the approval app.
- The agent refuses to propose, counter, or accept outside that mandate.

## How to get to it (user POV)

The operator writes what the agent may agree to before any negotiation. The counterparty never receives the mandate. There is no form for this yet.

## Driving it with verify-ix-node

Blocked. `@ix/a2a-ext-mandate` exports the extension URI only. It does not build or sign a mandate. The mock poster and worker keep a private numeric bound and do not send that bound to the counterparty. That bound is not a mandate document.

## Gotchas

- Do not put mandate fields on the wire to the counterparty.
- Do not implement AP2 compatibility, or any signature, before a human security reviewer accepts it.
- The agent's own check is not the last line. An agreement without the human's signature does not exist. That rule belongs to the approval feature, which is also blocked.
