# kar-voice

**▶ Live: https://sjgant80-hub.github.io/kar-voice/** — what this company says, before it says it.

The public voice of an AI-run company, **key-ready**: every post is drafted deterministically from a
sealed receipt (the claim, the anchor, the link — no hype), passes a rules gate stricter than the
platform's, and sits in a public ledger before and after it ships. **No cold outreach exists in this
codebase**: replies happen only when someone @mentions us, once, with opt-outs honoured — which is
also exactly where X's own automation rules draw the line.

## The pieces

- [`voice-core.mjs`](voice-core.mjs) — the pure kernel, **mutation-gated clean (28/29 killed, 1
  reviewed-equivalent argued in [`witness.baseline.json`](witness.baseline.json))**: deterministic
  drafting, X-style length accounting (every URL = 23 chars), shingle near-duplicate refusal (≥0.6),
  the daily cap (4), summoned-only reply picking, and OAuth 1.0a signing that reproduces X's
  documented example signature byte-for-byte.
- [`claim-gate.mjs`](claim-gate.mjs) — **every claim checked against a committed receipt, and nothing out without Simon’s approval of the exact words** (pure kernel, **mutation-gated clean 47/47, nothing baselined**). A card pins one JSON receipt by repo, full commit and sha256; every number in the post must be a named field of it; a number from a claim that FAILED is refused; no hype, prices, economy terms or jargon. An approval binds the item to the sha256 of its text; a rehearsal approval only ever authorises a dry run. Sealed before the code ([`data/claimgate-prereg.json`](data/claimgate-prereg.json), 06b8683); measured **5 of 6 held** ([`data/claimgate-run.json`](data/claimgate-run.json)) — V3 failed as sealed (all 35 forgeries refused, 2 not for the reason the seal named; the rule, not the gate) and is kept. CI re-measures it on every push.
- [`voice.mjs`](voice.mjs) — `approve <id> --quote "…"` (Kar runs it only on Simon’s word in chat) · `withdraw <id>` · the IO: `draft` (feed → gated queue), `post` (**DRY_RUN=1 by default**;
  with the owner's `X_CONSUMER_KEY/SECRET` + `X_ACCESS_TOKEN/SECRET` and an explicit `DRY_RUN=0`,
  posts via `POST /2/tweets` — and only an item that passes the claim gate, is exactly its card’s draft, and carries Simon’s approval of those words), `status` (never prints keys).
- [`feed.jsonl`](feed.jsonl) → [`queue.jsonl`](queue.jsonl) → [`posted.jsonl`](posted.jsonl) — the
  receipt cards in, the gated drafts, the public ledger (rehearsals included).
- [`index.html`](index.html) — the live page rendering the queue, the ledger and the rules.

## Keys (the only human step)

Pay-per-use X API credentials from the owner activate posting. Anything beyond replying-when-summoned
(a true AI reply bot) needs X's prior written approval — that mode deliberately does not exist here.

MIT · vendored gate: [witness](https://github.com/sjgant80-hub/witness) · the shop:
[kar-hub](https://sjgant80-hub.github.io/kar-hub/) · Powered by the Konomi architecture, created by
Thomas Frumkin.
