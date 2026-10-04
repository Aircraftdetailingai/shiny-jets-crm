/**
 * Brett-approved knowledge (Oct 3 2026): King Air spinners, de-ice boots, source priority, wool carpet.
 * Usage: node --import ./scripts/test-support/register.mjs scripts/test-detailing-ai-brett-oct3.mjs
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert/strict';
import { loadKnowledge, loadKnowledgeStub } from '../lib/detailing-ai-knowledge.js';
import { applyBrandRules, fixBrandSpelling, mentionsBannedBrand, scrubBannedBrands } from '../lib/detailing-ai-messages.js';
import { promptLeakSource } from '../lib/detailing-ai-guard.js';

const tests = [];
const check = (name, fn) => tests.push([name, fn]);
const SRC = fs.readFileSync('app/api/detailing-ai/chat/route.js', 'utf8');
const PROMPT = SRC.slice(SRC.indexOf('const SYSTEM_PROMPT'), SRC.indexOf('const FLAGGED_TURN_NOTE'));
const joined = PROMPT.replace(/" "/g, ' ');
const KA = 'On a Beechcraft King Air, the only bare (polished) aluminum is the two propeller spinners. Nothing else on a King Air is bare aluminum, including the cowlings. Treat everything else as painted.';
const BOOTS = "Full system (SOP-07, newest source): boot prep, then AgeMaster, then sealant, then ICEX II, then Goodrich Aerospace Protectant Spray or Fly Shiny Quick Turn. Maintenance on boots that are already coated: wipe on Fly Shiny Quick Turn concentrate, then wipe it off with a dry microfiber towel. The boots come out a darker, shinier black, and ice sticks less. Follow the boot manufacturer's and aircraft maintenance manual limits.";
const PRIORITY = "When sources conflict, always recommend from the newest-dated source. The SOPs are the latest, then Brett's chat methods, then the Beyond Shiny book.";
const CARPET = 'Fly Shiny Oil Delete is the best product. Spray the area with Oil Delete and vacuum. Repeat that spray-and-vacuum three times, then spray a fourth time and extract. This removes the oil or grease completely. For ink or Sharpie, use Oil Delete with the towel-press method: mist a cotton terry towel wrapped around a fingertip, press straight down, and switch to a fresh section each time, 30 to 60 presses.';
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

check('system prompt carries all four exact texts', () => {
  for (const t of [KA, BOOTS, PRIORITY, CARPET]) assert.ok(joined.includes(t), t.slice(0, 50));
  assert.match(PROMPT, /Always write "ICEX II", never "Icex"/);
  assert.match(PROMPT, /Never state a reapplication interval/);
  assert.match(PROMPT, /don't suggest Fly Shiny Aircraft Wash or Bio Degreaser; use the SOP-07 boot prep step/);
  assert.match(PROMPT, /"Fly Shiny Boot Dressing" and "NOCO Boot Protect"/);
});
check('approved quotes are repeatable verbatim (each quoted chunk inside the 400-char quote window)', () => {
  for (const q of PROMPT.match(/"[^"\n]*"/g) || []) assert.ok(q.length <= 402, q.slice(0, 60));
  const leak = promptLeakSource(PROMPT);
  for (const s of ['the only bare (polished) aluminum is the two propeller spinners', 'wipe it off with a dry microfiber towel', 'The SOPs are the latest, then', 'spray-and-vacuum three times']) assert.ok(!leak.includes(s), s);
});
check('knowledge: King Air files + turboprop profile', () => {
  const files = fs.readdirSync('knowledge/detailing/aircraft').filter((n) => n.startsWith('beechcraft-king-air-'));
  assert.ok(files.length >= 4);
  for (const n of files) assert.ok(fs.readFileSync(path.join('knowledge/detailing/aircraft', n), 'utf8').includes(KA), n);
  assert.match(fs.readFileSync('knowledge/detailing/type-class/turboprop.md', 'utf8'), /King Air: only the two propeller spinners are bare aluminum/);
});
check('knowledge: de-ice boots + source priority notes (quotable, Brett-approved)', () => {
  assert.ok(fs.readFileSync('knowledge/detailing/brett-approved/de-ice-boots.md', 'utf8').includes(BOOTS));
  assert.ok(fs.readFileSync('knowledge/detailing/brett-approved/source-priority.md', 'utf8').includes(PRIORITY));
});
check('carpet method stays out of this public repo (lives in private_knowledge); SOP-04 points to Oil Delete', () => {
  for (const f of walk('knowledge')) assert.ok(!fs.readFileSync(f, 'utf8').includes('spray-and-vacuum three times'), f);
  const sop = fs.readFileSync('knowledge/detailing/sops/sop-04-carpet-cleaning.md', 'utf8');
  assert.ok(!/Citrusolve \(spot\) \+ Wool/.test(sop));
  assert.match(sop, /UPDATED Oct 3, 2026 \(Brett\)/);
  assert.ok(!/supersed/i.test(sop), 'would demote SOP-04 as superseded');
});
check('knowledge sweep: no NOCO, no "Icex" without II, no boot reapplication interval', () => {
  for (const f of walk('knowledge')) {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/\bnoco\b/i.test(t), `NOCO in ${f}`);
    assert.ok(!/(?<![\w/.-])icex(?![\s-]*ii\b)(?![\w-])/i.test(t), `Icex without II in ${f}`);
    assert.ok(!/icexii/i.test(t), `ICEXII in ${f}`);
    if (/de-?ice|boot/i.test(t)) {
      assert.ok(!/(?:every|after)\s+(?:30|60|90)\s*days|(?:30|60|90)[\s-]*day\s+(?:interval|reapplication|recoat)/i.test(t), `30/60/90-day interval in ${f}`);
      assert.ok(!/ICEX II\W+every \d+ flight hours|every 6 months after installation/i.test(t), `boot interval in ${f}`);
    }
  }
});
check('ban list: Fly Shiny Boot Dressing + NOCO Boot Protect dropped; ICEX II spelling', () => {
  assert.ok(mentionsBannedBrand('Use Fly Shiny Boot Dressing.'));
  assert.ok(mentionsBannedBrand('NOCO Boot Protect works.'));
  assert.ok(!mentionsBannedBrand('Shiny boots after Quick Turn. NOCO battery charger.'));
  assert.equal(scrubBannedBrands('Apply Fly Shiny Boot Dressing. Or NOCO Boot Protect. Then ICEX II.'), 'Then ICEX II.');
  assert.equal(applyBrandRules('Finish with Icex. Avoid Shiny Boot Dressing.', [{ role: 'user', content: 'boots?' }]), 'Finish with ICEX II.');
  assert.equal(fixBrandSpelling('Icex, icex 2, ICEXII, Icex II, ICEX-II'), 'ICEX II, ICEX II, ICEX II, ICEX II, ICEX II');
  assert.equal(fixBrandSpelling('### beyond-shiny/deice-boots-agemaster-shinemaster-icex.md'), '### beyond-shiny/deice-boots-agemaster-shinemaster-icex.md');
});
check('retrieval: boots and King Air questions get the Brett-approved / aircraft notes; not protected', async () => {
  const boots = await loadKnowledge('How do I maintain the de-ice boots? They already have sealant on them.', { privateRows: [] });
  assert.match(boots.block, /### brett-approved\/de-ice-boots\.md/);
  assert.ok(!boots.protectedTexts.some((t) => t.startsWith('### brett-approved/')), 'Brett-approved notes may be quoted');
  const ka = await loadKnowledgeStub('Which parts are bare aluminum on a King Air 350? Can I polish the cowlings?', { privateRows: [] });
  assert.match(ka, /### aircraft\/beechcraft-king-air-360-350-300\.md/);
  assert.ok(ka.includes(KA));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`PASS ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n  ${err.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
