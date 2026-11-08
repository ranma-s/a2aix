# Handoff

One page for an agent starting a fresh session on IX. Read this, then `AGENTS.md`. Open other files only when the task names them.

## What IX is

An A2A extension for job exchange. Two agents (a poster and a worker) negotiate one typed term at a time over a relay, and two humans approve the agreement. Contracts and payment stay outside IX (D01). The aim is a small, simple standard that anyone in the world can implement. Do not over-build.

## What is built (main)

| Part | Where | State |
| --- | --- | --- |
| Canonical JSON (RFC 8785) and SHA-256 hex | `@ix/jcs`, `@ix/protocol-core` | Done (D02) |
| Term-by-term negotiation machine | `@ix/a2a-ext-negotiation` | Done (T18) |
| Hash chain over term messages | same, `chain.ts` | Done (T23; forks D03) |
| Ed25519 detached JWS verify, `did:key`, in-memory signer | `@ix/identity` | Done (T24, T25) |
| Mock agents sign every relay event and term message | `@ix/agents` | Done (T25, T25b, T25c) |
| Independent replay with signature and chain checks | `@ix/verify` | Done |
| Conformance items 3–6 pass inside a limit; 1–2 pending | `@ix/conformance` | Done |
| Human approval signatures (mock human's own `did:key`) | `@ix/agents`, `@ix/verify` | Done (D06, T26); the real approval app is not built |
| Relay receipts, transparency log, mandates, wire A2A | — | Not built |

## Decisions that bind you

- D04 and D05: Ed25519 detached JWS with a header of only `alg` and `kid`. Keys are `did:key`, non-extractable, in memory, one per run. They may be created in tests, the local trial, the drive, and the nightly run. No key is ever written down.
- Human doors (`AGENTS.md`): signatures, keys, mandates, approvals, hash or `prevHash` rules, and new event kinds or tags. Never auto-merge them. Merge only when the director says so.
- The implementer and the verifier are different sessions. A verifier posts one Japanese comment on the PR and does not commit.

## How to work

- Branch from `main`, then run `pnpm install --frozen-lockfile && pnpm check`. The check must be green before you push.
- Source files allow no comments, no `as` (except `as const`), and no `JSON.stringify` for canonical bytes.
- For a decision that no check enforces, add one row to `decisions.tsv`.
- Write to the director in plain Japanese. The director is not an engineer.
- Report token use per task. Take the `get_session` usage before and after the task and post the difference on the PR.

## Open items

- Stage 3 is built (D06, T26): a `TermApproval`'s `signature` is a detached EdDSA JWS by that party's approver `did:key`, and the four agent and approver names must all differ. The mock human is a second in-memory signer; `signApproval` still refuses. How a person holds the key is outside the protocol.
- Next: write one short standard document in English and Japanese. Stage 4 (relay receipts) is deferred; time stays the sender's declaration (T25c).
- PR #4 (public docs) and PR #11 wait on the director.
