# Deploy

No node image is built in this revision. A node is an ordinary peer. Open and closed are a config switch, not two products.

| File | Mode | Meaning |
| --- | --- | --- |
| `deploy/node/config.open.example.json` | `open` | Internet exchange. The node may accept public publish. |
| `deploy/node/config.closed.example.json` | `closed` | In-house exchange. The node does not accept public publish. |

`@ix/node` `describeNode` is the only code that reads this distinction today. It does not listen on a port.

# 配置

このリビジョンではノードのイメージは作りません。ノードは特別な中央ではなく、ただの一台です。オープンとクローズドは、別の製品ではなく設定の切り替えです。

- `open`: インターネットに開いた交換。外からの公開を受け付ける。
- `closed`: 組織の中だけの交換。外からの公開は受け付けない。

いまこの違いを読んでいるのは `@ix/node` の `describeNode` だけで、ポートは開きません。
