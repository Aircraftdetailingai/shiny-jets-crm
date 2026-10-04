/**
 * Brand rules (Brett, Oct 3 2026) for Detailing AI, the website chat bubble and the knowledge loader.
 * Usage: node --import ./scripts/test-support/register.mjs scripts/test-detailing-ai-brand-rules.mjs
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert/strict';
import {
  applyBrandRules, scrubBannedBrands, scrubNotRecommended, mentionsBannedBrand, mentionsNotRecommended,
  NOT_RECOMMENDED_LINE, scrubRupes, userAskedAboutRupes,
} from '../lib/detailing-ai-messages.js';
import { guardReply } from '../lib/ai-chat.js';
import { loadKnowledgeStub } from '../lib/detailing-ai-knowledge.js';

const tests = [];
const check = (name, fn) => tests.push([name, fn]);
const BANNED = ['Sky Glide', 'SkyGlide', 'sky-glide', 'University Detailers', 'University of Detailers', 'UDetailers', 'U-Detailers', 'udetailers.com'];
const NOT_REC = ['Sparrowhawk', 'Sparrow Hawk', 'SparrowHawk', 'Aviation Detailing Association'];
const user = (content) => [{ role: 'user', content }];

check('detects every banned spelling; leaves normal text alone', () => {
  for (const b of BANNED) assert.ok(mentionsBannedBrand(`Try ${b} for this.`), b);
  for (const n of NOT_REC) assert.ok(mentionsNotRecommended(`Look at ${n}.`), n);
  for (const ok of ['Use a university-grade towel.', 'Detailers often skip this.', 'Fly Shiny Wash', 'Glide the pad slowly across the sky-blue stripe.', 'Hawkers and Sparrows']) {
    assert.ok(!mentionsBannedBrand(ok) && !mentionsNotRecommended(ok), ok);
  }
});

check('banned brands are always removed (sentence level), even when the user asked', () => {
  const reply = 'Start with Fly Shiny Wash. Sky Glide also works on paint. Finish with a Lake Country pad.\n- UDetailers has a course on this.\n- Use clean microfiber.';
  for (const msgs of [user('What wash should I use?'), user('Is Sky Glide any good? What about UDetailers?')]) {
    const out = applyBrandRules(reply, msgs);
    assert.ok(!mentionsBannedBrand(out), out);
    assert.match(out, /Fly Shiny Wash/);
    assert.match(out, /Lake Country pad/);
    assert.match(out, /- Use clean microfiber\./);
  }
});

check('not-recommended options: dropped when not asked; neutral line when asked', () => {
  const unasked = applyBrandRules('Use Nuvite on the brightwork. You could also join the Aviation Detailing Association.', user('How do I polish brightwork?'));
  assert.equal(unasked, 'Use Nuvite on the brightwork.');
  const asked = applyBrandRules('Sparrowhawk is a detailing franchise. Shiny Jets training covers starting a business.', user('Should I buy a Sparrowhawk franchise?'));
  assert.ok(asked.startsWith(NOT_RECOMMENDED_LINE), asked);
  assert.match(NOT_RECOMMENDED_LINE, /Shiny Jets doesn't recommend that option based on our experience/);
  assert.match(NOT_RECOMMENDED_LINE, /Shiny Jets training/);
  const already = applyBrandRules("Shiny Jets doesn't recommend that option based on our experience. Shiny Jets training is a better fit.", user('What about the Aviation Detailing Association?'));
  assert.equal((already.match(/doesn't recommend that option/g) || []).length, 1);
});

check('a reply that is only a banned mention falls back to the neutral line (never empty)', () => {
  assert.equal(applyBrandRules('Sky Glide.', user('sky glide?')), NOT_RECOMMENDED_LINE);
});

check('Rupes exception unchanged: scrubbed unless asked directly', () => {
  assert.ok(!/rupes/i.test(scrubRupes('Use a Rupes Bigfoot LHR15 with a pad.')));
  assert.ok(userAskedAboutRupes(user('What do you think of Rupes?')));
});

check('preferred brands pass through untouched', () => {
  const text = 'Fly Shiny first. Flex power tools, Milwaukee rotary polishers, Lake Country pads, Arrow creepers, Nuvite, Jet Stream, Perma Guard and Real Clean are all fine.';
  assert.equal(applyBrandRules(text, user('what tools?')), text);
});

check('Detailing AI prompt: banned, preferred (Fly Shiny star) and not-recommended rules', () => {
  const src = fs.readFileSync('app/api/detailing-ai/chat/route.js', 'utf8');
  const prompt = (src.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/) || [])[1];
  for (const s of ['Sky Glide products, University Detailers / UDetailers and their course', 'Fly Shiny is always the star brand', 'Flex power tools, Milwaukee rotary polishers, Lake Country pads, Arrow creepers, Nuvite, Jet Stream, Perma Guard, Real Clean', 'good franchise opportunity', 'the Sparrowhawk franchise and the Aviation Detailing Association', "Shiny Jets doesn't recommend that option based on our experience", 'No insults and no claims about them', 'Rupes (the brand and every Rupes product', 'Compound Pro']) assert.ok(prompt.includes(s), s);
  assert.match(src, /applyBrandRules\(compoundSafe, messages\)/);
  assert.match(src, /svc\.name = scrubNotRecommended\(scrubBannedBrands\(scrubRupes\(svc\.name\)\)\)/);
});

check('website chat bubble: prompt names them and the guard refuses any mention', () => {
  for (const b of [...BANNED, ...NOT_REC, 'Rupes']) assert.equal(guardReply(`We use ${b} products.`).covered, false, b);
  assert.equal(guardReply('We detail King Airs and Citations.').covered, true);
  assert.match(fs.readFileSync('lib/ai-chat.js', 'utf8'), /Never mention Sky Glide, University Detailers \/ UDetailers \(or their course\), the Sparrowhawk franchise or the Aviation Detailing Association\./);
});

check('quote widget chat bubble applies the brand rules to its replies', () => {
  const src = fs.readFileSync('app/api/widget/chat/route.js', 'utf8');
  assert.match(src, /scrubCompoundPro\(scrubRupes\(applyBrandRules\(rawReply, conversationMessages\)\), 'compound'\)/);
});

check('knowledge loader scrubs banned + not-recommended names from excerpts (public and private rows)', async () => {
  const rows = [{ id: 1, slug: 'shop-recipes-test-wash', source: 'recipes', title: 'Wash method', section: null, keywords: ['wash', 'fuselage'], content: '# Wash method\nWash the fuselage with Fly Shiny Wash. Some shops use Sky Glide here. UDetailers teaches a different wash.\nSparrowhawk crews do it differently. Rinse top down.' }];
  const out = await loadKnowledgeStub('fuselage wash method', { privateRows: rows });
  assert.match(out, /Fly Shiny Wash/);
  assert.match(out, /Rinse top down/);
  assert.ok(!mentionsBannedBrand(out) && !mentionsNotRecommended(out), out);
});

check('repo + private source knowledge have no banned / not-recommended names', () => {
  const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
  const files = [...walk('knowledge'), ...walk(process.env.PRIVATE_KNOWLEDGE_DIR || '/home/box/private-knowledge')].filter((f) => /\.(md|txt|json)$/.test(f));
  const hits = files.filter((f) => { const t = fs.readFileSync(f, 'utf8'); return mentionsBannedBrand(t) || mentionsNotRecommended(t) || /\brupes\b/i.test(t); });
  assert.deepEqual(hits, []);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`PASS ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n  ${err.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
