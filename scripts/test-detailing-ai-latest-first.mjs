/**
 * Detailing AI "latest first" + hard product rules tests (Brett, Sep 28 2026).
 *  - latest Shiny Jets method ranks first; older/superseded content stays loadable, labeled, and after it
 *  - "don't have X" / "didn't work" questions surface the older alternative
 *  - Pro Cut is annotated "not yet released"; Polish Pro + Rupes blue wool is flagged; prompt has both rules
 * Synthetic rows only (no proprietary text), so this runs the same locally and in CI.
 * Usage: node --import ./scripts/test-support/register.mjs scripts/test-detailing-ai-latest-first.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadKnowledgeStub,
  wantsAlternative,
  NOTE_PRO_CUT,
  NOTE_POLISH_PRO_BLUE_WOOL,
  NOTE_OLDER_METHOD,
  NOTE_SUPERSEDED,
} from '../lib/detailing-ai-knowledge.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const CURRENT = 'shop-methods/shop-methods-mock-single-stage';
const OLDER = 'shop-methods/shop-methods-mock-single-stage-older';
const ROWS = [
  {
    slug: 'shop-recipes-mock-single-stage',
    source: 'recipes',
    title: 'Mock single-stage method (test fixture)',
    section: null,
    keywords: ['menzerna', 'spta'],
    content: '# Mock single-stage method\n## Single-stage oxidation\nPLACEHOLDER-CURRENT: DA + SPTA wool + Menzerna 400.',
  },
  {
    slug: 'shop-recipes-mock-single-stage-older',
    source: 'recipes',
    title: 'Mock single-stage method (older version, test fixture)',
    section: null,
    keywords: ['superseded', 'menzerna'],
    content: '# Older mock single-stage method\n## Single-stage oxidation\nPLACEHOLDER-OLDER: DA + foam + PLACEHOLDER polish.',
  },
  {
    slug: 'beyond-shiny-mock-paint',
    source: 'beyond-shiny',
    title: 'Beyond Shiny',
    section: 'Paint restoration',
    keywords: ['paint', 'oxidation', 'mockbookchunk'],
    content: 'Mock book chunk. Fly Shiny Pro Cut on a Rupes blue wool pad. Fly Shiny Pro Polish on the rotary.',
  },
];

let failed = 0;
let total = 0;
function check(name, ok, detail = '') {
  total += 1;
  if (ok) console.log(`PASS ${name}`);
  else { failed += 1; console.log(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`); }
}

const order = (out) => [...out.matchAll(/^### (\S+)/gm)].map((m) => m[1]);
// Notes block for one excerpt: lines between its header and its first non-note line.
function notesFor(out, rel) {
  const i = out.indexOf(`### ${rel}`);
  if (i < 0) return '';
  const after = out.slice(i).split('\n').slice(1);
  const notes = [];
  for (const l of after) { if (!l.startsWith('[')) break; notes.push(l); }
  return notes.join('\n');
}

// 1. Latest method ranks first; older version still loadable, labeled, and after the current one.
{
  const out = await loadKnowledgeStub('medium oxidation on single stage paint, what method?', { privateRows: ROWS });
  const o = order(out);
  check('latest Shiny Jets method is the first excerpt', o[0] === CURRENT, o.join(', '));
  const iOld = o.indexOf(OLDER);
  check('older method version is never ahead of the latest method', iOld === -1 || iOld > o.indexOf(CURRENT), o.join(', '));
  check('superseded public digest content is still loaded and labeled older/superseded',
    o.some((r) => r.startsWith('beyond-shiny/') && notesFor(out, r).includes(NOTE_SUPERSEDED)), o.join(', '));
}

// 2. "don't have X" / "didn't work" surfaces the older alternative, labeled, still after the latest method.
for (const q of [
  "I don't have Menzerna 400 — single stage oxidation, what else can I use?",
  "The latest method didn't work on this single-stage oxidation. Older method?",
]) {
  const out = await loadKnowledgeStub(q, { privateRows: ROWS });
  const o = order(out);
  check(`alternative query surfaces the older method: "${q.slice(0, 40)}…"`, o.includes(OLDER), o.join(', '));
  check('  …labeled "Older Shiny Jets method"', notesFor(out, OLDER).includes(NOTE_OLDER_METHOD));
  check('  …and listed after the latest method', o.indexOf(CURRENT) > -1 && o.indexOf(OLDER) > o.indexOf(CURRENT), o.join(', '));
  check('  …with the model-facing text saying "method", never "recipe"', !/recipe/i.test(out));
}
check('wantsAlternative detects curly apostrophes', wantsAlternative('I don’t have that pad'));
check('wantsAlternative ignores normal questions', !wantsAlternative('how do I polish a king air'));

// 3. Pro Cut + Polish Pro / blue wool flags on private rows (at load time) and public files.
{
  const out = await loadKnowledgeStub('mockbookchunk: what does the beyond shiny book say about paint restoration?', { privateRows: ROWS });
  const bookNotes = notesFor(out, 'beyond-shiny-book/beyond-shiny-mock-paint');
  check('private book row mentioning Pro Cut gets the not-yet-released note', bookNotes.includes(NOTE_PRO_CUT), bookNotes);
  check('private row pairing Pro Polish with blue wool gets the never-pair note', bookNotes.includes(NOTE_POLISH_PRO_BLUE_WOOL), bookNotes);
  const proCutFiles = order(out).filter((r) => !r.startsWith('beyond-shiny-book/') && /pro[\s-]*cut/i.test(out.slice(out.indexOf(`### ${r}`)).split('\n### ')[0]));
  check('every public excerpt mentioning Pro Cut carries the note', proCutFiles.every((r) => notesFor(out, r).includes(NOTE_PRO_CUT)), proCutFiles.join(', '));
}
{
  const dir = 'knowledge/detailing';
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const bad = [];
  for (const f of walk(dir).filter((x) => x.endsWith('.md'))) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      if (/pro[\s-]*cut/i.test(l) && !/not yet released/i.test(l)) bad.push(`${f}:${i + 1}`);
    });
  }
  check('public knowledge marks every Pro Cut line "not yet released"', bad.length === 0, bad.join(', '));
}

// 4. System prompt carries the absolute rules and the latest-first rules; old rules kept.
{
  const route = fs.readFileSync('app/api/detailing-ai/chat/route.js', 'utf8');
  const prompt = route.slice(route.indexOf('const SYSTEM_PROMPT'), route.indexOf('function getSupabase'));
  check('prompt: never Fly Shiny Polish Pro on a Rupes blue wool pad',
    /NEVER recommend Fly Shiny Polish Pro[^\n]*Rupes blue wool pad/.test(prompt));
  check('prompt: Pro Cut not yet released, never recommend, not available',
    /Fly Shiny Pro Cut is not yet released\. Never recommend it[^\n]*isn't available yet/.test(prompt));
  check('prompt: latest Shiny Jets method first, older only when latest failed / product missing',
    /Always lead with the latest Shiny Jets method/.test(prompt) && /didn't work or they don't have the recommended product/.test(prompt)
      && /Older Shiny Jets method — use if you don't have X/.test(prompt));
  check('prompt: no invented Menzerna 400 fallback', /Menzerna 400 isn't available has not been published yet — do not invent one/.test(prompt));
  check('prompt: methods-not-recipes and proprietary rules still present',
    /Never call them "recipes"/.test(prompt) && /never reproduce whole excerpts/.test(prompt));
}

console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
