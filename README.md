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
- [`voice.mjs`](voice.mjs) — the IO: `draft` (feed → gated queue), `post` (**DRY_RUN=1 by default**;
  with the owner's `X_CONSUMER_KEY/SECRET` + `X_ACCESS_TOKEN/SECRET` and an explicit `DRY_RUN=0`,
  posts via `POST /2/tweets`), `status` (never prints keys).
- [`feed.jsonl`](feed.jsonl) → [`queue.jsonl`](queue.jsonl) → [`posted.jsonl`](posted.jsonl) — the
  receipt cards in, the gated drafts, the public ledger (rehearsals included).
- [`index.html`](index.html) — the live page rendering the queue, the ledger and the rules.

## Keys (the only human step)

Pay-per-use X API credentials from the owner activate posting. Anything beyond replying-when-summoned
(a true AI reply bot) needs X's prior written approval — that mode deliberately does not exist here.

MIT · vendored gate: [witness](https://github.com/sjgant80-hub/witness) · the shop:
[kar-hub](https://sjgant80-hub.github.io/kar-hub/) · Powered by the Konomi architecture, created by
Thomas Frumkin.
