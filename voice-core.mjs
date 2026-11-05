// ════════════════════════════════════════════════════════════════
// kar-voice · the AI-run company's voice on X — the PURE kernel
//
// The whole distribution ethos in one file: this company never cold-pitches. It POSTS what it has
// PROVEN (every freshly sealed receipt becomes one plain post), and it REPLIES only when summoned
// (someone @mentions us). That is not just the owner's taste — it is also exactly the line X's own
// automation rules draw: original useful posts are allowed; unsummoned automated replies are not.
// The rules gate below refuses anything over the line BEFORE a key is ever involved, so the organ
// is safe to wire the day the key lands.
//
// Everything here is deterministic and IO-free: drafting is a template over a receipt card (a local
// model may polish a draft UPSTREAM, but what passes the gate is what posts), duplicate detection is
// shingle overlap, and the OAuth 1.0a signature is pure crypto over supplied parameters. The IO —
// reading the feed, calling the X API, the dry-run ledger — lives in voice.mjs.
//
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════

import { createHmac, randomBytes } from 'node:crypto';

export const RULES = Object.freeze({
  maxPerDay: 4,              // a voice, not a firehose
  tcoUrlLength: 23,          // every URL costs 23 chars on X regardless of its true length
  maxChars: 280,
  dupThreshold: 0.6,         // shingle overlap above this = a near-duplicate, refused
  replyOnlyWhenSummoned: true,
});

// ── drafting: a receipt card becomes one plain post ──────────────────────────
// No hype, no hashtag spam, no emoji carpet. The claim, the number, the proof, the link — because
// the reader we care about is as likely to be an agent as a human.
// Total, like every kernel here: garbage in gives { ok: false, … } (or an empty value), never a throw — a hostile card,
// a hostile options object or a string X cannot encode is refused, not crashed on.
export function draftPost(card) {
  try { return draftOf(card); } catch { return { ok: false, error: 'the card could not be read' }; }
}
function draftOf(card) {
  if (!card || typeof card !== 'object') return { ok: false, error: 'no card' };
  for (const k of ['name', 'claim', 'url']) {
    if (typeof card[k] !== 'string' || !card[k].trim()) return { ok: false, error: `card needs ${k}` };
  }
  const anchor = typeof card.anchor === 'string' && /^[0-9a-f]{64}$/.test(card.anchor) ? card.anchor.slice(0, 12) : null;
  const lines = [
    `${card.name.trim()}: ${card.claim.trim()}`,
    anchor ? `Receipt anchor ${anchor}… — re-run it and the hash reproduces, or the claim is refused.` : `The proof is re-runnable — same inputs, same verdict, on your machine.`,
    card.url.trim(),
  ];
  return { ok: true, text: lines.join('\n') };
}

// X counts every URL as 23 chars. Count that way, not by string length.
export function xLength(text) {
  try {
    const urls = String(text).match(/https?:\/\/\S+/g) || [];
    let len = String(text).length;
    for (const u of urls) len += RULES.tcoUrlLength - u.length;
    return len;
  } catch { return NaN; }
}

// ── near-duplicate detection: word shingles, Jaccard overlap ─────────────────
export function shingles(text, k = 3) {
  const out = new Set();
  try {
    const words = String(text).toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    for (let i = 0; i + k <= words.length; i++) out.add(words.slice(i, i + k).join(' '));
  } catch { /* unreadable text has no shingles */ }
  return out;
}
export function overlap(a, b) {
  const A = shingles(a), B = shingles(b);
  if (A.size === 0 || B.size === 0) return 0;
  let hit = 0;
  for (const s of A) if (B.has(s)) hit++;
  return Math.round((hit / Math.min(A.size, B.size)) * 1000) / 1000;
}

// ── the rules gate: nothing posts unless this says ok ────────────────────────
// history = texts already posted (ever); todayCount = posts already made today.
export function rulesGate(text, opts) {
  try { return gateOf(text, opts); } catch { return { ok: false, why: 'the post or its history could not be read' }; }
}
function gateOf(text, { history = [], todayCount = 0, maxPerDay = RULES.maxPerDay } = {}) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, why: 'empty post' };
  const len = xLength(text);
  if (len > RULES.maxChars) return { ok: false, why: `too long: ${len} > ${RULES.maxChars} (URLs count as ${RULES.tcoUrlLength})` };
  if (todayCount >= maxPerDay) return { ok: false, why: `daily cap reached (${maxPerDay}) — a voice, not a firehose` };
  if (!/https?:\/\//.test(text)) return { ok: false, why: 'no link — every post carries its proof URL' };
  for (const prev of history) {
    const o = overlap(text, prev);
    if (o >= RULES.dupThreshold) return { ok: false, why: `near-duplicate of an earlier post (overlap ${o}) — X prohibits repeating near-identical posts, and so do we` };
  }
  return { ok: true, length: len };
}

// ── replies: only when summoned, once per mention, opt-out honoured ──────────
// mention = { id, authorUsername, text }; repliedIds = mention ids already answered.
export function pickReply(mention, opts) {
  try { return replyOf(mention, opts); } catch { return { ok: false, why: 'malformed mention' }; }
}
function replyOf(mention, { repliedIds = [], selfUsername = '' } = {}) {
  if (!Array.isArray(repliedIds)) return { ok: false, why: 'the list of answered mentions could not be read' };
  if (!mention || typeof mention.id !== 'string' || !mention.id) return { ok: false, why: 'malformed mention' };
  if (repliedIds.includes(mention.id)) return { ok: false, why: 'already answered — one automated reply per interaction' };
  if (typeof mention.authorUsername !== 'string' || !mention.authorUsername) return { ok: false, why: 'no author' };
  if (selfUsername && mention.authorUsername.toLowerCase() === selfUsername.toLowerCase()) return { ok: false, why: 'never reply to self' };
  if (/\b(stop|unsubscribe|optout|opt-out)\b/i.test(String(mention.text || ''))) return { ok: false, why: 'opt-out honoured' };
  const text = [
    `@${mention.authorUsername} Everything we ship carries a proof you can re-run — the catalog and the how-to-verify guide are here:`,
    'https://sjgant80-hub.github.io/kar-hub/agents.md',
  ].join('\n');
  return { ok: true, text, inReplyTo: mention.id };
}

// ── OAuth 1.0a (HMAC-SHA1) — the signature X's v2 POST /2/tweets accepts ─────
// Pure over its inputs; nonce and timestamp are parameters so the whole thing is testable against
// the canonical RFC vector. percentEncode is RFC 3986 (OAuth's stricter variant of encodeURIComponent).
// The signing functions are total too: garbage (or a string X cannot encode, such as a lone surrogate) gives '' — and
// an empty header, which voice.mjs refuses to send — never a throw.
export function percentEncode(s) {
  try {
    return encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  } catch { return ''; }
}

export function signatureBaseString(method, url, params) {
  try { return baseOf(method, url, params); } catch { return ''; }
}
function baseOf(method, url, params) {
  const pairs = [];
  for (const [k, v] of Object.entries(params)) pairs.push([percentEncode(k), percentEncode(v)]);
  // params arrive as a JS object, so keys are unique BY CONSTRUCTION — the spec's sort-by-value
  // tiebreak for duplicate keys can never fire here, and writing it anyway would be dead code a
  // mutation gate rightly flags. Key order alone is total for unique keys.
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const paramStr = pairs.map(([k, v]) => `${k}=${v}`).join('&');
  return `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramStr)}`;
}

export function oauth1Signature(args) {
  try { return signatureOf(args); } catch { return ''; }
}
function signatureOf({ method, url, params, consumerSecret, tokenSecret }) {
  const base = signatureBaseString(method, url, params);
  if (!base) return '';
  const key = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret || '')}`;
  return createHmac('sha1', key).update(base).digest('base64');
}

export function oauth1Header(args) {
  try { return headerOf(args); } catch { return { header: '', oauth: null }; }
}
function headerOf({ method, url, consumerKey, consumerSecret, token, tokenSecret, nonce, timestamp }) {
  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce || randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(timestamp || Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: '1.0',
  };
  const sig = oauth1Signature({ method, url, params: oauth, consumerSecret, tokenSecret });
  if (!sig) return { header: '', oauth: null };   // nothing signed, nothing to send
  const all = { ...oauth, oauth_signature: sig };
  const header = 'OAuth ' + Object.keys(all).sort().map((k) => `${percentEncode(k)}="${percentEncode(all[k])}"`).join(', ');
  return { header, oauth: all };
}

export default { RULES, draftPost, xLength, shingles, overlap, rulesGate, pickReply, percentEncode, signatureBaseString, oauth1Signature, oauth1Header };
