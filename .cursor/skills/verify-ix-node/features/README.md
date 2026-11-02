# IX feature map

Index of user-facing behavior. Every feature is blocked in this revision. `node scripts/verify-ix-node.mjs drive` does not exercise them. A passing drive is not coverage.

| Feature | File | State |
| --- | --- | --- |
| Distribution | [distribution.md](distribution.md) | Blocked. No relay. |
| Negotiation | [negotiation.md](negotiation.md) | Blocked. No messages. |
| Mandate | [mandate.md](mandate.md) | Blocked. No mandate document. |
| Approval | [approval.md](approval.md) | Blocked. Signing throws. |
| Transcript | [transcript.md](transcript.md) | Blocked. No hash chain. |
| Transparency log | [log.md](log.md) | Blocked. No proofs. |
| Conformance | [conformance.md](conformance.md) | Placeholder. Six items pending. |
| MCP | [mcp.md](mcp.md) | Blocked. No tools. |

H2 headings in each file are `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-ix-node`, and `Gotchas`.
