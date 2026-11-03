---
name: verify-ix-node
description: Verification for an IX change. Doctor is read-only. Drive runs the check suite, then starts the localhost relay and the mock agents and writes evidence. Signatures stay deferred.
---

# Verify an IX node

IX is a job-exchange node. Drive starts the private relay on `127.0.0.1` and the mock poster and worker, then runs the non-cryptographic checks in `@ix/verify`. A green drive is not a signature check, not a JCS check, and not a full six-item credential. Items 1 and 2 stay pending. Mandate documents, approval cryptography, transcript hashes, the transparency log, and MCP stay blocked.

The feature map under `features/` is the list of user-facing behavior. The director's copy is `docs/feature-map.md`. Do not mark a blocked entry drivable so a drive can pass it. Do not bind any address other than `127.0.0.1`.

日本語: `drive` は手元の `127.0.0.1` で中継と模試を起動し、署名以外の検査をします。緑でも、署名、JCS、JWS、prevHash の照合はしていません。適合の1と2は未実施です。

## Launch

From a clean checkout:

```bash
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm install --frozen-lockfile
node scripts/verify-ix-node.mjs doctor
```

Ready means `doctor` prints `doctor: ok` and exits 0. Doctor does not start a listener.

Drive starts one relay with `IX_BIND=127.0.0.1` and `IX_PORT=0`, then the mock poster and the mock worker against that port. The process refuses any other bind. Two drives can run side by side because each asks the operating system for its own port. Each drive writes its own directory under `artifacts/verify/`.

`deploy/local/compose.yaml` is the same private trial for a person with Docker. It publishes no host ports. Drive does not call Docker. Drive uses `scripts/ix-trial-evidence.mjs`, which stops the listener before it exits.

## Doctor

```bash
node scripts/verify-ix-node.mjs doctor
```

Doctor is read-only. It checks:

- Node.js is 22 or newer.
- pnpm runs.
- Dependencies are installed (`node_modules/typescript`, `node_modules/vitest`, `pnpm-lock.yaml`).
- `node scripts/check-boundaries.mjs` exits 0. That includes the boundary self-test and the open/closed example configs.

There is no auth and no build id. If doctor fails, do not drive. Doctor does not listen.

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
node --import tsx scripts/ix-trial-evidence.mjs
```

The last command starts the relay on `127.0.0.1`, runs the mock poster and worker until both print `agreed`, queries the stored events, and runs `@ix/verify`. That check covers message schema, state-machine replay, numeric bounds, and deadlines. Signature, JCS, JWS, and prevHash checks return `deferred` and do not read the material as a proof. The trial step runs only after the six checks above exit 0.

`protocolFeaturesDriven` is `distribution-localhost-publish-query`, `negotiation-mock`, and `ix-verify` when the drive exits 0. It is empty when the drive fails. `blockedFeatures` stays `mandate`, `approval`, `transcript`, `log`, `mcp`, `signature`, `jcs`, `jws`, and `prevHash`. Evidence records `conformance: "partial-items-3-6-pass-signatures-deferred"`.

Mapped features and how to drive them are in `features/`. A feature whose file says blocked was not exercised, even if drive exits 0.

## Evidence

Drive writes:

- `artifacts/verify/<utc-timestamp>-<pid>/evidence.json`
- `artifacts/verify/<utc-timestamp>-<pid>/output.txt`

`evidence.json` records each command, its exit code, the bind address, the driven features, the blocked features, and the four deferred check names. `output.txt` is the combined stdout and stderr, including the trial JSON.

Proof standard for this revision:

- Run the commands above. Do not substitute a claim that the code looks right.
- Capture the exit codes, not only the last line.
- The localhost trial is a real listener on `127.0.0.1`. It is not a public relay and it does not check a signature.
- `@ix/verify` may pass schema, replay, bounds, and deadlines. A `deferred` result is not a pass for that check.
- Conformance items 3–6 may be `pass` only with the limit on the result. Item 6's `coveredCases` is the injection list. Items 1 and 2 stay `pending`. Do not drop a limit or flip item 1 or 2 to pass in the same change that needs a separate verifier.
- `pnpm guardrails` must fail the dummies in `fixtures/guardrails/`. A green guardrail run means those dummies failed and the normal tree passed. It does not mean the dummies were cleaned up.

## Cleanup

```bash
node scripts/verify-ix-node.mjs cleanup
```

Cleanup does not kill a process by name. Drive's trial script stops the listener, the poster, and the worker it started. Cleanup must not delete `artifacts/verify/`. After cleanup, the evidence directory from this run still exists.

## Helpers

`scripts/verify-ix-node.mjs` is the helper. Invoke it as shown above. It takes one argument: `doctor`, `drive`, or `cleanup`.

`scripts/ix-trial-evidence.mjs` is the localhost launch. Drive calls it. It is not a separate public mode.

`scripts/check-boundaries.mjs` is the dependency-direction check doctor runs. It also runs `runSelfTest` in `scripts/boundaries-lib.mjs`, which must keep rejecting a core-to-adapter import, `JSON.stringify` outside `@ix/jcs`, a crypto import, a comment in package source, an empty `catch`, and an unbounded loop. A leading `/* SPDX-License-Identifier: Apache-2.0 */` header is the only comment it allows.

`scripts/prove-guardrails.mjs` is the guardrail self-test (`pnpm guardrails`). It must keep failing the dummies in `fixtures/guardrails/` and passing the real tree.

## Maintenance

When a feature becomes real, update that feature's file in the same change that makes it drivable. Do not mark it drivable first. `/maintain-verification-skill` is the later loop. It is not wired in this revision, and it must not edit product code.
