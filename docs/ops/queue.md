# Work queue

The nightly run and every fresh session read this file. One row is one task. The nightly run takes the first row whose `status` is `ready` and whose `door` is `no`. It never takes a `door: yes` row; a person starts those.

Statuses: `ready`, `in-progress` (a PR exists; the row names it), `waiting-director`, `done`. When a PR opens for a row, the session that opened it changes the row to `in-progress` in the same PR. When it merges, the director or the next session marks it `done`.

| id | status | door | model | task | done when |
| --- | --- | --- | --- | --- | --- |
| Q1 | done | no | sonnet | Clean up the dev loop after PR #25: neutral wording in `docs/dev-loop.md`, the canary ticket marked as an example, AGENTS.md rows for `automation/` and `scripts/ix-job.mjs`, no comments in Python, and a configurable Claude CLI path (`chore/dev-loop-cleanup`). | The PR is verified and merged. |
| Q2 | done | no | haiku | In `docs/spec/signature-design-draft.md` section 11, change the row "4. 中継の受領印" from "まだ" to "見送り（D06）。時刻は送り手の申告（T25c）" so it matches section 12. Documentation only. | `pnpm check` green; PR open. |
| Q3 | in-progress (PR #31) | no | opus | Write the short standard: `docs/spec/ix-standard.md`, English first and Japanese after. Cover term-by-term negotiation, the hash chain, agent and approval signatures, and the replay procedure. Write it from the code and `decisions.tsv`; it must not invent rules. Keep it to about four pages. | `pnpm check` green; PR open; it cites the decision ids. |
| Q4 | waiting-director | no | — | Delete stale branches. The session proxy refuses branch deletes, so a person does this on GitHub. | The director has done it. |
| Q5 | waiting-director | no | — | PR #4 (public docs) and PR #11. | The director decides. |
| Q6 | ready | no | sonnet | Make `verifyTermTranscript` check the job's expiry like the agents do (T21b): `deadlines` fails for a negotiation message whose event `createdAt` is at or after the job's `expiresAt`, judged by the sender's declared time (T25c). Found by the PR #31 verifier. Add one `decisions.tsv` row, a test that fails if the check is reverted, and update sections 9 and 10 of `docs/spec/ix-standard.md` in both languages. | `pnpm check` green; PR open; the test from the PR #31 finding (job expiry earlier than every message) now fails `deadlines`. |
