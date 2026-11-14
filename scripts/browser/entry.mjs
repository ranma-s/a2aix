/* SPDX-License-Identifier: Apache-2.0 */

import { createLocalRelay } from "@ix/adapters";
import { clockAt, createTermConsole, createTermSigners, peersOf, peersProblem, sampleNow } from "@ix/agents";

const signers = await createTermSigners();
const peers = peersOf(signers);
const problem = peersProblem(peers);
if (problem !== undefined) {
  throw new Error(problem);
}
const clock = clockAt(sampleNow);
const relay = createLocalRelay({ mode: "open", clock });
const trial = createTermConsole({ board: relay, clock, signers });

const rows = [
  ["依頼者のエージェント", peers.client],
  ["依頼者の承認者（模試の人間）", peers.approvers.client],
  ["受注者のエージェント", peers.worker],
  ["受注者の承認者（模試の人間）", peers.approvers.worker],
];

const byId = (id) => {
  const found = document.getElementById(id);
  if (found === null) {
    throw new Error(`the page has no element ${id}`);
  }
  return found;
};

const element = (tag, text) => {
  const made = document.createElement(tag);
  if (text !== undefined) {
    made.textContent = text;
  }
  return made;
};

const keyList = byId("keys");
for (const [label, did] of rows) {
  const item = element("li");
  item.append(element("strong", label), " ", element("code", did));
  keyList.append(item);
}
byId("relay").textContent = `中継: ${relay.mode}、このページのメモリの中だけ`;

const jobSelect = byId("job");
const status = byId("status");
let busy = false;

const currentJob = () => (jobSelect.value === "" ? undefined : jobSelect.value);

const listInto = (target, items, empty) => {
  target.replaceChildren();
  if (items.length === 0) {
    target.append(element("li", empty));
    return;
  }
  for (const text of items) {
    target.append(element("li", text));
  }
};

const renderSide = (party) => {
  const jobId = currentJob();
  const view = jobId === undefined ? undefined : trial.view(jobId, party);
  byId(`${party}-phase`).textContent = view === undefined ? "仕事がありません" : `状態: ${view.phase}`;
  const table = byId(`${party}-terms`);
  table.replaceChildren();
  for (const term of view?.terms ?? []) {
    const row = element("tr");
    row.append(element("td", term.label), element("td", term.status), element("td", term.value ?? "—"));
    table.append(row);
  }
  listInto(byId(`${party}-moves`), view?.moves ?? [], "—");
  listInto(byId(`${party}-problems`), [...(view?.escalations ?? []).map((text) => `権限外: ${text}`), ...(view?.refusals ?? [])], "なし");
  listInto(byId(`${party}-free`), view?.shownFreeText ?? [], "なし");
};

const render = () => {
  const chosen = jobSelect.value;
  jobSelect.replaceChildren();
  for (const jobId of trial.jobIds()) {
    const option = element("option", jobId);
    option.value = jobId;
    jobSelect.append(option);
  }
  if (chosen !== "") {
    jobSelect.value = chosen;
  }
  renderSide("client");
  renderSide("worker");
};

const run = async (action) => {
  if (busy) {
    return;
  }
  busy = true;
  try {
    const outcome = await action();
    status.textContent = outcome.text;
    status.className = outcome.ok ? "ok" : "ng";
  } catch (error) {
    status.textContent = `ページの処理が失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`;
    status.className = "ng";
  } finally {
    busy = false;
    render();
  }
};

const needJob = (action) => () => {
  const jobId = currentJob();
  return jobId === undefined ? Promise.resolve({ ok: false, text: "先に仕事を登録してください" }) : action(jobId);
};

byId("register").addEventListener("click", () => {
  void run(async () => {
    const outcome = await trial.registerSampleJob();
    const ids = trial.jobIds();
    render();
    const last = ids[ids.length - 1];
    if (outcome.ok && last !== undefined) {
      jobSelect.value = last;
    }
    return outcome;
  });
});
jobSelect.addEventListener("change", render);

for (const party of ["client", "worker"]) {
  const pasted = byId(`${party}-paste`);
  byId(`${party}-send`).addEventListener("click", () => {
    void run(needJob(async (jobId) => {
      const outcome = await trial.pasteMove(jobId, party, pasted.value);
      if (outcome.ok) {
        pasted.value = "";
      }
      return outcome;
    }));
  });
  byId(`${party}-approve`).addEventListener("click", () => {
    void run(needJob((jobId) => trial.approve(jobId, party, "approve")));
  });
  byId(`${party}-reject`).addEventListener("click", () => {
    void run(needJob((jobId) => trial.approve(jobId, party, "reject")));
  });
}
byId("client-draft").addEventListener("click", () => {
  void run(needJob((jobId) => trial.draftAgreement(jobId)));
});

render();
