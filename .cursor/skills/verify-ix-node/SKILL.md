---
name: verify-ix-node
description: Verification for an IX change. Drive runs the check suite and writes evidence. It does not start the private localhost trial. Conformance items 3-5 pass only without signature checks. The other three stay pending.
---

# Verify an IX node

IX is a job-exchange node. A green check suite is evidence that the checks still hold. It is not evidence that a public relay, a checked signature, approval cryptography, or the transparency log works. Header activation, the in-memory relay, and the mock poster and worker have tests. Drive does not start the listener.

The feature map under `features/` is the list of user-facing behavior. Do not mark a blocked entry drivable so a drive can pass it. Do not start `deploy/local/compose.yaml` to manufacture a drive pass.

日本語: `drive` が緑でも、公開された中継、署名の確認、承認の暗号、ログは未検証です。適合は3項目だけが、署名を見ない範囲で合格です。手元の試験は `drive` では起動しません。

## Launch

Drive does not start a server. `deploy/local/compose.yaml` is a private trial. The process binds `127.0.0.1` and the file publishes no ports. Do not start it as part of drive. Do not bind any other address and do not publish a port.

From a clean checkout:

```bash
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm install --frozen-lockfile
node scripts/verify-ix-node.mjs doctor
```

Ready means `doctor` prints `doctor: ok` and exits 0. Ready does not mean the private trial is listening. Doctor does not start it.

Two drives can run side by side. They do not share a port. Each drive writes its own directory under `artifacts/verify/`.

## Doctor

```bash
node scripts/verify-ix-node.mjs doctor
```

Doctor is read-only. It checks:

- Node.js is 22 or newer.
- pnpm runs.
- Dependencies are installed (`node_modules/typescript`, `node_modules/vitest`, `pnpm-lock.yaml`).
- `node scripts/check-boundaries.mjs` exits 0. That includes the boundary self-test and the open/closed example configs.

There is no auth and no build id. If doctor fails, do not drive.

## Drive

```bash
node scripts/verify-ix-node.mjs drive
```

This is the only drive that exists. It runs, in order:

```bash
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm guardrails
pnpm test
pnpm conformance
```

It does not publish, query, subscribe, negotiate, sign, or ask the log for a proof, and it does not start the private listener. `protocolFeaturesDriven` in the evidence is always an empty array. The conformance step passes items 3–5 inside a recorded limit and leaves items 1, 2, and 6 `pending`. Do not describe that as a full conformance pass or as a signature check. Evidence records `conformance: "partial-items-3-5-pass-signatures-pending"`.

Mapped features and how to drive them are in `features/`. A feature whose file says blocked was not exercised, even if drive exits 0.

## Evidence

Drive writes:

- `artifacts/verify/<utc-timestamp>-<pid>/evidence.json`
- `artifacts/verify/<utc-timestamp>-<pid>/output.txt`

`evidence.json` records each command and its exit code. `output.txt` is the combined stdout and stderr.

Proof standard for this revision:

- Run the commands above. Do not substitute a claim that the code looks right.
- Capture the exit codes, not only the last line.
- A unit test proves only what it asserts. Header activation, the in-memory relay, and the mock agents have tests. Those tests are not a drive, and they do not verify a signature. `protocolFeaturesDriven` stays empty.
- The mock poster and worker are the private trial. They are not a signature pass. Do not add a key to make a result look verified.
- Conformance items 1, 2, and 6 stay `pending`. Items 3–5 may be `pass` only with the limit on the result. Do not drop the limit or flip another item to pass in the same change that needs a separate verifier.
- `pnpm guardrails` must fail the dummies in `fixtures/guardrails/`. A green guardrail run means those dummies failed and the normal tree passed. It does not mean the dummies were cleaned up.

## Cleanup

```bash
node scripts/verify-ix-node.mjs cleanup
```

Cleanup does not kill a process by name. Drive does not leave a process. Cleanup must not delete `artifacts/verify/`. After cleanup, the evidence directory from this run still exists.

## Helpers

`scripts/verify-ix-node.mjs` is the helper. Invoke it as shown above. It takes one argument: `doctor`, `drive`, or `cleanup`.

`scripts/check-boundaries.mjs` is the dependency-direction check doctor runs. It also runs `runSelfTest` in `scripts/boundaries-lib.mjs`, which must keep rejecting a core-to-adapter import, `JSON.stringify` outside `@ix/jcs`, a crypto import, a comment in package source, an empty `catch`, and an unbounded loop. A leading `/* SPDX-License-Identifier: Apache-2.0 */` header is the only comment it allows.

`scripts/prove-guardrails.mjs` is the guardrail self-test (`pnpm guardrails`). It must keep failing the dummies in `fixtures/guardrails/` and passing the real tree.

## Maintenance

When a feature becomes real, update that feature's file in the same change that makes it drivable. Do not mark it drivable first. `/maintain-verification-skill` is the later loop. It is not wired in this revision, and it must not edit product code.
