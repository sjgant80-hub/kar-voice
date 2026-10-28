// voice.mjs · the voice's IO: feed in, gated drafts out, Simon's approvals, a public ledger of everything — and the
// actual X call only when an item passes the claim gate, carries Simon's approval of its exact words, the owner's keys
// exist, AND DRY_RUN is explicitly turned off.
//
//   node voice.mjs draft                          read feed.jsonl; draft + rules gate + claim gate each new card → queue.jsonl
//   node voice.mjs approve <id> --quote "<words>" record Simon's approval of that item's exact text (Kar runs this ONLY on
//                                                 Simon's word in chat, quoting it); --rehearsal records a dry-run-only one
//   node voice.mjs withdraw <id>                  cancel an approval
//   node voice.mjs post [<id>]                    post one approved item (DRY_RUN=1 default → a dry-run record in
//                                                 posted.jsonl; with keys + DRY_RUN=0 → POST /2/tweets)
//   node voice.mjs status                         counts, and whether keys are present (never prints them)
//
// KEY-READY, honestly: without X_CONSUMER_KEY/SECRET + X_ACCESS_TOKEN/SECRET nothing can post and the organ says so.
// Replies beyond being @mentioned need X's prior written approval — that mode does not exist here at all.
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { draftPost, rulesGate, oauth1Header } from './voice-core.mjs';
import { pinned, checkCard, approvalFor } from './claim-gate.mjs';

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const KEYS = ['X_CONSUMER_KEY', 'X_CONSUMER_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'];
const HERE = fileURLToPath(new URL('.', import.meta.url));

/** The organ over one folder. Everything outside the kernels is injected, so a sandbox can stand in for the world. */
export function organ({ dir = HERE, env = process.env, fetch = globalThis.fetch, now = () => new Date(), log = (s) => console.error(s) } = {}) {
  const at = (f) => join(dir, f);
  const lines = (f) => { try { return readFileSync(at(f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const append = (f, obj) => appendFileSync(at(f), JSON.stringify(obj) + '\n');
  const keysPresent = () => KEYS.every((k) => typeof env[k] === 'string' && env[k].length > 0);
  const live = () => env.DRY_RUN === '0' && keysPresent();   // posting is OPT-IN; everything else is a rehearsal

  /** The card's receipt, fetched from GitHub at its pinned commit, with the sha256 of the bytes that came back. */
  async function receiptOf(card) {
    if (!card || pinned(card.receipt)) return { text: '', sha: '' };
    const r = card.receipt;
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${r.repo}/${r.commit}/${r.path}`);
      if (!res.ok) return { text: '', sha: '' };
      const bytes = Buffer.from(await res.arrayBuffer());
      return { text: bytes.toString('utf8'), sha: sha256(bytes) };
    } catch { return { text: '', sha: '' }; }
  }
  async function gate(card) { const { text, sha } = await receiptOf(card); return checkCard(card, text, sha); }

  async function draft() {
    const feed = lines('feed.jsonl'), queued = lines('queue.jsonl'), posted = lines('posted.jsonl');
    const have = new Set(queued.map((q) => q.cardId).concat(posted.map((p) => p.cardId)));
    const history = posted.map((p) => p.text).concat(queued.map((q) => q.text));
    const out = { queued: [], refused: [] };
    for (const card of feed) {
      if (!card.id || have.has(card.id)) continue;
      const d = draftPost(card);
      if (!d.ok) { out.refused.push({ cardId: card.id, why: [d.error] }); continue; }
      const g = rulesGate(d.text, { history });
      if (!g.ok) { out.refused.push({ cardId: card.id, why: [g.why] }); continue; }
      const c = await gate(card);
      if (!c.ok) { out.refused.push({ cardId: card.id, why: c.why }); continue; }
      append('queue.jsonl', { cardId: card.id, text: d.text, length: g.length, textSha256: sha256(d.text), draftedAt: now().toISOString() });
      history.push(d.text); have.add(card.id); out.queued.push(card.id);
    }
    for (const r of out.refused) log(`✗ ${r.cardId}: ${r.why.join('; ')}`);
    log(`${out.queued.length} new draft(s) queued, ${out.refused.length} refused · ${feed.length} card(s) in the feed`);
    return out;
  }

  function approve(itemId, { quote = '', rehearsal = false } = {}) {
    const item = lines('queue.jsonl').find((q) => q.cardId === itemId);
    if (!item) { log(`✗ no queued item ${itemId}`); return { ok: false }; }
    if (!rehearsal && !String(quote).trim()) { log('✗ an approval by Simon quotes his words in chat (--quote)'); return { ok: false }; }
    const rec = { itemId, textSha256: sha256(item.text), by: rehearsal ? 'rehearsal' : 'simon', via: rehearsal ? 'rehearsal' : 'chat', quote: rehearsal ? '' : String(quote), at: now().toISOString() };
    append('approvals.jsonl', rec);
    log(`✓ ${rec.by} approval recorded for ${itemId}`);
    return { ok: true, approval: rec };
  }

  function withdraw(itemId) {
    append('approvals.jsonl', { itemId, withdrawn: true, at: now().toISOString() });
    log(`✓ approval withdrawn for ${itemId}`);
    return { ok: true };
  }

  /** Post one item. Returns { posted, dryRun, why } and touches X only when every rule allows it. */
  async function post(itemId) {
    const queued = lines('queue.jsonl'), posted = lines('posted.jsonl');
    const livePosted = posted.filter((p) => !p.dryRun);
    const item = itemId ? queued.find((q) => q.cardId === itemId) : queued.find((q) => !livePosted.some((p) => p.cardId === q.cardId));
    if (!item) { log('nothing to post'); return { posted: false, why: 'nothing to post' }; }
    if (livePosted.some((p) => p.cardId === item.cardId)) { log(`✗ ${item.cardId} is already posted`); return { posted: false, why: 'already posted' }; }
    const card = lines('feed.jsonl').find((c) => c.id === item.cardId);
    const c = await gate(card);
    if (!c.ok) { log(`✗ ${item.cardId} refused by the claim gate: ${c.why.join('; ')}`); return { posted: false, why: c.why.join('; ') }; }
    const d = draftPost(card);
    if (!d.ok || d.text !== item.text) { log(`✗ ${item.cardId}: the queued words are not the gated card's draft`); return { posted: false, why: 'the queued words are not the gated card’s draft' }; }
    const today = now().toISOString().slice(0, 10);
    const g = rulesGate(item.text, { history: livePosted.map((p) => p.text), todayCount: livePosted.filter((p) => String(p.at || '').startsWith(today)).length });
    if (!g.ok) { log(`✗ refused at post time: ${g.why}`); return { posted: false, why: g.why }; }
    const a = approvalFor(item.cardId, sha256(item.text), lines('approvals.jsonl'), live());
    if (!a.ok) { log(`✗ ${item.cardId}: ${a.why}`); return { posted: false, why: a.why }; }

    if (!live()) {
      append('posted.jsonl', { cardId: item.cardId, text: item.text, dryRun: true, approvedBy: a.approval.by, at: now().toISOString() });
      log(`DRY RUN — would post (${g.length} chars, ${a.why}):\n---\n${item.text}\n---`);
      if (!keysPresent()) log('keys: absent — this organ cannot post until the owner authorises it');
      return { posted: false, dryRun: true, why: a.why };
    }
    const url = 'https://api.x.com/2/tweets';
    const { header } = oauth1Header({ method: 'POST', url, consumerKey: env.X_CONSUMER_KEY, consumerSecret: env.X_CONSUMER_SECRET, token: env.X_ACCESS_TOKEN, tokenSecret: env.X_ACCESS_SECRET });
    const r = await fetch(url, { method: 'POST', headers: { Authorization: header, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: item.text }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { log(`✗ X refused (${r.status})`); return { posted: false, why: `X refused (${r.status})` }; }
    const tweetId = j.data && j.data.id;
    append('posted.jsonl', { cardId: item.cardId, text: item.text, tweetId, dryRun: false, approvedBy: 'simon', at: now().toISOString() });
    log(`✓ posted ${tweetId}`);
    return { posted: true, tweetId, why: a.why };
  }

  function status() {
    const queued = lines('queue.jsonl'), posted = lines('posted.jsonl'), approvals = lines('approvals.jsonl');
    const today = now().toISOString().slice(0, 10);
    return {
      queued: queued.length,
      approved: new Set(approvals.filter((x) => x.by === 'simon').map((x) => x.itemId)).size,
      posted: posted.filter((p) => !p.dryRun).length,
      rehearsed: posted.filter((p) => p.dryRun).length,
      postedToday: posted.filter((p) => !p.dryRun && String(p.at || '').startsWith(today)).length,
      keys: keysPresent() ? 'present' : 'absent',
      mode: live() ? 'LIVE' : 'DRY RUN (nothing leaves this machine)',
    };
  }

  return { draft, approve, withdraw, post, status, gate };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, id, ...rest] = process.argv.slice(2);
  const o = organ();
  const flag = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  if (cmd === 'draft') await o.draft();
  else if (cmd === 'approve') { if (!o.approve(id, { quote: flag('--quote') || '', rehearsal: rest.includes('--rehearsal') }).ok) process.exit(1); }
  else if (cmd === 'withdraw') o.withdraw(id);
  else if (cmd === 'post') await o.post(id);
  else if (cmd === 'status') console.log(JSON.stringify(o.status(), null, 2));
  else { console.error('kar-voice — draft | approve <id> --quote "…" | withdraw <id> | post [<id>] | status   (DRY_RUN=1 by default; the owner authorises the keys)'); process.exit(2); }
}
