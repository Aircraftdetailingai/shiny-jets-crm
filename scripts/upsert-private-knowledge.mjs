#!/usr/bin/env node
/**
 * Seed / update the server-only `private_knowledge` table (Brett's Shiny Jets
 * shop methods, the Shiny Jets SOP library, and the full Beyond Shiny book text) from a private folder OUTSIDE
 * this repo. Shop methods use the internal category value `recipes` (DB CHECK
 * constraint + live rows); the Detailing AI loader shows them as "methods".
 *
 *   node scripts/upsert-private-knowledge.mjs [--dir /home/box/private-knowledge]
 *        [--only recipes|beyond-shiny|sops] [--dry-run] [--no-prune] [--emit-sql out.sql]
 *
 * Env (service role — never commit these, never expose to the browser):
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 * If not set in the shell, the script reads them from .env.local / .env
 * (values are never printed).
 *
 * Upserts by slug. Unless --no-prune, rows of each loaded source whose slug is no
 * longer produced (e.g. after re-chunking the book) are deleted.
 *
 * --emit-sql writes an idempotent SQL upsert (for the Supabase SQL editor) instead
 * of calling the API. Write it OUTSIDE the repo — it contains the private content.
 * The table must already exist: supabase/migrations/20260928_private_knowledge.sql
 * and, for source 'sops', supabase/migrations/20260928_private_knowledge_sops.sql
 * (widens the source CHECK constraint).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { buildAllRows, contentHash, DEFAULT_PRIVATE_DIR, PRIVATE_SOURCES } from './lib/private-knowledge-build.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').replace(/\\n$/, '').trim();
  }
}

function sqlLiteral(s) {
  if (s == null) return 'NULL';
  const str = String(s);
  let tag = 'pk';
  let n = 0;
  while (str.includes(`$${tag}$`)) tag = `pk${++n}`;
  return `$${tag}$${str}$${tag}$`;
}

function sqlArray(arr) {
  return `ARRAY[${(arr || []).map(sqlLiteral).join(', ')}]::text[]`;
}

function emitSql(rows, file, { prune, sources }) {
  const out = [];
  out.push('-- private_knowledge seed — CONTAINS PROPRIETARY CONTENT. Do not commit.');
  out.push(`-- Generated ${new Date().toISOString()} · ${rows.length} rows · hash ${contentHash(rows)}`);
  out.push('BEGIN;');
  for (const r of rows) {
    out.push(
      'INSERT INTO public.private_knowledge (slug, source, title, section, keywords, content, updated_at) VALUES ('
      + `${sqlLiteral(r.slug)}, ${sqlLiteral(r.source)}, ${sqlLiteral(r.title)}, ${sqlLiteral(r.section)}, `
      + `${sqlArray(r.keywords)}, ${sqlLiteral(r.content)}, now())\n`
      + 'ON CONFLICT (slug) DO UPDATE SET source = EXCLUDED.source, title = EXCLUDED.title, section = EXCLUDED.section, '
      + 'keywords = EXCLUDED.keywords, content = EXCLUDED.content, updated_at = now();'
    );
  }
  if (prune) {
    for (const src of sources) {
      const keep = rows.filter((r) => r.source === src).map((r) => sqlLiteral(r.slug));
      out.push(`DELETE FROM public.private_knowledge WHERE source = ${sqlLiteral(src)}`
        + (keep.length ? ` AND slug NOT IN (${keep.join(', ')});` : ';'));
    }
  }
  out.push('COMMIT;');
  out.push('SELECT source, count(*) FROM public.private_knowledge GROUP BY source ORDER BY source;');
  fs.writeFileSync(file, `${out.join('\n')}\n`, { mode: 0o600 });
}

async function main() {
  const dir = path.resolve(String(arg('--dir', DEFAULT_PRIVATE_DIR)));
  const only = arg('--only');
  const dryRun = !!arg('--dry-run');
  const prune = !arg('--no-prune');
  const sqlOut = arg('--emit-sql');

  if (dir === repoRoot || dir.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`Refusing to read private content from inside the repo (${dir}).`);
  }
  if (!fs.existsSync(dir)) throw new Error(`Private knowledge folder not found: ${dir}`);

  const rows = buildAllRows(dir, { only: typeof only === 'string' ? only : undefined });
  const sources = [...new Set(rows.map((r) => r.source))];
  const counts = Object.fromEntries(sources.map((s) => [s, rows.filter((r) => r.source === s).length]));
  console.log(`Built ${rows.length} rows from ${dir}:`, counts, `hash ${contentHash(rows)}`);
  if (rows.length === 0) throw new Error('No rows built — check the folder layout.');

  if (typeof sqlOut === 'string') {
    const outPath = path.resolve(sqlOut);
    if (outPath.startsWith(`${repoRoot}${path.sep}`)) throw new Error('Refusing to write private SQL inside the repo.');
    emitSql(rows, outPath, { prune, sources });
    console.log(`Wrote SQL upsert to ${outPath} (${fs.statSync(outPath).size} bytes).`);
    return;
  }
  if (dryRun) {
    for (const r of rows) console.log(`  ${r.source.padEnd(12)} ${r.slug}  (${r.content.length} chars)`);
    return;
  }

  loadEnvFile(path.join(repoRoot, '.env.local'));
  loadEnvFile(path.join(repoRoot, '.env'));
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role).');
  console.log(`Target: ${new URL(url).host}`);

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  const batch = 20;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch).map((r) => ({ ...r, updated_at: now }));
    const { error } = await supabase.from('private_knowledge').upsert(chunk, { onConflict: 'slug' });
    if (error) throw new Error(`upsert failed at row ${i}: ${error.message}`);
  }
  console.log(`Upserted ${rows.length} rows.`);

  if (prune) {
    for (const src of sources) {
      const keep = new Set(rows.filter((r) => r.source === src).map((r) => r.slug));
      const { data, error } = await supabase.from('private_knowledge').select('slug').eq('source', src);
      if (error) throw new Error(`prune list failed: ${error.message}`);
      const stale = (data || []).map((d) => d.slug).filter((s) => !keep.has(s));
      if (stale.length) {
        const { error: delErr } = await supabase.from('private_knowledge').delete().in('slug', stale);
        if (delErr) throw new Error(`prune delete failed: ${delErr.message}`);
      }
      console.log(`Pruned ${stale.length} stale ${src} rows.`);
    }
  }

  const summary = {};
  for (const src of PRIVATE_SOURCES) {
    const { count, error } = await supabase
      .from('private_knowledge').select('slug', { count: 'exact', head: true }).eq('source', src);
    summary[src] = error ? `error: ${error.message}` : count;
  }
  console.log('Row counts now in private_knowledge:', summary);
}

main().catch((err) => {
  console.error(`upsert-private-knowledge: ${err.message}`);
  process.exit(1);
});
