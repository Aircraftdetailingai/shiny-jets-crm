/**
 * Detailing AI "Fly Shiny Compound Pro" rule tests (Brett, Oct 3 2026: there NEVER was a product
 * called "Fly Shiny Compound Pro"; never mention or recommend it).
 *  - system prompt carries the rule next to the Pro Cut rule (other absolute rules kept)
 *  - loader replaces every mention in excerpts (public files + private rows at load time)
 *  - public knowledge has no mention
 *  - output guard: unprompted mention / quote lines scrubbed; user-asked answer allowed through
 * Usage: node --import ./scripts/test-support/register.mjs scripts/test-detailing-ai-no-compound-pro.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadKnowledgeStub } from '../lib/detailing-ai-knowledge.js';
import { scrubCompoundPro, mentionsCompoundPro, userAskedAboutCompoundPro } from '../lib/detailing-ai-messages.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

let failed = 0;
let total = 0;
function check(name, ok, detail = '') {
  total += 1;
  if (ok) console.log(`PASS ${name}`);
  else { failed += 1; console.log(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`); }
}

// 1. Prompt rule (and the neighboring absolute rules are still there).
const route = fs.readFileSync('app/api/detailing-ai/chat/route.js', 'utf8');
const prompt = route.slice(route.indexOf('const SYSTEM_PROMPT'), route.indexOf('function getSupabase'));
check('prompt: "Fly Shiny Compound Pro" does not exist, never mention or recommend it',
  /"Fly Shiny Compound Pro" does not exist[^\n]*Never mention or recommend it[^\n]*quote line[^\n]*Never invent a replacement product/.test(prompt));
check('prompt: rule sits in the absolute product rules, after the Pro Cut rule',
  prompt.indexOf('Absolute product rules') < prompt.indexOf('Fly Shiny Pro Cut is not yet released')
    && prompt.indexOf('Fly Shiny Pro Cut is not yet released') < prompt.indexOf('"Fly Shiny Compound Pro" does not exist')
    && prompt.indexOf('"Fly Shiny Compound Pro" does not exist') < prompt.indexOf('Manual interpretation'));
check('prompt: Pro Cut, Rupes, latest-first, and methods rules still present',
  /Fly Shiny Pro Cut is not yet released\. Never recommend it/.test(prompt)
    && /never putting Fly Shiny Polish Pro on a Rupes blue wool pad/.test(prompt)
    && /NEVER bring it up on your own/.test(prompt)
    && /Always lead with the latest Shiny Jets method/.test(prompt)
    && /Never call them "recipes"/.test(prompt));

// 2. Loader scrub (private rows at load time + public files).
const ROWS = [
  { slug: 'shop-recipes-mock-compound-pro', source: 'recipes', title: 'Mock method (fixture)', section: null,
    keywords: ['menzerna'], content: '## Single-stage oxidation\nStep 1: Fly Shiny Compound Pro on a wool cutting pad. Step 2: FlyShiny Compound-Pro again.' },
  { slug: 'beyond-shiny-mock-compound-pro', source: 'beyond-shiny', title: 'Beyond Shiny', section: 'Paint restoration',
    keywords: ['paint', 'mockcompoundprochunk'], content: 'Shiny Compound Pro - cuts fast. compound_pro is great. Use a compound product on the rotary.' },
];
for (const q of ['single stage oxidation menzerna method', 'mockcompoundprochunk beyond shiny book paint', 'should I use fly shiny compound pro for oxidation?']) {
  const out = await loadKnowledgeStub(q, { privateRows: ROWS });
  check(`loader output has no Compound Pro mention: "${q}"`, out.length > 0 && !mentionsCompoundPro(out),
    (out.match(/.{0,40}compound.{0,40}/i) || [''])[0]);
}
{
  const out = await loadKnowledgeStub('single stage oxidation menzerna method', { privateRows: ROWS });
  check('scrubbed private row marks the removal and keeps the rest of the step', /\[non-existent product removed\] on a wool cutting pad/.test(out));
}
{
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const hits = walk('knowledge/detailing').filter((f) => mentionsCompoundPro(fs.readFileSync(f, 'utf8')));
  check('public knowledge files contain no Compound Pro mention', hits.length === 0, hits.join(', '));
}

// 3. scrub behavior: variants caught, real products and ordinary words untouched.
for (const t of ['Fly Shiny Compound Pro', 'FlyShiny Compound Pro', 'Shiny Compound Pro', 'Compound Pro', 'compound-pro', 'Fly Shiny Compound']) {
  check(`detects variant: ${t}`, mentionsCompoundPro(t) && !mentionsCompoundPro(scrubCompoundPro(t)));
}
for (const t of ['Fly Shiny Pro Polish', 'Fly Shiny Polish Pro', 'Fly Shiny Pro Cut', 'one step polish/compound product', 'compound process', 'Fly Shiny Pro ceramic coating']) {
  check(`leaves alone: ${t}`, !mentionsCompoundPro(t) && scrubCompoundPro(t) === t);
}
check('output wording: "Use Fly Shiny Compound Pro on wool." -> "Use compound on wool."',
  scrubCompoundPro('Use Fly Shiny Compound Pro on wool.', 'compound') === 'Use compound on wool.');

// 4. Output guard (same decision the route makes).
const guard = (messages, reply) => (userAskedAboutCompoundPro(messages) ? reply : scrubCompoundPro(reply, 'compound'));
{
  const out = guard([{ role: 'user', content: 'How do I fix medium oxidation on single stage?' }], 'Step 1: Fly Shiny Compound Pro on a wool pad.');
  check('output guard: unprompted mention is scrubbed', !mentionsCompoundPro(out), out);
}
{
  const reply = "Shiny Jets doesn't make a product called Fly Shiny Compound Pro. Use the products in the current Shiny Jets method.";
  const out = guard([{ role: 'user', content: 'Where do I buy Fly Shiny Compound Pro?' }], reply);
  check('output guard: user asked -> "no such product" answer allowed through', out === reply, out);
}
check('route wires the output guard + quote-line scrub',
  /userAskedAboutCompoundPro\(messages\) \? rupesSafe : scrubCompoundPro\(rupesSafe, 'compound'\)/.test(route)
    && /svc\.name = scrubCompoundPro\(svc\.name, 'compound'\)/.test(route)
    && /scrubCompoundPro\(scrubRupes\(suggestions\.notes\), 'compound'\)/.test(route));

console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
