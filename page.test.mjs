// the live page's wiring: no typed-in numbers, no dead references, every section a stranger needs, and the kernel
// imports that make the page's logic the gated logic. Reads index.html as text; no browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { DEFAULTS } from './costcase.mjs';
import { ECONOMY } from './claim-gate.mjs';

const HTML = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const SCRIPT = [...HTML.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
const MARKUP = HTML.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const TEXT = MARKUP.replace(/<[^>]*>/g, ' ');
const IDS = new Set([...MARKUP.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

// The only digits allowed in the page's static text are names, never figures: hash and claim names, the switch's value
// in voice.mjs, the protocol's version, witness's pinned tag. Every figure is filled in from a receipt or a kernel.
const NAMES = /^(sha256|SHA-256|DRY_RUN=0|v0\.6|1\.0a|V[1-6])$/;

test('no number is typed into the page: every figure comes from a receipt, the basis or a kernel', () => {
  const typed = TEXT.split(/\s+/).map((t) => t.replace(/^[(]+|[),.;:]+$/g, '')).filter((t) => /\d/.test(t) && !NAMES.test(t));
  assert.deepEqual(typed, []);
});

test('every element the script fills in exists on the page', () => {
  const refs = new Set([
    ...[...SCRIPT.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]),
    ...[...SCRIPT.matchAll(/setText\('([\w-]+)'/g)].map((m) => m[1]),
    ...[...SCRIPT.matchAll(/getElementById\('([\w-]+)'\)/g)].map((m) => m[1]),
  ]);
  assert.ok(refs.size > 10, 'the script fills in the page');
  for (const id of refs) assert.ok(IDS.has(id), `#${id} is referenced by the script but not on the page`);
});

test('every in-page link lands on a section that exists', () => {
  const anchors = [...MARKUP.matchAll(/href="#([\w-]+)"/g)].map((m) => m[1]);
  assert.ok(anchors.length > 5);
  for (const a of anchors) assert.ok(IDS.has(a), `#${a}`);
});

test('the cost case has an input for every number the kernel takes', () => {
  for (const k of [...Object.keys(DEFAULTS), 'hoursOn']) {
    assert.ok(IDS.has('in-' + k), `input for ${k}`);
    assert.ok(SCRIPT.includes(`'${k}'`), `the script reads ${k}`);
  }
});

test('the page explains itself: what it is, start here, how it works, blueprint, the brochure, adoption, the white paper', () => {
  for (const id of ['start', 'how', 'blueprint', 'business', 'cost', 'adoption', 'paper', 'faq']) assert.ok(IDS.has(id), id);
  assert.match(TEXT, /In plain words:/);
  assert.match(MARKUP, /<svg class="flow"[\s\S]*<\/svg>/, 'an inline diagram of the flow');
  for (const fn of ['draftPost()', 'rulesGate()', 'checkCard()', 'approvalFor()', 'post()']) assert.ok(MARKUP.includes(fn), `the diagram names ${fn}`);
  for (const role of ['Chief executive', 'Finance', 'Operations', 'Technology and security', 'Marketing and communications', 'Legal and compliance']) assert.ok(TEXT.includes(role), role);
  for (const h of ['Security and data protection', 'Ownership, support and exit', 'Risks, straight', 'The case for the board']) assert.ok(TEXT.includes(h), h);
});

test('supplier and credit are on the page; no economy wording, no "per seat"', () => {
  assert.ok(MARKUP.includes('href="https://www.ai-nativesolutions.com"'));
  assert.ok(TEXT.includes('Supplied by AI Native Solutions'));
  assert.ok(TEXT.includes('Powered by the Konomi architecture, created by Thomas Frumkin.'));
  assert.equal(ECONOMY.test(TEXT), false);
  assert.equal(/per seat/i.test(TEXT + SCRIPT), false);
});

test('the page imports the gated kernels themselves, and can never sign', async () => {
  const map = JSON.parse(HTML.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  assert.equal(map.imports['node:crypto'], './page-nosign.mjs');
  for (const f of ['./claim-gate.mjs', './voice-core.mjs', './costcase.mjs']) assert.ok(SCRIPT.includes(`import('${f}'`), f);
  assert.ok(existsSync(new URL('./page-nosign.mjs', import.meta.url)));
  const shim = await import('./page-nosign.mjs');
  assert.throws(() => shim.createHmac('sha1', 'k'), /never on the page/);
  assert.throws(() => shim.randomBytes(16), /never on the page/);
  assert.ok(SCRIPT.includes("fetch('vendor/sovereign-enterprise/data/basis.json'"), 'the cost case reads the vendored basis');
});
