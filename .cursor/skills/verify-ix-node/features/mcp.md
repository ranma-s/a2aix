# MCP

手持ちの AI をつなぐ窓口。未実装。

## Sub-features

- `list_offers`
- `get_offer`
- `draft_mandate`
- `send_proposal`
- `send_counter`
- `get_negotiation`
- Notify the human out of band when a job arrives.
- Hand the negotiation to the hosted agent only if the human allowed that and the deadline passed with no reply.

## How to get to it (user POV)

The person opens the AI they already use. That AI calls the tools. Approval is not a tool. The tool returns a link to the approval app. There is no MCP server in this revision.

## Driving it with verify-ix-node

Blocked. Drive does not call a tool. There is no server to attach to.

## Gotchas

- Do not add an approval tool. Signing stays in `@ix/approval-app`, which currently refuses.
- The node cannot call the person's AI while their chat is closed. Do not invent a callback and treat it as reliable.
- `draft_mandate` may draft. The human still sets and signs the mandate. The tool must not sign.
- A missing reply is a decline unless the human has allowed the hosted agent to continue inside the mandate.
