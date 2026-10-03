// POST { urls } -> extracted Q&A pairs for review. Saves nothing.
// Authenticated, Business only, scoped to the signed-in account. Each link
// is fetched server-side through lib/safe-fetch (SSRF-safe, time + size
// limits) and only that page's content is used.
import { getAuthUser } from '@/lib/auth';
import { resolveDetailerId } from '@/lib/resolve-detailer';
import { getServiceSupabase, chatEligible, loadAccountFaqs } from '@/lib/ai-chat-server';
import { createRateLimiter } from '@/lib/ai-chat';
import { parseUrlList, markDuplicates, buildSnapshot, MAX_IMPORT_URLS } from '@/lib/faq-import';
import { importFromUrl, aiExtractAvailable } from '@/lib/faq-import-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

const perAccount = createRateLimiter({ limit: 12, windowMs: 10 * 60 * 1000 });

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'crew') return Response.json({ error: 'Forbidden' }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });
  const id = await resolveDetailerId(supabase, user);
  const { data: detailer } = await supabase.from('detailers').select('id, plan, is_admin').eq('id', id).maybeSingle();
  if (!detailer) return Response.json({ error: 'Not found' }, { status: 404 });
  if (!chatEligible(detailer)) return Response.json({ error: 'Importing FAQs from your website is included with Business.', upgrade: '/upgrade?plan=business' }, { status: 403 });

  const { urls, invalid, tooMany } = parseUrlList(body?.urls);
  if (!urls.length) return Response.json({ error: invalid.length ? 'That doesn’t look like a web page link. Paste something like https://yourshop.com/faq.' : 'Paste at least one link to your FAQ page.', field: 'urls' }, { status: 400 });
  const rl = perAccount.check(id);
  if (!rl.ok) return Response.json({ error: `You’ve imported a lot in the last few minutes. Try again in ${Math.ceil(rl.retryAfter / 60)} min.` }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const existing = await loadAccountFaqs(supabase, id);
  const results = await Promise.all(urls.map((u) => importFromUrl(u, { allowAi: true, accountId: id })));
  const all = [];
  const summary = results.map((r) => {
    for (const p of r.pairs) all.push({ ...p, source_url: r.url, method: r.method });
    return { url: r.url, ok: r.ok && r.pairs.length > 0, count: r.pairs.length, method: r.method || '', error: r.pairs.length ? '' : (r.error || ''), truncated: !!r.truncated, snapshot: r.pairs.length ? buildSnapshot(r.pairs) : [] };
  });
  const pairs = markDuplicates(all, existing).map((p, i) => ({ id: `p${i}`, ...p }));
  console.log('[faq-import]', JSON.stringify({ account: id, urls: urls.length, found: pairs.length, methods: summary.map((s) => s.method || s.error.slice(0, 30)) }));
  return Response.json({ results: summary, pairs, invalid, tooMany, maxUrls: MAX_IMPORT_URLS, aiExtract: aiExtractAvailable() }, { headers: { 'Cache-Control': 'no-store' } });
}
