/**
 * Brett-approved paint-correction method (Oct 3 2026): work small sections.
 * Usage: node --import ./scripts/test-support/register.mjs scripts/test-detailing-ai-small-sections.mjs
 */
import fs from 'fs';
import assert from 'assert/strict';
import path from 'path';
import { loadKnowledgeStub } from '../lib/detailing-ai-knowledge.js';
import { buildAllRows, DEFAULT_PRIVATE_DIR } from './lib/private-knowledge-build.mjs';

let failed = 0;
let total = 0;
const tests = [];
const check = (name, fn) => tests.push([name, fn]);
// The method text lives in the server-only private_knowledge store (this repo is public),
// seeded from the private folder outside the repo. Checks that need it skip when it's absent.
const FILE = path.join(DEFAULT_PRIVATE_DIR, 'recipes', 'shop-methods-paint-correction-small-sections.md');
const HAS_PRIVATE = fs.existsSync(FILE);
const PRIVATE_ROWS = HAS_PRIVATE ? buildAllRows(DEFAULT_PRIVATE_DIR, { only: 'recipes' }) : [];
const BRANDS = /rupes|flex|griot|meguiar|chemical guys|lake country|menzerna|fly shiny|koch|sonax|3m|porter|makita|dewalt|milwaukee/i;

check('no public copy of the method in the repo', () => {
  assert.ok(!fs.existsSync('knowledge/detailing/shop-methods-paint-correction-small-sections.md'));
});

if (HAS_PRIVATE) check('private method file has the method: 16 x 16 in, 45 s to a minute, wipe/clean pad/reapply, arm speed, stalling DA', () => {
  const t = fs.readFileSync(FILE, 'utf8');
  for (const s of ['16 x 16 inch', 'microfiber towel', '45 seconds to a minute', 'clean the pad', 'reapply', 'Slow down your arm speed', 'losing rotation', 'adjust the pad angle', 'Current Shiny Jets method, Brett-approved', 'turns black', 'let it dry', 'polish it off with the random orbital', 'coral fleece bonnets', 'cotton velour bonnet']) assert.ok(t.includes(s), s);
  assert.ok(!BRANDS.test(t), 'no brand names');
  assert.ok(!/recipe/i.test(t), 'methods wording');
});

check('chat prompt: bring it up when correction results are missing, no brands', () => {
  const src = fs.readFileSync('app/api/detailing-ai/chat/route.js', 'utf8');
  const rule = src.split('\n').find((l) => l.includes('Not getting correction results'));
  assert.ok(rule, 'rule present');
  for (const s of ['16 x 16 inch', '45 seconds to a minute', 'clean the pad', 'slow down the arm speed', 'losing rotation', 'turns black', 'let it dry', 'random orbital', 'coral fleece bonnets', 'cotton velour bonnet', "Don't name brands"]) assert.ok(rule.includes(s), s);
  assert.ok(!BRANDS.test(rule.replace("Don't name brands for this tip.", '')));
});

for (const q of [
  "I'm not getting any correction results, swirls are still there after polishing",
  'Polishing the fuselage takes forever and the oxidation is not coming out',
  'my DA keeps stalling and the paint correction is not working',
]) {
  if (HAS_PRIVATE) check(`retrieval: "${q.slice(0, 50)}…" gets the small-section method`, async () => {
    const out = await loadKnowledgeStub(q, { privateRows: PRIVATE_ROWS });
    assert.match(out, /shop-methods\/shop-methods-paint-correction-small-sections/);
    assert.match(out, /16 x 16 inch/);
  });
}

if (!HAS_PRIVATE) console.log(`SKIP private-file + retrieval checks (no ${FILE})`);
for (const [name, fn] of tests) {
  total += 1;
  try { await fn(); console.log(`PASS ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n  ${err.message}`); }
}
console.log(`\n${total - failed}/${total} passed`);
if (failed) process.exit(1);
