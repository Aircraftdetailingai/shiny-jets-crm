import { getAuthUser } from '@/lib/auth';
import { getServiceSupabase, requireAdmin } from '@/lib/ask-brett-server';
import { ABUSE_SOURCE, REVIEW_TOPICS } from '@/lib/detailing-ai-abuse-server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Admin-only review list of Detailing AI abuse events (webhook_logs, source 'detailing_ai'):
// extraction / injection flags, blocked or trimmed replies, refusals, rate limits, auto-throttles,
// high volume and possible login sharing.
//   GET   ?status=open (default, not yet reviewed) | all   &topic=<topic>   &account=<detailer id>
//   PATCH { ids: [..] }  -> marks those events reviewed (processed = true)
export async function GET(request) {
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ error: 'Not configured' }, { status: 503 });
  const user = await getAuthUser(request);
  const admin = await requireAdmin(user, supabase);
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const params = new URL(request.url).searchParams;
  const topic = params.get('topic');
  const account = params.get('account');
  let q = supabase
    .from('webhook_logs')
    .select('id, topic, payload, processed, created_at')
    .eq('source', ABUSE_SOURCE)
    .in('topic', topic && REVIEW_TOPICS.includes(topic) ? [topic] : REVIEW_TOPICS)
    .order('created_at', { ascending: false })
    .limit(Math.min(500, Math.max(1, Number(params.get('limit')) || 200)));
  if (params.get('status') !== 'all') q = q.eq('processed', false);
  if (account) q = q.filter('payload->>account_id', 'eq', String(account));
  const { data, error } = await q;
  if (error) return Response.json({ error: 'Abuse log unavailable', items: [] }, { status: 500 });

  // Per-account roll-up so the worst offenders are easy to spot.
  const byAccount = {};
  for (const r of data || []) {
    const id = r.payload?.account_id || 'unknown';
    const a = (byAccount[id] ||= { account_id: id, email: r.payload?.email || null, total: 0, topics: {} });
    a.total += 1;
    a.topics[r.topic] = (a.topics[r.topic] || 0) + 1;
  }
  const accounts = Object.values(byAccount).sort((x, y) => y.total - x.total);
  return Response.json({ items: data || [], accounts, topics: REVIEW_TOPICS });
}

export async function PATCH(request) {
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ error: 'Not configured' }, { status: 503 });
  const user = await getAuthUser(request);
  const admin = await requireAdmin(user, supabase);
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });
  const body = await request.json().catch(() => ({}));
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean).slice(0, 500);
  if (!ids.length) return Response.json({ error: 'ids required' }, { status: 400 });
  const { error } = await supabase.from('webhook_logs').update({ processed: true }).eq('source', ABUSE_SOURCE).in('id', ids);
  if (error) return Response.json({ error: 'Could not update' }, { status: 500 });
  return Response.json({ ok: true, reviewed: ids.length });
}
