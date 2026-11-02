---
name: verify-ix-node
description: Verification stub for an IX node. Use when an agent must prove a change to this repo. There is no node process yet. The runnable proof is doctor, then drive, which runs the check suite and writes evidence. Protocol features stay blocked.
---

# Verify an IX node

IX is a job-exchange node. This revision has no process to launch. A green check suite is evidence that the foundation still holds. It is not evidence that publish, negotiation, approval, or the transparency log works.

The feature map under `features/` is the list of user-facing behavior. Every entry is blocked. Do not weaken an entry so a drive can pass it.

日本語: これは検証手順のスタブです。ノードはまだ起動しません。`drive` が緑でも、流通・交渉・承認・ログは未検証です。

## Launch

There is no server, port, container, or browser. Do not start one.

From a clean checkout:

```bash
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm install --frozen-lockfile
node scripts/verify-ix-node.mjs doctor
```

Ready means `doctor` prints `doctor: ok` and exits 0. Ready does not mean a node is listening.

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
pnpm test
pnpm conformance
```

It does not publish, query, subscribe, negotiate, sign, or ask the log for a proof. `protocolFeaturesDriven` in the evidence is always an empty array. The conformance step asserts that six items are `pending`. Do not describe that as a conformance pass.

Mapped features and how to drive them are in `features/`. A feature whose file says blocked was not exercised, even if drive exits 0.

## Evidence

Drive writes:

- `artifacts/verify/<utc-timestamp>-<pid>/evidence.json`
- `artifacts/verify/<utc-timestamp>-<pid>/output.txt`

`evidence.json` records each command and its exit code. `output.txt` is the combined stdout and stderr.

Proof standard for this revision:

- Run the commands above. Do not substitute a claim that the code looks right.
- Capture the exit codes, not only the last line.
- A unit test that a stub throws, or that `open` sets `acceptsPublicPublish`, proves only that fact. It does not prove a feature in the map.
- Do not mock a relay, a counterparty, or a key to manufacture a protocol pass. No production boundary isolates those systems yet, because the systems are not built.
- The conformance placeholder must stay `pending`.

## Cleanup

```bash
node scripts/verify-ix-node.mjs cleanup
```

Cleanup does not kill a process by name. Drive does not leave a process. Cleanup must not delete `artifacts/verify/`. After cleanup, the evidence directory from this run still exists.

## Helpers

`scripts/verify-ix-node.mjs` is the helper. Invoke it as shown above. It takes one argument: `doctor`, `drive`, or `cleanup`.

`scripts/check-boundaries.mjs` is the dependency-direction check doctor runs. It also runs `runSelfTest` in `scripts/boundaries-lib.mjs`, which must keep rejecting a core-to-adapter import, `JSON.stringify` outside `@ix/jcs`, a crypto import, a comment in package source, an empty `catch`, and an unbounded loop.

## Maintenance

When a feature becomes real, update that feature's file in the same change that makes it drivable. Do not mark it drivable first. `/maintain-verification-skill` is the later loop. It is not wired in this revision, and it must not edit product code.
