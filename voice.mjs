// voice.mjs · the voice's IO: feed in, gated drafts out, a public ledger of everything — and the
// actual X call only when the owner's keys exist AND DRY_RUN is explicitly turned off.
//
//   node voice.mjs draft              read feed.jsonl, draft + gate each card, append to queue.jsonl
//   node voice.mjs post               post the oldest queued item (DRY_RUN=1 default -> posted.jsonl
//                                     with {dryRun:true}; with keys + DRY_RUN=0 -> POST /2/tweets)
//   node voice.mjs status             counts + whether keys are present (never prints them)
//
// KEY-READY, honestly: without X_CONSUMER_KEY/SECRET + X_ACCESS_TOKEN/SECRET nothing can post and
// the organ says so. Replies beyond being @mentioned need X's prior written approval — that mode
// does not exist here at all; pickReply only ever answers a direct mention, once.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { draftPost, rulesGate } from './voice-core.mjs';
import { oauth1Header } from './voice-core.mjs';

const here = (f) => fileURLToPath(new URL(`./${f}`, import.meta.url));
const lines = (f) => { try { return readFileSync(here(f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const append = (f, obj) => appendFileSync(here(f), JSON.stringify(obj) + '\n');

const env = process.env;
const keysPresent = () => ['X_CONSUMER_KEY', 'X_CONSUMER_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'].every((k) => typeof env[k] === 'string' && env[k].length > 0);
const dryRun = () => env.DRY_RUN !== '0';   // posting is OPT-IN; everything else is a rehearsal

export function statusReport() {
  const queued = lines('queue.jsonl'), posted = lines('posted.jsonl');
  const today = new Date().toISOString().slice(0, 10);
  return {
    queued: queued.length,
    posted: posted.filter((p) => !p.dryRun).length,
    rehearsed: posted.filter((p) => p.dryRun).length,
    postedToday: posted.filter((p) => !p.dryRun && String(p.at || '').startsWith(today)).length,
    keys: keysPresent() ? 'present' : 'absent',
    mode: dryRun() ? 'DRY RUN (nothing leaves this machine)' : 'LIVE',
  };
}

function cmdDraft() {
  const feed = lines('feed.jsonl');
  const queued = lines('queue.jsonl');
  const posted = lines('posted.jsonl');
  const have = new Set(queued.map((q) => q.cardId).concat(posted.map((p) => p.cardId)));
  const history = posted.map((p) => p.text).concat(queued.map((q) => q.text));
  let added = 0;
  for (const card of feed) {
    if (!card.id || have.has(card.id)) continue;
    const d = draftPost(card);
    if (!d.ok) { console.error(`✗ ${card.id}: ${d.error}`); continue; }
    const g = rulesGate(d.text, { history });
    if (!g.ok) { console.error(`✗ ${card.id}: ${g.why}`); continue; }
    append('queue.jsonl', { cardId: card.id, text: d.text, length: g.length, draftedAt: new Date().toISOString() });
    history.push(d.text); have.add(card.id); added++;
    console.error(`✓ queued ${card.id} (${g.length} chars)`);
  }
  console.error(`${added} new draft(s) queued · ${feed.length} card(s) in the feed`);
}

async function cmdPost() {
  const queued = lines('queue.jsonl');
  const posted = lines('posted.jsonl');
  const next = queued.find((q) => !posted.some((p) => p.cardId === q.cardId));
  if (!next) { console.error('queue is empty — nothing to post'); return; }
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = posted.filter((p) => !p.dryRun && String(p.at || '').startsWith(today)).length;
  const g = rulesGate(next.text, { history: posted.map((p) => p.text), todayCount });
  if (!g.ok) { console.error(`✗ refused at post time: ${g.why}`); return; }

  if (dryRun() || !keysPresent()) {
    append('posted.jsonl', { cardId: next.cardId, text: next.text, dryRun: true, at: new Date().toISOString() });
    console.error(`DRY RUN — would post (${g.length} chars):\n---\n${next.text}\n---`);
    if (!keysPresent()) console.error('keys: absent — this organ cannot post until the owner provides them');
    return;
  }
  const url = 'https://api.x.com/2/tweets';
  const { header } = oauth1Header({
    method: 'POST', url,
    consumerKey: env.X_CONSUMER_KEY, consumerSecret: env.X_CONSUMER_SECRET,
    token: env.X_ACCESS_TOKEN, tokenSecret: env.X_ACCESS_SECRET,
  });
  const r = await fetch(url, { method: 'POST', headers: { Authorization: header, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: next.text }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error(`✗ X refused (${r.status}): ${JSON.stringify(j).slice(0, 200)}`); process.exit(1); }
  append('posted.jsonl', { cardId: next.cardId, text: next.text, tweetId: j.data && j.data.id, dryRun: false, at: new Date().toISOString() });
  console.error(`✓ posted ${j.data && j.data.id}`);
}

const cmd = process.argv[2];
if (cmd === 'draft') cmdDraft();
else if (cmd === 'post') await cmdPost();
else if (cmd === 'status') console.log(JSON.stringify(statusReport(), null, 2));
else { console.error('kar-voice — draft | post | status   (DRY_RUN=1 by default; the owner’s X keys are required to go live)'); process.exit(2); }
