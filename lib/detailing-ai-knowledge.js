// Server-only Detailing AI knowledge loader.
//
// Candidate pool = public markdown under knowledge/detailing/** PLUS private rows
// from the Supabase `private_knowledge` table (Brett's shop recipes + the full
// Beyond Shiny book text). Private rows are read with the service role, cached in
// memory for a short TTL, and only ever end up inside the system prompt sent to
// the model provider — never in an API response to the browser.
//
// Do not import this module from client components.
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

export const KNOWLEDGE_NEEDLES = [
  'oxid',
  'acrylic',
  'haze',
  'brightwork',
  'ceramic',
  'interior',
  'odor',
  'leather',
  'polish',
  'window',
  'wash',
  'carpet',
  'decontaminat',
  'de-ice',
  'deice',
  'boot',
  'veneer',
  'cabinetry',
  'paint',
  'soot',
  'skydrol',
  'alcantara',
  'suede',
  'wax',
  'compound',
  'clearcoat',
  'pitot',
  'sop',
  'manual',
  'poh',
  'pim',
  'amm',
  'microfiber',
  'terry',
  'solvent',
  'soap',
  'corrosion',
  'plexiglass',
  'plexiglas',
  'aluminum',
  'exterior',
  'cloth',
  'chamois',
  'prohibited',
  'beechcraft',
  'baron',
  'bonanza',
  'cessna',
  'skyhawk',
  'citation',
  'hawker',
  'king air',
  'gulfstream',
  'embraer',
  'phenom',
  'pilatus',
  'piper',
  'bell',
  'helicopter',
  'hold-harmless',
  'policy',
  'robinson',
  'r22',
  'r44',
  'r66',
  'cirrus',
  'sr20',
  'sr22',
  'pc-12',
  'pc12',
  'archer',
  'cherokee',
  'g550',
  'g650',
  'g700',
  'formula 409',
  'ibf',
  'tks',
  'info16005',
  'mooney',
  'm20j',
  'caravan',
  '208',
  'md500',
  'enstrom',
  'hondajet',
  'honda',
  'matte',
  'vision',
  'sf50',
  'pc-24',
  'pc24',
  'kodiak',
  'as350',
  'h125',
  'cabri',
  'guimbal',
  'piaggio',
  'avanti',
  'air tractor',
  'citricut',
  '43-4b',
  'single-stage',
  'single stage',
  'clear coat',
  'spta',
  'striker',
  'maverick',
  'oil delete',
  'sharpie',
  'grease',
  'hologram',
  'wool pad',
  'aca 500',
  'grant',
  'fogging',
  'mek',
  'agemaster',
  '150f',
  '150°f',
  '150 °f',
  'boots',
  'beyond shiny',
  'rejex',
  'pro cut',
  'pro polish',
  'rupes',
  'granitize',
  'icex',
  'shinemaster',
  'wool perfect',
  'wool zone',
  'citrus solv',
  'colourlock',
  'colourloc',
  'dreadnaught',
  'tornador',
  'static',
  'static port',
  'air guard',
  'bond enhancer',
];
const NEEDLE_SET = new Set(KNOWLEDGE_NEEDLES);

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
export const MAX_EXCERPTS = 6;
// Full-text book chunks are numerous (~100); cap how many can take excerpt slots
// so SOPs, shop recipes and the public book digest are not crowded out.
export const MAX_BOOK_CHUNKS = 2;
const PRIVATE_TTL_MS = 5 * 60 * 1000; // fresh rows are reused for 5 minutes
const PRIVATE_RETRY_MS = 60 * 1000; // after a failure, retry at most once a minute
const PRIVATE_TIMEOUT_MS = 3000; // never hold the chat up on a slow database

// Generic shop-recipe triggers. Recipe-specific product names live in each
// private row's `keywords` column (not in this public repo).
const SHOP_RECIPE_TRIGGERS = ['oxid', 'paint', 'polish', 'compound', 'brightwork', 'carpet', 'grease',
  'sharpie', 'ink', 'clearcoat', 'clear coat', 'single-stage', 'single stage', 'hologram', 'correction'];

const SAFETY_TRIGGERS = ['pitot', 'static', 'fog', 'mek', 'agemaster', '150', 'boot', 'strut',
  'landing gear', 'faa', 'cover', 'craz', 'caution', 'safety', 'respirator', 'wash',
  'brightwork', 'silver boot', 'vortex'];

// Words that never count as a "file term" hit when they come from book headings.
const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'your', 'you', 'are', 'our', 'how', 'what',
  'who', 'why', 'when', 'where', 'this', 'that', 'into', 'not', 'all', 'any', 'can', 'use', 'using', 'part',
  'chapter', 'introduction', 'intro', 'continued', 'section', 'book', 'about', 'more', 'less', 'one', 'two']);

// Folder / generic path tokens that shouldn't count as the question matching a specific file.
const GENERIC_PATH_TOKENS = new Set(['aircraft', 'manuals', 'type', 'class', 'sops', 'beyond', 'shiny', 'policy',
  'recipes', 'shop', 'book']);

// ---------------------------------------------------------------------------
// Public files
// ---------------------------------------------------------------------------
async function collectMarkdownFiles(dir, relative = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectMarkdownFiles(full, rel)));
    } else if (entry.name.endsWith('.md')) {
      out.push({ rel, full });
    }
  }
  return out;
}

// Meta files (ingest progress, catalog/library indexes, READMEs) are never injected as knowledge.
function isNonContentFile(rel) {
  const base = rel.split('/').pop().toLowerCase();
  return base === 'readme.md' || base === 'index.md' || base.includes('progress');
}

async function loadPublicCandidates(root) {
  let files;
  try {
    files = await collectMarkdownFiles(root);
  } catch (err) {
    console.error('[detailing-ai/knowledge] public files error:', err?.message || err);
    return [];
  }
  const out = [];
  for (const { rel, full } of files) {
    if (isNonContentFile(rel)) continue;
    try {
      const text = await readFile(full, 'utf8');
      out.push({ kind: 'file', rel, text, keywords: rel.replace(/\.md$/, '').split(/[-_./]/) });
    } catch (err) {
      console.error('[detailing-ai/knowledge] read error:', rel, err?.message || err);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Private rows (Supabase `private_knowledge`, service role only)
// ---------------------------------------------------------------------------
let privateCache = { rows: null, fetchedAt: 0, failedAt: 0, inflight: null };

export function resetPrivateKnowledgeCache() {
  privateCache = { rows: null, fetchedAt: 0, failedAt: 0, inflight: null };
}

function privateClient() {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init = {}) => fetch(input, {
        ...init,
        cache: 'no-store',
        signal: AbortSignal.timeout(PRIVATE_TIMEOUT_MS),
      }),
    },
  });
}

async function queryPrivateRows() {
  const supabase = privateClient();
  if (!supabase) throw new Error('supabase service role not configured');
  const rows = [];
  const pageSize = 500;
  for (let from = 0; from < 10000; from += pageSize) {
    const { data, error } = await supabase
      .from('private_knowledge')
      .select('slug, source, title, section, keywords, content')
      .order('slug', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message || 'private_knowledge query failed');
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

/**
 * Private knowledge rows, cached in memory. Never throws: on any failure it
 * returns the last good rows (if any) or [] so the chat falls back to the
 * public files.
 */
export async function getPrivateKnowledgeRows({ now = Date.now() } = {}) {
  const c = privateCache;
  if (c.rows && now - c.fetchedAt < PRIVATE_TTL_MS) return c.rows;
  if (c.failedAt && now - c.failedAt < PRIVATE_RETRY_MS) return c.rows || [];
  if (c.inflight) return c.inflight;
  c.inflight = (async () => {
    try {
      const rows = await queryPrivateRows();
      privateCache.rows = rows;
      privateCache.fetchedAt = Date.now();
      privateCache.failedAt = 0;
      return rows;
    } catch (err) {
      console.error('[detailing-ai/knowledge] private_knowledge unavailable, using public files only:', err?.message || err);
      privateCache.failedAt = Date.now();
      return privateCache.rows || [];
    } finally {
      privateCache.inflight = null;
    }
  })();
  return c.inflight;
}

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9°]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function privateRowToCandidate(row) {
  if (!row || typeof row.content !== 'string' || !row.content.trim() || !row.slug) return null;
  const extra = Array.isArray(row.keywords)
    ? row.keywords.map((k) => String(k || '').toLowerCase().trim()).filter(Boolean)
    : [];
  if (row.source === 'recipes') {
    return {
      kind: 'recipe',
      rel: `shop-recipes/${row.slug}`,
      title: row.title || row.slug,
      text: row.content,
      // Same +2 path-token logic as files: slug tokens only (e.g. shop, recipes, paint, brightwork, carpet).
      keywords: String(row.slug).split(/[-_./]/),
      triggers: extra,
    };
  }
  if (row.source === 'beyond-shiny') {
    const headingTokens = [...new Set([...tokenize(row.section), ...extra.flatMap((k) => tokenize(k))])];
    return {
      kind: 'book',
      rel: `beyond-shiny-book/${row.slug}`,
      title: [row.title, row.section].filter(Boolean).join(' / '),
      text: row.content,
      keywords: headingTokens,
      triggers: [],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scoring (shared by files and private rows)
// ---------------------------------------------------------------------------

// True when the question hits this candidate: a specific keyword token, or a needle present in both
// the question and the text. Cross-links / pointers to shop recipes are ignored in the text.
function questionMatchesFile(keywords, text, lower) {
  const fileTermHit = keywords.some((kw) => kw.length > 2 && !GENERIC_PATH_TOKENS.has(kw) && lower.includes(kw));
  if (fileTermHit) return true;
  const hay = text.toLowerCase().replace(/shop-recipes-[a-z0-9-]+\.md/g, '');
  return KNOWLEDGE_NEEDLES.some((n) => lower.includes(n) && hay.includes(n));
}

function isRecipe(c) {
  return c.kind === 'recipe' || (c.kind === 'file' && c.rel.startsWith('shop-recipes-'));
}

function isBook(c) {
  return c.kind === 'book' || (c.kind === 'file' && c.rel.startsWith('beyond-shiny/'));
}

// Tie-break groups (lower wins on equal score): SOPs, shop recipes, book (digest + full text), everything else.
function tieGroup(c) {
  if (c.kind === 'file' && c.rel.startsWith('sops/')) return 0;
  if (isRecipe(c)) return 1;
  if (isBook(c)) return 2;
  return 3;
}

export function scoreCandidate(c, lower) {
  const { rel, text, keywords } = c;
  const matchesQuestion = questionMatchesFile(keywords, text, lower);
  let score = 0;
  for (const kw of keywords) {
    if (kw.length > 2 && lower.includes(kw)) score += 2;
  }
  if (c.kind === 'file') {
    if (rel.includes('sops') && (lower.includes('sop') || lower.includes('procedure'))) {
      score += 3;
    }
    if (rel.includes('policy/')) {
      score += 2;
    }
    // Folder baseline only when the question actually matches the file (no alphabetical filler).
    if ((rel.includes('manuals/') || rel.includes('aircraft/') || rel.includes('type-class/')) && matchesQuestion) {
      score += 2;
    }
  }
  // Shop recipes — strong boost when paint / brightwork / carpet topics (or a recipe's own keywords) appear.
  if (isRecipe(c)) {
    const triggers = [...SHOP_RECIPE_TRIGGERS, ...(c.triggers || [])];
    if (triggers.some((k) => lower.includes(k))) score += 10;
  }
  // Beyond Shiny — public digest topic files and private full-text chunks share book priority.
  if (isBook(c)) {
    const bookNamed = lower.includes('beyond shiny') || lower.includes('beyond-shiny');
    if (matchesQuestion) score += 3;
    if (c.kind === 'file' && rel.includes('safety-cautions')) {
      if (SAFETY_TRIGGERS.some((k) => lower.includes(k))) score += 8;
    }
    if (bookNamed || ((lower.includes('brett') || lower.includes('book')) && matchesQuestion)) {
      score += 4;
    }
  }
  // Boost exact aircraft profile when make/model tokens appear in the user message
  if (c.kind === 'file' && rel.startsWith('aircraft/')) {
    const tokens = rel.replace(/^aircraft\//, '').replace(/\.md$/, '').split('-').filter((t) => t.length > 2);
    let hits = 0;
    for (const t of tokens) {
      if (lower.includes(t)) hits += 1;
    }
    if (hits >= 2) score += 8;
    else if (hits === 1) score += 3;
  }
  const hay = text.toLowerCase();
  for (const n of KNOWLEDGE_NEEDLES) {
    if (lower.includes(n) && hay.includes(n)) score += 1;
  }
  // Private rows can carry extra needles (e.g. recipe product names) in their keywords column.
  for (const n of c.triggers || []) {
    if (!NEEDLE_SET.has(n) && lower.includes(n) && hay.includes(n)) score += 1;
  }
  return score;
}

export function compareCandidates(a, b) {
  return b.score - a.score || tieGroup(a) - tieGroup(b) || a.rel.localeCompare(b.rel);
}

function sopTopicHit(c, lower) {
  return c.keywords.some((kw) => kw.length > 2 && !GENERIC_PATH_TOKENS.has(kw) && kw !== 'sop' && lower.includes(kw));
}

export function selectCandidates(candidates, userMessage) {
  const lower = (userMessage || '').toLowerCase();
  const scored = candidates.map((c) => ({ ...c, score: scoreCandidate(c, lower) }));
  scored.sort(compareCandidates);

  const top = [];
  let bookChunks = 0;
  for (const s of scored) {
    if (top.length >= MAX_EXCERPTS) break;
    if (s.score <= 0) break;
    if (s.kind === 'book') {
      if (bookChunks >= MAX_BOOK_CHUNKS) continue;
      bookChunks += 1;
    }
    top.push(s);
  }
  // SOPs are the procedure of record: when the question names an SOP's topic (a filename term such as
  // "carpet" or "leather") keep the best such SOP even if book/digest files outscored it.
  if (top.length > 0 && !top.some((s) => s.kind === 'file' && s.rel.startsWith('sops/'))) {
    const sop = scored.find((s) => s.kind === 'file' && s.rel.startsWith('sops/') && s.score > 0 && sopTopicHit(s, lower));
    if (sop) {
      let drop = -1;
      for (let i = top.length - 1; i >= 0; i -= 1) {
        const t = top[i];
        if (!isRecipe(t) && !(t.kind === 'file' && t.rel.includes('safety-cautions'))) { drop = i; break; }
      }
      if (top.length < MAX_EXCERPTS) top.push(sop);
      else if (drop >= 0) top.splice(drop, 1, sop);
      top.sort(compareCandidates);
    }
  }
  if (top.length > 0) return top;
  // Nothing matched: fall back to the first two public files (never private rows).
  return scored.filter((s) => s.kind === 'file').slice(0, 2);
}

function excerptHeader(c) {
  if (c.kind === 'recipe') return `### ${c.rel} (Brett shop recipe — procedure of record: ${c.title})`;
  if (c.kind === 'book') return `### ${c.rel} (Beyond Shiny full text: ${c.title})`;
  return `### ${c.rel}`;
}

function excerptCap(c) {
  if (c.kind !== 'file') return 5500;
  const f = c.rel;
  if (f.includes('sops/') || f.includes('aircraft/') || f.includes('manuals/') || f.includes('policy/') || f.includes('beyond-shiny/')) {
    return 5500;
  }
  return 3500;
}

/**
 * Build the knowledge block appended to the system prompt.
 * @param {string} userMessage latest user message
 * @param {object} [opts]
 * @param {Array}  [opts.privateRows] inject private rows (tests); default = cached Supabase fetch
 * @param {string} [opts.root] public knowledge root; default = <cwd>/knowledge/detailing
 */
export async function loadKnowledgeStub(userMessage, opts = {}) {
  try {
    const root = opts.root || path.join(process.cwd(), 'knowledge', 'detailing');
    const [publicCandidates, rows] = await Promise.all([
      loadPublicCandidates(root),
      Array.isArray(opts.privateRows) ? opts.privateRows : getPrivateKnowledgeRows(),
    ]);
    const privateCandidates = (rows || []).map(privateRowToCandidate).filter(Boolean);
    const candidates = [...publicCandidates, ...privateCandidates];
    if (candidates.length === 0) return '';

    const chosen = selectCandidates(candidates, userMessage);
    const excerpts = chosen
      .map((c) => `${excerptHeader(c)}\n${c.text.slice(0, excerptCap(c))}`)
      .join('\n\n');

    return `\n\n---\nKnowledge base excerpts (RAG stub — prefer these when relevant):\n${excerpts}\n---`;
  } catch (err) {
    console.error('[detailing-ai/knowledge] knowledge stub error:', err?.message || err);
    return '';
  }
}
