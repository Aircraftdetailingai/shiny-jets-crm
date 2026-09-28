/**
 * Sanity check: run the real Detailing AI knowledge stub loader against sample queries.
 * Usage: node scripts/test-detailing-ai-knowledge.mjs
 * Exit 0 if shop recipes + Beyond Shiny safety both surface for the required queries.
 */
import { readdir, readFile } from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const src = fs.readFileSync('app/api/detailing-ai/chat/route.js', 'utf8');
const start = src.indexOf('const KNOWLEDGE_NEEDLES');
const end = src.indexOf('async function loadServicesCatalog');
if (start < 0 || end < 0) {
  console.error('Could not locate knowledge loader in route.js');
  process.exit(2);
}
const code = src.slice(start, end);
const load = new Function(
  'readdir', 'readFile', 'path', 'console',
  `${code}\nreturn loadKnowledgeStub;`
)(readdir, readFile, path, console);

function chosenFiles(out) {
  // Only the loader's file headers: "### <path>" at start of a knowledge block line.
  // Paths always contain a slash or end with .md and have no spaces for our files.
  return [...out.matchAll(/^### (\S+\.md)$/gm)]
    .map((m) => m[1])
    .filter((f) => f.includes('.md') || f.includes('/'));
}

const checks = [
  {
    q: 'medium oxidation single stage',
    mustIncludeAny: ['shop-recipes'],
    mustIncludeAny2: ['beyond-shiny/paint-single-stage', 'beyond-shiny/recipe-quick-list', 'beyond-shiny/paint-compound'],
    note: 'shop recipe + book paint topic',
  },
  {
    q: 'pitot cover wash',
    mustIncludeAny: ['beyond-shiny/safety-cautions', 'beyond-shiny/wash-dry-wet-pitot'],
    note: 'book safety and/or wash',
  },
  {
    q: 'how do I get sharpie out of carpet',
    mustIncludeAny: ['shop-recipes'],
    note: 'shop Oil Delete recipe',
  },
  {
    q: 'clearcoat cirrus polish',
    mustIncludeAny: ['shop-recipes'],
    note: 'shop clearcoat recipe',
  },
  {
    q: 'brightwork overheating 150F',
    mustIncludeAny: ['beyond-shiny/safety-cautions', 'beyond-shiny/brightwork'],
    note: '150F brightwork caution',
  },
  {
    q: 'Agemaster on silver boots',
    mustIncludeAny: ['beyond-shiny/safety-cautions', 'beyond-shiny/deice-boots'],
    note: 'Agemaster silver-boot caution',
  },
  {
    q: 'can I fog the cabin for disinfection',
    mustIncludeAny: ['beyond-shiny/safety-cautions', 'beyond-shiny/interior'],
    note: 'no fogging FAA caution',
  },
  {
    q: 'sharpie out of carpet',
    mustIncludeAll: ['sops/sop-04-carpet-cleaning.md'],
    note: 'carpet SOP not crowded out by book files',
  },
  {
    q: 'can I fog the cabin for disinfection',
    mustExclude: ['beyond-shiny/acrylic', 'beyond-shiny/brightwork'],
    note: 'no unrelated book files for fogging',
  },
];

let failed = 0;
for (const c of checks) {
  const out = await load(c.q);
  const files = chosenFiles(out);
  const ok1 = !c.mustIncludeAny || c.mustIncludeAny.some((p) => files.some((f) => f.includes(p)));
  const ok2 = !c.mustIncludeAny2 || c.mustIncludeAny2.some((p) => files.some((f) => f.includes(p)));
  const ok3 = !c.mustIncludeAll || c.mustIncludeAll.every((p) => files.some((f) => f.includes(p)));
  const bad = (c.mustExclude || []).filter((p) => files.some((f) => f.includes(p)));
  const ok = ok1 && ok2 && ok3 && bad.length === 0;
  if (!ok) failed += 1;
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  "${c.q}"  (${c.note})`);
  files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  if (!ok1) console.log(`  missing any of: ${c.mustIncludeAny}`);
  if (!ok2) console.log(`  missing any of: ${c.mustIncludeAny2}`);
  if (!ok3) console.log(`  missing all of: ${c.mustIncludeAll}`);
  if (bad.length) console.log(`  must not include: ${bad}`);
  // Presence of safety language for pitot query
  if (c.q.includes('pitot') && !/pitot/i.test(out)) {
    console.log('  WARN: injected text has no "pitot"');
  }
}

console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
