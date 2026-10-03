// FAQ import: extraction patterns, SSRF guards, review dedupe, sync diffs.
import assert from 'node:assert/strict';
import { extractFaqsFromHtml } from '../lib/faq-extract.js';
import { isPrivateIp, isBlockedHostname, checkUrl, safeFetchPage } from '../lib/safe-fetch.js';
import {
  normalizeImportUrl, parseUrlList, finalizePairs, markDuplicates, buildSnapshot, computeSyncDiff,
  mergePending, normalizeFaqSources, publicSources, syncDue, groundedIn, parseAiPairs, extractQaText, faqKey,
} from '../lib/faq-import.js';
import { normalizeFaqs } from '../lib/ai-chat.js';

let n = 0;
const t = async (name, fn) => { await fn(); n += 1; };
const page = (body, head = '') => `<!doctype html><html><head><title>FAQ</title>${head}</head><body><nav><a href="/">Home</a><button aria-controls="m">Menu?</button><div id="m">Services</div></nav><main>${body}</main></body></html>`;

await t('JSON-LD FAQPage (incl. @graph, HTML answers)', () => {
  const ld = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, { '@type': 'FAQPage', mainEntity: [
    { '@type': 'Question', name: 'Do you come to my hangar?', acceptedAnswer: { '@type': 'Answer', text: '<p>Yes, <strong>on-site</strong> at your FBO.</p>' } },
    { '@type': 'Question', name: 'Are you insured?', acceptedAnswer: [{ '@type': 'Answer', text: 'Yes &amp; we can send a COI.' }] },
  ] }] };
  const r = extractFaqsFromHtml(page('<h2>Other?</h2><p>ignored</p>', `<script type="application/ld+json">${JSON.stringify(ld)}</script>`));
  assert.equal(r.method, 'jsonld');
  assert.deepEqual(r.pairs.map((p) => p.question), ['Do you come to my hangar?', 'Are you insured?']);
  assert.equal(r.pairs[0].answer, 'Yes, on-site at your FBO.');
  assert.equal(r.pairs[1].answer, 'Yes & we can send a COI.');
});
await t('details/summary', () => {
  const r = extractFaqsFromHtml(page('<details><summary>How long does a wash take?</summary><p>Most take 2-4 hours.</p></details><details><summary>Do you work weekends?</summary><div>Yes, by appointment.</div></details>'));
  assert.equal(r.method, 'details');
  assert.equal(r.pairs.length, 2);
  assert.equal(r.pairs[0].answer, 'Most take 2-4 hours.');
});
await t('aria-controls accordion (nav menus ignored)', () => {
  const r = extractFaqsFromHtml(page('<div class="faq"><button aria-controls="a1" aria-expanded="false">What do you charge?</button><div id="a1" hidden aria-hidden="true"><p>It depends on size.</p></div><button aria-controls="a2">Where are you based?</button><div id="a2"><p>Van Nuys (KVNY).</p></div></div>'));
  assert.equal(r.method, 'accordion');
  assert.deepEqual(r.pairs, [{ question: 'What do you charge?', answer: 'It depends on size.' }, { question: 'Where are you based?', answer: 'Van Nuys (KVNY).' }]);
});
await t('class-name accordions (Elementor / Squarespace / Bootstrap 3)', () => {
  const el = extractFaqsFromHtml(page('<div class="elementor-accordion"><div class="elementor-accordion-item"><div class="elementor-tab-title"><a>Do you polish brightwork?</a></div><div class="elementor-tab-content"><p>Yes, by hand.</p></div></div><div class="elementor-accordion-item"><div class="elementor-tab-title"><a>Is it safe for paint?</a></div><div class="elementor-tab-content"><p>Yes.</p></div></div></div>'));
  assert.equal(el.pairs.length, 2); assert.equal(el.pairs[0].answer, 'Yes, by hand.');
  const sq = extractFaqsFromHtml(page('<ul class="accordion-items-container"><li class="accordion-item"><h4 class="accordion-item__title-wrapper"><span class="accordion-item__title">Do you do ceramic coatings?</span></h4><div class="accordion-item__description"><p>Yes, two-year coatings.</p></div></li></ul>'));
  assert.equal(sq.pairs[0]?.answer, 'Yes, two-year coatings.');
  const bs = extractFaqsFromHtml(page('<div class="panel"><div class="panel-heading"><h4 class="panel-title">Can I be there?</h4></div><div class="panel-collapse collapse"><div class="panel-body">Sure.</div></div></div><div class="panel"><div class="panel-heading"><h4 class="panel-title">Do you travel?</h4></div><div class="panel-collapse collapse"><div class="panel-body">Within 200 nm.</div></div></div>'));
  assert.deepEqual(bs.pairs.map((p) => p.answer), ['Sure.', 'Within 200 nm.']);
});
await t('headings + paragraphs, bold-line questions, dl', () => {
  const h = extractFaqsFromHtml(page('<h1>FAQ</h1><h3>What aircraft do you detail?</h3><p>Pistons to heavy jets.</p><p>Helicopters too.</p><h3>How do I book?</h3><p>Request a quote.</p><h2>Contact</h2><p>Call us</p>'));
  assert.equal(h.method, 'headings');
  assert.deepEqual(h.pairs, [{ question: 'What aircraft do you detail?', answer: 'Pistons to heavy jets.\nHelicopters too.' }, { question: 'How do I book?', answer: 'Request a quote.' }]);
  const b = extractFaqsFromHtml(page('<p><strong>Do you offer gift cards?</strong></p><p>No, sorry.</p><p><strong>Do you wax?</strong> Yes, on request.</p>'));
  assert.deepEqual(b.pairs.map((p) => p.answer), ['No, sorry.', 'Yes, on request.']);
  const dl = extractFaqsFromHtml(page('<dl><dt>Do you clean props?</dt><dd>Yes.</dd><dt>Do you clean wheels?</dt><dd>Yes, and brakes.</dd></dl>'));
  assert.equal(dl.pairs.length, 2);
});
await t('Q:/A: text; no FAQs -> text for AI fallback', () => {
  assert.deepEqual(extractQaText('Q: Are you open Sunday?\nA: No.\nQ: Do you fly in?\nA: Yes.'), [{ question: 'Are you open Sunday?', answer: 'No.' }, { question: 'Do you fly in?', answer: 'Yes.' }]);
  const r = extractFaqsFromHtml(page('<p>We are a family business detailing aircraft since 1999.</p><script>var x="Is this hidden?"</script>'));
  assert.equal(r.pairs.length, 0);
  assert.match(r.text, /family business/);
  assert.doesNotMatch(r.text, /hidden/);
});
await t('finalizePairs cleans, de-dupes, drops empties', () => {
  const p = finalizePairs([{ question: ' 1. Do you  wash? ', answer: 'A: Yes ' }, { question: 'do you wash', answer: 'dup' }, { question: 'Q?', answer: 'too short q' }, { question: 'No answer?', answer: '' }]);
  assert.deepEqual(p, [{ question: 'Do you wash?', answer: 'Yes' }]);
});
await t('AI pairs must be grounded in the page text', () => {
  const text = 'Frequently asked questions. Do you work at night? Yes, we offer overnight details at no extra charge. Where are you based? Van Nuys airport.';
  const raw = 'Here you go: [{"question":"Do you work at night?","answer":"Yes, we offer overnight details at no extra charge."},{"question":"Where are you based?","answer":"Van Nuys airport, and we also cover Burbank and LAX for free."},{"question":"What does a wash cost?","answer":"$500 for a light jet."}]';
  const pairs = parseAiPairs(raw, text);
  assert.deepEqual(pairs.map((p) => p.question), ['Do you work at night?']);
  assert.equal(groundedIn(text, 'overnight details at no extra charge'), true);
  assert.equal(groundedIn(text, 'details at night cost extra'), false);
  assert.deepEqual(parseAiPairs('not json', text), []);
});
await t('URL normalizing', () => {
  assert.equal(normalizeImportUrl('acmejets.com/faq#top'), 'https://acmejets.com/faq');
  assert.equal(normalizeImportUrl('javascript:alert(1)'), '');
  assert.equal(normalizeImportUrl('file:///etc/passwd'), '');
  assert.equal(normalizeImportUrl('http://user:pw@acme.com'), '');
  const l = parseUrlList('a.com/faq\nb.com/faq, a.com/faq c.com d.com e.com f.com');
  assert.equal(l.urls.length, 5); assert.equal(l.tooMany, true);
});
await t('SSRF: private / reserved addresses', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00:ec2::254', '::ffff:127.0.0.1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1', '2002:7f00:1::1', 'garbage']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111']) assert.equal(isPrivateIp(ip), false, ip);
  for (const h of ['localhost', 'foo.localhost', 'metadata.google.internal', 'printer.local', 'intranet', 'x.internal']) assert.equal(isBlockedHostname(h), true, h);
  assert.equal(isBlockedHostname('acmejets.com'), false);
  for (const u of ['http://127.0.0.1/', 'http://[::1]/', 'http://2130706433/', 'http://0x7f.1/', 'http://169.254.169.254/latest/', 'https://acme.com:8443/', 'ftp://acme.com/', 'gopher://acme.com/', 'http://u:p@acme.com/']) assert.throws(() => checkUrl(u), undefined, u);
  assert.equal(checkUrl('https://acme.com/faq').hostname, 'acme.com');
});
await t('SSRF: safeFetchPage refuses before connecting', async () => {
  for (const u of ['http://127.0.0.1:3000/', 'http://localhost/', 'http://169.254.169.254/latest/meta-data/', 'http://[::ffff:127.0.0.1]/', 'file:///etc/passwd']) {
    const r = await safeFetchPage(u, { timeoutMs: 2000 });
    assert.equal(r.ok, false, u); assert.ok(['blocked', 'invalid'].includes(r.code), `${u} ${r.code}`);
  }
});
await t('review: duplicates against saved FAQs and within the batch', () => {
  const out = markDuplicates([{ question: 'Are you insured?', answer: 'x' }, { question: 'Do you come to my hangar or FBO?', answer: 'y' }, { question: 'What is ceramic coating?', answer: 'z' }, { question: 'what is ceramic coating', answer: 'z2' }],
    [{ question: 'ARE YOU INSURED', answer: 'old' }, { question: 'Do you come to my hangar or FBO', answer: 'old' }]);
  assert.deepEqual(out.map((p) => !!p.duplicateOf), [true, true, false, true]);
});
await t('sync: diff + merge never loses unreviewed items', () => {
  const v1 = [{ question: 'A?', answer: 'one' }, { question: 'Bee?', answer: 'two' }, { question: 'Cee?', answer: 'three' }];
  const snap = buildSnapshot(v1);
  const v2 = [{ question: 'A?', answer: 'one' }, { question: 'Bee?', answer: 'two, updated' }, { question: 'Dee?', answer: 'four' }];
  const items = computeSyncDiff(snap, v2);
  assert.deepEqual(items.map((i) => `${i.type}:${i.question}`).sort(), ['added:Dee?', 'changed:Bee?', 'removed:Cee?']);
  assert.equal(computeSyncDiff(buildSnapshot(v2), v2).length, 0);
  const merged = mergePending([{ type: 'added', key: faqKey('Zed?'), question: 'Zed?', answer: 'z' }], items);
  assert.equal(merged.length, 4);
  const src = normalizeFaqSources([{ url: 'acme.com/faq', keep_in_sync: true, snapshot: snap, pending: merged }, { url: 'acme.com/faq' }, { url: 'javascript:x' }]);
  assert.equal(src.length, 1); assert.equal(src[0].url, 'https://acme.com/faq');
  assert.equal('snapshot' in publicSources(src)[0], false);
  assert.equal(syncDue({ keep_in_sync: true, last_checked_at: new Date().toISOString() }), false);
  assert.equal(syncDue({ keep_in_sync: true, last_checked_at: new Date(Date.now() - 8 * 864e5).toISOString() }), true);
  assert.equal(syncDue({ keep_in_sync: false }), false);
});
await t('saved FAQs keep a valid source_url only', () => {
  const f = normalizeFaqs([{ question: 'Q one?', answer: 'A', source_url: 'https://acme.com/faq#x' }, { question: 'Q two?', answer: 'B', source_url: 'javascript:alert(1)' }]);
  assert.equal(f[0].source_url, 'https://acme.com/faq'); assert.equal('source_url' in f[1], false);
});
console.log(`faq-import: ${n} checks passed`);
