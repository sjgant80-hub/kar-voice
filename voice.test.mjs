// voice.mjs, the IO organ, on the parts that need no network: approvals are recorded against the exact words, status
// counts only approvals that still stand, and status never prints a key. (The full draft → gate → post path is measured
// end to end by tools/claimgate-measure.mjs against receipts fetched at their pins; CI re-runs it.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { organ, sha256 } from './voice.mjs';

const HERE = new URL('.', import.meta.url);
function sandbox(env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kar-voice-'));
  for (const f of ['feed.jsonl', 'queue.jsonl', 'posted.jsonl']) copyFileSync(new URL(f, HERE), join(dir, f));
  writeFileSync(join(dir, 'approvals.jsonl'), '');
  const logs = [];
  const o = organ({ dir, env, fetch: () => { throw new Error('no network in this test'); }, log: (s) => logs.push(String(s)) });
  return { dir, o, logs, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const lastQueued = () => JSON.parse(readFileSync(new URL('queue.jsonl', HERE), 'utf8').split('\n').filter(Boolean).at(-1));

test('status counts only approvals by Simon that still stand', () => {
  const sb = sandbox();
  try {
    const item = lastQueued();
    assert.equal(sb.o.status().approved, 0);
    assert.equal(sb.o.approve(item.cardId, { quote: 'yes, post it' }).ok, true);
    assert.equal(sb.o.status().approved, 1, 'an approval of the exact words counts');
    const rec = JSON.parse(readFileSync(join(sb.dir, 'approvals.jsonl'), 'utf8').trim());
    assert.equal(rec.textSha256, sha256(item.text), 'the approval is bound to the sha256 of the queued words');
    assert.equal(rec.quote, 'yes, post it');
    sb.o.withdraw(item.cardId);
    assert.equal(sb.o.status().approved, 0, 'a withdrawn approval no longer counts');
  } finally { sb.done(); }
});

test('a rehearsal approval never counts as Simon’s, and an approval without his quoted words is refused', () => {
  const sb = sandbox();
  try {
    const item = lastQueued();
    assert.equal(sb.o.approve(item.cardId, { rehearsal: true }).ok, true);
    assert.equal(sb.o.status().approved, 0, 'a rehearsal approval is not an approval by Simon');
    assert.equal(sb.o.approve(item.cardId, { quote: '   ' }).ok, false, 'no quoted words, no approval');
    assert.equal(sb.o.approve('no-such-item', { quote: 'yes' }).ok, false, 'only a queued item can be approved');
  } finally { sb.done(); }
});

test('status shows whether the keys are present, never the keys, and stays a dry run without the explicit switch', () => {
  const keys = { X_CONSUMER_KEY: 'ck-planted-1', X_CONSUMER_SECRET: 'cs-planted-2', X_ACCESS_TOKEN: 'at-planted-3', X_ACCESS_SECRET: 'as-planted-4' };
  const none = sandbox();
  const some = sandbox(keys);
  const live = sandbox({ ...keys, DRY_RUN: '0' });
  try {
    assert.equal(none.o.status().keys, 'absent');
    assert.match(none.o.status().mode, /^DRY RUN/);
    const s = some.o.status();
    assert.equal(s.keys, 'present');
    assert.match(s.mode, /^DRY RUN/, 'keys alone never turn it live');
    assert.equal(live.o.status().mode, 'LIVE', 'keys and DRY_RUN=0 together do');
    const printed = JSON.stringify([s, live.o.status()]);
    for (const v of Object.values(keys)) assert.equal(printed.includes(v), false, 'a key value is never in the status');
  } finally { none.done(); some.done(); live.done(); }
});
