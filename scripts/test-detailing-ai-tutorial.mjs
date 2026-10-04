/**
 * Detailing AI first-run tutorial + "Ask a Shiny Jets expert" button.
 * Usage: node --import ./scripts/test-support/register.mjs scripts/test-detailing-ai-tutorial.mjs
 */
import fs from 'fs';
import assert from 'assert/strict';
import { TUTORIAL_SLIDES, TUTORIAL_STORAGE_KEY, ASK_EXPERT_LABEL, PRIVACY_TITLE, PRIVACY_BODY } from '../lib/detailing-ai-tutorial.js';
import { askExpertSummary, askExpertRawReply, parseEscalateBlock, ESCALATION_SENTENCE, ASK_EXPERT_BUTTON_TEXT } from '../lib/ask-brett.js';

const tests = [];
const check = (name, fn) => tests.push([name, fn]);
const all = (s) => [s.title, s.lead, ...s.points].join('\n');
const byId = (id) => TUTORIAL_SLIDES.find((s) => s.id === id);

check('6 short slides, each with an icon, title and lead (points on all but the privacy slide)', () => {
  assert.deepEqual(TUTORIAL_SLIDES.map((s) => s.id), ['welcome', 'private', 'ask', 'photos', 'organize', 'stuck']);
  for (const s of TUTORIAL_SLIDES) assert.ok(s.id && s.icon && s.title && s.lead && Array.isArray(s.points) && (s.id === 'private' || s.points.length >= 2), s.id);
});

check('privacy slide: exact approved wording, second slide, no "train"', () => {
  const p = byId('private');
  assert.equal(TUTORIAL_SLIDES[1], p);
  assert.equal(p.title, PRIVACY_TITLE);
  assert.equal(p.lead, PRIVACY_BODY);
  assert.equal(`${p.title} ${p.lead}`.replace(/\u2019/g, "'"), "Your shop stays private. The AI isn't crowd-sourced. Your questions, prices and customer info stay in your account and are never shared with other shops.");
  assert.ok(!/train/i.test(all(p)));
  const c = fs.readFileSync('components/DetailingAiTutorial.jsx', 'utf8');
  assert.match(c, /\{slide\.points\?\.length > 0 && \(/, 'no empty list for a slide without points');
  assert.match(c, /\{slide\.icon \|\| /);
});

check('slide content covers Brett\'s points', () => {
  const [welcome, ask, photos, organize, stuck] = ['welcome', 'ask', 'photos', 'organize', 'stuck'].map((id) => all(byId(id)));
  for (const w of ['skills', 'labor and time', 'great results']) assert.ok(welcome.includes(w), w);
  for (const w of ['Aircraft type', 'leading edge', 'belly', 'brightwork', 'paint', 'bare aluminum', 'chrome', 'What you see', 'tried', 'products, pad, machine', 'goal']) assert.ok(ask.includes(w), w);
  for (const w of ['shade', 'angle', 'swirl light or flashlight', 'white paint', 'close-up', 'wider shot', 'Wipe the area clean']) assert.ok(photos.includes(w), w);
  for (const w of ['new chat', 'aircraft or problem', 'project', 'notes', 'fresh chat', 'summary']) assert.ok(organize.includes(w), w);
  assert.ok(stuck.includes(ASK_EXPERT_LABEL) && stuck.includes('$4.99 for one question answered by a Shiny Jets expert') && stuck.includes('new payment') && stuck.includes('for free'));
});

check('says "methods", never "recipes"', () => {
  const text = TUTORIAL_SLIDES.map(all).join('\n') + fs.readFileSync('components/DetailingAiTutorial.jsx', 'utf8');
  assert.ok(!/recipe/i.test(text));
  assert.ok(/methods/.test(TUTORIAL_SLIDES.map(all).join('\n')));
});

check('page: first run opens once (storage key), ? button reopens, expert button label matches slide', () => {
  const page = fs.readFileSync('app/detailing-ai/page.jsx', 'utf8');
  assert.equal(TUTORIAL_STORAGE_KEY, 'detailing_ai_tutorial_v1');
  assert.match(page, /localStorage\.getItem\(TUTORIAL_STORAGE_KEY\)/);
  assert.match(page, /localStorage\.setItem\(TUTORIAL_STORAGE_KEY, 'done'\)/);
  assert.equal((page.match(/aria-label="How to use Detailing AI"/g) || []).length, 2, 'phone + desktop ? buttons');
  assert.match(page, /\{ASK_EXPERT_LABEL\}/);
  assert.equal(ASK_EXPERT_LABEL, ASK_EXPERT_BUTTON_TEXT);
});

check('dialog a11y: modal, labelled, Skip, Escape, focus trap, 44px+ buttons, 24px dots, reduced motion', () => {
  const c = fs.readFileSync('components/DetailingAiTutorial.jsx', 'utf8');
  for (const s of ['role="dialog"', 'aria-modal="true"', 'aria-labelledby="dai-tutorial-title"', ">\n            Skip", "e.key === 'Escape'", "e.key === 'Tab'", 'ArrowRight', 'ArrowLeft', 'onPointerUp', 'aria-live="polite"', 'h-6 w-6', 'h-12', 'motion-reduce:', 'motion-safe:', "aria-current={i === index ? 'step' : undefined}"]) assert.ok(c.includes(s), s);
});

check('ask expert: summary is the latest real question (not the button text), photo-only fallback', () => {
  const msgs = [
    { role: 'user', content: 'Haze on a white Falcon 900 after a DA pass, swirls or something else?' },
    { role: 'assistant', content: 'Probably light marring…' },
    { role: 'user', content: ASK_EXPERT_BUTTON_TEXT },
  ];
  assert.equal(askExpertSummary(msgs), 'Haze on a white Falcon 900 after a DA pass, swirls or something else?');
  assert.equal(askExpertSummary([{ role: 'user', content: '[Sent 2 photos]\nAsk a Shiny Jets expert' }]), 'Photo question (see the attached photos)');
  assert.equal(askExpertSummary([{ role: 'user', content: '[Sent 1 photo]\nIs this oxidation?' }]), 'Is this oxidation?');
});

check('ask expert: reply has the exact sentence and parses as a user_asked escalation', () => {
  const parsed = parseEscalateBlock(askExpertRawReply([{ role: 'user', content: 'Chrome pitting on a King Air prop spinner?' }]));
  assert.equal(parsed.reply, ESCALATION_SENTENCE);
  assert.deepEqual(parsed.escalate, { reason: 'user_asked', summary: 'Chrome pitting on a King Air prop spinner?' });
});

check('chat route: the old free ask_expert path is gone (button is paid via /api/detailing-ai/ask-expert)', () => {
  const src = fs.readFileSync('app/api/detailing-ai/chat/route.js', 'utf8');
  assert.match(src, /if \(body\.ask_expert === true\) \{\s*return Response\.json\(\{[^}]*code: 'ASK_EXPERT_PAID'/);
  assert.ok(!/askExpertRawReply\(/.test(src));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`PASS ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n  ${err.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
