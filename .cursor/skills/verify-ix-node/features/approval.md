# Approval

人間の承認。合意案に、人間の鍵で署名する。未実装。

## Sub-features

- Both humans receive an AgreementDraft.
- Each human approves, rejects, or asks for a revision in the approval app.
- An ApprovalDecision without the human's signature is invalid.

## How to get to it (user POV)

When negotiation reaches `awaiting_approval`, each person opens the approval app and signs. An agent cannot open that step for them. There is no app screen yet. `signApproval` in `@ix/approval-app` throws.

## Driving it with verify-ix-node

Blocked. The unit test proves that `signApproval("client")` throws and names a security reviewer. A throw is not an approval. Do not catch it and report a pass.

## Gotchas

- `@ix/approval-app` is the human app. `@ix/a2a-ext-approval` is only the extension URI. Do not put key code in the extension package.
- Agents do not hold human keys. The approval app does not sign because an agent told it to.
- Approval is not an MCP tool. A future tool returns a link to the app and nothing else.
- Key generation, storage, and JWS need a human security reviewer before any of this becomes real.
