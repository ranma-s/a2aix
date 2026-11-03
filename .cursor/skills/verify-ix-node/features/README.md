# IX feature map

Index of user-facing behavior. `node scripts/verify-ix-node.mjs drive` does not start the private trial and does not exercise the blocked rows. A passing drive is not a signature pass. Conformance items 3–5 pass only inside the limit in [conformance.md](conformance.md).

| Feature | File | State |
| --- | --- | --- |
| Distribution | [distribution.md](distribution.md) | Blocked for drive. In-memory relay; the private trial is not a drive. |
| Negotiation | [negotiation.md](negotiation.md) | Blocked for drive. Mock agents use the relay in tests. Drive sends nothing. |
| Mandate | [mandate.md](mandate.md) | Blocked. No mandate document. The mock keeps a private number. |
| Approval | [approval.md](approval.md) | Blocked. Signing throws. |
| Transcript | [transcript.md](transcript.md) | Blocked. No hash chain. |
| Transparency log | [log.md](log.md) | Blocked. No proofs. |
| Conformance | [conformance.md](conformance.md) | Partial. Items 3–5 pass without signatures. Items 1, 2, and 6 pending. |
| MCP | [mcp.md](mcp.md) | Blocked. No tools. |

H2 headings in each file are `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-ix-node`, and `Gotchas`.
