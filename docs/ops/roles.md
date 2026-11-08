# Roles, models, and prompts

Decided by the director on 2026-11-08 (D07). The goal is fewer tokens and more automation. Do not over-build.

## Roles

| Who | Does | Does not |
| --- | --- | --- |
| Director | Picks the next work, answers questions, says "merge" | Write code |
| Short Claude sessions | Coordinate, implement, and verify; one task per session, started from `docs/handoff.md` and `docs/ops/queue.md` | Keep one long conversation; merge |
| Nightly run | Takes one `ready`, `door: no` row from the queue, implements it, opens a PR, starts one verifier, and leaves a Japanese morning note on the PR | Merge; take human-door rows |
| GrokBot | Runs the local 14B for high-volume, low-risk work: test case candidates, a first-pass review against `docs/ops/checklist.md`, plain-Japanese summaries of a PR, and draft docs. Follows `docs/dev-loop.md` | Decide anything about signatures, keys, approvals, or hashing; coordinate the Claude sessions; merge |

## Models

| Work | Model |
| --- | --- |
| Design, security, and human-door changes | `claude-opus-5-5` |
| Ordinary implementation, verification, and re-verification | `claude-sonnet-5-5` |
| Small doc fixes and status summaries | `claude-haiku-5-5` |

The `model` column in the queue names the model. A verifier uses the same model as the implementer or a stronger one, never a weaker one, for a human-door change.

## Prompts

Implementer (fresh session, model from the queue):

> Read docs/handoff.md, AGENTS.md, and docs/ops/checklist.md. Do queue row {id} in docs/ops/queue.md. Branch {branch} from main. Keep the change small. `pnpm install --frozen-lockfile && pnpm check` must pass. Mark the row in-progress in the same PR. Open a PR with `gh api repos/ranma-s/a2aix/pulls -f base=main -f head={branch} -f title=... -F body=@file` (no GraphQL). Write the PR in plain Japanese, answer each checklist line, and name any human door. Do not merge. Send the PR number to "@parent" with send_message if you have a parent, then stop.

Verifier (fresh session, a different session from the implementer):

> You did not write PR #{n}. Read docs/handoff.md, AGENTS.md, and docs/ops/checklist.md. Run `pnpm install --frozen-lockfile && pnpm check`, then `node scripts/verify-ix-node.mjs doctor`, `drive`, and `cleanup`. Try to break what the PR claims, using the checklist. Do not commit or push. Leave the tree clean. Post exactly one comment on PR #{n} with `gh api repos/ranma-s/a2aix/issues/{n}/comments -F body=@file`, in plain Japanese: the verdict (問題なし / 要修正), each finding with a reproduction, and what you ran. Be concise.

Token note: each session reports nothing about its own usage. Whoever started it reads `get_session` usage afterwards and adds it to the PR.
