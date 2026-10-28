// claim-gate.mjs — kar-voice's claim gate and approval binding. Pure, total, deterministic, IO-free, witness-gated.
//
// Two rules the company's voice cannot break:
//   1. Every claim is checked against a COMMITTED receipt. A card names the receipt by repo + full commit + path and
//      pins the file's sha256; every number in the post must be a field of that receipt (named by its path in the
//      card's facts, and equal to it there); a fact inside a claim that FAILED is refused; and the post may carry no
//      hype word, no price, no economy term and no estate jargon.
//   2. Nothing goes out without Simon's approval of those exact words. An approval names the item and the sha256 of
//      its text: change one character and the approval no longer covers it. A rehearsal approval (the demo's) can
//      only ever authorise a dry run.
// Hashing is the caller's (node:crypto in voice.mjs, WebCrypto on the page), so this file runs in both.
//
// Powered by the Konomi architecture, created by Thomas Frumkin.

export const HYPE = /\b(best|world'?s first|first[- ]ever|the only|revolutionary|guarantee[sd]?|unbeatable|certified|game[- ]?chang\w*|unprecedented|perfect|flawless|never fails|number one)\b/i;
export const PRICE = /[£$€]\s?\d|\b\d+(\.\d+)?\s?(gbp|usd|eur|pounds|dollars)\b|\/mo\b|\bper (seat|month|user|year)\b|\bpric(e|es|ed|ing)\b|\bdiscount/i;
export const ECONOMY = /\b(kcc|airdrop|token sale|pre-?sale|ico|crypto|coin|staking|yield|earned value|mint price)\b/i;
export const JARGON = /κ|φ|θ|konomif|sididy|\bwisp\b|wobble|\bgep\b/i;
export const HOSTS = /^https:\/\/(sjgant80-hub\.github\.io\/|github\.com\/sjgant80-hub\/)/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim() !== '';

/** Is the receipt pinned to one committed file? */
export function pinned(r) {
  if (!isObj(r)) return 'no receipt';
  if (!isStr(r.repo) || !/^sjgant80-hub\/[A-Za-z0-9._-]+$/.test(r.repo)) return 'the receipt must live in a public estate repo (sjgant80-hub/<name>)';
  if (!isStr(r.commit) || !/^[0-9a-f]{40}$/.test(r.commit)) return 'the receipt must be pinned to a full commit, not a branch';
  if (!isStr(r.path) || r.path.includes('..') || r.path.startsWith('/') || !r.path.endsWith('.json')) return 'the receipt must be one JSON file in that repo';
  if (!isStr(r.sha256) || !/^[0-9a-f]{64}$/.test(r.sha256)) return 'the card must pin the receipt file’s sha256';
  return '';
}

/** The value at a dotted path ("verdicts.0.measured"); `undefined` when the path is not there. */
export function at(obj, path) {
  let cur = obj;
  for (const k of String(path).split('.')) {
    if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, k)) return undefined;
    cur = cur[k];
  }
  return cur;
}

/** The objects a path passes through, outermost first (the claim a fact belongs to is one of them). */
export function ancestors(obj, path) {
  const out = [];
  let cur = obj;
  for (const k of String(path).split('.')) {
    if (cur === null || typeof cur !== 'object') break;
    out.push(cur);
    cur = cur[k];
  }
  return out;
}

/** The numbers a text states, as written: "1,200" → 1200 (0 decimals), "0.796" → 0.796 (3 decimals), "79.6%" → percent. */
export function numbersIn(text) {
  const out = [];
  for (const m of String(text).matchAll(/\d+(?:,\d{3})*(?:\.\d+)?%?/g)) {
    const s = m[0];
    const pct = s.endsWith('%');
    const body = (pct ? s.slice(0, -1) : s).replace(/,/g, '');
    out.push({ text: s, value: Number(body), places: (body.split('.')[1] || '').length, pct });
  }
  return out;
}

const round = (v, p) => Math.round(v * 10 ** p) / 10 ** p;
/** Does a stated number say this receipt number? Whole numbers exactly; decimals rounded to the places the claim shows. */
export function says(n, v) {
  if (!Number.isFinite(v)) return false;   // false for anything that is not a finite number, strings included
  const x = n.pct ? v * 100 : v;
  if (n.places === 0) return Number.isInteger(x) && x === n.value;
  return round(x, n.places) === n.value;
}

/** Check one card against the receipt text the IO fetched at the pinned commit (and that text's sha256). */
export function checkCard(card, receiptText, receiptSha256) {
  try {
    if (!isObj(card)) return { ok: false, why: ['no card'] };
    const why = [];
    for (const k of ['id', 'name', 'claim', 'url']) if (!isStr(card[k])) why.push('card needs ' + k);
    if (why.length) return { ok: false, why };
    const words = card.name + ' ' + card.claim;
    if (!HOSTS.test(card.url)) why.push('the link must go to the estate’s own pages or repos');
    if (HYPE.test(words)) why.push('hype: say what the receipt shows instead');
    if (PRICE.test(words)) why.push('a price: never on a product surface');
    if (ECONOMY.test(words)) why.push('an economy term: kept off every public surface');
    if (JARGON.test(words)) why.push('estate jargon: plain words only');
    const pin = pinned(card.receipt);
    if (pin) return { ok: false, why: why.concat(pin) };
    if (receiptSha256 !== card.receipt.sha256) return { ok: false, why: why.concat('the receipt at that commit is not the file the card pinned') };
    let receipt;
    try { receipt = JSON.parse(receiptText); } catch { return { ok: false, why: why.concat('the receipt is not JSON') }; }
    const facts = Array.isArray(card.facts) ? card.facts : [];
    if (facts.length === 0) why.push('the card names no receipt fields');
    const known = [];
    for (const f of facts) {
      if (!isObj(f) || !isStr(f.path)) { why.push('a fact needs a path'); continue; }
      const v = at(receipt, f.path);
      if (v === undefined) { why.push(`${f.path} is not in the receipt`); continue; }
      if (v !== f.value) { why.push(`${f.path} is ${JSON.stringify(v)} in the receipt, not ${JSON.stringify(f.value)}`); continue; }
      if (ancestors(receipt, f.path).some((o) => o.held === false || o.pass === false)) { why.push(`${f.path} belongs to a claim that FAILED`); continue; }
      if (typeof v === 'number') known.push(v);
      else if (typeof v === 'string') for (const n of numbersIn(v)) known.push(n.value);
    }
    for (const n of numbersIn(words)) if (!known.some((v) => says(n, v))) why.push(`the number ${n.text} is not a field of the receipt`);
    return why.length ? { ok: false, why } : { ok: true, why: [] };
  } catch { return { ok: false, why: ['the card could not be read'] }; }
}

/** May this item go out? Only on an approval of these exact words (their sha256); a rehearsal approval only in a dry run. */
export function approvalFor(itemId, textSha256, approvals, live) {
  const list = Array.isArray(approvals) ? approvals.filter((a) => isObj(a) && a.itemId === itemId) : [];
  if (list.some((a) => a.withdrawn === true)) return { ok: false, why: 'Simon withdrew the approval' };
  const exact = list.filter((a) => a.textSha256 === textSha256);
  if (exact.length === 0) return { ok: false, why: list.length ? 'the words changed after they were approved' : 'waiting for Simon’s approval' };
  const simon = exact.find((a) => a.by === 'simon' && a.via === 'chat' && isStr(a.quote));
  if (simon) return { ok: true, why: 'approved by Simon in chat', approval: simon };
  if (live === true) return { ok: false, why: 'a rehearsal approval can never post for real' };
  const rehearsal = exact.find((a) => a.by === 'rehearsal');
  return rehearsal ? { ok: true, why: 'a rehearsal approval: dry run only', approval: rehearsal } : { ok: false, why: 'waiting for Simon’s approval' };
}

export default { HYPE, PRICE, ECONOMY, JARGON, HOSTS, pinned, at, ancestors, numbersIn, says, checkCard, approvalFor };
