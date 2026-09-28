/**
 * Detailing AI Rupes rule tests (Brett, Sep 28 2026: "never ever ever mention Rupes product";
 * exception: when the user asks about Rupes, a brief Shiny Jets experience answer is allowed).
 *  - system prompt carries the absolute rule + the user-asked exception
 *  - loader scrubs Rupes from every excerpt (public files + private rows at load time)
 *  - public knowledge has no Rupes references
 *  - output guard: unprompted mention redacted; user-asked mention allowed through
 * Usage: node --import ./scripts/test-support/register.mjs scripts/test-detailing-ai-no-rupes.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadKnowledgeStub } from '../lib/detailing-ai-knowledge.js';
import { scrubRupes, mentionsRupes, userAskedAboutRupes } from '../lib/detailing-ai-messages.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

let failed = 0;
let total = 0;
function check(name, ok, detail = '') {
  total += 1;
  if (ok) console.log(`PASS ${name}`);
  else { failed += 1; console.log(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`); }
}

// 1. Prompt rule.
const route = fs.readFileSync('app/api/detailing-ai/chat/route.js', 'utf8');
const prompt = route.slice(route.indexOf('const SYSTEM_PROMPT'), route.indexOf('function getSupabase'));
check('prompt: never bring up / recommend any Rupes product, incl. fallbacks and quotes',
  /Rupes[^\n]*NEVER bring it up on your own and NEVER recommend any Rupes product or combination[^\n]*fallback[^\n]*quote line/.test(prompt));
check('prompt: user-asked exception with the Shiny Jets experience line, then steer to current methods',
  /if the user specifically asks about Rupes/.test(prompt)
    && prompt.includes("We've had a lot of their tools break down, and they stall a lot. They're very finicky to detail with.")
    && /steer them to the current Shiny Jets methods and tools\. Even then, never recommend a Rupes product/.test(prompt));

// 2. Loader scrub (private rows at load time + public files).
const ROWS = [
  { slug: 'shop-recipes-mock-rupes', source: 'recipes', title: 'Mock method with a RUPES Bigfoot (fixture)', section: null,
    keywords: ['menzerna'], content: '## Single-stage oxidation\nPLACEHOLDER on a Rupes Bigfoot LHR15 with a rupes blue wool pad. Mini Rupes Nano iBrid for edges.' },
  { slug: 'beyond-shiny-mock-rupes', source: 'beyond-shiny', title: 'Beyond Shiny', section: 'Paint restoration',
    keywords: ['paint', 'mockrupeschunk'], content: 'Rupes Blue Wool Pad - The rupes blue wool pad is phenomenal. The Rupes pads spin.' },
];
for (const q of ['single stage oxidation menzerna method', 'mockrupeschunk beyond shiny book paint', 'acrylic window polishing sop pads', 'cabinetry veneer polish tools', 'what rupes polisher should I use for oxidation?']) {
  const out = await loadKnowledgeStub(q, { privateRows: ROWS });
  check(`loader output has no Rupes/Bigfoot: "${q}"`, out.length > 0 && !mentionsRupes(out) && !/rupes/i.test(out),
    (out.match(/.{0,40}(rupes|bigfoot).{0,40}/i) || [''])[0]);
}
{
  const out = await loadKnowledgeStub('single stage oxidation menzerna method', { privateRows: ROWS });
  check('scrubbed private row keeps the generic tool/pad wording', /DA polisher/.test(out) && /wool cutting pad/.test(out));
}
{
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const hits = walk('knowledge/detailing').filter((f) => /rupes|bigfoot/i.test(fs.readFileSync(f, 'utf8')));
  check('public knowledge files contain no Rupes references', hits.length === 0, hits.join(', '));
}

// 3. scrubRupes behavior.
const cases = [
  ['Use a Rupes yellow foam pad with ACA 520.', 'Use a yellow foam pad with ACA 520.'],
  ['- Rupes 3" battery-powered buffer', '- 3" battery-powered buffer'],
  ['Finish on the RUPES Bigfoot LHR15.', 'Finish on the DA polisher.'],
  ['DA + Rupes blue wool pad + compound', 'DA + wool cutting pad + compound'],
];
for (const [inp, want] of cases) check(`scrubRupes: ${inp}`, scrubRupes(inp) === want, JSON.stringify(scrubRupes(inp)));

// 4. Output guard (same decision the route makes).
const guard = (messages, reply) => (userAskedAboutRupes(messages) ? reply : scrubRupes(reply));
{
  const msgs = [{ role: 'user', content: 'How do I polish acrylic windows?' }];
  const out = guard(msgs, 'Step 1: heavy-cut compound on a Rupes blue wool pad, then a Rupes yellow foam pad.');
  check('output guard: unprompted Rupes mention is redacted', !/rupes/i.test(out), out);
}
{
  const line = "We've had a lot of their tools break down, and they stall a lot. They're very finicky to detail with.";
  const msgs = [{ role: 'user', content: 'What do you think of Rupes polishers?' }];
  const out = guard(msgs, `Rupes? ${line} Stick with the current Shiny Jets method and tools.`);
  check('output guard: user asked about Rupes -> experience line allowed through', out.includes('Rupes') && out.includes(line), out);
}
{
  const msgs = [
    { role: 'user', content: 'Is the Rupes Bigfoot any good?' },
    { role: 'assistant', content: 'We have had a lot of their tools break down.' },
    { role: 'user', content: 'Ok, so what should I use instead?' },
  ];
  check('output guard: a recent user turn about Rupes counts as asked', userAskedAboutRupes(msgs));
  const old = [{ role: 'user', content: 'Rupes?' }, ...Array.from({ length: 4 }, (_, i) => ({ role: 'user', content: `q${i}` }))];
  check('output guard: an old (not recent) Rupes turn does not unlock mentions', !userAskedAboutRupes(old));
}
check('route wires the output guard + quote-line scrub',
  /userAskedAboutRupes\(messages\) \? result\.reply : scrubRupes\(result\.reply\)/.test(route) && /svc\.name = scrubRupes\(svc\.name\)/.test(route));

console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
