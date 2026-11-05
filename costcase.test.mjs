// the voice's cost case: every figure from the sourced basis, the cap from the voice itself, like for like, never a throw
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DEFAULTS, BASIS_KEYS, MAX_MINUTES, MAX_HOURS_ON, MAX_SETUP_HOURS, MAX_UPKEEP_HOURS, MAX_X_USD, sourcesOf, over, voiceCase } from './costcase.mjs';
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
  assert.deepEqual(r.hours, { today: 260, approving: 43.33, upkeep: 24, handedBack: 192.67, withSeats: 260 });
  assert.deepEqual(r.lines, { staff: 5114.2, approve: 852.37, takenOff: 4261.83, seats: 554.4, seatSaved: 0, api: 2.35, xApi: 0, power: 32.21, setup: 314.72, upkeep: 472.08 });
  assert.deepEqual(r.perYear, { today: 5114.2, rentSeats: 5668.6, cloudApi: 1326.8, own: 1356.66 });
  assert.deepEqual(r.over, { today: 15823.14, rentSeats: 17538.43, cloudApi: 4419.79, own: 4512.17 });
  assert.deepEqual([r.savingPerYear, r.savingOver, r.versusSeatsOver, r.versusCloudOver], [3757.54, 11310.97, 13026.26, -92.38]);
  assert.equal(r.paybackMonths, 1.01);
});

test('voiceCase · set-up and upkeep: the same on both automated routes, set-up counted once, upkeep every year with CPI', () => {
  const w = BASIS.wageMedianHourly.value, cpi = BASIS.cpi.value;
  const r = voiceCase(BASIS, { setupHours: 40, upkeepHoursPerMonth: 3, years: 2 }, CAP);
  assert.equal(r.lines.setup, r2(40 * w));
  assert.equal(r.lines.upkeep, r2(3 * 12 * w));
  assert.equal(r.hours.upkeep, 36);
  assert.equal(r.hours.handedBack, r2(260 - 43.33 - 36));
  assert.equal(r.perYear.cloudApi, r2(r.lines.approve + r.lines.api + r.lines.upkeep));
  assert.equal(r.perYear.own, r2(r.lines.approve + r.lines.power + r.lines.upkeep));
  assert.equal(r.over.own, r2(over(r.perYear.own, cpi, 2) + r.lines.setup));
  assert.equal(r.over.cloudApi, r2(over(r.perYear.cloudApi, cpi, 2) + r.lines.setup));
  assert.equal(r.over.today, over(r.perYear.today, cpi, 2), 'today carries no set-up');
  assert.equal(r.over.rentSeats, over(r.perYear.rentSeats, cpi, 2), 'seats carry no set-up');
  assert.equal(r.savingOver, r2(r.over.today - r.over.own));
  assert.equal(r.paybackMonths, r2(r.lines.setup / (r.savingPerYear / 12)));
  const none = voiceCase(BASIS, { setupHours: 0, upkeepHoursPerMonth: 0 }, CAP);
  assert.equal(none.lines.setup, 0);
  assert.equal(none.lines.upkeep, 0);
  assert.equal(none.paybackMonths, 0);
  assert.equal(none.perYear.own, 884.58);
  assert.equal(none.over.own, 2736.86);
  assert.equal(none.hours.handedBack, 216.67);
});

test('voiceCase · payback only when there is a running saving', () => {
  const even = voiceCase(BASIS, { postsPerWeek: 0, upkeepHoursPerMonth: 0, hoursOn: 0 }, CAP);
  assert.equal(even.savingPerYear, 0);
  assert.equal(even.paybackMonths, null, 'no saving: no payback, never Infinity');
  const loss = voiceCase(BASIS, { approveMinutes: 30 }, CAP);
  assert.ok(loss.savingPerYear < 0);
  assert.equal(loss.paybackMonths, null);
  const tiny = voiceCase(BASIS, { postsPerWeek: 1, minutesPerPost: 30, approveMinutes: 0, upkeepHoursPerMonth: 0, hoursOn: 0, setupHours: 1 }, CAP);
  assert.equal(tiny.savingPerYear, r2(52 * 0.5 * BASIS.wageMedianHourly.value));
  assert.equal(tiny.paybackMonths, r2(BASIS.wageMedianHourly.value / (tiny.savingPerYear / 12)));
});

test("voiceCase · seats save only the minutes the reader says they save, and the seats' bill is added", () => {
  const w = BASIS.wageMedianHourly.value;
  const r = voiceCase(BASIS, { seatSavesMinutes: 12 }, CAP);
  assert.equal(r.lines.seatSaved, r2(10 * 52 * 12 / 60 * w));
  assert.equal(r.perYear.rentSeats, r2(r.lines.staff - r.lines.seatSaved + r.lines.seats));
  assert.equal(r.hours.withSeats, 156);
  assert.equal(r.perYear.today, r.lines.staff, 'today is untouched by seats');
  assert.equal(r.perYear.own, voiceCase(BASIS, {}, CAP).perYear.own, 'owning the voice is untouched by seats');
  const all = voiceCase(BASIS, { seatSavesMinutes: 30 }, CAP);
  assert.equal(all.ok, true, 'a seat may save the whole post');
  assert.equal(all.hours.withSeats, 0);
  assert.equal(all.perYear.rentSeats, all.lines.seats);
  assert.equal(voiceCase(BASIS, { minutesPerPost: 10, approveMinutes: 2, seatSavesMinutes: 10 }, CAP).ok, true);
  const why = 'minutes a seat saves on a post: no more than a post takes today';
  assert.equal(voiceCase(BASIS, { seatSavesMinutes: 30.5 }, CAP).why, why);
  assert.equal(voiceCase(BASIS, { minutesPerPost: 10, approveMinutes: 2, seatSavesMinutes: 11 }, CAP).why, why);
  assert.equal(voiceCase(BASIS, { seatSavesMinutes: -1 }, CAP).why, why);
  assert.equal(voiceCase(BASIS, { seatSavesMinutes: '5' }, CAP).why, why);
  assert.equal(voiceCase(BASIS, { seatSavesMinutes: NaN }, CAP).why, why);
});

test("voiceCase · X's per-post charge: the reader's own figure, on both automated routes only, converted at the basis's rate", () => {
  const fx = BASIS.fxGbpPerUsd.value, cpi = BASIS.cpi.value;
  const r = voiceCase(BASIS, { xPerPostUsd: 0.5 }, CAP);
  assert.equal(r.lines.xApi, r2(10 * 52 * 0.5 * fx));
  const none = voiceCase(BASIS, {}, CAP);
  assert.equal(none.lines.xApi, 0, 'left out until the reader enters it');
  assert.equal(r.perYear.own, r2(none.perYear.own + r.lines.xApi));
  assert.equal(r.perYear.cloudApi, r2(none.perYear.cloudApi + r.lines.xApi));
  assert.equal(r.perYear.today, none.perYear.today, 'posting by hand pays no API charge');
  assert.equal(r.perYear.rentSeats, none.perYear.rentSeats, 'posting by hand with seats pays no API charge');
  assert.equal(r.over.own, r2(over(r.perYear.own, cpi, 3) + r.lines.setup));
  assert.equal(r.savingPerYear, r2(none.savingPerYear - r.lines.xApi));
  assert.equal(r.versusCloudOver, none.versusCloudOver, 'the same charge on both automated routes');
  const priced = voiceCase(base({ fxGbpPerUsd: { ...BASIS.fxGbpPerUsd, value: 1 } }), { xPerPostUsd: 2 }, CAP);
  assert.equal(priced.lines.xApi, 1040);
  assert.equal(voiceCase(BASIS, { xPerPostUsd: MAX_X_USD }, CAP).ok, true);
  const why = `X’s charge for a post: 0 to ${MAX_X_USD} dollars`;
  assert.equal(voiceCase(BASIS, { xPerPostUsd: MAX_X_USD + 0.01 }, CAP).why, why);
  assert.equal(voiceCase(BASIS, { xPerPostUsd: -0.01 }, CAP).why, why);
  assert.equal(voiceCase(BASIS, { xPerPostUsd: '0.2' }, CAP).why, why);
  assert.equal(voiceCase(BASIS, { xPerPostUsd: Infinity }, CAP).why, why);
});

test('voiceCase · like for like: seats take nothing off until the reader says they save minutes; the cloud model and the owned voice take the same off; approval stays on both', () => {
  const r = voiceCase(BASIS, { postsPerWeek: 20, minutesPerPost: 60, approveMinutes: 10, seats: 3, tokensIn: 2000, tokensOut: 500 }, CAP);
  assert.equal(r.perYear.rentSeats, r2(r.lines.staff + r.lines.seats));
  assert.equal(r.perYear.cloudApi, r2(r.lines.approve + r.lines.api + r.lines.upkeep));
  assert.equal(r.perYear.own, r2(r.lines.approve + r.lines.power + r.lines.upkeep));
  assert.equal(r.lines.takenOff, r2(r.lines.staff - r.lines.approve));
  assert.equal(r.lines.seats, r2(3 * 12 * BASIS['seat.copilot'].value));
  assert.equal(r.lines.staff, r2(20 * 52 * 60 / 60 * BASIS.wageMedianHourly.value));
  assert.equal(r.lines.approve, r2(20 * 52 * 10 / 60 * BASIS.wageMedianHourly.value));
  assert.equal(r.hours.today, 1040);
  assert.equal(r.hours.handedBack, r2(r.hours.today - r.hours.approving - r.hours.upkeep));
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
    { seats: 0 }, { years: 1 }, { years: 10 }, { tokensIn: 0, tokensOut: 0 }, { setupHours: 0 }, { setupHours: MAX_SETUP_HOURS },
    { upkeepHoursPerMonth: 0 }, { upkeepHoursPerMonth: MAX_UPKEEP_HOURS }]) assert.equal(voiceCase(BASIS, ok, CAP).ok, true, JSON.stringify(ok));
  assert.equal(voiceCase(BASIS, { approveMinutes: 30, upkeepHoursPerMonth: 0 }, CAP).savingPerYear, -32.21);
  assert.equal(voiceCase(BASIS, { approveMinutes: 30 }, CAP).lines.takenOff, 0);
  assert.equal(voiceCase(BASIS, { approveMinutes: 0, upkeepHoursPerMonth: 0 }, CAP).perYear.own, 32.21);
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
  const setup = `set-up hours: 0 to ${MAX_SETUP_HOURS}`;
  assert.equal(why({ setupHours: MAX_SETUP_HOURS + 0.5 }), setup);
  assert.equal(why({ setupHours: -1 }), setup);
  assert.equal(why({ setupHours: '16' }), setup);
  assert.equal(why({ setupHours: NaN }), setup);
  const upkeep = `upkeep hours a month: 0 to ${MAX_UPKEEP_HOURS}`;
  assert.equal(why({ upkeepHoursPerMonth: MAX_UPKEEP_HOURS + 0.5 }), upkeep);
  assert.equal(why({ upkeepHoursPerMonth: -1 }), upkeep);
  assert.equal(why({ upkeepHoursPerMonth: '2' }), upkeep);
  assert.equal(why({ upkeepHoursPerMonth: Infinity }), upkeep);
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
