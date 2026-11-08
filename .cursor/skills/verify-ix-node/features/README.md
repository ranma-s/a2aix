# IX feature map

Index of user-facing behavior. Drive starts the localhost relay and the mock exchange, then runs the non-cryptographic verifier. A passing drive is not a signature pass. The director's page is `docs/feature-map.md`.

| Feature | File | State |
| --- | --- | --- |
| Distribution | [distribution.md](distribution.md) | Drive publishes and queries on `127.0.0.1`. Subscribe is not driven. The relay stores events without checking signatures; the agents and ix-verify check them. |
| Negotiation | [negotiation.md](negotiation.md) | Drive runs the mock poster and worker to `agreed` through that relay. No A2A HTTP endpoint. |
| ix-verify | [ix-verify.md](ix-verify.md) | Schema, issuers, Ed25519 event and message signatures, replay, bounds, deadlines, and the JCS SHA-256 hash chain. |
| Mandate | [mandate.md](mandate.md) | Blocked. The numeric bound is local to the mock. No mandate document. |
| Approval | [approval.md](approval.md) | The mock human is a script that signs its `TermApproval` with its own in-memory `did:key` (stage 3, T26), checked by drive. The real approval app is blocked: `signApproval` throws. |
| Transcript | [transcript.md](transcript.md) | Partly built: the term hash chain (T23) and mock agent signatures (T25). The transcript extension package is still a stub. |
| Transparency log | [log.md](log.md) | Blocked. No proofs. |
| Conformance | [conformance.md](conformance.md) | Items 3–6 pass inside a recorded limit. Items 1 and 2 stay pending. |
| MCP | [mcp.md](mcp.md) | Blocked. No tools. |

H2 headings in each file are `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-ix-node`, and `Gotchas`.
