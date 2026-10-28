// claim-gate.test.mjs — the claim gate and the approval binding, edge by edge (each case aimed at a mutant).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinned, at, ancestors, numbersIn, says, checkCard, approvalFor } from './claim-gate.mjs';

const RECEIPT = { held: 6, failed: 1, summary: { killed: 15, mutants: 17, auc: 0.795946, ratio: 0.882 }, verdicts: [{ held: true, measured: '30 of 30 jobs routed' }, { held: false, measured: '2 turns' }, { pass: false, n: 9 }], name: 'qwen2.5:7b' };
const TEXT = JSON.stringify(RECEIPT);
const SHA = 'a'.repeat(64);
const card = (over) => ({
  id: 'c1', name: 'witness', claim: 'killed 15 of 17', url: 'https://sjgant80-hub.github.io/witness/',
  receipt: { repo: 'sjgant80-hub/witness', commit: 'b'.repeat(40), path: 'landing/x.json', sha256: SHA },
  facts: [{ path: 'summary.killed', value: 15 }, { path: 'summary.mutants', value: 17 }], ...(over || {}),
});
const check = (over, text = TEXT, sha = SHA) => checkCard(card(over), text, sha);

test('pinned: one committed JSON file in a public estate repo', () => {
  assert.equal(pinned(card().receipt), '');
  assert.equal(pinned(null), 'no receipt');
  assert.equal(pinned([]), 'no receipt');
  assert.match(pinned({ ...card().receipt, repo: 'someone/witness' }), /public estate repo/);
  assert.match(pinned({ ...card().receipt, repo: 7 }), /public estate repo/);
  assert.match(pinned({ ...card().receipt, commit: 'main' }), /full commit/);
  assert.match(pinned({ ...card().receipt, commit: 'B'.repeat(40) }), /full commit/);
  assert.match(pinned({ ...card().receipt, path: '../x.json' }), /one JSON file/);
  assert.match(pinned({ ...card().receipt, path: '/x.json' }), /one JSON file/);
  assert.match(pinned({ ...card().receipt, path: 'x.md' }), /one JSON file/);
  assert.match(pinned({ ...card().receipt, sha256: 'a'.repeat(63) }), /sha256/);
  assert.match(pinned({ ...card().receipt, sha256: '  ' }), /sha256/);
});

test('at and ancestors walk dotted paths', () => {
  assert.equal(at(RECEIPT, 'summary.killed'), 15);
  assert.equal(at(RECEIPT, 'verdicts.0.measured'), '30 of 30 jobs routed');
  assert.equal(at(RECEIPT, 'summary.nope'), undefined);
  assert.equal(at(RECEIPT, 'held.x'), undefined);
  assert.equal(at({ a: null }, 'a.b'), undefined);
  assert.equal(at(RECEIPT, 'toString'), undefined);
  assert.deepEqual(ancestors(RECEIPT, 'verdicts.1.held').map((o) => Array.isArray(o) ? 'array' : Object.keys(o).length), [5, 'array', 2]);
  assert.deepEqual(ancestors({ a: null }, 'a.b.c').length, 1);
});

test('numbersIn reads numbers as written', () => {
  assert.deepEqual(numbersIn('1,200 rows at 0.796 and 88.2%'), [
    { text: '1,200', value: 1200, places: 0, pct: false },
    { text: '0.796', value: 0.796, places: 3, pct: false },
    { text: '88.2%', value: 88.2, places: 1, pct: true },
  ]);
  assert.deepEqual(numbersIn('no numbers'), []);
});

test('says: whole numbers exactly, decimals to the places shown, percentages as the field x100', () => {
  const n = (s) => numbersIn(s)[0];
  assert.equal(says(n('15'), 15), true);
  assert.equal(says(n('15'), 15.4), false);
  assert.equal(says(n('1'), 0.796), false);
  assert.equal(says(n('0.796'), 0.795946), true);
  assert.equal(says(n('0.797'), 0.795946), false);
  assert.equal(says(n('0.80'), 0.795946), true);
  assert.equal(says(n('88.2%'), 0.882), true);
  assert.equal(says(n('88%'), 0.882), false);
  assert.equal(says(n('88.2'), 0.882), false);
  assert.equal(says(n('15'), '15'), false);
  assert.equal(says(n('15'), Infinity), false);
});

test('a genuine card passes', () => {
  assert.deepEqual(check(), { ok: true, why: [] });
  assert.deepEqual(check({ claim: 'routed 30 of 30 with a 7B', facts: [{ path: 'verdicts.0.measured', value: '30 of 30 jobs routed' }, { path: 'name', value: 'qwen2.5:7b' }] }), { ok: true, why: [] });
  assert.deepEqual(check({ claim: 'AUC 0.796 and 88.2% of mutants', facts: [{ path: 'summary.auc', value: 0.795946 }, { path: 'summary.ratio', value: 0.882 }] }), { ok: true, why: [] });
});

test('card shape and link', () => {
  assert.deepEqual(checkCard(null, TEXT, SHA), { ok: false, why: ['no card'] });
  assert.deepEqual(checkCard([], TEXT, SHA), { ok: false, why: ['no card'] });
  assert.deepEqual(check({ id: '', url: 5 }).why, ['card needs id', 'card needs url']);
  assert.deepEqual(check({ name: ' ' }).why, ['card needs name']);
  assert.deepEqual(check({ claim: undefined }).why, ['card needs claim']);
  assert.deepEqual(check({ url: 'https://example.com/x' }).why, ['the link must go to the estate’s own pages or repos']);
  assert.deepEqual(check({ url: 'https://github.com/sjgant80-hub/witness' }), { ok: true, why: [] });
});

test('words: hype, price, economy, jargon — each named', () => {
  assert.deepEqual(check({ claim: 'the best: killed 15 of 17' }).why, ['hype: say what the receipt shows instead']);
  assert.deepEqual(check({ claim: 'killed 15 of 17 — from £49 a month' }).why, ['a price: never on a product surface', 'the number 49 is not a field of the receipt']);
  assert.deepEqual(check({ claim: 'killed 15 of 17, see pricing' }).why, ['a price: never on a product surface']);
  assert.deepEqual(check({ claim: 'killed 15 of 17 — earn KCC' }).why, ['an economy term: kept off every public surface']);
  assert.deepEqual(check({ claim: 'killed 15 of 17 at κ' }).why, ['estate jargon: plain words only']);
  assert.deepEqual(check({ name: 'the only witness' }).why, ['hype: say what the receipt shows instead']);
});

test('the receipt must be the pinned, committed JSON', () => {
  assert.deepEqual(check({ receipt: { ...card().receipt, commit: 'main' } }).why, ['the receipt must be pinned to a full commit, not a branch']);
  assert.deepEqual(check({ claim: 'the best', receipt: undefined }).why, ['hype: say what the receipt shows instead', 'no receipt']);
  assert.deepEqual(check({}, TEXT, 'c'.repeat(64)).why, ['the receipt at that commit is not the file the card pinned']);
  assert.deepEqual(check({}, 'not json', SHA).why, ['the receipt is not JSON']);
});

test('facts: present, equal, from a claim that held, and naming every number', () => {
  assert.deepEqual(check({ facts: [] }).why, ['the card names no receipt fields', 'the number 15 is not a field of the receipt', 'the number 17 is not a field of the receipt']);
  assert.deepEqual(check({ facts: 'x' }).why.slice(0, 1), ['the card names no receipt fields']);
  assert.deepEqual(check({ facts: [{ path: 'summary.killed', value: 15 }, { value: 17 }] }).why, ['a fact needs a path', 'the number 17 is not a field of the receipt']);
  assert.deepEqual(check({ facts: [{ path: 'summary.killed', value: 15 }, { path: 'summary.gone', value: 17 }] }).why, ['summary.gone is not in the receipt', 'the number 17 is not a field of the receipt']);
  assert.deepEqual(check({ claim: 'killed 16 of 17', facts: [{ path: 'summary.killed', value: 16 }, { path: 'summary.mutants', value: 17 }] }).why, ['summary.killed is 15 in the receipt, not 16', 'the number 16 is not a field of the receipt']);
  assert.deepEqual(check({ claim: 'killed 16 of 17' }).why, ['the number 16 is not a field of the receipt']);
  assert.deepEqual(check({ claim: 'it took 2 turns', facts: [{ path: 'verdicts.1.measured', value: '2 turns' }] }).why, ['verdicts.1.measured belongs to a claim that FAILED', 'the number 2 is not a field of the receipt']);
  assert.deepEqual(check({ claim: 'n is 9', facts: [{ path: 'verdicts.2.n', value: 9 }] }).why, ['verdicts.2.n belongs to a claim that FAILED', 'the number 9 is not a field of the receipt']);
  assert.deepEqual(check({ claim: 'held', facts: [{ path: 'verdicts.0.held', value: true }] }), { ok: true, why: [] });
  assert.deepEqual(check({ claim: 'it held 6', facts: [{ path: 'held', value: 6 }] }), { ok: true, why: [] });
  assert.deepEqual(check({ claim: 'one failed', facts: [{ path: 'failed', value: 1 }] }), { ok: true, why: [] });
});

test('a card the gate cannot read is refused, never thrown', () => {
  const evil = card(); Object.defineProperty(evil, 'facts', { get() { throw new Error('boom'); } });
  assert.deepEqual(checkCard(evil, TEXT, SHA), { ok: false, why: ['the card could not be read'] });
});

const A = (over) => ({ itemId: 'p1', textSha256: 'h1', by: 'simon', via: 'chat', quote: 'yes post it', at: 't', ...(over || {}) });
test('approval binds the exact words, and only Simon’s can go live', () => {
  assert.deepEqual(approvalFor('p1', 'h1', [], false), { ok: false, why: 'waiting for Simon’s approval' });
  assert.deepEqual(approvalFor('p1', 'h1', 'x', true), { ok: false, why: 'waiting for Simon’s approval' });
  assert.deepEqual(approvalFor('p1', 'h1', [A({ itemId: 'p2' })], false), { ok: false, why: 'waiting for Simon’s approval' });
  assert.deepEqual(approvalFor('p1', 'h2', [A()], false), { ok: false, why: 'the words changed after they were approved' });
  assert.deepEqual(approvalFor('p1', 'h1', [null, A()], true), { ok: true, why: 'approved by Simon in chat', approval: A() });
  assert.deepEqual(approvalFor('p1', 'h1', [A(), { itemId: 'p1', withdrawn: true }], true), { ok: false, why: 'Simon withdrew the approval' });
  assert.deepEqual(approvalFor('p1', 'h1', [A({ via: 'page' })], true), { ok: false, why: 'a rehearsal approval can never post for real' });
  assert.deepEqual(approvalFor('p1', 'h1', [A({ quote: '' })], false), { ok: false, why: 'waiting for Simon’s approval' });
  const R = A({ by: 'rehearsal', quote: '' });
  assert.deepEqual(approvalFor('p1', 'h1', [R], true), { ok: false, why: 'a rehearsal approval can never post for real' });
  assert.deepEqual(approvalFor('p1', 'h1', [R], false), { ok: true, why: 'a rehearsal approval: dry run only', approval: R });
  assert.deepEqual(approvalFor('p1', 'h1', [R], 'yes'), { ok: true, why: 'a rehearsal approval: dry run only', approval: R });
});
