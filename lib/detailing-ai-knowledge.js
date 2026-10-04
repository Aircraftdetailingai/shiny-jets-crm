// Server-only Detailing AI knowledge loader.
//
// Candidate pool = public markdown under knowledge/detailing/** PLUS private rows
// from the Supabase `private_knowledge` table (Brett's Shiny Jets shop methods + the
// full Beyond Shiny book text). Private rows are read with the service role, cached in
// memory for a short TTL, and only ever end up inside the system prompt sent to
// the model provider — never in an API response to the browser.
//
// Wording: Brett calls his shop procedures "methods", never "recipes". The DB
// category value (`source = 'recipes'`) and existing row slugs are internal
// identifiers and stay as-is (the table's CHECK constraint and live rows use
// them); everything the model sees is normalized to "method(s)" by
// toMethodsWording() below.
//
// Do not import this module from client components.
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { scrubRupes, scrubCompoundPro } from '@/lib/detailing-ai-messages';

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
// so SOPs, shop methods and the public book digest are not crowded out.
export const MAX_BOOK_CHUNKS = 2;
const PRIVATE_TTL_MS = 5 * 60 * 1000; // fresh rows are reused for 5 minutes
const PRIVATE_RETRY_MS = 60 * 1000; // after a failure, retry at most once a minute
const PRIVATE_TIMEOUT_MS = 3000; // never hold the chat up on a slow database

// Generic shop-method triggers. Method-specific product names live in each
// private row's `keywords` column (not in this public repo).
const SHOP_METHOD_TRIGGERS = ['oxid', 'paint', 'polish', 'compound', 'brightwork', 'carpet', 'grease',
  'sharpie', 'ink', 'clearcoat', 'clear coat', 'single-stage', 'single stage', 'hologram', 'correction'];

const SAFETY_TRIGGERS = ['pitot', 'static', 'fog', 'mek', 'agemaster', '150', 'boot', 'strut',
  'landing gear', 'faa', 'cover', 'craz', 'caution', 'safety', 'respirator', 'wash',
  'brightwork', 'silver boot', 'vortex'];

// Latest-first (Brett, Sep 28 2026: "default is always the latest thing I tell you"). Older /
// superseded methods, SOP versions and products are never deleted or filtered out: they stay
// retrievable, rank below the latest Shiny Jets method, and are labeled "older / alternative".
// They get a boost only when the user says the latest method didn't work or they don't have
// the recommended product/tool.
export const ALTERNATIVE_TRIGGERS = ["don't have", 'dont have', 'do not have', "didn't work", 'didnt work',
  'did not work', "doesn't work", 'not working', "isn't working", 'no luck', 'ran out', "can't get",
  'cant get', "can't find", 'cant find', 'unavailable', 'instead of', 'substitute', 'alternative', 'older method',
  'old method', 'something else', 'other option'];
// A private method row is an older version when its keywords/title/slug say so.
const OLDER_MARKERS = ['superseded', 'older', 'legacy', 'previous', 'old-method', 'old method'];

// Words that never count as a "file term" hit when they come from book headings.
const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'your', 'you', 'are', 'our', 'how', 'what',
  'who', 'why', 'when', 'where', 'this', 'that', 'into', 'not', 'all', 'any', 'can', 'use', 'using', 'part',
  'chapter', 'introduction', 'intro', 'continued', 'section', 'book', 'about', 'more', 'less', 'one', 'two']);

// Folder / generic path tokens that shouldn't count as the question matching a specific file.
const GENERIC_PATH_TOKENS = new Set(['aircraft', 'manuals', 'type', 'class', 'sops', 'beyond', 'shiny', 'policy',
  'recipes', 'methods', 'shop', 'book']);

// DB category value for Brett's shop methods. Internal identifier only (matches the
// `private_knowledge.source` CHECK constraint and the live rows) — never shown to the model.
const SHOP_METHODS_SOURCE = 'recipes';

/**
 * Model-facing wording: "recipe(s)" -> "method(s)", preserving case
 * (recipe -> method, Recipes -> Methods, RECIPES -> METHODS). Applied to private
 * row titles, slugs shown in headers, and content before they reach the prompt.
 */
export function toMethodsWording(s) {
  return String(s ?? '').replace(/recipe(s?)/gi, (m, plural) => {
    let word = 'method';
    if (m === m.toUpperCase()) word = 'METHOD';
    else if (m[0] === m[0].toUpperCase()) word = 'Method';
    const sfx = plural ? (plural === 'S' ? 'S' : 's') : '';
    return word + sfx;
  });
}

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
  if (row.source === SHOP_METHODS_SOURCE) {
    const slugTokens = String(row.slug).split(/[-_./]/);
    return {
      kind: 'method',
      rel: `shop-methods/${toMethodsWording(row.slug)}`,
      title: toMethodsWording(row.title || row.slug),
      text: toMethodsWording(row.content),
      // Same +2 path-token logic as files: slug tokens only (e.g. shop, recipes, paint, brightwork, carpet),
      // plus "methods" so questions using Brett's wording score the same as the legacy slug token.
      keywords: slugTokens.includes('recipes') ? [...slugTokens, 'methods'] : slugTokens,
      triggers: extra,
    };
  }
  if (row.source === 'brett-answers') {
    // Ask Brett answers saved with "Add to AI knowledge" (lib/ask-brett.js buildKnowledgeRow).
    const tokens = [...new Set([...tokenize(row.title), ...extra.flatMap((k) => tokenize(k))])];
    return {
      kind: 'brett',
      rel: `brett-approved/${row.slug}`,
      title: toMethodsWording(row.title || row.slug),
      text: toMethodsWording(row.content),
      keywords: tokens,
      triggers: [],
    };
  }
  if (row.source === 'beyond-shiny') {
    const headingTokens = [...new Set([...tokenize(row.section), ...extra.flatMap((k) => tokenize(k))])];
    return {
      kind: 'book',
      rel: `beyond-shiny-book/${row.slug}`,
      title: toMethodsWording([row.title, row.section].filter(Boolean).join(' / ')),
      text: toMethodsWording(row.content),
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
// the question and the text. Cross-links / pointers to shop methods are ignored in the text.
function questionMatchesFile(keywords, text, lower) {
  const fileTermHit = keywords.some((kw) => kw.length > 2 && !GENERIC_PATH_TOKENS.has(kw) && lower.includes(kw));
  if (fileTermHit) return true;
  const hay = text.toLowerCase().replace(/shop-(?:recipes|methods)-[a-z0-9-]+\.md/g, '');
  return KNOWLEDGE_NEEDLES.some((n) => lower.includes(n) && hay.includes(n));
}

function isBrettAnswer(c) {
  return c.kind === 'brett';
}

function isShopMethod(c) {
  return c.kind === 'method' || (c.kind === 'file' && /^shop-(?:recipes|methods)-/.test(c.rel));
}

function isBook(c) {
  return c.kind === 'book' || (c.kind === 'file' && c.rel.startsWith('beyond-shiny/'));
}

export function wantsAlternative(lower) {
  const l = String(lower || '').toLowerCase().replace(/[\u2018\u2019]/g, "'");
  return ALTERNATIVE_TRIGGERS.some((k) => l.includes(k));
}

// An older version of a Shiny Jets method (kept on purpose as an alternative).
export function isOlderMethod(c) {
  if (!isShopMethod(c)) return false;
  const hay = [c.rel, c.title, ...(c.triggers || [])].join(' ').toLowerCase();
  return OLDER_MARKERS.some((m) => hay.includes(m));
}

// Content that includes methods explicitly flagged as superseded (older alternatives).
function hasSupersededContent(c) {
  return /supersed/i.test(c.text || '');
}

// Display order inside the prompt: latest content first, older/alternative content after.
function olderRank(c) {
  return isOlderMethod(c) || hasSupersededContent(c) ? 1 : 0;
}

// Tie-break groups (lower wins on equal score): SOPs, shop methods, book (digest + full text), everything else.
function tieGroup(c) {
  if (c.kind === 'file' && c.rel.startsWith('sops/')) return 0;
  if (isShopMethod(c) || isBrettAnswer(c)) return 1;
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
  // Shop methods — strong boost when paint / brightwork / carpet topics (or a method's own keywords) appear.
  if (isShopMethod(c)) {
    const triggers = [...SHOP_METHOD_TRIGGERS, ...(c.triggers || [])];
    if (triggers.some((k) => lower.includes(k))) score += 10;
  }
  // Brett-approved answers (Ask Brett): a real answer to a detailer's question. Strong boost when the
  // question shares at least two of its specific terms, so a near-repeat question gets Brett's answer.
  if (isBrettAnswer(c)) {
    const hits = keywords.filter((kw) => kw.length > 3 && !GENERIC_PATH_TOKENS.has(kw) && lower.includes(kw)).length;
    if (hits >= 2) score += 8;
    else if (hits === 1 && matchesQuestion) score += 2;
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
  // Latest-first: older method versions rank below the current method unless the user asks for an
  // alternative; superseded / book-era content gets a small boost for alternative questions.
  const alt = wantsAlternative(lower);
  if (isOlderMethod(c) && !alt) score -= 8;
  if (alt && matchesQuestion && (isOlderMethod(c) || hasSupersededContent(c) || isBook(c))) score += 4;
  const hay = text.toLowerCase();
  for (const n of KNOWLEDGE_NEEDLES) {
    if (lower.includes(n) && hay.includes(n)) score += 1;
  }
  // Private rows can carry extra needles (e.g. shop-method product names) in their keywords column.
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
        if (!isShopMethod(t) && !(t.kind === 'file' && t.rel.includes('safety-cautions'))) { drop = i; break; }
      }
      if (top.length < MAX_EXCERPTS) top.push(sop);
      else if (drop >= 0) top.splice(drop, 1, sop);
      top.sort(compareCandidates);
    }
  }
  // Never present older/superseded content ahead of the latest method (stable sort keeps score order).
  if (top.length > 0) return top.sort((a, b) => olderRank(a) - olderRank(b));
  // Nothing matched: fall back to the first two public files (never private rows).
  return scored.filter((s) => s.kind === 'file').slice(0, 2);
}

function excerptHeader(c) {
  if (c.kind === 'method') return `### ${c.rel} (Shiny Jets method from Brett — procedure of record: ${c.title})`;
  if (c.kind === 'book') return `### ${c.rel} (Beyond Shiny full text: ${c.title})`;
  if (c.kind === 'brett') return `### ${c.rel} (Brett-approved answer to a detailer's question: ${c.title})`;
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

// Model-facing notes injected under each excerpt header (public files AND private rows, at load
// time; the database is never edited). Brett's hard product rules (Sep 28 2026) win over any text.
export const NOTE_PRO_CUT = '[Fly Shiny Pro Cut: not yet released, do not recommend]';
export const NOTE_OLDER_METHOD = '[Older Shiny Jets method: alternative only. Lead with the latest Shiny Jets method; offer this only if the latest did not work or the user lacks its product, labeled "Older Shiny Jets method".]';
export const NOTE_SUPERSEDED = '[Contains older/superseded methods: never the primary recommendation. Offer only as a clearly labeled older alternative when the latest method did not work or the user lacks its product.]';
export const NOTE_BOOK = '[Beyond Shiny book era: where it conflicts with a Shiny Jets method on products/pads/steps it is an older alternative, never the primary recommendation. Its safety/FAA cautions always apply.]';

export function excerptNotes(c, text) {
  const notes = [];
  if (isOlderMethod(c)) notes.push(NOTE_OLDER_METHOD);
  else if (hasSupersededContent({ text })) notes.push(NOTE_SUPERSEDED);
  else if (isBook(c)) notes.push(NOTE_BOOK);
  if (/pro[\s-]*cut/i.test(text)) notes.push(NOTE_PRO_CUT);
  return notes;
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
      // Final wording guard for every excerpt (public files included): the model never sees "recipe(s)".
      .map((c) => {
        const text = c.text.slice(0, excerptCap(c));
        const notes = excerptNotes(c, text);
        // Rupes brand never reaches the model (Brett, Sep 28 2026), public files and private rows alike.
        // "Fly Shiny Compound Pro" never existed (Brett, Oct 3 2026): any mention is replaced at load time.
        return scrubCompoundPro(scrubRupes(toMethodsWording(`${excerptHeader(c)}\n${notes.length ? `${notes.join('\n')}\n` : ''}${text}`)));
      })
      .join('\n\n');

    return `\n\n---\nKnowledge base excerpts (RAG stub — prefer these when relevant):\n${excerpts}\n---`;
  } catch (err) {
    console.error('[detailing-ai/knowledge] knowledge stub error:', err?.message || err);
    return '';
  }
}
