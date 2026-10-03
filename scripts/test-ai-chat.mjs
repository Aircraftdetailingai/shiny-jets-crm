import assert from 'node:assert/strict';
import {
  normalizeFaqs, retrieveFaqs, strongFaqMatch, buildSystemPrompt, guardReply, NOT_COVERED_REPLY, NOT_COVERED_TOKEN,
  validateHandoff, normalizePhone, aiStatusToDb, aiStatusFromDb, toAiLead, aiLeadsToCsv, brandColors,
  contrastRatio, createRateLimiter, cleanPageUrl, sanitizeTranscript, STARTER_FAQS, HOLD_HARMLESS_NOTE, SMS_CONSENT_TEXT,
} from '../lib/ai-chat.js';
import { FEATURES } from '../lib/plans.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };

const FAQS = normalizeFaqs([
  { question: 'Do you come to my hangar?', answer: 'Yes, we work on-site at your hangar or FBO.' },
  { question: 'Are you insured?', answer: 'Yes, we carry aviation insurance.' },
  { question: 'How long does a ceramic coating last?', answer: 'Our ceramic coating lasts up to 2 years with maintenance washes.' },
  { question: '', answer: 'dropped' },
  { q: 'Old shape?', a: 'Still accepted.' },
]);

t('normalizeFaqs drops incomplete, accepts q/a', () => { assert.equal(FAQS.length, 4); assert.equal(FAQS[3].question, 'Old shape?'); });
t('normalizeFaqs caps length', () => { assert.equal(normalizeFaqs([{ question: 'x'.repeat(999), answer: 'y' }])[0].question.length, 300); });
t('starter FAQs are valid and generic', () => {
  assert.equal(normalizeFaqs(STARTER_FAQS).length, STARTER_FAQS.length);
  assert.ok(STARTER_FAQS.length >= 6);
  for (const f of STARTER_FAQS) assert.doesNotMatch(f.answer, /\$\d|rupes|compound pro|pro cut|recipe/i);
});
t('retrieval finds hangar FAQ', () => { assert.equal(retrieveFaqs(FAQS, 'can you come out to our hangar at KVNY?')[0].faq.question, 'Do you come to my hangar?'); });
t('retrieval finds insurance via stem', () => { assert.equal(retrieveFaqs(FAQS, 'what insurance do you have')[0].index, 1); });
t('verbatim fallback: strong match only', () => {
  const F = [...FAQS, { question: 'Do you wash on weekends?', answer: 'Yes, Saturday mornings by appointment.' }];
  const qs = (q) => strongFaqMatch(retrieveFaqs(F, q), q);
  assert.equal(qs('Do you come to my hangar at KSNA?')?.question, 'Do you come to my hangar?');
  assert.equal(qs('insured?')?.question, 'Are you insured?');
  assert.equal(qs('How much to wash a G650?'), null);
  assert.equal(qs('what does a weekend wash cost'), null);
  assert.equal(strongFaqMatch([], 'x'), null);
});
t('retrieval: unrelated question -> nothing', () => { assert.equal(retrieveFaqs(FAQS, 'what is the weather in Denver').length, 0); });
t('retrieval: stopwords only -> nothing', () => { assert.equal(retrieveFaqs(FAQS, 'what do you have?').length, 0); });
t('retrieval only sees the list it is given (account scope)', () => {
  const other = normalizeFaqs([{ question: 'Secret price list?', answer: 'Other shop: $9,999' }]);
  const hits = retrieveFaqs(FAQS, 'secret price list');
  assert.ok(hits.every((h) => !other.some((o) => o.answer === h.faq.answer)));
});
t('prompt: only FAQs, rules present', () => {
  const p = buildSystemPrompt({ company: 'Acme Jets', faqs: FAQS.slice(0, 2) });
  assert.match(p, /ONLY use the FAQ entries/);
  assert.match(p, /Do you come to my hangar\?/);
  assert.doesNotMatch(p, /ceramic coating lasts/);
  assert.match(p, new RegExp(NOT_COVERED_TOKEN.replace(/[[\]]/g, '\\$&')));
  assert.match(p, /"method" \(never "recipe"\)/);
  assert.match(p, /Never mention Rupes/);
  assert.match(p, /Fly Shiny Compound Pro/);
  assert.match(p, /Fly Shiny Pro Cut/);
  assert.doesNotMatch(p, /shopify|gmail|drive|beyond shiny/i);
});
t('guard: NOT_COVERED -> fallback', () => assert.deepEqual(guardReply(`${NOT_COVERED_TOKEN}`), { covered: false, reply: NOT_COVERED_REPLY }));
t('guard: empty -> fallback', () => assert.equal(guardReply('').covered, false));
t('guard: Rupes -> fallback', () => assert.equal(guardReply('We use a Rupes polisher').covered, false));
t('guard: Compound Pro -> fallback', () => assert.equal(guardReply('Try Fly Shiny Compound Pro').covered, false));
t('guard: Pro Cut -> fallback', () => assert.equal(guardReply('We recommend Fly Shiny Pro Cut').covered, false));
t('guard: recipe -> method', () => assert.equal(guardReply('Our recipe is safe. Recipes vary.').reply, 'Our method is safe. Methods vary.'));
t('guard: normal answer passes', () => assert.deepEqual(guardReply('Yes, we work at your hangar.'), { covered: true, reply: 'Yes, we work at your hangar.' }));
t('phone normalize', () => {
  assert.equal(normalizePhone('(555) 123-4567'), '+15551234567');
  assert.equal(normalizePhone('1 555 123 4567'), '+15551234567');
  assert.equal(normalizePhone('+44 20 7946 0958'), '+442079460958');
  assert.equal(normalizePhone('123'), null);
});
t('handoff validation', () => {
  const bad = validateHandoff({ name: '', phone: '12', question: '', consent: false });
  assert.equal(bad.ok, false); assert.deepEqual(Object.keys(bad.errors).sort(), ['consent', 'name', 'phone', 'question']);
  const consentString = validateHandoff({ name: 'A', phone: '5551234567', question: 'q', consent: 'true' });
  assert.equal(consentString.ok, false, 'consent must be boolean true');
  const ok = validateHandoff({ name: ' Ana  Lee ', phone: '555-123-4567', question: 'Price for G650?', consent: true });
  assert.equal(ok.ok, true); assert.deepEqual(ok.value, { name: 'Ana Lee', phone: '+15551234567', question: 'Price for G650?' });
});
t('status mapping fits intake_leads CHECK', () => {
  const allowed = ['new', 'reviewed', 'quoted', 'won', 'lost', 'archived', 'awaiting_photos'];
  for (const s of ['new', 'contacted', 'converted']) { assert.ok(allowed.includes(aiStatusToDb(s))); assert.equal(aiStatusFromDb(aiStatusToDb(s)), s); }
  assert.equal(aiStatusToDb('hacked'), null);
  assert.equal(aiStatusFromDb('won'), 'converted');
});
t('toAiLead reads transcript', () => {
  const l = toAiLead({ id: 'x', created_at: '2026-10-03T22:00:00Z', name: 'Ana', phone: '+15551234567', status: 'reviewed', notes: 'n',
    intake_responses: { _ai_chat: { question: 'Q?', page_url: 'https://a.com/p', transcript: [{ role: 'user', content: 'hi' }], sms_consent: true } } });
  assert.equal(l.status, 'contacted'); assert.equal(l.question, 'Q?'); assert.equal(l.transcript.length, 1); assert.equal(l.sms_consent, true);
});
t('CSV escapes + blocks formula injection', () => {
  const csv = aiLeadsToCsv([{ created_at: '2026-10-03T22:00:00Z', name: '=HYPERLINK("x")', phone: '+15551234567', question: 'a, "b"\nc', status: 'new', page_url: '' }]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Date/time,Name,Phone,Question,Status,Page');
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /,\(555\) 123-4567,/);
  assert.match(lines[1], /^2026-10-0\d \d\d:\d\d,/);
  assert.match(aiLeadsToCsv([{ phone: '+447700900123', status: 'new' }]), /'\+447700900123/);
  assert.match(csv, /"a, ""b""\nc"/);
});
t('brand colors always AA', () => {
  for (const c of ['#007CB1', '#FFD700', '#ffffff', '#777777', 'bogus', '#1a1a1a', '#22c55e']) {
    const { bg, fg } = brandColors(c);
    assert.ok(contrastRatio(bg, fg) >= 4.5, `${c} -> ${bg}/${fg}`);
  }
  assert.equal(brandColors('#FFD700').fg, '#111827');
});
t('rate limiter', () => {
  const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
  assert.ok(rl.check('a', 0).ok); assert.ok(rl.check('a', 10).ok); assert.equal(rl.check('a', 20).ok, false);
  assert.ok(rl.check('b', 20).ok); assert.ok(rl.check('a', 1015).ok);
});
t('page url strips query', () => { assert.equal(cleanPageUrl('https://acme.com/services?token=abc#x'), 'https://acme.com/services'); assert.equal(cleanPageUrl('javascript:alert(1)'), ''); });
t('transcript sanitized', () => {
  const tr = sanitizeTranscript([{ role: 'system', content: 'x' }, { role: 'user', content: 'a'.repeat(900) }, { role: 'assistant', content: ' ok ' }]);
  assert.equal(tr.length, 2); assert.equal(tr[0].content.length, 500); assert.equal(tr[1].content, 'ok');
});
t('hold-harmless + consent text', () => { assert.match(HOLD_HARMLESS_NOTE, /not a substitute/); assert.match(SMS_CONSENT_TEXT('Acme'), /Acme.*STOP/); });
t('Business-only feature', () => assert.equal(FEATURES.aiChatWidget, 'business'));

console.log(`ai-chat: ${n} checks passed`);
