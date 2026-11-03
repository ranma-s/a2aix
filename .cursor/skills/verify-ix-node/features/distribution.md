# Distribution

流通。署名つきの依頼票を、タグで探せる中継ノードに出す。プロセスの中のメモリまでは実装した。ポートは開かない。署名は見ない。

## Sub-features

- Publish one job event into an injected store. The in-memory store is `@ix/adapters`. The same event can be published to two relays. A repeat with the same content is one copy. A different payload under the same id is refused.
- Query by tag, kind, issuer, id, and an inclusive time window. Different tag names are all required. Values of one name match if any one is present.
- Subscribe to events published after the subscription. Stored events are not replayed.
- `open` accepts public publish. `closed` refuses it.
- Unknown kinds and tags are stored.
- `id` and `sig` are the caller’s strings. `signatureVerification` is `deferred`.

## How to get to it (user POV)

An operator runs their own node and chooses a mode. The examples are `deploy/node/config.open.example.json` and `deploy/node/config.closed.example.json`. There is no node command and no relay URL. The plain-language map is `docs/distribution.md`.

## Driving it with verify-ix-node

Blocked. `node scripts/verify-ix-node.mjs drive` does not publish, query, or subscribe. Evidence lists `distribution` in `blockedFeatures`. Unit tests are not a drive.

The `@ix/node` unit test still checks `describeNode("open").acceptsPublicPublish` and `describeNode("closed").acceptsPublicPublish`.

## Gotchas

- Do not start a server, websocket, or container to make this file look drivable.
- Do not sign an event. Signatures need a human security reviewer. PR #3 (JCS) is still unmerged.
- Do not compute an event id. `@ix/jcs` `canonicalize` throws. `JSON.stringify` is not a stand-in. The caller supplies `id`.
- Unknown kinds and tags are stored. Do not reject them in the relay.
- An event with `now >= expiresAt` is discarded, including the exact instant.
- Subscribe does not take `limit` and does not replay events already stored.
