// costcase.mjs — the cost case for the voice, for the page's "For your business" brochure: what writing and fact-checking
// public proof posts costs a team in staff time today, what the two rented-AI routes add, and what owning the voice costs
// to run. Every external figure is read from the vendored, sourced basis (vendor/sovereign-enterprise/data/basis.json,
// byte for byte, hash pinned in vendor/SOURCES.json); the posts, the minutes and the counts are the reader's own.
// Floors, never top ends: staff time at the UK median wage with on-costs left out; CPI applied to every later year.
// Like for like: a person still reads and approves every post on every route (that is the voice's second rule), so the
// approval minutes stay on all three; the cloud-model route takes the SAME drafting and checking off as owning the voice,
// so the two differ only in the per-call bill (and where the words go); rented assistant seats help each person but take
// no work off, so the staff time stays. Both automated routes (the cloud model and the owned voice) carry the same
// one-off set-up hours and the same monthly upkeep hours, at the same wage: the reader's own figures, so the saving is
// never shown without the work it takes to get and keep it. X's own charge for each post is the same on every route (the
// same posts go out) and is not in the basis, so it is left out of every line. No price of ours appears here — these are
// the buyer's costs.
// Pure, total, deterministic, no imports (it runs in Node and on the page): garbage in gives { ok: false, why }, never a throw.
//
// Powered by the Konomi architecture, created by Thomas Frumkin.

export const DEFAULTS = Object.freeze({ postsPerWeek: 10, minutesPerPost: 30, approveMinutes: 5, seats: 2, tokensIn: 1500, tokensOut: 300, setupHours: 16, upkeepHoursPerMonth: 2, years: 3 });
export const BASIS_KEYS = Object.freeze(['wageMedianHourly', 'cpi', 'electricityPencePerKwh', 'laptopExtraWatts', 'hoursPerYear', 'seat.copilot', 'frontier', 'fxGbpPerUsd']);
export const MAX_MINUTES = 480;   // one working day on a single post is the most the case will take
export const MAX_HOURS_ON = 8784; // a leap year, always on
export const MAX_SETUP_HOURS = 2000;  // about a working year of one person: the most the case will take for the set-up
export const MAX_UPKEEP_HOURS = 160;  // about a working month of one person: the most the case will take for a month's upkeep

const isNum = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const r2 = (x) => Math.round(x * 100) / 100;

/** the basis entries the case reads, each a sourced number; null when one is missing or unreadable */
function figures(basis) {
  const b = basis || {}, f = (k) => b[k] || {};
  const out = {
    wage: f('wageMedianHourly').value, cpi: f('cpi').value, pence: f('electricityPencePerKwh').value, watts: f('laptopExtraWatts').value,
    hours: f('hoursPerYear').value, seat: f('seat.copilot').value, apiIn: f('frontier').inPerM, apiOut: f('frontier').outPerM, fx: f('fxGbpPerUsd').value,
  };
  return Object.values(out).every(isNum) ? out : null;
}

/** where each figure came from, for the page to list beside the numbers */
export function sourcesOf(basis) {
  try { return BASIS_KEYS.map((k) => ({ key: k, what: basis[k].what || basis[k].product, source: basis[k].source })); } catch { return []; }
}

/** a yearly cost carried over `years`, rising by CPI each year after the first */
export function over(perYear, cpi, years) {
  let total = 0, factor = 1;
  for (let y = 0; y < years; y++) { total += perYear * factor; factor *= 1 + cpi; }
  return r2(total);
}

/**
 * The case. capPerDay is the voice's own daily cap (RULES.maxPerDay in voice-core.mjs, which the page imports itself):
 * the voice posts no more than seven times that a week, so the case takes no more.
 * input (all optional, defaults above): postsPerWeek, minutesPerPost, approveMinutes, seats, tokensIn, tokensOut,
 * setupHours (one-off, counted once in the over-the-years total), upkeepHoursPerMonth (every month, rising with CPI like
 * the rest), years, and hoursOn — the hours a year the machine running the voice is counted as drawing extra power
 * (default: the basis's always-on year, a ceiling: a draft takes seconds).
 * paybackMonths: the months of running saving against today it takes to cover the set-up; null when there is no saving.
 */
export function voiceCase(basis, input, capPerDay) {
  try {
    const f = figures(basis);
    if (!f) return { ok: false, why: 'a sourced basis with every figure the case reads' };
    if (!Number.isInteger(capPerDay) || capPerDay < 1) return { ok: false, why: 'the voice’s daily cap' };
    const i = { ...DEFAULTS, hoursOn: f.hours, ...(input || {}) };
    if (!Number.isInteger(i.postsPerWeek) || i.postsPerWeek < 0 || i.postsPerWeek > 7 * capPerDay) return { ok: false, why: `posts a week: a whole number, 0 to ${7 * capPerDay} (the voice’s cap)` };
    if (!isNum(i.minutesPerPost) || i.minutesPerPost > MAX_MINUTES) return { ok: false, why: `minutes a post today: 0 to ${MAX_MINUTES}` };
    if (!isNum(i.approveMinutes) || i.approveMinutes > i.minutesPerPost) return { ok: false, why: 'minutes to approve a post: no more than a post takes today' };
    if (!Number.isInteger(i.seats) || i.seats < 0) return { ok: false, why: 'seats: a whole number' };
    if (!isNum(i.tokensIn) || !isNum(i.tokensOut)) return { ok: false, why: 'tokens: numbers' };
    if (!isNum(i.setupHours) || i.setupHours > MAX_SETUP_HOURS) return { ok: false, why: `set-up hours: 0 to ${MAX_SETUP_HOURS}` };
    if (!isNum(i.upkeepHoursPerMonth) || i.upkeepHoursPerMonth > MAX_UPKEEP_HOURS) return { ok: false, why: `upkeep hours a month: 0 to ${MAX_UPKEEP_HOURS}` };
    if (!Number.isInteger(i.years) || i.years < 1 || i.years > 10) return { ok: false, why: 'years: 1 to 10' };
    if (!isNum(i.hoursOn) || i.hoursOn > MAX_HOURS_ON) return { ok: false, why: `hours on: 0 to ${MAX_HOURS_ON} a year` };
    const postsPerYear = i.postsPerWeek * 52;
    const hoursToday = r2(postsPerYear * i.minutesPerPost / 60);                                  // writing + checking, a year
    const hoursApproving = r2(postsPerYear * i.approveMinutes / 60);                             // reading the exact words, a year
    const hoursUpkeep = r2(i.upkeepHoursPerMonth * 12);                                           // keeping it running, a year
    const staff = r2(postsPerYear * i.minutesPerPost / 60 * f.wage);                              // the process, in staff time
    const approve = r2(postsPerYear * i.approveMinutes / 60 * f.wage);                            // what stays on every route
    const takenOff = r2(staff - approve);
    const seats = r2(i.seats * 12 * f.seat);                                                     // rented assistants: help, take nothing off
    const api = r2(postsPerYear * (i.tokensIn * f.apiIn + i.tokensOut * f.apiOut) / 1e6 * f.fx);  // a cloud model on every post
    const power = r2(f.watts * i.hoursOn / 1000 * f.pence / 100);                                // owned: the extra draw, a year
    const setup = r2(i.setupHours * f.wage);                                                     // one-off, both automated routes
    const upkeep = r2(i.upkeepHoursPerMonth * 12 * f.wage);                                      // a year, both automated routes
    const perYear = { today: staff, rentSeats: r2(staff + seats), cloudApi: r2(approve + api + upkeep), own: r2(approve + power + upkeep) };
    const total = Object.fromEntries(Object.entries(perYear).map(([k, v]) => [k, over(v, f.cpi, i.years)]));
    total.cloudApi = r2(total.cloudApi + setup);
    total.own = r2(total.own + setup);
    const savingPerYear = r2(perYear.today - perYear.own);
    return {
      ok: true, inputs: i, hours: { today: hoursToday, approving: hoursApproving, upkeep: hoursUpkeep, handedBack: r2(hoursToday - hoursApproving - hoursUpkeep) },
      lines: { staff, approve, takenOff, seats, api, power, setup, upkeep }, perYear, over: total,
      savingPerYear, savingOver: r2(total.today - total.own),
      paybackMonths: savingPerYear > 0 ? r2(setup / (savingPerYear / 12)) : null,
      versusSeatsOver: r2(total.rentSeats - total.own), versusCloudOver: r2(total.cloudApi - total.own),
    };
  } catch { return { ok: false, why: 'the inputs could not be read' }; }
}

export default { DEFAULTS, BASIS_KEYS, MAX_MINUTES, MAX_HOURS_ON, MAX_SETUP_HOURS, MAX_UPKEEP_HOURS, sourcesOf, over, voiceCase };
