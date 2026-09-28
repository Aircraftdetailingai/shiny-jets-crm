// Builds `private_knowledge` rows from a private source folder that lives OUTSIDE
// this repo (default /home/box/private-knowledge). No proprietary content is in
// the repo — only this reader/chunker.
//
// Folder layout:
//   recipes/*.md                 Shiny Jets shop methods (internal folder/category name
//                                  'recipes' matches the DB source value), one row per file.
//                                  Optional front matter:
//                                  ---
//                                  slug: shop-recipes-...
//                                  title: ...
//                                  section: ...
//                                  keywords: comma, separated, triggers
//                                  ---
//   beyond-shiny/beyond-shiny.txt full book text (plain text, headings are
//                                  short lines ending in " -" or "Chapter N ...")
//   beyond-shiny/parts.json       optional { parts: [{ start, end, title }] }
//                                  1-based inclusive line ranges (chapters)
//   sops/sop-*.md                 Shiny Jets SOP library (source 'sops'), one row per
//                                  file, slug = file name without .md (e.g.
//                                  sop-04-carpet-cleaning). The whole file (front
//                                  matter included) is stored as content so the chat
//                                  loader scores it exactly like the former public
//                                  knowledge/detailing/sops/<slug>.md file. The public
//                                  repo keeps only a pointer stub with the same name.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULT_PRIVATE_DIR = process.env.PRIVATE_KNOWLEDGE_DIR || '/home/box/private-knowledge';

// Book chunk sizing (characters). The chat loader caps an excerpt at 5500 chars.
export const BOOK_TARGET_CHARS = 4000;
export const BOOK_MAX_CHARS = 5200;

function slugify(s, max = 48) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

function parseFrontMatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { meta, body: raw.slice(m[0].length) };
}

function unquote(s) {
  return String(s ?? '').trim().replace(/^(['"])(.*)\1$/, '$2');
}

function splitList(s) {
  return String(s || '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

export function buildRecipeRows(dir = DEFAULT_PRIVATE_DIR) {
  const rdir = path.join(dir, 'recipes');
  if (!fs.existsSync(rdir)) return [];
  return fs
    .readdirSync(rdir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('.') && f.toLowerCase() !== 'readme.md')
    .sort()
    .map((f) => {
      const raw = fs.readFileSync(path.join(rdir, f), 'utf8').replace(/\r\n/g, '\n');
      const { meta, body } = parseFrontMatter(raw);
      const h1 = (body.match(/^#\s+(.+)$/m) || [])[1];
      const content = body.trim();
      return {
        slug: meta.slug || slugify(f.replace(/\.md$/, ''), 80),
        source: 'recipes',
        title: meta.title || h1 || f.replace(/\.md$/, ''),
        section: meta.section || null,
        keywords: splitList(meta.keywords),
        content,
      };
    })
    .filter((r) => r.content);
}

// SOP file names: sop-<nn>-<topic>.md (index.md / README are catalogs, not SOPs).
export const SOP_FILE_RE = /^sop-[0-9]{2}-[a-z0-9-]+\.md$/;

export function buildSopRows(dir = DEFAULT_PRIVATE_DIR) {
  const sdir = path.join(dir, 'sops');
  if (!fs.existsSync(sdir)) return [];
  return fs
    .readdirSync(sdir)
    .filter((f) => SOP_FILE_RE.test(f))
    .sort()
    .map((f) => {
      const raw = fs.readFileSync(path.join(sdir, f), 'utf8').replace(/\r\n/g, '\n');
      const { meta, body } = parseFrontMatter(raw);
      const h1 = (body.match(/^#\s+(.+)$/m) || [])[1];
      const slug = f.replace(/\.md$/, '');
      const ids = [meta.id, meta.doc_number].map((v) => unquote(v).toLowerCase()).filter(Boolean);
      return {
        slug,
        source: 'sops',
        title: (h1 || unquote(meta.title) || slug).trim(),
        section: unquote(meta.service) || null,
        keywords: [...new Set([...ids, ...splitList(meta.keywords)])],
        content: raw.trim(),
      };
    })
    .filter((r) => r.content);
}

function isHeading(line) {
  const t = line.trim();
  if (!t || t.length > 90) return false;
  if (/^chapter\s+\d+/i.test(t)) return true;
  return /\s?[-–]\s*$/.test(t) && /[a-z]/i.test(t);
}

function cleanHeading(line) {
  return line.trim().replace(/\s*[-–]\s*$/, '').replace(/\s+/g, ' ');
}

function norm(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Split one part (chapter) into heading segments, drop exact duplicate segments,
// then pack segments into chunks of ~BOOK_TARGET_CHARS (hard max BOOK_MAX_CHARS,
// splitting oversized segments on paragraph/line boundaries).
function chunkPart(lines, partTitle, seen) {
  const segments = [];
  let cur = { heading: null, lines: [] };
  for (const line of lines) {
    if (isHeading(line) && cur.lines.some((l) => l.trim())) {
      segments.push(cur);
      cur = { heading: cleanHeading(line), lines: [line] };
    } else {
      if (isHeading(line) && !cur.heading) cur.heading = cleanHeading(line);
      cur.lines.push(line);
    }
  }
  if (cur.lines.some((l) => l.trim())) segments.push(cur);

  const pieces = [];
  for (const seg of segments) {
    const text = seg.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) continue;
    const key = norm(text);
    if (seen.has(key)) continue; // the source repeats some sections verbatim
    seen.add(key);
    if (text.length <= BOOK_MAX_CHARS) {
      pieces.push({ heading: seg.heading, text });
      continue;
    }
    let buf = '';
    for (const para of text.split('\n')) {
      if (buf && buf.length + para.length + 1 > BOOK_MAX_CHARS) {
        pieces.push({ heading: seg.heading, text: buf.trim(), continued: pieces.length > 0 });
        buf = '';
      }
      if (para.length > BOOK_MAX_CHARS) {
        // Pathological single paragraph: hard-split on sentence boundaries.
        for (const sent of para.split(/(?<=[.!?])\s+/)) {
          if (buf && buf.length + sent.length + 1 > BOOK_MAX_CHARS) {
            pieces.push({ heading: seg.heading, text: buf.trim(), continued: true });
            buf = '';
          }
          buf += (buf ? ' ' : '') + sent;
        }
        buf += '\n';
      } else {
        buf += `${para}\n`;
      }
    }
    if (buf.trim()) pieces.push({ heading: seg.heading, text: buf.trim(), continued: true });
  }

  const chunks = [];
  let acc = null;
  for (const p of pieces) {
    if (acc && acc.text.length + p.text.length + 2 <= BOOK_TARGET_CHARS) {
      acc.text += `\n\n${p.text}`;
      if (p.heading && !acc.headings.includes(p.heading)) acc.headings.push(p.heading);
    } else {
      if (acc) chunks.push(acc);
      acc = { text: p.text, headings: p.heading ? [p.heading] : [], continued: !!p.continued };
    }
  }
  if (acc) chunks.push(acc);
  return chunks.map((c) => ({ ...c, partTitle }));
}

export function buildBookRows(dir = DEFAULT_PRIVATE_DIR) {
  const bdir = path.join(dir, 'beyond-shiny');
  const txt = path.join(bdir, 'beyond-shiny.txt');
  if (!fs.existsSync(txt)) return [];
  const all = fs.readFileSync(txt, 'utf8').replace(/\r\n/g, '\n').split('\n');
  let parts = [{ start: 1, end: all.length, title: 'Beyond Shiny' }];
  const pj = path.join(bdir, 'parts.json');
  if (fs.existsSync(pj)) {
    const parsed = JSON.parse(fs.readFileSync(pj, 'utf8'));
    if (Array.isArray(parsed.parts) && parsed.parts.length) parts = parsed.parts;
  }

  const seen = new Set();
  const rows = [];
  parts.forEach((part, pi) => {
    const lines = all.slice(Math.max(0, part.start - 1), Math.min(all.length, part.end));
    const title = String(part.title || `Part ${pi + 1}`).replace(/\s*\(.*?\)\s*$/, '').trim();
    const chunks = chunkPart(lines, title, seen);
    chunks.forEach((c, ci) => {
      const section = c.headings.length
        ? `${c.continued ? '(cont.) ' : ''}${c.headings.slice(0, 6).join('; ')}`
        : title;
      rows.push({
        slug: `beyond-shiny-${String(pi + 1).padStart(2, '0')}-${slugify(title, 40)}-${String(ci + 1).padStart(2, '0')}`,
        source: 'beyond-shiny',
        title: `Beyond Shiny — ${title}`,
        section: section.slice(0, 300),
        keywords: [...new Set([title, ...c.headings].map((h) => h.toLowerCase()))].slice(0, 12),
        content: c.text,
      });
    });
  });
  return rows;
}

export const PRIVATE_SOURCES = ['recipes', 'beyond-shiny', 'sops'];

export function buildAllRows(dir = DEFAULT_PRIVATE_DIR, { only } = {}) {
  if (only && !PRIVATE_SOURCES.includes(only)) throw new Error(`unknown source: ${only} (expected ${PRIVATE_SOURCES.join('|')})`);
  const rows = [];
  if (!only || only === 'recipes') rows.push(...buildRecipeRows(dir));
  if (!only || only === 'beyond-shiny') rows.push(...buildBookRows(dir));
  if (!only || only === 'sops') rows.push(...buildSopRows(dir));
  const slugs = new Set();
  for (const r of rows) {
    if (slugs.has(r.slug)) throw new Error(`duplicate slug: ${r.slug}`);
    slugs.add(r.slug);
  }
  return rows;
}

export function contentHash(rows) {
  const h = crypto.createHash('sha256');
  for (const r of rows) h.update(`${r.slug}\n${r.content}\n`);
  return h.digest('hex').slice(0, 16);
}
