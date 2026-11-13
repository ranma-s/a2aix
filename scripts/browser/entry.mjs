/* SPDX-License-Identifier: Apache-2.0 */

import { createLocalRelay } from "@ix/adapters";
import { clockAt, createTermSigners, peersOf, peersProblem, sampleNow } from "@ix/agents";

const signers = await createTermSigners();
const peers = peersOf(signers);
const problem = peersProblem(peers);
if (problem !== undefined) {
  throw new Error(problem);
}
const relay = createLocalRelay({ mode: "open", clock: clockAt(sampleNow) });

const rows = [
  ["poster agent", peers.client],
  ["poster approver", peers.approvers.client],
  ["worker agent", peers.worker],
  ["worker approver", peers.approvers.worker],
];

const list = document.getElementById("keys");
for (const [label, did] of rows) {
  const item = document.createElement("li");
  const name = document.createElement("strong");
  name.textContent = label;
  const code = document.createElement("code");
  code.textContent = did;
  item.append(name, " ", code);
  list.append(item);
}
document.getElementById("relay").textContent = `relay: ${relay.mode}, in memory, no events`;
