# Deploy

No node image is built in this revision. A node is an ordinary peer. Open and closed are a config switch, not two products.

| File | Mode | Meaning |
| --- | --- | --- |
| `deploy/node/config.open.example.json` | `open` | Internet exchange. The node may accept public publish. |
| `deploy/node/config.closed.example.json` | `closed` | In-house exchange. The node does not accept public publish. |

`@ix/node` `describeNode` reads this distinction and does not listen on a port. The private trial is separate: [`docs/local-trial.md`](../docs/local-trial.md) and `deploy/local/compose.yaml`. That file publishes no ports. `scripts/local-ix.mjs` binds `127.0.0.1` only.

# 配置

このリビジョンではノードのイメージは作りません。ノードは特別な中央ではなく、ただの一台です。オープンとクローズドは、別の製品ではなく設定の切り替えです。

- `open`: インターネットに開いた交換。外からの公開を受け付ける。
- `closed`: 組織の中だけの交換。外からの公開は受け付けない。

いまこの違いを読んでいる `@ix/node` の `describeNode` は、ポートを開きません。手元だけの試験は別です。[`docs/local-trial.md`](../docs/local-trial.md) と `deploy/local/compose.yaml` を見てください。その compose はポートを公開しません。`scripts/local-ix.mjs` は `127.0.0.1` 以外では起動しません。
