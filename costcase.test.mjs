// the voice's cost case: every figure from the sourced basis, the cap from the voice itself, like for like, never a throw
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DEFAULTS, BASIS_KEYS, MAX_MINUTES, MAX_HOURS_ON, sourcesOf, over, voiceCase } from './costcase.mjs';
import { RULES } from './voice-core.mjs';

const BASIS_TEXT = readFileSync(new URL('./vendor/sovereign-enterprise/data/basis.json', import.meta.url));
const BASIS = JSON.parse(BASIS_TEXT.toString('utf8'));
const SOURCES = JSON.parse(readFileSync(new URL('./vendor/SOURCES.json', import.meta.url), 'utf8'));
const CAP = RULES.maxPerDay;
const base = (patch) => ({ ...BASIS, ...patch });
const r2 = (x) => Math.round(x * 100) / 100;

test('the vendored basis is the pinned file, byte for byte', () => {
  const pin = SOURCES.files.find((f) => f.path === 'vendor/sovereign-enterprise/data/basis.json');
  assert.ok(pin, 'vendor/SOURCES.json pins the basis');
  assert.equal(createHash('sha256').update(BASIS_TEXT).digest('hex'), pin.sha256);
  assert.match(pin.commit, /^[0-9a-f]{40}$/);
});

test('voiceCase · the default case, every line from the sourced basis', () => {
  const r = voiceCase(BASIS, {}, CAP);
  assert.equal(r.ok, true);
  assert.deepEqual(r.inputs, { ...DEFAULTS, hoursOn: BASIS.hoursPerYear.value });
  assert.deepEqual(r.hours, { today: 260, approving: 43.33, handedBack: 216.67 });
  assert.deepEqual(r.lines, { staff: 5114.2, approve: 852.37, takenOff: 4261.83, seats: 554.4, api: 2.35, power: 32.21 });
  assert.deepEqual(r.perYear, { today: 5114.2, rentSeats: 5668.6, cloudApi: 854.72, own: 884.58 });
  assert.deepEqual(r.over, { today: 15823.14, rentSeats: 17538.43, cloudApi: 2644.47, own: 2736.86 });
  assert.deepEqual([r.savingPerYear, r.savingOver, r.versusSeatsOver, r.versusCloudOver], [4229.62, 13086.28, 14801.57, -92.39]);
});

test('voiceCase · like for like: seats take nothing off; the cloud model and the owned voice take the same off; approval stays on both', () => {
  const r = voiceCase(BASIS, { postsPerWeek: 20, minutesPerPost: 60, approveMinutes: 10, seats: 3, tokensIn: 2000, tokensOut: 500 }, CAP);
  assert.equal(r.perYear.rentSeats, r2(r.lines.staff + r.lines.seats));
  assert.equal(r.perYear.cloudApi, r2(r.lines.approve + r.lines.api));
  assert.equal(r.perYear.own, r2(r.lines.approve + r.lines.power));
  assert.equal(r.lines.takenOff, r2(r.lines.staff - r.lines.approve));
  assert.equal(r.lines.seats, r2(3 * 12 * BASIS['seat.copilot'].value));
  assert.equal(r.lines.staff, r2(20 * 52 * 60 / 60 * BASIS.wageMedianHourly.value));
  assert.equal(r.lines.approve, r2(20 * 52 * 10 / 60 * BASIS.wageMedianHourly.value));
  assert.equal(r.hours.today, 1040);
  assert.equal(r.hours.handedBack, r2(r.hours.today - r.hours.approving));
  assert.equal(r.savingPerYear, r2(r.perYear.today - r.perYear.own));
  assert.equal(r.versusSeatsOver, r2(r.over.rentSeats - r.over.own));
  assert.equal(r.versusCloudOver, r2(r.over.cloudApi - r.over.own));
});

test('voiceCase · the figures move with the basis, not with anything typed', () => {
  const dear = voiceCase(base({ wageMedianHourly: { ...BASIS.wageMedianHourly, value: 30 } }), {}, CAP);
  assert.equal(dear.lines.staff, 10 * 52 * 30 / 60 * 30);
  const cheapPower = voiceCase(base({ electricityPencePerKwh: { ...BASIS.electricityPencePerKwh, value: 10 } }), {}, CAP);
  assert.equal(cheapPower.lines.power, r2(15 * 8760 / 1000 * 10 / 100));
  const fx = voiceCase(base({ fxGbpPerUsd: { ...BASIS.fxGbpPerUsd, value: 1 } }), {}, CAP);
  assert.equal(fx.lines.api, r2(10 * 52 * (1500 * 2 + 300 * 10) / 1e6));
  const seat = voiceCase(base({ 'seat.copilot': { ...BASIS['seat.copilot'], value: 10 } }), {}, CAP);
  assert.equal(seat.lines.seats, 240);
  const watts = voiceCase(base({ laptopExtraWatts: { ...BASIS.laptopExtraWatts, value: 100 } }), {}, CAP);
  assert.equal(watts.lines.power, r2(100 * 8760 / 1000 * BASIS.electricityPencePerKwh.value / 100));
  const cpi = voiceCase(base({ cpi: { ...BASIS.cpi, value: 0 } }), {}, CAP);
  assert.equal(cpi.over.today, r2(5114.2 * 3));
});

test('voiceCase · the hours the machine is on are the reader\'s own; the default is the basis\'s always-on year', () => {
  assert.equal(voiceCase(BASIS, { hoursOn: 0 }, CAP).lines.power, 0);
  assert.equal(voiceCase(BASIS, { hoursOn: 100 }, CAP).lines.power, r2(15 * 100 / 1000 * BASIS.electricityPencePerKwh.value / 100));
  assert.equal(voiceCase(BASIS, { hoursOn: MAX_HOURS_ON }, CAP).ok, true);
  assert.equal(voiceCase(BASIS, { hoursOn: MAX_HOURS_ON + 1 }, CAP).why, `hours on: 0 to ${MAX_HOURS_ON} a year`);
  assert.equal(voiceCase(BASIS, { hoursOn: -1 }, CAP).why, `hours on: 0 to ${MAX_HOURS_ON} a year`);
  assert.equal(voiceCase(BASIS, { hoursOn: '8760' }, CAP).why, `hours on: 0 to ${MAX_HOURS_ON} a year`);
});

test('voiceCase · the voice\'s own cap bounds the posts', () => {
  assert.equal(voiceCase(BASIS, { postsPerWeek: 7 * CAP }, CAP).ok, true);
  const capWhy = `posts a week: a whole number, 0 to ${7 * CAP} (the voice’s cap)`;
  assert.equal(voiceCase(BASIS, { postsPerWeek: 7 * CAP + 1 }, CAP).why, capWhy);
  assert.equal(voiceCase(BASIS, { postsPerWeek: -1 }, CAP).why, capWhy);
  assert.equal(voiceCase(BASIS, { postsPerWeek: 2.5 }, CAP).why, capWhy);
  assert.equal(voiceCase(BASIS, { postsPerWeek: 7 }, 1).ok, true);
  assert.equal(voiceCase(BASIS, { postsPerWeek: 8 }, 1).ok, false);
  for (const bad of [0, -1, 2.5, '4', null, undefined, NaN]) assert.deepEqual(voiceCase(BASIS, {}, bad), { ok: false, why: 'the voice’s daily cap' }, String(bad));
});

test('voiceCase · boundaries hold at both ends of every input', () => {
  for (const ok of [{ postsPerWeek: 0 }, { minutesPerPost: MAX_MINUTES }, { minutesPerPost: 0, approveMinutes: 0 }, { approveMinutes: 30 }, { approveMinutes: 0 },
    { seats: 0 }, { years: 1 }, { years: 10 }, { tokensIn: 0, tokensOut: 0 }]) assert.equal(voiceCase(BASIS, ok, CAP).ok, true, JSON.stringify(ok));
  assert.equal(voiceCase(BASIS, { approveMinutes: 30 }, CAP).savingPerYear, -32.21);
  assert.equal(voiceCase(BASIS, { approveMinutes: 30 }, CAP).lines.takenOff, 0);
  assert.equal(voiceCase(BASIS, { approveMinutes: 0 }, CAP).perYear.own, 32.21);
  assert.equal(voiceCase(BASIS, { postsPerWeek: 0 }, CAP).perYear.today, 0);
  assert.equal(voiceCase(BASIS, { years: 1 }, CAP).over.today, 5114.2);
  assert.equal(voiceCase(BASIS, { years: 10 }, CAP).over.today, over(5114.2, BASIS.cpi.value, 10));
});

test('voiceCase · each bad input refused with its reason', () => {
  const why = (i) => voiceCase(BASIS, i, CAP).why;
  const mins = `minutes a post today: 0 to ${MAX_MINUTES}`;
  assert.equal(why({ minutesPerPost: MAX_MINUTES + 0.5 }), mins);
  assert.equal(why({ minutesPerPost: -1 }), mins);
  assert.equal(why({ minutesPerPost: '30' }), mins);
  assert.equal(why({ minutesPerPost: Infinity }), mins);
  const appr = 'minutes to approve a post: no more than a post takes today';
  assert.equal(why({ approveMinutes: 30.5 }), appr);
  assert.equal(why({ approveMinutes: -1 }), appr);
  assert.equal(why({ approveMinutes: '5' }), appr);
  assert.equal(why({ seats: 2.5 }), 'seats: a whole number');
  assert.equal(why({ seats: -1 }), 'seats: a whole number');
  assert.equal(why({ tokensIn: -1 }), 'tokens: numbers');
  assert.equal(why({ tokensIn: NaN }), 'tokens: numbers');
  assert.equal(why({ tokensOut: 'x' }), 'tokens: numbers');
  assert.equal(why({ tokensOut: -1 }), 'tokens: numbers');
  assert.equal(why({ years: 0 }), 'years: 1 to 10');
  assert.equal(why({ years: 11 }), 'years: 1 to 10');
  assert.equal(why({ years: 2.5 }), 'years: 1 to 10');
});

test('voiceCase · refuses a basis missing any figure it reads', () => {
  const refused = { ok: false, why: 'a sourced basis with every figure the case reads' };
  assert.deepEqual(voiceCase(null, {}, CAP), refused);
  assert.deepEqual(voiceCase(undefined, {}, CAP), refused);
  for (const k of BASIS_KEYS) { const b = { ...BASIS }; delete b[k]; assert.deepEqual(voiceCase(b, {}, CAP), refused, k); }
  assert.deepEqual(voiceCase(base({ cpi: { value: -0.1 } }), {}, CAP), refused);
  assert.deepEqual(voiceCase(base({ frontier: { inPerM: 2 } }), {}, CAP), refused);
  assert.deepEqual(voiceCase(base({ frontier: { outPerM: 10 } }), {}, CAP), refused);
  assert.deepEqual(voiceCase(base({ wageMedianHourly: { value: Infinity } }), {}, CAP), refused);
  assert.deepEqual(voiceCase(base({ wageMedianHourly: { value: '19.67' } }), {}, CAP), refused);
});

test('voiceCase · never throws: hostile inputs give a reason', () => {
  const toxic = {}; Object.defineProperty(toxic, 'postsPerWeek', { enumerable: true, get() { throw new Error('boom'); } });
  assert.deepEqual(voiceCase(BASIS, toxic, CAP), { ok: false, why: 'the inputs could not be read' });
  const toxicBasis = { ...BASIS }; Object.defineProperty(toxicBasis, 'cpi', { get() { throw new Error('boom'); } });
  assert.deepEqual(voiceCase(toxicBasis, {}, CAP), { ok: false, why: 'the inputs could not be read' });
  for (const junk of [null, 42, 'x', [], () => 1]) assert.equal(typeof voiceCase(BASIS, junk, CAP).ok, 'boolean');
  assert.equal(voiceCase(BASIS, null, CAP).ok, true);
});

test('over · CPI on every year after the first, compounding', () => {
  assert.equal(over(100, 0.1, 1), 100);
  assert.equal(over(100, 0.1, 2), 210);
  assert.equal(over(100, 0.1, 3), 331);
  assert.equal(over(100, 0, 4), 400);
  assert.equal(over(100, 0.1, 0), 0);
});

test('sourcesOf · every figure the case reads, with what it is and where it came from', () => {
  const s = sourcesOf(BASIS);
  assert.deepEqual(s.map((x) => x.key), [...BASIS_KEYS]);
  for (const x of s) {
    assert.ok(x.what, x.key);
    if (x.key === 'hoursPerYear') assert.equal(x.source, undefined, 'arithmetic, not a source: 24 hours x 365 days');
    else assert.match(x.source, /^https:\/\//, x.key);
  }
  assert.equal(s.find((x) => x.key === 'seat.copilot').what, BASIS['seat.copilot'].product);
  assert.equal(s.find((x) => x.key === 'cpi').what, BASIS.cpi.what);
  assert.deepEqual(sourcesOf(null), []);
  assert.deepEqual(sourcesOf({}), []);
});
