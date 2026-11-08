# Self-check before a PR

Run this before you open a PR. Each line is a hole an earlier independent verification found. Answer each one in the PR body with "ok" or "not relevant".

1. Reverting each new check makes a test fail. Try this once for each new check.
2. The agents and `@ix/verify` reach the same conclusion on the same events. That covers kind, job tag, issuer, duplicates, forks, and expiry (T25b, T25c).
3. Edge input is refused or handled on purpose: duplicate JSON keys, unsafe integers, lone surrogates, a BOM, non-canonical encodings, empty or huge values, and nesting deeper than 64.
4. For relay tricks, a copy, a reorder, a re-tag, an id change, or a stale event cannot fake an agreement or fail an honest record.
5. Keys and signatures: no new crypto call site outside `packages/identity/src`, and none of the boundary detours (Reflect, `globalThis`, `.constructor`, names built from strings, a new `.d.ts`). Weak or small-order keys are refused.
6. AGENTS.md rules: no comments (Python under `automation/` too), no `as` except `as const`, and no `JSON.stringify` for canonical bytes.
7. Docs follow the code. Update `decisions.tsv`, `AGENTS.md`, and `docs/handoff.md` when they change. Conformance notes do not claim more than the tests show.
8. Write nothing about a person's machine, account, plan, or home path into the tree.
9. A human-door change (signatures, keys, mandates, approvals, hash rules, new kinds or tags) says so in the PR title or body.
