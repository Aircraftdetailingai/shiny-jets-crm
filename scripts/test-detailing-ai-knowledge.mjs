/**
 * Detailing AI knowledge selection tests — runs the real loader
 * (lib/detailing-ai-knowledge.js) against sample questions.
 *
 * Usage: node --import ./scripts/test-support/register.mjs scripts/test-detailing-ai-knowledge.mjs
 *
 * Private rows (Shiny Jets shop methods, Shiny Jets SOPs, Beyond Shiny full text) come from, in order:
 *   1. the live `private_knowledge` table, when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set
 *      in the environment and the table answers ("db" mode);
 *   2. the private source folder outside the repo (PRIVATE_KNOWLEDGE_DIR, default
 *      /home/box/private-knowledge), built with the same code as the upsert script ("local" mode);
 *   3. a synthetic fixture with no proprietary text ("mock" mode — used in CI).
 * Exit 0 only if every check passes.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadKnowledgeStub,
  getPrivateKnowledgeRows,
  resetPrivateKnowledgeCache,
  MAX_BOOK_CHUNKS,
  MAX_EXCERPTS,
  toMethodsWording,
  compareCandidates,
  isSop,
} from '../lib/detailing-ai-knowledge.js';
import { buildAllRows, DEFAULT_PRIVATE_DIR, SOP_FILE_RE } from './lib/private-knowledge-build.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

// ---------------------------------------------------------------------------
// Private rows source
// ---------------------------------------------------------------------------
// Shop-method rows keep the DB's internal identifiers (source 'recipes', slug 'shop-recipes-…') and the
// mock text deliberately says "recipe(s)" so the tests prove the loader never shows that word to the model.
// Public SOP pointer stubs (knowledge/detailing/sops/sop-*.md). Each must have a private 'sops' row
// with slug = file name without .md; the private row replaces the stub in the loader.
const SOP_DIR = 'knowledge/detailing/sops';
const SOP_STUBS = fs.readdirSync(SOP_DIR).filter((f) => SOP_FILE_RE.test(f)).sort();
const STUB_MARKER = 'visibility: pointer-stub';

// Mock SOP rows are generated from the public stubs' scope lines (no proprietary text).
function mockSopRows() {
  return SOP_STUBS.map((f) => {
    const raw = fs.readFileSync(path.join(SOP_DIR, f), 'utf8');
    const title = ((raw.match(/^#\s+(.+)$/m) || [])[1] || f).replace(/\s*\(pointer\)\s*$/, '');
    const service = ((raw.match(/^service:\s*(.+)$/m) || [])[1] || '').trim();
    return {
      slug: f.replace(/\.md$/, ''),
      source: 'sops',
      title,
      section: service,
      keywords: [],
      content: `# ${title}\nMOCK SOP (test fixture — not real content). Scope: ${service}.\n## Procedure\n1. PLACEHOLDER step.\n2. PLACEHOLDER step.`,
    };
  });
}

const MOCK_ROWS = [
  {
    slug: 'shop-recipes-mock-paint-brightwork-carpet',
    source: 'recipes',
    title: 'Mock shop recipes (test fixture — not real content)',
    section: 'paint, brightwork, carpet',
    keywords: ['mockpad', 'mockpolish'],
    content: '# Mock shop recipes\nAsk single-stage or clearcoat first.\n## Single-stage oxidation\nPLACEHOLDER pad + PLACEHOLDER polish on a DA.\n'
      + '## Clearcoat (e.g., Cirrus)\nPLACEHOLDER polish on foam.\n## Brightwork one-step\nPLACEHOLDER; no holograms.\n'
      + '## Carpet grease, ink, or Sharpie\nPLACEHOLDER spray, terry towel press method.',
  },
  ...['wash', 'carpet', 'paint', 'brightwork'].flatMap((t) => [1, 2, 3].map((n) => ({
    slug: `beyond-shiny-mock-${t}-${n}`,
    source: 'beyond-shiny',
    title: `Beyond Shiny — mock ${t}`,
    section: `${t} section ${n}`,
    keywords: t === 'wash' ? ['foam cannon', 'pressure washer'] : [`mock ${t}`],
    content: `Mock book chunk about ${t}: carpet paint polish oxidation wash brightwork pitot sharpie foam cannon pressure washer. (fixture ${n})`,
  }))),
  ...mockSopRows(),
];

async function pickRows() {
  if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)) {
    resetPrivateKnowledgeCache();
    const rows = await getPrivateKnowledgeRows();
    if (rows.length > 0) return { mode: 'db', rows };
    console.log('(private_knowledge not reachable or empty — falling back)');
  }
  if (fs.existsSync(DEFAULT_PRIVATE_DIR)) {
    const rows = buildAllRows(DEFAULT_PRIVATE_DIR);
    if (rows.length > 0) return { mode: 'local', rows };
  }
  return { mode: 'mock', rows: MOCK_ROWS };
}

const { mode, rows: PRIVATE_ROWS } = await pickRows();
const methodRows = PRIVATE_ROWS.filter((r) => r.source === 'recipes'); // DB category value (internal)
const bookRows = PRIVATE_ROWS.filter((r) => r.source === 'beyond-shiny');
const sopRows = PRIVATE_ROWS.filter((r) => r.source === 'sops');
console.log(`private rows: ${mode} mode — ${methodRows.length} shop method, ${sopRows.length} SOP, ${bookRows.length} book`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const HELICOPTER_FILES = fs
  .readFileSync('knowledge/detailing/aircraft/index.md', 'utf8')
  .split('\n')
  .filter((l) => l.includes('`helicopter`'))
  .map((l) => (l.match(/`([a-z0-9-]+)`/) || [])[1])
  .filter(Boolean)
  .map((slug) => `aircraft/${slug}.md`);

const NON_CONTENT = /(^|\/)(readme|index)\.md$|progress[^/]*\.md$/i;

// Loader headers: "### <path>" (public files) or "### shop-methods/<slug> (…)" / "### beyond-shiny-book/<slug> (…)".
function chosenFiles(out) {
  return [...out.matchAll(/^### ((?:shop-methods|beyond-shiny-book)\/\S+|\S+\.md)(?: \(.*\))?$/gm)].map((m) => m[1]);
}

const METHOD = 'shop-methods/';
const BOOK_FULL = 'beyond-shiny-book/';

const checks = [
  {
    q: 'medium oxidation single stage',
    mustIncludeAny: [METHOD],
    mustIncludeAny2: ['beyond-shiny/paint-single-stage', 'beyond-shiny/quick-list', 'beyond-shiny/paint-compound'],
    methodBeforeBook: true,
    note: 'Shiny Jets method row + book paint topic; method outranks book',
  },
  {
    q: 'pitot cover wash',
    mustIncludeAny: ['beyond-shiny/safety-cautions', 'beyond-shiny/wash-dry-wet-pitot'],
    note: 'book safety and/or wash',
  },
  {
    q: 'how do I get sharpie out of carpet',
    mustIncludeAny: [METHOD],
    methodBeforeBook: true,
    note: 'Shiny Jets carpet stain method row',
  },
  {
    q: 'clearcoat cirrus polish',
    mustIncludeAny: [METHOD],
    note: 'Shiny Jets clearcoat method row',
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
    note: 'no unrelated book digest files for fogging',
  },
  {
    q: 'can I fog the cabin for disinfection',
    mustExclude: [...HELICOPTER_FILES, 'PROGRESS.md'],
    note: 'no helicopter aircraft/ filler or PROGRESS.md for fogging',
  },
  {
    q: 'how do I get sharpie out of carpet',
    mustIncludeAll: ['sops/sop-04-carpet-cleaning.md'],
    note: 'carpet SOP (longer phrasing)',
  },
  {
    q: 'Citation CJ3 leather seats',
    mustIncludeAll: ['aircraft/cessna-citation-cj3.md'],
    mustExclude: [METHOD],
    note: 'specific aircraft profile still selected; no shop-method filler',
  },
  {
    q: 'what does beyond shiny say about using a foam cannon and pressure washer',
    mustIncludeAny: [BOOK_FULL],
    note: 'Beyond Shiny full text surfaces for book questions',
  },
  {
    q: 'single stage paint oxidation polish compound carpet wash brightwork',
    maxBookChunks: MAX_BOOK_CHUNKS,
    note: `at most ${MAX_BOOK_CHUNKS} full-text book chunks per answer`,
  },
];

let failed = 0;
let total = 0;
function report(ok, title, files, problems = []) {
  total += 1;
  if (!ok) failed += 1;
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${title}`);
  files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  problems.forEach((p) => console.log(`  ${p}`));
}

for (const c of checks) {
  const out = await loadKnowledgeStub(c.q, { privateRows: PRIVATE_ROWS });
  const files = chosenFiles(out);
  const problems = [];
  if (c.mustIncludeAny && !c.mustIncludeAny.some((p) => files.some((f) => f.includes(p)))) problems.push(`missing any of: ${c.mustIncludeAny}`);
  if (c.mustIncludeAny2 && !c.mustIncludeAny2.some((p) => files.some((f) => f.includes(p)))) problems.push(`missing any of: ${c.mustIncludeAny2}`);
  if (c.mustIncludeAll && !c.mustIncludeAll.every((p) => files.some((f) => f.includes(p)))) problems.push(`missing all of: ${c.mustIncludeAll}`);
  const bad = (c.mustExclude || []).filter((p) => files.some((f) => f.includes(p)));
  if (bad.length) problems.push(`must not include: ${bad}`);
  const meta = files.filter((f) => NON_CONTENT.test(f));
  if (meta.length) problems.push(`non-content files selected: ${meta}`);
  if (files.length > MAX_EXCERPTS) problems.push(`more than ${MAX_EXCERPTS} excerpts`);
  const bookCount = files.filter((f) => f.startsWith(BOOK_FULL)).length;
  if (bookCount > MAX_BOOK_CHUNKS) problems.push(`${bookCount} full-text book chunks (max ${MAX_BOOK_CHUNKS})`);
  if (c.methodBeforeBook) {
    const ri = files.findIndex((f) => f.startsWith(METHOD));
    const bi = files.findIndex((f) => f.startsWith('beyond-shiny'));
    if (ri < 0 || (bi >= 0 && bi < ri)) problems.push('Shiny Jets method must rank above Beyond Shiny (digest and full text)');
  }
  if (c.q.includes('pitot') && !/pitot/i.test(out)) problems.push('injected text has no "pitot"');
  if (/recipe/i.test(out)) problems.push('injected knowledge says "recipe" (must say "method")');
  report(problems.length === 0, `"${c.q}"  (${c.note})`, files, problems);
}

// ---------------------------------------------------------------------------
// Fallback: Supabase unreachable → public files only, no crash.
// ---------------------------------------------------------------------------
{
  const out = await loadKnowledgeStub('how do I get sharpie out of carpet', { privateRows: [] });
  const files = chosenFiles(out);
  const problems = [];
  if (!files.includes('sops/sop-04-carpet-cleaning.md')) problems.push('carpet SOP missing in fallback');
  if (files.some((f) => f.startsWith(METHOD) || f.startsWith(BOOK_FULL))) problems.push('private rows present with none loaded');
  if (/Shiny Jets SOP — procedure of record/.test(out)) problems.push('private SOP header present with none loaded');
  if (!out.includes(STUB_MARKER)) problems.push('SOP pointer stub text not injected in fallback');
  report(problems.length === 0, 'fallback (no private rows): carpet SOP pointer stub still selected', files, problems);
}
{
  const saved = { url: process.env.SUPABASE_URL, k1: process.env.SUPABASE_SERVICE_ROLE_KEY, k2: process.env.SUPABASE_SERVICE_KEY };
  process.env.SUPABASE_URL = 'http://127.0.0.1:9';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-not-a-key';
  resetPrivateKnowledgeCache();
  const origError = console.error;
  console.error = () => {};
  const t0 = Date.now();
  const out = await loadKnowledgeStub('medium oxidation single stage');
  const ms = Date.now() - t0;
  console.error = origError;
  const files = chosenFiles(out);
  const problems = [];
  if (!files.length) problems.push('no knowledge returned');
  if (files.some((f) => f.startsWith(METHOD) || f.startsWith(BOOK_FULL))) problems.push('private rows present while DB unreachable');
  if (ms > 5000) problems.push(`took ${ms}ms (timeout too long)`);
  report(problems.length === 0, `fallback (DB unreachable): public files in ${ms}ms`, files, problems);
  process.env.SUPABASE_URL = saved.url ?? '';
  if (saved.k1 === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.k1;
  if (saved.k2 === undefined) delete process.env.SUPABASE_SERVICE_KEY; else process.env.SUPABASE_SERVICE_KEY = saved.k2;
  if (saved.url === undefined) delete process.env.SUPABASE_URL;
  resetPrivateKnowledgeCache();
}

// ---------------------------------------------------------------------------
// SOPs: private rows replace the public pointer stubs; best-matching SOP + tie-break unchanged.
// ---------------------------------------------------------------------------
{
  const problems = [];
  const slugs = sopRows.map((r) => r.slug).sort();
  const stubSlugs = SOP_STUBS.map((f) => f.replace(/\.md$/, ''));
  if (sopRows.length === 0) problems.push(`no private 'sops' rows (${mode} mode) — seed private_knowledge before merging`);
  const missing = stubSlugs.filter((s) => !slugs.includes(s));
  const extra = slugs.filter((s) => !stubSlugs.includes(s));
  if (missing.length) problems.push(`public SOP stubs without a private row: ${missing}`);
  if (extra.length) problems.push(`private SOP rows without a public pointer stub: ${extra}`);
  report(problems.length === 0, `SOP rows: ${sopRows.length} private rows ↔ ${SOP_STUBS.length} public pointer stubs`, [], problems);
}
{
  // [question, SOP that must be selected, must it be the top excerpt?]
  const sopChecks = [
    ['how do I get sharpie out of carpet', 'sops/sop-04-carpet-cleaning.md', false],
    ['coffee stain on wool carpet', 'sops/sop-04-carpet-cleaning.md', false],
    ['leather cleaning SOP', 'sops/sop-03-leather-cleaning.md', true],
    ['wet wash SOP', 'sops/sop-02-wet-wash.md', true],
    ['dry wash procedure', 'sops/sop-01-dry-wash.md', true],
    ['SOP for windows', 'sops/sop-10-window-polishing.md', true],
    ['de-ice boots restoration', 'sops/sop-07-de-ice-boots.md', false],
    ['brightwork polishing leading edge', 'sops/sop-11-brightwork-polishing.md', false],
  ];
  for (const [q, want, first] of sopChecks) {
    const out = await loadKnowledgeStub(q, { privateRows: PRIVATE_ROWS });
    const files = chosenFiles(out);
    const problems = [];
    if (!files.includes(want)) problems.push(`missing ${want}`);
    if (first && files[0] !== want) problems.push(`${want} should rank first`);
    const dupes = files.filter((f, i) => files.indexOf(f) !== i);
    if (dupes.length) problems.push(`duplicate excerpts (stub + private row?): ${dupes}`);
    const header = out.split('\n').find((l) => l.startsWith(`### ${want}`)) || '';
    if (sopRows.some((r) => `sops/${r.slug}.md` === want)) {
      if (!/\(Shiny Jets SOP — procedure of record: .+\)$/.test(header)) problems.push(`${want} is not the private SOP row: "${header}"`);
    }
    if (out.includes(STUB_MARKER)) problems.push('a public pointer stub was injected although private SOP rows are loaded');
    if (/recipe/i.test(out)) problems.push('injected knowledge says "recipe" (must say "method")');
    report(problems.length === 0, `"${q}"  (private SOP ${want}${first ? ' ranks first' : ' kept'})`, files, problems);
  }
}
{
  // Tie-break on equal score: SOP (private row or stub) → shop method → book → everything else.
  const problems = [];
  const mk = (kind, rel) => ({ kind, rel, score: 5 });
  const pool = [mk('file', 'aircraft/a.md'), mk('book', 'beyond-shiny-book/x'), mk('method', 'shop-methods/x'),
    mk('file', 'beyond-shiny/y.md'), mk('sop', 'sops/sop-99-b.md'), mk('file', 'sops/sop-98-a.md')];
  const order = [...pool].sort(compareCandidates).map((c) => c.rel);
  const want = ['sops/sop-98-a.md', 'sops/sop-99-b.md', 'shop-methods/x', 'beyond-shiny-book/x', 'beyond-shiny/y.md', 'aircraft/a.md'];
  if (order.join() !== want.join()) problems.push(`tie order ${order} (want ${want})`);
  if (!isSop(mk('sop', 'sops/x.md')) || !isSop(mk('file', 'sops/x.md')) || isSop(mk('file', 'beyond-shiny/sops.md'))) problems.push('isSop wrong');
  report(problems.length === 0, 'SOP tie-break: SOPs win ties over methods, book, other files', [], problems);
}

// ---------------------------------------------------------------------------
// Repo hygiene: no shop-method file, no private text in public files, no knowledge in API responses.
// ---------------------------------------------------------------------------
{
  const problems = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const publicFiles = walk('knowledge/detailing').filter((f) => f.endsWith('.md'));
  const methodFiles = publicFiles.filter((f) => /shop-(?:recipes|methods)-/.test(path.basename(f)));
  if (methodFiles.length) problems.push(`shop-method files in public repo: ${methodFiles}`);
  // Public SOP files must be pointer stubs: marker, small, one heading, no lists/steps/tables.
  for (const f of SOP_STUBS) {
    const raw = fs.readFileSync(path.join(SOP_DIR, f), 'utf8');
    const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
    if (!raw.includes(STUB_MARKER)) problems.push(`${f}: not marked as a pointer stub`);
    if (raw.length > 1200) problems.push(`${f}: ${raw.length} bytes (pointer stubs stay under 1200)`);
    if (/^\s*(?:\d+[.)]|[-*+]|\|)\s/m.test(body)) problems.push(`${f}: has list/step/table lines`);
    if ((body.match(/^#{1,6}\s/gm) || []).length > 1) problems.push(`${f}: has section headings`);
  }
  const otherSopFiles = publicFiles.filter((f) => f.includes(`${path.sep}sops${path.sep}`)
    && !SOP_STUBS.includes(path.basename(f)) && path.basename(f) !== 'index.md');
  if (otherSopFiles.length) problems.push(`unexpected files in the public SOP folder: ${otherSopFiles}`);
  if (mode !== 'mock') {
    const publicText = [...publicFiles, 'app/api/detailing-ai/chat/route.js', 'lib/detailing-ai-knowledge.js']
      .map((f) => fs.readFileSync(f, 'utf8').toLowerCase().replace(/\s+/g, ' '))
      .join('\n');
    for (const r of methodRows) {
      const lines = r.content.split('\n').map((l) => l.replace(/[*#>`_-]/g, '').trim().toLowerCase().replace(/\s+/g, ' '))
        .filter((l) => l.length >= 30 && !/^(source|related|keywords):/.test(l));
      const leaked = lines.filter((l) => publicText.includes(l));
      if (leaked.length) problems.push(`shop method "${r.slug}" text found in public files: ${leaked.slice(0, 3).join(' | ')}`);
    }
    // SOP body text (front matter, title and scope line are public by design in the stubs).
    for (const r of sopRows) {
      const body = r.content.replace(/^---\n[\s\S]*?\n---\n/, '');
      const norm = (l) => l.replace(/[*#>`_|-]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
      const title = norm(r.title || '');
      const lines = body.split('\n').filter((l) => !/^#\s/.test(l)).map(norm)
        .filter((l) => l.length >= 30 && !title.includes(l) && !/^(service|author|version|source pdf):/.test(l));
      const leaked = lines.filter((l) => publicText.includes(l));
      if (leaked.length) problems.push(`SOP "${r.slug}" text found in public files: ${leaked.slice(0, 3).join(' | ')}`);
    }
  }
  const route = fs.readFileSync('app/api/detailing-ai/chat/route.js', 'utf8');
  const jsonCalls = [...route.matchAll(/Response\.json\(\{([\s\S]*?)\}\s*(?:,|\))/g)].map((m) => m[1]);
  if (jsonCalls.some((b) => /\b(system|knowledge|excerpts)\b/.test(b))) problems.push('route returns system/knowledge to the client');
  if (/knowledge\/detailing\/shop-(?:recipes|methods)-/i.test(route)) problems.push('system prompt still points at a public shop-method file');
  report(problems.length === 0, 'repo hygiene: no public shop-method or SOP content (pointer stubs only); API never returns knowledge', [], problems);
}

// ---------------------------------------------------------------------------
// Wording: customers never see "recipe(s)" — Brett's procedures are "methods".
// ---------------------------------------------------------------------------
{
  const problems = [];
  const route = fs.readFileSync('app/api/detailing-ai/chat/route.js', 'utf8');
  const prompt = (route.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/) || [])[1] || '';
  if (!prompt) problems.push('SYSTEM_PROMPT not found');
  const promptLines = prompt.split('\n');
  const rule = promptLines.find((l) => /never call them "recipes"/i.test(l) && /"method\(s\)"/i.test(l));
  if (!rule) problems.push('system prompt lacks the "never call them recipes; say methods" rule');
  const stray = promptLines.filter((l) => l !== rule && /recipe/i.test(l));
  if (stray.length) problems.push(`system prompt says "recipe" outside the terminology rule: ${stray.map((l) => l.slice(0, 80))}`);
  if (!/Shiny Jets methods/.test(prompt)) problems.push('system prompt never says "Shiny Jets methods"');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const publicHits = walk('knowledge/detailing').filter((f) => f.endsWith('.md') && /recipe/i.test(f + fs.readFileSync(f, 'utf8')));
  if (publicHits.length) problems.push(`public knowledge files say "recipe": ${publicHits}`);
  // Private rows (DB / local / mock) may still say "recipe" in slug, title, or text: the loader must normalize it.
  const qs = ['medium oxidation single stage', 'shop recipes for brightwork', 'Recipe for sharpie on carpet', 'clearcoat cirrus polish'];
  for (const q of qs) {
    const out = await loadKnowledgeStub(q, { privateRows: PRIVATE_ROWS });
    if (/recipe/i.test(out)) problems.push(`loader output for "${q}" says "recipe"`);
    if (!chosenFiles(out).some((f) => f.startsWith(METHOD))) problems.push(`no Shiny Jets method excerpt for "${q}"`);
  }
  if (toMethodsWording('Brett Shop Recipes: the recipe; RECIPES') !== 'Brett Shop Methods: the method; METHODS') {
    problems.push('toMethodsWording does not preserve case');
  }
  report(problems.length === 0, 'wording: prompt + injected knowledge say "method(s)", never "recipe(s)"', [], problems);
}

console.log(`\n${total - failed}/${total} passed (${mode} mode)`);
process.exit(failed ? 1 : 0);
