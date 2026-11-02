# Transcript

交渉履歴。各メッセージを署名し、直前のハッシュでつなぐ。未実装。

## Sub-features

- Each negotiation message carries `signature` and `prevHash`.
- `signature` is JWS over the JCS bytes of the message with `signature` removed.
- The hash is SHA-256 of those same JCS bytes.
- Both parties keep the signed transcript. The worker recomputes the agreement draft from it.

## How to get to it (user POV)

People do not edit the chain. Their agents attach the previous hash, and a later reader can see a gap or a swap. There is no transcript to show yet.

## Driving it with verify-ix-node

Blocked. `@ix/a2a-ext-transcript` exports the extension URI only. `@ix/jcs` `canonicalize` throws, so there is no canonical byte string to hash.

## Gotchas

- Do not hash `JSON.stringify` output. The lint and the boundary check reject that call outside `packages/jcs/src`.
- Do not add signature fixtures under `vectors/` before a human security reviewer accepts the scheme.
- A chain that uses a test key is still key handling. Do not add the key either.
