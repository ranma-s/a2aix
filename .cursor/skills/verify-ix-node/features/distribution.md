# Distribution

流通。署名つきの依頼票を、タグで探せる中継ノードに出す。未実装。

## Sub-features

- Publish one signed job event to one or more relays.
- Query by tag, kind, and time window.
- Subscribe to matching events.
- `open` may accept public publish. `closed` does not.

## How to get to it (user POV)

An operator runs their own node and chooses a mode. The examples are `deploy/node/config.open.example.json` and `deploy/node/config.closed.example.json`. There is no node command and no relay URL.

## Driving it with verify-ix-node

Blocked. `node scripts/verify-ix-node.mjs drive` does not publish, query, or subscribe. Evidence lists `distribution` in `blockedFeatures`.

The only related check is the `@ix/node` unit test: `describeNode("open").acceptsPublicPublish` is true, and `describeNode("closed").acceptsPublicPublish` is false.

## Gotchas

- Do not start a server, websocket, or container to make this file look drivable.
- Do not sign an event. Signatures need a human security reviewer.
- An event id will be a hash of bytes from `@ix/jcs` `canonicalize`. That function throws. `JSON.stringify` is not a stand-in.
- Unknown kinds and tags are ignored once the relay exists. Do not reject them in a future parser just to be strict.
