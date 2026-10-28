// claimgate-measure.mjs — the claim gate's six sealed claims (data/claimgate-prereg.json, sealed 06b8683), measured.
//
//   node tools/claimgate-measure.mjs --check    the seal is unchanged since the sealing commit
//   node tools/claimgate-measure.mjs --run      measure → data/claimgate-run.json (receipts fetched from GitHub at their pins)
//   node tools/claimgate-measure.mjs --verify   measure again and require the committed receipt, byte for byte (CI)
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { organ, sha256 } from '../voice.mjs';

const SEAL = '06b8683';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const readJSON = (p) => JSON.parse(readFileSync(file(p), 'utf8'));
const PREREG = 'data/claimgate-prereg.json', RUN = 'data/claimgate-run.json';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

// GitHub fetches are cached for the run, so every claim judges the same bytes.
const cache = new Map();
async function realFetch(url, init) {
  if (init && init.method && init.method !== 'GET') throw new Error('the measurement never sends anything');
  if (!cache.has(url)) { const r = await fetch(url); cache.set(url, { ok: r.ok, status: r.status, bytes: Buffer.from(await r.arrayBuffer()) }); }
  const c = cache.get(url);
  return { ok: c.ok, status: c.status, arrayBuffer: async () => c.bytes, json: async () => JSON.parse(c.bytes.toString('utf8')) };
}

/** The forgery rule, word for word from the seal. */
export function forge(card) {
  const out = {};
  const m = card.claim.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
  const orig = m[0];
  const last = Number(orig.at(-1));
  const moved = orig.slice(0, -1) + String((last + 1) % 10);
  const claimMoved = card.claim.slice(0, m.index) + moved + card.claim.slice(m.index + orig.length);
  const clone = (c) => JSON.parse(JSON.stringify(c));
  out.F1 = { ...clone(card), claim: claimMoved };
  const origNum = Number(orig.replace(/,/g, '')), movedNum = Number(moved.replace(/,/g, ''));
  out.F2 = { ...clone(card), claim: claimMoved, facts: card.facts.map((f) => (typeof f.value === 'number' && f.value === origNum ? { ...f, value: movedNum } : { ...f })) };
  const hex = '0123456789abcdef';
  const s = card.receipt.sha256;
  out.F3 = { ...clone(card), receipt: { ...card.receipt, sha256: hex[(hex.indexOf(s[0]) + 1) % 16] + s.slice(1) } };
  out.F4 = { ...clone(card), receipt: { ...card.receipt, commit: 'main' } };
  out.F5 = { ...clone(card), claim: 'the best result yet: ' + card.claim };
  out.F6 = { ...clone(card), claim: card.claim + ' — from £49 a month' };
  out.F7 = { ...clone(card), claim: card.claim + ' — and earn KCC on every run' };
  return out;
}

const KEYS = { X_CONSUMER_KEY: 'ck-' + 'q7Zf3TnX1pLw', X_CONSUMER_SECRET: 'cs-' + 'Vb9mKe2RtYu4', X_ACCESS_TOKEN: 'at-' + 'Hs6dPq8WnJc0', X_ACCESS_SECRET: 'as-' + 'Lg5xNr1ZkFm7' };

/** One sandboxed organ: its own folder, X replaced by a recorder, every log line kept. */
function sandbox(feed, extraEnv) {
  const dir = mkdtempSync(join(tmpdir(), 'kar-voice-sb-'));
  writeFileSync(join(dir, 'feed.jsonl'), feed.map((c) => JSON.stringify(c)).join('\n') + '\n');
  const calls = [], logs = [];
  const fetchStub = async (url, init) => {
    if (String(url).startsWith('https://api.x.com/')) { calls.push(JSON.parse(init.body)); return { ok: true, status: 201, json: async () => ({ data: { id: 'recorded-' + calls.length } }) }; }
    return realFetch(url, init);
  };
  let tick = 0;
  const o = organ({ dir, env: { ...KEYS, ...(extraEnv || {}) }, fetch: fetchStub, now: () => new Date(Date.UTC(2026, 9, 28, 12, 0, tick++)), log: (s) => logs.push(String(s)) });
  const files = () => readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  const done = () => rmSync(dir, { recursive: true, force: true });
  return { o, dir, calls, logs, files, done };
}

async function measure() {
  const P = readJSON(PREREG);
  const feedNow = readFileSync(file('feed.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const queueNow = readFileSync(file('queue.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const oldCards = feedNow.slice(0, 4), oldQueue = queueNow.slice(0, 4);
  const probe = organ({ dir: tmpdir(), env: {}, fetch: realFetch, log: () => {} });
  const leaks = [];

  // V1 — the feed of 2026-10-08: no committed receipts. Even with an approval from Simon, none of its drafts can go.
  const v1Gate = [];
  for (const c of oldCards) { const g = await probe.gate(c); v1Gate.push({ id: c.id, ok: g.ok, why: g.why }); }
  const sb1 = sandbox(oldCards, {});
  writeFileSync(join(sb1.dir, 'queue.jsonl'), oldQueue.map((q) => JSON.stringify(q)).join('\n') + '\n');
  const v1Post = [];
  for (const q of oldQueue) { sb1.o.approve(q.cardId, { quote: 'measurement: an approval as if Simon gave it' }); v1Post.push({ id: q.cardId, ...(await sb1.o.post(q.cardId)) }); }
  const v1Records = sb1.files().split('\n').filter((l) => l.includes('"dryRun"')).length;
  leaks.push(sb1.files() + sb1.logs.join('\n')); sb1.done();
  const V1 = { pass: v1Gate.every((g) => !g.ok) && v1Post.every((p) => !p.posted && !p.dryRun) && v1Records === 0 && sb1.calls.length === 0,
    measured: `${v1Gate.filter((g) => !g.ok).length} of ${oldCards.length} refused; ${v1Post.filter((p) => p.posted || p.dryRun).length} of ${oldQueue.length} queued drafts posted or rehearsed`, gate: v1Gate, post: v1Post.map((p) => ({ id: p.id, why: p.why })) };

  // V2 — the genuine cards, fetched at their pins.
  const v2 = [];
  for (const c of P.genuine) { const g = await probe.gate(c); v2.push({ id: c.id, ok: g.ok, why: g.why }); }
  const V2 = { pass: v2.every((g) => g.ok), measured: `${v2.filter((g) => g.ok).length} of ${v2.length} pass`, cards: v2 };

  // V3 — the forgeries.
  const v3 = [];
  for (const c of P.genuine) for (const [k, f] of Object.entries(forge(c))) {
    const g = await probe.gate(f);
    const marker = P.forgeryRule[k].marker;
    v3.push({ card: c.id, forgery: k, refused: !g.ok, forItsReason: g.why.some((w) => w.includes(marker)), why: g.why });
  }
  const good = v3.filter((x) => x.refused && x.forItsReason).length;
  const V3 = { pass: good === v3.length && v3.length === 35, measured: `${v3.filter((x) => x.refused).length} of ${v3.length} refused, ${good} for their own reason`, forgeries: v3 };

  // V4 — a fact from a claim that FAILED.
  const g4 = await probe.gate(P.failedClaimCard);
  const V4 = { pass: !g4.ok && g4.why.some((w) => w.includes('FAILED')), measured: g4.ok ? 'passed' : 'refused: ' + g4.why.join('; ') };

  // V5 — approval of the exact words, six scenarios on a genuine card.
  const card = { ...P.genuine[0], anchor: P.genuine[0].receipt.sha256 };
  const LIVE = { DRY_RUN: '0' };
  const scen = [];
  const run = async (name, env, setup) => {
    const sb = sandbox([card], env);
    await sb.o.draft();
    const q = JSON.parse(readFileSync(join(sb.dir, 'queue.jsonl'), 'utf8').trim());
    await setup(sb, q);
    const r = await sb.o.post(card.id);
    const dry = readFileSync(join(sb.dir, 'posted.jsonl'), { encoding: 'utf8', flag: 'a+' }).split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((p) => p.dryRun);
    scen.push({ name, calls: sb.calls.length, sentText: sb.calls[0] ? sb.calls[0].text : null, approvedText: q.text, dryRecords: dry.length, dryText: dry[0] ? dry[0].text : null, why: r.why });
    leaks.push(sb.files() + sb.logs.join('\n')); sb.done();
  };
  await run('no approval, live', LIVE, async () => {});
  await run('approved, then edited by one character, live', LIVE, async (sb, q) => {
    sb.o.approve(card.id, { quote: 'measurement: yes, post it' });
    writeFileSync(join(sb.dir, 'queue.jsonl'), JSON.stringify({ ...q, text: q.text + '.' }) + '\n');
  });
  await run('rehearsal approval, live', LIVE, async (sb) => { sb.o.approve(card.id, { rehearsal: true }); });
  await run('approved then withdrawn, live', LIVE, async (sb) => { sb.o.approve(card.id, { quote: 'measurement: yes' }); sb.o.withdraw(card.id); });
  await run('Simon approved, dry run', {}, async (sb) => { sb.o.approve(card.id, { quote: 'measurement: yes, post it' }); });
  await run('Simon approved, live', LIVE, async (sb) => { sb.o.approve(card.id, { quote: 'measurement: yes, post it' }); });
  const calls = scen.map((s) => s.calls);
  const dryOk = scen[4].dryRecords === 1 && scen[4].dryText === scen[4].approvedText;
  const liveOk = scen[5].sentText === scen[5].approvedText;
  const V5 = { pass: calls.join(',') === '0,0,0,0,0,1' && dryOk && liveOk, measured: `X calls ${calls.join(',')}; dry-run record of the approved text: ${dryOk ? 'yes' : 'no'}; the live call carried the approved text: ${liveOk ? 'yes' : 'no'}`, scenarios: scen };

  // V6 — the keys never surface in anything the organ wrote or printed.
  const all = leaks.join('\n');
  const hits = Object.values(KEYS).reduce((n, k) => n + all.split(k).length - 1, 0);
  const V6 = { pass: hits === 0, measured: `${hits} occurrences of the four fake key values in every file written and every line printed` };

  const claims = { V1, V2, V3, V4, V5, V6 };
  return { kind: 'kar-voice-claimgate-run', seal: SEAL, claims, held: Object.values(claims).filter((c) => c.pass).length, of: 6 };
}

const cmd = process.argv[2];
if (cmd === '--check') {
  const sealed = git('show', `${SEAL}:${PREREG}`);
  if (sealed.replace(/\r\n/g, '\n').trim() !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the claim-gate seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ claim-gate seal unchanged since ' + SEAL);
} else if (cmd === '--run' || cmd === '--verify') {
  const result = await measure();
  const text = JSON.stringify(result, null, 1) + '\n';
  if (cmd === '--run') {
    writeFileSync(file(RUN), text);
    console.error(`✓ ${result.held} of ${result.of} held`);
    for (const [k, c] of Object.entries(result.claims)) console.error(`  ${k} ${c.pass ? 'HELD' : 'FAILED'} · ${c.measured}`);
  } else {
    if (readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n') !== text) { console.error('✗ the claim gate does not re-measure to the committed receipt'); process.exit(1); }
    console.error(`✓ claim gate re-measured: ${result.held} of ${result.of} held, identical to the committed receipt`);
  }
} else { console.error('claimgate-measure — --check | --run | --verify'); process.exit(2); }
