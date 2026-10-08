// voice-core.test.mjs — the voice's rules, pinned. The mutation gate runs this suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, draftPost, xLength, overlap, rulesGate, pickReply, percentEncode, oauth1Signature, oauth1Header } from './voice-core.mjs';

// ── drafting ──────────────────────────────────────────────────────────────────
test('a receipt card drafts into claim + proof line + link, anchor shortened to 12 hex', () => {
  const d = draftPost({ name: 'witness', claim: '15/17 mutants killed on vercel/ms', url: 'https://sjgant80-hub.github.io/witness/', anchor: 'a'.repeat(64) });
  assert.equal(d.ok, true);
  assert.match(d.text, /^witness: 15\/17 mutants killed on vercel\/ms\n/);
  assert.match(d.text, /anchor aaaaaaaaaaaa…/);
  assert.match(d.text, /re-run/);
  assert.ok(d.text.endsWith('https://sjgant80-hub.github.io/witness/'));
});
test('no anchor -> the generic re-runnable line; missing fields are refused', () => {
  const d = draftPost({ name: 'x', claim: 'y', url: 'https://e.g/h' });
  assert.equal(d.ok, true);
  assert.match(d.text, /proof is re-runnable/);
  assert.equal(draftPost({ name: 'x', claim: 'y' }).ok, false);
  assert.equal(draftPost({ name: '', claim: 'y', url: 'https://e.g/h' }).ok, false);
  assert.equal(draftPost(null).ok, false);
  // a NON-string anchor never reaches the anchor line, even one that would stringify into 64 hex
  const sly = draftPost({ name: 'x', claim: 'y', url: 'https://e.g/h', anchor: ['a'.repeat(64)] });
  assert.equal(sly.ok, true);
  assert.doesNotMatch(sly.text, /anchor/i);
});

// ── X length accounting ───────────────────────────────────────────────────────
test('every URL costs exactly 23 characters, whatever its true length', () => {
  const longUrl = 'https://example.com/' + 'x'.repeat(100);
  assert.equal(xLength(`go ${longUrl}`), 3 + 23);
  assert.equal(xLength('plain words only'), 16);
  // 'a https://a.b/c b https://d.e/f' = 31 raw chars, two 13-char URLs each re-counted as 23
  assert.equal(xLength('a https://a.b/c b https://d.e/f'), 31 + 2 * (23 - 13));
});

// ── near-duplicate detection ──────────────────────────────────────────────────
test('overlap: identical text is 1, disjoint is 0, too-short is 0 on either side', () => {
  assert.equal(overlap('alpha bravo charlie delta', 'alpha bravo charlie delta'), 1);
  assert.equal(overlap('alpha bravo charlie delta', 'echo foxtrot golf hotel india'), 0);
  assert.equal(overlap('two words', 'two words'), 0);                            // no 3-shingle exists
  assert.equal(overlap('two words', 'alpha bravo charlie delta'), 0);            // ONE empty side is 0, not NaN
  assert.equal(overlap('alpha bravo charlie delta', 'two words'), 0);
});

// ── the rules gate ────────────────────────────────────────────────────────────
const LINK = 'https://sjgant80-hub.github.io/witness/';
test('a clean post passes and reports its X-length', () => {
  const g = rulesGate(`witness: the gate landed on external code.\n${LINK}`, {});
  assert.equal(g.ok, true);
  assert.equal(g.length, xLength(`witness: the gate landed on external code.\n${LINK}`));
});
test('over-length, link-less, and over-cap posts are refused with the reason', () => {
  assert.match(rulesGate(`${'long words here '.repeat(20)}${LINK}`, {}).why || '', /too long/);
  assert.match(rulesGate('no link in this one at all', {}).why, /no link/);
  assert.equal(rulesGate(`fine post ${LINK}`, { todayCount: 3 }).ok, true);     // 3 < 4: still allowed
  assert.match(rulesGate(`fine post ${LINK}`, { todayCount: 4 }).why, /daily cap/);  // 4 >= 4: refused
  assert.equal(RULES.maxPerDay, 4);
  assert.equal(rulesGate(123, {}).ok, false);                                    // a non-string never throws
  assert.equal(rulesGate(null, {}).ok, false);
});
test('the 280 boundary is INSIDE the allowed range; 281 is not', () => {
  const link = 'https://a.b/c';                                   // counts as 23
  const exact = 'x'.repeat(280 - 23 - 1) + ' ' + link;            // X-length exactly 280
  assert.equal(xLength(exact), 280);
  assert.equal(rulesGate(exact, {}).ok, true);
  assert.match(rulesGate('y' + exact, {}).why, /too long: 281 > 280/);   // the message's own operator, verbatim
});
test('a near-duplicate is refused at EXACTLY the 0.6 threshold', () => {
  const a = `alpha bravo charlie delta echo foxtrot golf ${LINK}`;
  const b = `alpha bravo charlie delta echo xray yankee ${LINK}`;   // shares 3 of 5 shingles = 0.600
  assert.equal(overlap(a, b), 0.6);
  assert.match(rulesGate(a, { history: [b] }).why, /near-duplicate/);
  assert.equal(rulesGate(a, { history: [`totally different subject matter entirely here ${LINK}`] }).ok, true);
});

// ── replies: summoned-only, once, opt-out honoured ───────────────────────────
test('a fresh mention gets one reply pointing at the verify guide', () => {
  const r = pickReply({ id: '123', authorUsername: 'someone', text: 'what is this?' }, { selfUsername: 'karvoice' });
  assert.equal(r.ok, true);
  assert.match(r.text, /^@someone /);
  assert.match(r.text, /agents\.md/);
  assert.equal(r.inReplyTo, '123');
});
test('already-answered, self, opt-out and malformed mentions are each refused', () => {
  assert.match(pickReply({ id: '1', authorUsername: 'a', text: 'x' }, { repliedIds: ['1'] }).why, /one automated reply/);
  assert.match(pickReply({ id: '2', authorUsername: 'KarVoice', text: 'x' }, { selfUsername: 'karvoice' }).why, /self/);
  assert.match(pickReply({ id: '3', authorUsername: 'a', text: 'please STOP' }, {}).why, /opt-out/);
  assert.equal(pickReply({ authorUsername: 'a' }, {}).ok, false);
  assert.equal(pickReply({ id: '4', text: 'x' }, {}).ok, false);
  assert.equal(pickReply(null, {}).ok, false);                                   // null never throws
  assert.equal(pickReply({ id: 123, authorUsername: 'a', text: 'x' }, {}).ok, false);   // a numeric id is malformed
  assert.equal(pickReply({ id: '5', authorUsername: 123, text: 'x' }, {}).ok, false);   // a numeric author is no author
});

// ── OAuth 1.0a: the canonical vector ─────────────────────────────────────────
// The worked example from X's own "Creating a signature" documentation. If our signing does not
// reproduce the documented signature byte-for-byte, the implementation is wrong — not the vector.
test('percentEncode is RFC 3986: space %20, plus %2B, and the five JS stragglers', () => {
  assert.equal(percentEncode('Hello Ladies + Gentlemen!'), 'Hello%20Ladies%20%2B%20Gentlemen%21');
  assert.equal(percentEncode("*'()"), '%2A%27%28%29');
});
test('the signature reproduces the documented example exactly', () => {
  const sig = oauth1Signature({
    method: 'POST',
    url: 'https://api.twitter.com/1.1/statuses/update.json',
    params: {
      status: 'Hello Ladies + Gentlemen, a signed OAuth request!',
      include_entities: 'true',
      oauth_consumer_key: 'xvz1evFS4wEEPTGEFPHBog',
      oauth_nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: '1318622958',
      oauth_token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
      oauth_version: '1.0',
    },
    consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
    tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
  });
  // 20-byte SHA-1 HMAC = exactly 28 base64 chars; this value reproduces X's documented example.
  // (An independently written implementation landing on a memorised published string is the
  // corroboration — a bug cannot land on a known base64 by chance.)
  assert.equal(sig, 'hCtSmYh+iHYCEqBWrE7C7hYmtUk=');
});
test('the header is deterministic given nonce+timestamp and carries the signature', () => {
  const h = oauth1Header({
    method: 'POST', url: 'https://api.x.com/2/tweets',
    consumerKey: 'ck', consumerSecret: 'cs', token: 'tk', tokenSecret: 'ts',
    nonce: 'fixednonce', timestamp: 111,
  });
  assert.ok(h.header.startsWith('OAuth '));
  assert.match(h.header, /oauth_consumer_key="ck"/);
  assert.match(h.header, /oauth_signature="/);
  assert.match(h.header, /oauth_timestamp="111"/);     // a supplied timestamp is USED, not replaced by the clock
  const again = oauth1Header({ method: 'POST', url: 'https://api.x.com/2/tweets', consumerKey: 'ck', consumerSecret: 'cs', token: 'tk', tokenSecret: 'ts', nonce: 'fixednonce', timestamp: 111 });
  assert.equal(h.header, again.header);
});
