/**
 * Detailing AI photo diagnosis: validation, provider payload shapes, wiring.
 * Usage: node --import ./scripts/test-support/register.mjs scripts/test-detailing-ai-photos.mjs
 */
import fs from 'fs';
import assert from 'assert/strict';
import {
  validatePhotos,
  withAnthropicPhotos,
  withOpenAIPhotos,
  estimatePhotoTokens,
  PHOTO_PROMPT,
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_EDGE,
} from '../lib/detailing-ai-photos.js';
import { toMethodsWording } from '../lib/detailing-ai-knowledge.js';

let failed = 0;
let total = 0;
function check(name, fn) {
  total += 1;
  try { fn(); console.log(`PASS ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n  ${err.message}`); }
}

// Tiny byte buffers with real magic numbers (the server only sniffs the header).
const pad = (head, n = 64) => Buffer.concat([Buffer.from(head), Buffer.alloc(n)]);
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]).toString('base64');
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(52)]).toString('base64');
const GIF = pad(Buffer.from('GIF89a')).toString('base64');
const TEXT = Buffer.from('not an image at all, just text....').toString('base64');
const jpg = (data = JPEG) => ({ media_type: 'image/jpeg', data });

check('no images (missing / empty array) is fine', () => {
  assert.deepEqual(validatePhotos(undefined), { ok: true, images: [] });
  assert.deepEqual(validatePhotos(null), { ok: true, images: [] });
  assert.deepEqual(validatePhotos([]), { ok: true, images: [] });
});

check('one JPEG, PNG and WebP each are accepted, with decoded byte counts', () => {
  const r = validatePhotos([jpg(), { media_type: 'image/png', data: PNG }, { media_type: 'image/webp', data: WEBP }]);
  assert.equal(r.ok, true);
  assert.equal(r.images.length, 3);
  assert.deepEqual(r.images.map((i) => i.media_type), ['image/jpeg', 'image/png', 'image/webp']);
  assert.ok(r.images.every((i) => i.bytes > 0));
});

check('data: URL form is accepted and stripped to raw base64', () => {
  const r = validatePhotos([{ data: `data:image/jpeg;base64,${JPEG}` }]);
  assert.equal(r.ok, true);
  assert.equal(r.images[0].data, JPEG);
  assert.equal(r.images[0].media_type, 'image/jpeg');
});

check(`more than ${MAX_PHOTOS} photos -> 400 with a friendly limit message`, () => {
  const r = validatePhotos([jpg(), jpg(), jpg(), jpg()]);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(r.error, /up to 3 photos/);
});

check('non-array images -> 400', () => {
  const r = validatePhotos('abc');
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

check('GIF / HEIC / text media types -> 415', () => {
  for (const media_type of ['image/gif', 'image/heic', 'text/plain', '']) {
    const r = validatePhotos([{ media_type, data: GIF }]);
    assert.equal(r.ok, false, media_type);
    assert.equal(r.status, 415, media_type);
    assert.match(r.error, /JPEG, PNG or WebP/);
  }
});

check('declared JPEG but bytes are text -> 415 (magic-byte sniff)', () => {
  const r = validatePhotos([jpg(TEXT)]);
  assert.equal(r.ok, false);
  assert.equal(r.status, 415);
});

check('declared JPEG but bytes are PNG -> 415 (type mismatch)', () => {
  const r = validatePhotos([jpg(PNG)]);
  assert.equal(r.ok, false);
  assert.equal(r.status, 415);
});

check('broken base64 -> 400 naming the photo number', () => {
  const r = validatePhotos([jpg(), jpg('@@not*base64@@')]);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(r.error, /Photo 2/);
});

check('a single photo over the per-photo cap -> 413', () => {
  const big = pad([0xff, 0xd8, 0xff, 0xe0], MAX_PHOTO_BYTES + 10).toString('base64');
  const r = validatePhotos([jpg(big)]);
  assert.equal(r.ok, false);
  assert.equal(r.status, 413);
  assert.match(r.error, /too large/);
});

check('three photos each under the cap but too big together -> 413', () => {
  const each = pad([0xff, 0xd8, 0xff, 0xe0], 1_300_000).toString('base64');
  const r = validatePhotos([jpg(each), jpg(each), jpg(each)]);
  assert.equal(r.ok, false);
  assert.equal(r.status, 413);
  assert.match(r.error, /together/);
});

const turns = [
  { role: 'user', content: 'King Air, hazy paint' },
  { role: 'assistant', content: 'Single-stage or clearcoat?' },
  { role: 'user', content: '[Sent 2 photos] What is this on the wing?' },
];
const imgs = validatePhotos([jpg(), { media_type: 'image/png', data: PNG }]).images;

check('Anthropic payload: image blocks first, then text, on the LAST user turn only', () => {
  const out = withAnthropicPhotos(turns, imgs);
  assert.equal(out[0].content, 'King Air, hazy paint');
  assert.equal(out[1].content, 'Single-stage or clearcoat?');
  const c = out[2].content;
  assert.equal(c.length, 3);
  assert.deepEqual(c[0], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: JPEG } });
  assert.equal(c[1].source.media_type, 'image/png');
  assert.deepEqual(c[2], { type: 'text', text: '[Sent 2 photos] What is this on the wing?' });
  assert.equal(turns[2].content, '[Sent 2 photos] What is this on the wing?', 'input not mutated');
});

check('OpenAI payload: text then image_url data URLs on the last user turn', () => {
  const out = withOpenAIPhotos(turns, imgs);
  const c = out[2].content;
  assert.equal(c[0].type, 'text');
  assert.equal(c[1].type, 'image_url');
  assert.equal(c[1].image_url.url, `data:image/jpeg;base64,${JPEG}`);
  assert.equal(c[2].image_url.url.slice(0, 22), 'data:image/png;base64,');
});

check('no images -> messages passed through unchanged (text turns cost nothing extra)', () => {
  assert.equal(withAnthropicPhotos(turns, []), turns);
  assert.equal(withOpenAIPhotos(turns, []), turns);
});

check('token estimate: big phone photo is capped near ~1,600 tokens; small ones are cheaper', () => {
  const big = estimatePhotoTokens(4032, 3024);
  assert.ok(big <= 1600 && big > 1400, String(big));
  assert.ok(estimatePhotoTokens(800, 600) === 640);
  assert.equal(MAX_PHOTO_EDGE, 1568);
});

check('photo prompt: confidence, limits of a photo, better-shot request, non-aircraft refusal, rules still apply', () => {
  assert.match(PHOTO_PROMPT, /confident/);
  assert.match(PHOTO_PROMPT, /cannot prove/);
  assert.match(PHOTO_PROMPT, /single-stage vs clearcoat/);
  assert.match(PHOTO_PROMPT, /closer, well-lit/);
  assert.match(PHOTO_PROMPT, /isn't of an aircraft/);
  assert.match(PHOTO_PROMPT, /rules above still apply/);
  assert.doesNotMatch(PHOTO_PROMPT, /recipe/i);
  assert.doesNotMatch(PHOTO_PROMPT, /rupes/i);
});

check('output guard wording still applies to photo answers ("recipe" -> "method")', () => {
  assert.doesNotMatch(toMethodsWording('Use the swirl removal recipe here. Recipes vary.'), /recipe/i);
});

const route = fs.readFileSync(new URL('../app/api/detailing-ai/chat/route.js', import.meta.url), 'utf8');
check('route: validates photos, adds PHOTO_PROMPT only with photos, passes images to both providers', () => {
  assert.match(route, /validatePhotos\(body\.images\)/);
  assert.match(route, /code: 'PHOTO_INVALID'/);
  assert.match(route, /images\.length \? PHOTO_PROMPT : ''/);
  assert.match(route, /callAnthropic\(\{ system, messages, images \}\)/);
  assert.match(route, /callOpenAI\(\{ system, messages, images \}\)/);
  assert.match(route, /withAnthropicPhotos\(messages, images\)/);
  assert.match(route, /withOpenAIPhotos\(messages, images\)/);
});

check('route: per-account rate limits incl. separate photo budget; 429 RATE_LIMITED', () => {
  assert.match(route, /accountPhotosHourly/);
  assert.match(route, /accountPhotosDaily/);
  assert.match(route, /code: 'RATE_LIMITED'/);
});

check('route: output guard runs on every reply (Rupes, Compound Pro, methods wording)', () => {
  assert.match(route, /scrubRupes\(result\.reply\)/);
  assert.match(route, /scrubCompoundPro\(rupesSafe/);
  assert.match(route, /toMethodsWording\(compoundSafe\)/);
});

check('route: photos are never stored (no storage upload / insert of image data)', () => {
  assert.doesNotMatch(route, /\.storage\b/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.upload\(/);
});

const page = fs.readFileSync(new URL('../app/detailing-ai/page.jsx', import.meta.url), 'utf8');
check('page: phone resize (<=1568px, <=~1.15MP, JPEG) before upload; up to 3 photos', () => {
  assert.match(page, /MAX_EDGE = 1568/);
  assert.match(page, /MAX_PIXELS = 1_150_000/);
  assert.match(page, /image\/jpeg/);
  assert.match(page, /accept="image\/\*"/);
});

check('page: accessible controls (labelled add/remove buttons, live status, labelled textarea)', () => {
  assert.match(page, /`Add photo \(/);
  assert.match(page, /aria-label=\{`Remove photo/);
  assert.match(page, /role="status"/);
  assert.match(page, /aria-label="Message Detailing AI"/);
});

console.log(`\n${total - failed}/${total} passed`);
if (failed) process.exit(1);
