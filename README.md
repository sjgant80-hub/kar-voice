# kar-voice

**▶ Live: https://sjgant80-hub.github.io/kar-voice/** — what this company says, before it says it.
The page explains itself: start here, how it works (a diagram traced live from a real card and the sealed run), the
blueprint organ by organ, and, for a business, what it does for each role, a cost case computed from your own numbers
and sourced figures, security, adoption, support, risks and a short white paper.

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
- [`costcase.mjs`](costcase.mjs) — the page's cost case (pure kernel, **mutation-gated in CI, nothing baselined**; 33/33 killed locally after set-up and upkeep were added): staff time writing and checking proof posts today, rented assistant seats, a cloud model drafting each post, and owning the voice; the reader's own one-off set-up hours and monthly upkeep hours are counted on both automated routes, with the months the set-up takes to pay back. Every external figure is read from [`vendor/sovereign-enterprise/data/basis.json`](vendor/sovereign-enterprise/data/basis.json) (ONS median wage, CPI, DESNZ electricity, ECB rate, Microsoft and Anthropic list prices, each with its source), copied byte for byte from sovereign-enterprise with its hash pinned in [`vendor/SOURCES.json`](vendor/SOURCES.json) and checked on every push. The posts, minutes and counts are the reader's own; X's per-post charge is the same on every route and is not in the basis, so it is left out. No price of ours.
- [`page.test.mjs`](page.test.mjs) — the live page's wiring: no number typed into its text (every figure comes from a receipt, the basis or a kernel), no dead element or anchor, an input for every number the cost case takes, every section present, supplier and credit on the page. The page imports `claim-gate.mjs`, `voice-core.mjs` and `costcase.mjs` themselves (an import map points `node:crypto` at [`page-nosign.mjs`](page-nosign.mjs), which throws), so the logic on the page is the gated logic and the page can never sign.
- [`voice.mjs`](voice.mjs) — `approve <id> --quote "…"` (Kar runs it only on Simon’s word in chat) · `withdraw <id>` · the IO: `draft` (feed → gated queue), `post` (**DRY_RUN=1 by default**;
  with the owner's `X_CONSUMER_KEY/SECRET` + `X_ACCESS_TOKEN/SECRET` and an explicit `DRY_RUN=0`,
  posts via `POST /2/tweets` — and only an item that passes the claim gate, is exactly its card’s draft, and carries Simon’s approval of those words), `status` (never prints keys).
- [`feed.jsonl`](feed.jsonl) → [`queue.jsonl`](queue.jsonl) → [`posted.jsonl`](posted.jsonl) — the
  receipt cards in, the gated drafts, the public ledger (rehearsals included).
- [`index.html`](index.html) — the live page rendering the queue, the ledger and the rules.

## Replies

The reply rule (`pickReply`: only someone who @mentioned us, once, opt-outs honoured) is in the kernel and tested. Reading
mentions needs the owner's X keys and X's paid read access, so `voice.mjs` has no reply command yet: today the voice only
posts.

## CI

`.github/workflows/gate.yml`: the four unit suites; the claim gate's seal checked unchanged since 06b8683 and its six
claims re-measured byte for byte; witness **pinned at v0.6** (fresh clone of the tag, commit `f04fe30` checked) on
`voice-core.mjs`, `claim-gate.mjs` and `costcase.mjs`, each required clean. `vendor/witness/` (bdca01f: v0.6 plus one
CLI message) is for local runs.

## Keys (the only human step)

Pay-per-use X API credentials from the owner activate posting. Anything beyond replying-when-summoned
(a true AI reply bot) needs X's prior written approval — that mode deliberately does not exist here.

MIT · vendored gate: [witness](https://github.com/sjgant80-hub/witness) · the shop:
[kar-hub](https://sjgant80-hub.github.io/kar-hub/) · Powered by the Konomi architecture, created by
Thomas Frumkin.
