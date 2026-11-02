# Transparency log

透明性ログ。合意、結果、評価のハッシュを追記する。未実装。

## Sub-features

- Inclusion proof for one record.
- Consistency proof that the log was only appended.
- Witness signatures over one tree head.
- Commit-reveal reviews: `ReviewCommit`, then `ReviewReveal`.
- A periodic public commitment of the log root. Not one chain transaction per deal.

## How to get to it (user POV)

After both humans sign, either party can register the agreement hash. Outcome and review records are registered by each party alone. A person can ask for an inclusion proof. Nothing here answers that request. `proveInclusion` throws.

## Driving it with verify-ix-node

Blocked. Drive does not append or prove. `@ix/log` names four record kinds and refuses inclusion proofs. `@ix/ledger` only recognizes those names.

## Gotchas

- The log stores hashes and signatures, not names, contact details, or contract text.
- Both signatures are required for an agreement record. Outcome and review records use one party's key. Do not require both signatures for those, or a party can hide a bad outcome by refusing to sign.
- Reviews are commit-reveal so one party cannot edit a review after reading the other. A missing commit by the deadline is "no review".
- Do not pick a public chain, a witness count, or a record encoding here. That is a human security review.
